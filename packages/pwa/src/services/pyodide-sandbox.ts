import type { PythonSandboxEngine, PythonExecutionResult, BskyClient } from '@bsky/core';
import { ToolDispatcher } from '@bsky/core';
import { getDefaultWorkspaceStorage } from '@bsky/app';
import PyodideWorker from './pyodide.worker.ts?worker';

const MIME_TYPE_MAP: Record<string, string> = {
  'png': 'image/png',
  'jpg': 'image/jpeg',
  'jpeg': 'image/jpeg',
  'csv': 'text/csv',
  'json': 'application/json',
  'txt': 'text/plain',
  'md': 'text/markdown',
};

function getMimeType(type: string): string {
  return MIME_TYPE_MAP[type] || 'application/octet-stream';
}

/**
 * PyodideSandbox — PWA implementation of PythonSandboxEngine via Web Worker.
 *
 * Uses Vite's `?worker` import to bundle the Worker as a standalone chunk,
 * avoiding template-string escaping issues that previously caused SyntaxError
 * when embedding Worker code inline via Blob URL.
 *
 * The Worker loads Pyodide WASM from CDN (jsdelivr) using importScripts()
 * in classic Worker mode (IIFE, not module).
 */
export class PyodideSandbox implements PythonSandboxEngine {
  private worker: Worker | null = null;
  private _isReady = false;
  private _initFailed = false;
  private _initPromise: Promise<void> | null = null;
  private _pendingExecutions: Array<{
    resolve: (result: PythonExecutionResult) => void;
    reject: (error: Error) => void;
    code: string;
  }> = [];
  private _initReject: ((error: Error) => void) | null = null;
  private _onProgress: ((msg: { stage: string; progress: number; message: string }) => void) | null = null;
  private _dispatcher: ToolDispatcher | null = null;

  constructor() {
    console.debug('[Pyodide] Sandbox instance created');
  }

  setClient(client: BskyClient): void {
    this._dispatcher = new ToolDispatcher(client);
  }

  isReady(): boolean {
    return this._isReady;
  }

  hasInitFailed(): boolean {
    return this._initFailed;
  }

  setCurrentChatId(chatId: string | undefined): void {
    // TODO: implement chat isolation
    console.debug('[Pyodide] setCurrentChatId:', chatId);
  }

  setOnProgress(callback: (msg: { stage: string; progress: number; message: string }) => void): void {
    this._onProgress = callback;
  }

  async *initialize(): AsyncIterable<{ stage: string; progress: number; message: string }> {
    if (this._isReady) {
      yield { stage: 'ready', progress: 1, message: 'Python sandbox ready' };
      return;
    }

    if (this._initFailed) {
      console.debug('[Pyodide] Previously failed, resetting...');
      this._initFailed = false;
      this._initPromise = null;
    }

    if (this._initPromise) {
      console.debug('[Pyodide] Already initializing, waiting...');
      await this._initPromise;
      yield { stage: 'ready', progress: 1, message: 'Python sandbox ready' };
      return;
    }

    console.debug('[Pyodide] Starting Worker initialization via Vite ?worker import...');

    this._initPromise = new Promise<void>((resolve, reject) => {
      this._initReject = reject;
      try {
        this.worker = new PyodideWorker();
        console.debug('[Pyodide] Worker created via Vite ?worker import');
      } catch (err) {
        console.debug('[Pyodide] Failed to create Worker:', err);
        this._initFailed = true;
        this._initPromise = null;
        this._initReject = null;
        reject(new Error('Failed to create Web Worker: ' + String(err)));
        return;
      }

      this.worker.onmessage = (e) => {
        const msg = e.data;
        if (msg.type === 'initProgress') {
          this._onProgress?.(msg);
        } else if (msg.type === 'initComplete') {
          console.debug('[Pyodide] Worker init complete');
          this._isReady = true;
          this._initReject = null;
          resolve();
        } else if (msg.type === 'initError') {
          console.debug('[Pyodide] Worker init error:', msg.error);
          this._initFailed = true;
          this._initPromise = null;
          this._initReject = null;
          reject(new Error(msg.error));
        } else if (msg.type === 'result') {
          this._handleResult(msg.result);
        } else if (msg.type === 'toolCall') {
          this._handleToolCall(msg);
        }
      };

      this.worker.onerror = (err) => {
        const details = err.message || 'unknown error';
        const filename = err.filename || 'unknown';
        const lineno = err.lineno || 0;
        const colno = err.colno || 0;
        console.error('[Pyodide] Worker error:', details, 'at', filename + ':' + lineno + ':' + colno);
        console.error('[Pyodide] Worker error event:', err);
        this._initFailed = true;
        this._initPromise = null;
        this._initReject = null;
        reject(new Error('Worker error: ' + details + ' at ' + filename + ':' + lineno));
      };

    console.debug('[Pyodide] Sending init message to Worker');
    this.worker.postMessage({ type: 'init' });

    // Send auth config if available
    this._sendAuthConfig();
  });

    await this._initPromise;
    yield { stage: 'ready', progress: 1, message: 'Python sandbox ready' };
  }

