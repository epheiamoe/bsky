import type { PythonSandboxEngine, PythonExecutionResult } from '@bsky/core';

/**
 * Minimal inline Worker code — embedded as string to avoid MIME type issues.
 * 
 * Loads Pyodide from CDN using dynamic import in a module Worker.
 * Only supports basic init and execute — no packages, no filesystem, no stdout capture.
 */
const WORKER_CODE = `
var CDN_URLS = [
  'https://cdn.jsdelivr.net/pyodide/v0.25.0/full/pyodide.js',
];

var pyodide = null;

async function loadPyodide() {
  if (pyodide !== null) {
    return pyodide;
  }

  var lastError = null;
  for (var i = 0; i < CDN_URLS.length; i++) {
    var url = CDN_URLS[i];
    try {
      console.debug('[PyodideWorker] Trying CDN: ' + url);
      await import(url);

      var loadFn = self.loadPyodide || globalThis.loadPyodide;
      if (typeof loadFn !== 'function') {
        throw new Error('loadPyodide not found after importing ' + url);
      }

      var lastSlash = url.lastIndexOf('/');
      var baseUrl = lastSlash > 0 ? url.substring(0, lastSlash + 1) : url + '/';
      console.debug('[PyodideWorker] Base URL: ' + baseUrl);
      pyodide = await loadFn({ indexURL: baseUrl });
      console.debug('[PyodideWorker] Pyodide loaded successfully');
      return pyodide;
    } catch (err) {
      lastError = err;
      console.debug('[PyodideWorker] CDN failed: ' + url + ' - ' + String(err));
    }
  }

  throw new Error('All CDN sources failed. Last error: ' + (lastError !== null && lastError.message !== undefined ? lastError.message : String(lastError)));
}

async function executePython(code) {
  var returnValue = null;
  var success = false;
  try {
    returnValue = await pyodide.runPythonAsync(code);
    success = true;
  } catch (err) {
    console.debug('[PyodideWorker] Execution error: ' + (err.message !== undefined ? err.message : String(err)));
    throw err;
  }
  return { stdout: '', stderr: '', returnValue: returnValue, files: [], success: success, executionTime: 0 };
}

self.onmessage = async function(e) {
  var msg = e.data;
  if (msg.type === 'init') {
    try {
      console.debug('[PyodideWorker] Init message received, starting loadPyodide...');
      await loadPyodide();
      console.debug('[PyodideWorker] loadPyodide completed successfully');
      self.postMessage({ type: 'initComplete' });
    } catch (err) {
      var errMsg = err.message !== undefined ? err.message : String(err);
      console.debug('[PyodideWorker] Init failed: ' + errMsg);
      self.postMessage({ type: 'initError', error: errMsg });
    }
  } else if (msg.type === 'execute') {
    try {
      var result = await executePython(msg.code);
      self.postMessage({ type: 'result', result: result });
    } catch (err) {
      var errMsg = err.message !== undefined ? err.message : String(err);
      self.postMessage({ type: 'result', result: { stdout: '', stderr: errMsg, returnValue: null, files: [], success: false, executionTime: 0 }});
    }
  } else {
    console.debug('[PyodideWorker] Unknown message: ' + msg.type);
  }
};
`;

/**
 * PyodideSandbox — minimal PWA implementation of PythonSandboxEngine via inline Web Worker.
 * 
 * Uses Blob URL to avoid MIME type issues with .ts files on CDN deployments.
 * Supports CDN fallback (jsdelivr -> unpkg).
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

  constructor() {
    console.debug('[Pyodide] Sandbox instance created');
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
    // TODO: implement progress reporting
    console.debug('[Pyodide] setOnProgress called');
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

    console.debug('[Pyodide] Starting inline Worker initialization...');

    this._initPromise = new Promise<void>((resolve, reject) => {
      try {
        const blob = new Blob([WORKER_CODE], { type: 'application/javascript' });
        const url = URL.createObjectURL(blob);
        console.debug('[Pyodide] Created inline Worker from Blob URL');
        this.worker = new Worker(url, { type: 'module' });
      } catch (err) {
        console.debug('[Pyodide] Failed to create Worker:', err);
        this._initFailed = true;
        this._initPromise = null;
        reject(new Error('Failed to create Web Worker: ' + String(err)));
        return;
      }

      this.worker.onmessage = (e) => {
        const msg = e.data;
        if (msg.type === 'initComplete') {
          console.debug('[Pyodide] Worker init complete');
          this._isReady = true;
          resolve();
        } else if (msg.type === 'initError') {
          console.debug('[Pyodide] Worker init error:', msg.error);
          this._initFailed = true;
          this._initPromise = null;
          reject(new Error(msg.error));
        } else if (msg.type === 'result') {
          this._handleResult(msg.result);
        }
      };

      this.worker.onerror = (err) => {
        const details = err.message || 'unknown error';
        console.debug('[Pyodide] Worker error:', details);
        this._initFailed = true;
        this._initPromise = null;
        reject(new Error('Worker error: ' + details));
      };

      console.debug('[Pyodide] Sending init message to Worker');
      this.worker.postMessage({ type: 'init' });
    });

    yield { stage: 'loading', progress: 0.5, message: 'Loading Python runtime...' };
    await this._initPromise;
    yield { stage: 'ready', progress: 1, message: 'Python sandbox ready' };
  }

  async execute(code: string, chatId?: string): Promise<PythonExecutionResult> {
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

    console.debug('[Pyodide] Sending execute to Worker, code length:', code.length);
    return new Promise((resolve, reject) => {
      this._pendingExecutions.push({ resolve, reject, code });
      this.worker!.postMessage({ type: 'execute', code });
    });
  }

  async mountFile(name: string, data: Uint8Array): Promise<void> {
    console.debug('[Pyodide] mountFile called (not implemented in minimal version)');
    return Promise.resolve();
  }

  async unmountFile(name: string): Promise<void> {
    console.debug('[Pyodide] unmountFile called (not implemented in minimal version)');
    return Promise.resolve();
  }

  private _handleResult(result: PythonExecutionResult): void {
    const pending = this._pendingExecutions.shift();
    if (pending) {
      pending.resolve(result);
    }
  }

  dispose(): void {
    console.debug('[Pyodide] Disposing sandbox');
    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
    }
    this._isReady = false;
    this._initFailed = false;
    this._initPromise = null;
  }
}
