import type { PythonSandboxEngine, PythonExecutionResult } from '@bsky/core';

/**
 * Minimal inline Worker code — embedded as string to avoid MIME type issues.
 * 
 * Uses CLASSIC Worker (not module) with importScripts() to load Pyodide.
 * This avoids browser compatibility issues with module Workers loading UMD scripts.
 * 
 * Features:
 * - stdout/stderr capture via Python-level redirection
 * - Workspace filesystem setup (/workspace/data, /workspace/output, /workspace/temp)
 * - Output file scanning after execution
 * - Detailed debug logging at each step
 */
const WORKER_CODE = `
var CDN_URLS = [
  'https://cdn.jsdelivr.net/pyodide/v0.25.0/full/pyodide.js',
];

var pyodide = null;
var initAborted = false;

function withTimeout(promise, ms, label) {
  return new Promise(function(resolve, reject) {
    var timer = setTimeout(function() {
      reject(new Error(label + ' timed out after ' + ms + 'ms'));
    }, ms);
    promise.then(function(result) {
      clearTimeout(timer);
      resolve(result);
    }, function(err) {
      clearTimeout(timer);
      reject(err);
    });
  });
}

async function loadPyodide() {
  console.debug('[PyodideWorker] loadPyodide() called');
  if (pyodide !== null) {
    console.debug('[PyodideWorker] Pyodide already loaded, returning cached instance');
    return pyodide;
  }

  var lastError = null;
  for (var i = 0; i < CDN_URLS.length; i++) {
    if (initAborted) {
      throw new Error('Initialization aborted by user');
    }
    var url = CDN_URLS[i];
    try {
      console.debug('[PyodideWorker] Trying CDN: ' + url);
      self.postMessage({ type: 'initProgress', stage: 'downloading', progress: 0.1, message: 'Downloading Pyodide loader...' });
      
      // Classic Worker: use importScripts instead of dynamic import
      console.debug('[PyodideWorker] Calling importScripts...');
      await withTimeout(
        new Promise(function(resolve, reject) {
          try {
            importScripts(url);
            console.debug('[PyodideWorker] importScripts succeeded');
            resolve();
          } catch (err) {
            console.debug('[PyodideWorker] importScripts failed: ' + String(err));
            reject(err);
          }
        }),
        30000,
        'Download pyodide.js via importScripts'
      );

      console.debug('[PyodideWorker] Looking for loadPyodide function...');
      var loadFn = self.loadPyodide || globalThis.loadPyodide;
      if (typeof loadFn !== 'function') {
        console.debug('[PyodideWorker] loadPyodide not found. self keys: ' + Object.keys(self).join(', '));
        throw new Error('loadPyodide not found after importScripts ' + url);
      }
      console.debug('[PyodideWorker] loadPyodide found');

      var lastSlash = url.lastIndexOf('/');
      var baseUrl = lastSlash > 0 ? url.substring(0, lastSlash + 1) : url + '/';
      console.debug('[PyodideWorker] Base URL: ' + baseUrl);
      self.postMessage({ type: 'initProgress', stage: 'loading', progress: 0.3, message: 'Loading Pyodide WASM runtime...' });
      
      console.debug('[PyodideWorker] Calling loadPyodide({ indexURL: baseUrl })...');
      pyodide = await withTimeout(loadFn({ indexURL: baseUrl }), 60000, 'Load Pyodide WASM');
      console.debug('[PyodideWorker] Pyodide loaded successfully. pyodide object type: ' + typeof pyodide);
      
      // Setup workspace filesystem (defensive, wrapped in try/catch)
      console.debug('[PyodideWorker] Setting up filesystem...');
      try {
        var fs = pyodide.FS;
        console.debug('[PyodideWorker] FS object found: ' + typeof fs);
        if (fs && typeof fs.mkdirTree === 'function') {
          console.debug('[PyodideWorker] Creating /workspace/data...');
          fs.mkdirTree('/workspace/data');
          console.debug('[PyodideWorker] Creating /workspace/output...');
          fs.mkdirTree('/workspace/output');
          console.debug('[PyodideWorker] Creating /workspace/temp...');
          fs.mkdirTree('/workspace/temp');
          console.debug('[PyodideWorker] Workspace directories created');
        } else {
          console.debug('[PyodideWorker] FS.mkdirTree not available, skipping filesystem setup');
        }
      } catch (fsErr) {
        console.debug('[PyodideWorker] FS setup warning (may already exist): ' + String(fsErr));
      }
      
      console.debug('[PyodideWorker] Sending initComplete');
      self.postMessage({ type: 'initProgress', stage: 'ready', progress: 1, message: 'Python sandbox ready' });
      return pyodide;
    } catch (err) {
      lastError = err;
      console.debug('[PyodideWorker] CDN failed: ' + url + ' - ' + String(err));
      self.postMessage({ type: 'initProgress', stage: 'retry', progress: 0.1, message: 'CDN failed, trying next...' });
    }
  }

  throw new Error('All CDN sources failed. Last error: ' + (lastError !== null && lastError.message !== undefined ? lastError.message : String(lastError)));
}

function getFileType(filename) {
  var ext = filename.split('.').pop().toLowerCase();
  var typeMap = {
    'csv': 'csv',
    'json': 'json',
    'png': 'png',
    'jpg': 'jpg',
    'jpeg': 'jpeg',
    'txt': 'txt',
    'md': 'md',
    'py': 'txt'
  };
  return typeMap[ext] || 'unknown';
}

function isTextFile(type) {
  return type === 'csv' || type === 'json' || type === 'txt' || type === 'md';
}

async function scanOutputFiles() {
  var files = [];
  try {
    if (!pyodide.FS || typeof pyodide.FS.readdir !== 'function') {
      return files;
    }
    var entries = pyodide.FS.readdir('/workspace/output/');
    for (var i = 0; i < entries.length; i++) {
      var name = entries[i];
      if (name === '.' || name === '..') continue;
      
      var path = '/workspace/output/' + name;
      var stat = pyodide.FS.stat(path);
      var type = getFileType(name);
      var content = '';
      
      try {
        if (isTextFile(type)) {
          content = pyodide.FS.readFile(path, { encoding: 'utf8' });
        } else {
          var binary = pyodide.FS.readFile(path);
          var bytes = new Uint8Array(binary);
          var chunkSize = 32768; // Safe limit (below 65535)
          var binaryStr = '';
          for (var j = 0; j < bytes.length; j += chunkSize) {
            var chunk = bytes.subarray(j, j + chunkSize);
            binaryStr += String.fromCharCode.apply(null, chunk);
          }
          content = btoa(binaryStr);
        }
      } catch (readErr) {
        console.debug('[PyodideWorker] Failed to read file ' + name + ': ' + String(readErr));
      }
      
      files.push({
        name: name,
        type: type,
        size: stat.size,
        path: path,
        content: content
      });
    }
  } catch (err) {
    console.debug('[PyodideWorker] Failed to scan output directory: ' + String(err));
  }
  return files;
}

async function executePython(code) {
  var returnValue = null;
  var success = false;
  var stdout = '';
  var stderr = '';
  
  try {
    // Setup stdout/stderr capture using Python-level redirection (safe, no JS API dependency)
    pyodide.runPython(["import sys", "_stdout_lines = []", "_stderr_lines = []", "", "class _StdoutCapture:", "    def write(self, text):", "        if text:", "            _stdout_lines.append(str(text))", "    def flush(self):", "        pass", "", "class _StderrCapture:", "    def write(self, text):", "        if text:", "            _stderr_lines.append(str(text))", "    def flush(self):", "        pass", "", "sys.stdout = _StdoutCapture()", "sys.stderr = _StderrCapture()"].join("\n"));
    
    // Execute user code
    returnValue = await pyodide.runPythonAsync(code);
    success = true;
    
    // Read captured output
    stdout = pyodide.globals.get('_stdout_lines').toJs().join('');
    stderr = pyodide.globals.get('_stderr_lines').toJs().join('');
    
    // Scan output files
    var outputFiles = await scanOutputFiles();
    
  } catch (err) {
    console.debug('[PyodideWorker] Execution error: ' + (err.message !== undefined ? err.message : String(err)));
    throw err;
  }
  
  return { stdout: stdout, stderr: stderr, returnValue: returnValue, files: outputFiles, success: success, executionTime: 0 };
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
  } else if (msg.type === 'abort') {
    console.debug('[PyodideWorker] Abort received');
    initAborted = true;
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
  private _initReject: ((error: Error) => void) | null = null;
  private _onProgress: ((msg: { stage: string; progress: number; message: string }) => void) | null = null;

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

    console.debug('[Pyodide] Starting inline Worker initialization...');

    this._initPromise = new Promise<void>((resolve, reject) => {
      this._initReject = reject;
      try {
        const blob = new Blob([WORKER_CODE], { type: 'application/javascript' });
        const url = URL.createObjectURL(blob);
        console.debug('[Pyodide] Created inline Worker from Blob URL');
        console.debug('[Pyodide] Creating Classic Worker (no module type)...');
        this.worker = new Worker(url);
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
    });

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