  async execute(code: string, chatId?: string, options?: { enableWrite?: boolean }): Promise<PythonExecutionResult> {
    console.debug('[Pyodide] Execute called, ready:', this._isReady, 'failed:', this._initFailed);

    if (!this._isReady) {
      if (!this._initPromise || this._initFailed) {
        console.debug('[Pyodide] Starting lazy initialization...');
        this._initFailed = false;
        const initIterator = this.initialize();
        this._initPromise = (async () => {
          for await (const _ of initIterator) {
            // consume all progress updates
          }
        })();
      }

      console.debug('[Pyodide] Waiting for initialization...');
      await this._initPromise;
    }

    if (!this._isReady) {
      throw new Error('Python sandbox initialization failed');
    }

    // Step 1: AST Analysis (unless enableWrite is already set)
    let enableWrite = options?.enableWrite ?? false;
    if (!enableWrite) {
      const analysis = await this._analyzeCode(code);
      if (analysis.error) {
        console.warn('[Pyodide] AST analysis error:', analysis.error);
      }
      if (analysis.hasDynamicCalls) {
        return {
          stdout: '',
          stderr: 'Security error: Dynamic method calls (getattr) are not allowed for safety reasons.',
          returnValue: null,
          files: [],
          success: false,
          executionTime: 0,
          executionTimestamp: Date.now(),
        };
      }
      if (analysis.hasWriteOperations) {
        const opsDesc = analysis.writeOperations.map(op => `${op.tool} ×${op.count}`).join(', ');
        const confirmed = window.confirm(
          `This Python script will perform the following write operations:\n\n${opsDesc}\n\nDo you want to allow these operations?`
        );
        if (!confirmed) {
          return {
            stdout: '',
            stderr: `Write operations cancelled by user. The script would have: ${opsDesc}`,
            returnValue: null,
            files: [],
            success: false,
            executionTime: 0,
            executionTimestamp: Date.now(),
          };
        }
        enableWrite = true;
      }
    }

    console.debug('[Pyodide] Sending execute to Worker, code length:', code.length, 'enableWrite:', enableWrite);
    return new Promise((resolve, reject) => {
      const wrappedResolve = async (result: PythonExecutionResult) => {
        if (chatId && result.files && result.files.length > 0) {
          try {
            const storage = getDefaultWorkspaceStorage();
            for (const file of result.files) {
              const isText = ['csv', 'json', 'txt', 'md'].includes(file.type);
              let data: Uint8Array;
              if (isText) {
                data = new TextEncoder().encode(file.content);
              } else {
                const binaryStr = atob(file.content);
                data = new Uint8Array(binaryStr.length);
                for (let i = 0; i < binaryStr.length; i++) {
                  data[i] = binaryStr.charCodeAt(i);
                }
              }
              const id = `py-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
              const mimeType = getMimeType(file.type);
              await storage.saveFile({
                id,
                name: file.name,
                mimeType,
                size: file.size || data.length,
                data,
                uploadedAt: new Date().toISOString(),
                chatId,
              });
            }
          } catch (err) {
            console.error('[Pyodide] Failed to save output files:', err);
          }
        }
        resolve(result);
      };
      this._pendingExecutions.push({ resolve: wrappedResolve, reject, code });
      this.worker!.postMessage({ type: 'execute', code, enableWrite });
    });
  }

  private async _analyzeCode(code: string): Promise<{ hasWriteOperations: boolean; writeOperations: Array<{ tool: string; count: number }>; hasDynamicCalls: boolean; error?: string }> {
    if (!this.worker) return { hasWriteOperations: false, writeOperations: [], hasDynamicCalls: false, error: 'Worker not initialized' };
    
    return new Promise((resolve) => {
      const handler = (e: MessageEvent) => {
        const msg = e.data;
        if (msg.type === 'analysisResult') {
          this.worker?.removeEventListener('message', handler);
          resolve(msg.result || { hasWriteOperations: false, writeOperations: [], hasDynamicCalls: false });
        }
      };
      if (!this.worker) {
        resolve({ hasWriteOperations: false, writeOperations: [], hasDynamicCalls: false, error: 'Worker not available' });
        return;
      }
      this.worker.addEventListener('message', handler);
      this.worker.postMessage({ type: 'analyze', code });
      
      // Timeout after 5 seconds
      setTimeout(() => {
        this.worker?.removeEventListener('message', handler);
        resolve({ hasWriteOperations: false, writeOperations: [], hasDynamicCalls: false, error: 'Analysis timeout' });
      }, 5000);
    });
  }

  async mountFile(name: string, data: Uint8Array): Promise<void> {
    if (!this._isReady || !this.worker) {
      throw new Error('Python sandbox not ready');
    }
    console.debug('[Pyodide] mountFile:', name, 'size:', data.length);
    const worker = this.worker; // capture for closure
    return new Promise((resolve, reject) => {
      const handler = (e: MessageEvent) => {
        const msg = e.data;
        if (msg.type === 'mountResult') {
          worker.removeEventListener('message', handler);
          if (msg.result.success) {
            resolve();
          } else {
            reject(new Error('Failed to mount file: ' + msg.result.error));
          }
        }
      };
      worker.addEventListener('message', handler);
      worker.postMessage({ type: 'mountFile', name, data });
    });
  }

  async unmountFile(name: string): Promise<void> {
    if (!this._isReady || !this.worker) {
      throw new Error('Python sandbox not ready');
    }
    console.debug('[Pyodide] unmountFile:', name);
    const worker = this.worker; // capture for closure
    return new Promise((resolve, reject) => {
      const handler = (e: MessageEvent) => {
        const msg = e.data;
        if (msg.type === 'unmountResult') {
          worker.removeEventListener('message', handler);
          if (msg.result.success) {
            resolve();
          } else {
            reject(new Error('Failed to unmount file: ' + msg.result.error));
          }
        }
      };
      worker.addEventListener('message', handler);
      worker.postMessage({ type: 'unmountFile', name });
    });
  }

  private _handleResult(result: PythonExecutionResult): void {
    const pending = this._pendingExecutions.shift();
    if (pending) {
      pending.resolve(result);
    }
  }

  private _sendAuthConfig(): void {
    try {
      const auth = this._getAuthConfig();
      if (auth && this.worker) {
        console.debug('[Pyodide] Sending auth config to Worker');
        this.worker.postMessage({
          type: 'setAuth',
          jwt: auth.jwt,
          did: auth.did,
          handle: auth.handle,
          pds: auth.pds,
        });
      }
    } catch (err) {
      console.debug('[Pyodide] Failed to send auth config:', err);
    }
  }

  private _getAuthConfig(): { jwt: string; did: string; handle: string; pds: string } | null {
    try {
      const session = localStorage.getItem('bsky_session');
      if (!session) return null;
      const parsed = JSON.parse(session);
      return {
        jwt: parsed.accessJwt || parsed.refreshJwt || '',
        did: parsed.did || '',
        handle: parsed.handle || '',
        pds: parsed.pds || 'https://api.bsky.app',
      };
    } catch {
      return null;
    }
  }

  private async _handleToolCall(msg: any): Promise<void> {
    const { id, method, params, sab } = msg;

    if (!this._dispatcher) {
      console.error('[Pyodide] ToolDispatcher not initialized. Call setClient() first.');
      this._writeToolResult(sab, { success: false, error: 'ToolDispatcher not initialized' });
      return;
    }

    try {
      const response = await this._dispatcher.dispatch({ method, params });
      this._writeToolResult(sab, response);
    } catch (err) {
      console.error('[Pyodide] Tool call failed:', err);
      this._writeToolResult(sab, {
        success: false,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  private _writeToolResult(sab: SharedArrayBuffer, response: { success: boolean; result?: unknown; error?: string }): void {
    try {
      const int32View = new Int32Array(sab);
      const byteView = new Uint8Array(sab);

      // Clear SAB
      byteView.fill(0);

      // Write JSON result after first 4 bytes
      const jsonStr = JSON.stringify(response);
      const encoder = new TextEncoder();
      const encoded = encoder.encode(jsonStr);

      // Write length at bytes 0-3
      const dataLength = Math.min(encoded.length, byteView.length - 4);
      byteView.set(encoded.subarray(0, dataLength), 4);

      // Signal worker that result is ready
      Atomics.store(int32View, 0, 1);
      Atomics.notify(int32View, 0, 1);
    } catch (err) {
      console.error('[Pyodide] Failed to write tool result:', err);
    }
  }

  abort(): void {
    console.debug('[Pyodide] Aborting sandbox initialization');
    if (this.worker) {
      this.worker.postMessage({ type: 'abort' });
      this.worker.terminate();
      this.worker = null;
    }
    if (this._initReject) {
      this._initReject(new Error('Initialization aborted by user'));
      this._initReject = null;
    }
    this._isReady = false;
    this._initFailed = true;
    this._initPromise = null;
  }

  dispose(): void {
    console.debug('[Pyodide] Disposing sandbox');
    this.abort();
  }
}
