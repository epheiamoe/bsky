/**
 * Pyodide Web Worker — runs in browser, loads Pyodide WASM from CDN.
 *
 * Uses CLASSIC Worker (IIFE) semantics via Vite's `?worker` import.
 * Vite bundles this file as a standalone chunk; `importScripts()` is used
 * to load the external Pyodide loader from CDN.
 */

// Tell TypeScript this is a Worker context, not Window
/// <reference lib="webworker" />

const CDN_URLS = [
  'https://cdn.jsdelivr.net/pyodide/v0.25.0/full/pyodide.js',
];

let pyodide: any = null;
let initAborted = false;

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`${label} timed out after ${ms}ms`));
    }, ms);
    promise.then(
      (result) => {
        clearTimeout(timer);
        resolve(result);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      }
    );
  });
}

async function loadPyodideRuntime() {
  console.debug('[PyodideWorker] loadPyodide() called');
  if (pyodide !== null) {
    console.debug('[PyodideWorker] Pyodide already loaded, returning cached instance');
    return pyodide;
  }

  let lastError: Error | null = null;
  for (let i = 0; i < CDN_URLS.length; i++) {
    if (initAborted) {
      throw new Error('Initialization aborted by user');
    }
    const url = CDN_URLS[i];
    try {
      console.debug('[PyodideWorker] Trying CDN: ' + url);
      self.postMessage({ type: 'initProgress', stage: 'downloading', progress: 0.1, message: 'Downloading Pyodide loader...' });

      // Classic Worker: use importScripts instead of dynamic import
      console.debug('[PyodideWorker] Calling importScripts...');
      await withTimeout(
        new Promise<void>((resolve, reject) => {
          try {
            self.importScripts(url);
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
      const loadFn = (self as any).loadPyodide || (globalThis as any).loadPyodide;
      if (typeof loadFn !== 'function') {
        console.debug('[PyodideWorker] loadPyodide not found. self keys: ' + Object.keys(self).join(', '));
        throw new Error('loadPyodide not found after importScripts ' + url);
      }
      console.debug('[PyodideWorker] loadPyodide found');

      const lastSlash = url.lastIndexOf('/');
      const baseUrl = lastSlash > 0 ? url.substring(0, lastSlash + 1) : url + '/';
      console.debug('[PyodideWorker] Base URL: ' + baseUrl);
      self.postMessage({ type: 'initProgress', stage: 'loading', progress: 0.3, message: 'Loading Pyodide WASM runtime...' });

      console.debug('[PyodideWorker] Calling loadPyodide({ indexURL: baseUrl })...');
      pyodide = await withTimeout(loadFn({ indexURL: baseUrl }), 60000, 'Load Pyodide WASM');
      console.debug('[PyodideWorker] Pyodide loaded successfully. pyodide object type: ' + typeof pyodide);

      // Setup workspace filesystem (defensive, wrapped in try/catch)
      console.debug('[PyodideWorker] Setting up filesystem...');
      try {
        const fs = pyodide.FS;
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

      // Load micropip and install third-party packages (best-effort)
      console.debug('[PyodideWorker] Loading micropip...');
      self.postMessage({ type: 'initProgress', stage: 'packages', progress: 0.7, message: 'Loading package manager...' });
      try {
        await withTimeout(
          pyodide.loadPackage('micropip'),
          60000,
          'Load micropip'
        );
        console.debug('[PyodideWorker] micropip loaded');

        // Batch 1: Core data science packages
        const corePackages = ['pandas', 'numpy', 'matplotlib'];
        console.debug('[PyodideWorker] Installing core packages: ' + corePackages.join(', '));
        self.postMessage({ type: 'initProgress', stage: 'packages', progress: 0.75, message: 'Installing pandas, numpy, matplotlib (this may take 30-60s)...' });
        await withTimeout(
          pyodide.runPythonAsync(`
import micropip
await micropip.install(${JSON.stringify(corePackages)})
          `.trim()),
          120000,
          'Install core packages'
        );
        console.debug('[PyodideWorker] Core packages installed');

        // Batch 2: Utility packages (small, fast)
        const utilPackages = ['beautifulsoup4', 'pyyaml', 'openpyxl'];
        console.debug('[PyodideWorker] Installing utility packages: ' + utilPackages.join(', '));
        self.postMessage({ type: 'initProgress', stage: 'packages', progress: 0.85, message: 'Installing beautifulsoup4, pyyaml, openpyxl...' });
        await withTimeout(
          pyodide.runPythonAsync(`
import micropip
await micropip.install(${JSON.stringify(utilPackages)})
          `.trim()),
          60000,
          'Install utility packages'
        );
        console.debug('[PyodideWorker] Utility packages installed');

        // Batch 3: Heavy packages (scipy, scikit-learn) — best effort
        const heavyPackages = ['scipy', 'scikit-learn'];
        console.debug('[PyodideWorker] Installing heavy packages: ' + heavyPackages.join(', '));
        self.postMessage({ type: 'initProgress', stage: 'packages', progress: 0.9, message: 'Installing scipy, scikit-learn (this may take 1-2min)...' });
        try {
          await withTimeout(
            pyodide.runPythonAsync(`
import micropip
await micropip.install(${JSON.stringify(heavyPackages)})
            `.trim()),
            180000,
            'Install heavy packages'
          );
          console.debug('[PyodideWorker] Heavy packages installed');
        } catch (heavyErr) {
          console.debug('[PyodideWorker] Heavy packages skipped: ' + String(heavyErr));
        }

        self.postMessage({ type: 'initProgress', stage: 'packages', progress: 0.95, message: 'Packages installed successfully' });
      } catch (pkgErr) {
        console.debug('[PyodideWorker] Package installation warning (non-fatal): ' + String(pkgErr));
        self.postMessage({ type: 'initProgress', stage: 'packages', progress: 0.95, message: 'Package installation skipped (some packages may be unavailable)' });
      }

      // Download and configure Chinese font for matplotlib (best-effort)
      console.debug('[PyodideWorker] Setting up Chinese font for matplotlib...');
      try {
        const fontUrl = 'https://cdn.jsdelivr.net/gh/googlefonts/noto-cjk@main/Sans/OTF/SimplifiedChinese/NotoSansCJKsc-Regular.otf';
        console.debug('[PyodideWorker] Downloading font from: ' + fontUrl);
        self.postMessage({ type: 'initProgress', stage: 'packages', progress: 0.96, message: 'Downloading Chinese font...' });

        const fontResponse = await withTimeout(
          fetch(fontUrl),
          30000,
          'Download Chinese font'
        );
        if (fontResponse.ok) {
          const fontBuffer = await fontResponse.arrayBuffer();
          const fontPath = '/home/pyodide/.fonts/NotoSansSC-Regular.otf';
          pyodide.FS.mkdirTree('/home/pyodide/.fonts');
          pyodide.FS.writeFile(fontPath, new Uint8Array(fontBuffer));
          console.debug('[PyodideWorker] Font downloaded and saved to: ' + fontPath);

          // Configure matplotlib to use the downloaded font
          pyodide.runPython(`
import matplotlib
import matplotlib.font_manager as fm
matplotlib.rcParams['axes.unicode_minus'] = False

# Add the downloaded font
font_path = '/home/pyodide/.fonts/NotoSansSC-Regular.otf'
fm.fontManager.addfont(font_path)
prop = fm.FontProperties(fname=font_path)

# Set as default sans-serif font
matplotlib.rcParams['font.sans-serif'] = [prop.get_name()] + matplotlib.rcParams.get('font.sans-serif', [])
          `);
          console.debug('[PyodideWorker] Matplotlib Chinese font configured');
        } else {
          console.debug('[PyodideWorker] Font download failed: ' + fontResponse.status);
        }
      } catch (fontErr) {
        console.debug('[PyodideWorker] Chinese font setup skipped (non-fatal): ' + String(fontErr));
      }

      console.debug('[PyodideWorker] Sending initComplete');
      self.postMessage({ type: 'initProgress', stage: 'ready', progress: 1, message: 'Python sandbox ready' });
      return pyodide;
    } catch (err) {
      lastError = err as Error;
      console.debug('[PyodideWorker] CDN failed: ' + url + ' - ' + String(err));
      self.postMessage({ type: 'initProgress', stage: 'retry', progress: 0.1, message: 'CDN failed, trying next...' });
    }
  }

  throw new Error('All CDN sources failed. Last error: ' + (lastError?.message ?? String(lastError)));
}

function getFileType(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase() ?? '';
  const typeMap: Record<string, string> = {
    'csv': 'csv',
    'json': 'json',
    'png': 'png',
    'jpg': 'jpg',
    'jpeg': 'jpeg',
    'txt': 'txt',
    'md': 'md',
    'py': 'txt',
  };
  return typeMap[ext] || 'unknown';
}

function isTextFile(type: string): boolean {
  return type === 'csv' || type === 'json' || type === 'txt' || type === 'md';
}

async function scanOutputFiles(): Promise<Array<{ name: string; type: string; size: number; path: string; content: string }>> {
  const files: Array<{ name: string; type: string; size: number; path: string; content: string }> = [];
  try {
    if (!pyodide.FS || typeof pyodide.FS.readdir !== 'function') {
      console.log('[PyodideWorker] FS not available, skipping file scan');
      return files;
    }
    const entries = pyodide.FS.readdir('/workspace/output/');
    console.log('[PyodideWorker] Scanned /workspace/output/, found', entries.length, 'entries:', entries.join(', '));
    for (let i = 0; i < entries.length; i++) {
      const name = entries[i];
      if (name === '.' || name === '..') continue;

      const path = '/workspace/output/' + name;
      const stat = pyodide.FS.stat(path);
      const type = getFileType(name);
      let content = '';

      try {
        console.log('[PyodideWorker] Reading file: ' + name + ' (type: ' + type + ', stat.size: ' + stat.size + ')');
        // Always read as binary to get Uint8Array, then decode text if needed
        const rawData = pyodide.FS.readFile(path, { encoding: 'binary' });
        console.log('[PyodideWorker] readFile returned type: ' + typeof rawData + ', constructor: ' + (rawData?.constructor?.name || 'unknown') + ', length: ' + (rawData?.length ?? 'N/A'));

        if (isTextFile(type)) {
          // Decode text files using TextDecoder (reliable across Pyodide versions)
          if (typeof rawData === 'string') {
            content = rawData;
            console.log('[PyodideWorker] File ' + name + ' returned as string, length: ' + rawData.length);
          } else if (rawData instanceof Uint8Array) {
            content = new TextDecoder('utf-8').decode(rawData);
            console.log('[PyodideWorker] File ' + name + ' decoded from Uint8Array, length: ' + content.length);
          } else {
            console.log('[PyodideWorker] File ' + name + ' unexpected type, converting to string');
            content = String(rawData);
          }
        } else {
          // Binary files: convert to base64
          const bytes = new Uint8Array(rawData);
          console.log('[PyodideWorker] Binary file ' + name + ', size: ' + bytes.length + ' bytes');
          const chunkSize = 32768; // Safe limit (below 65535)
          let binaryStr = '';
          for (let j = 0; j < bytes.length; j += chunkSize) {
            const chunk = bytes.subarray(j, j + chunkSize);
            binaryStr += String.fromCharCode.apply(null, chunk as any);
          }
          content = btoa(binaryStr);
        }
      } catch (readErr) {
        console.log('[PyodideWorker] Failed to read file ' + name + ': ' + String(readErr));
      }

      files.push({
        name: name,
        type: type,
        size: stat.size,
        path: path,
        content: content,
      });
      console.log('[PyodideWorker] Added file to result:', name, 'contentLength:', content.length);
    }
    console.log('[PyodideWorker] File scan complete, returning', files.length, 'files');
  } catch (err) {
    console.log('[PyodideWorker] Failed to scan output directory: ' + String(err));
  }
  return files;
}

async function executePython(code: string) {
  let returnValue: any = null;
  let success = false;
  let stdout = '';
  let stderr = '';
  let outputFiles: Awaited<ReturnType<typeof scanOutputFiles>> = [];
  const startTime = Date.now();

  try {
    // Setup stdout/stderr capture using Python-level redirection (safe, no JS API dependency)
    pyodide.runPython(
      [
        'import sys',
        '_stdout_lines = []',
        '_stderr_lines = []',
        '',
        'class _StdoutCapture:',
        '    def write(self, text):',
        '        if text:',
        '            _stdout_lines.append(str(text))',
        '    def flush(self):',
        '        pass',
        '',
        'class _StderrCapture:',
        '    def write(self, text):',
        '        if text:',
        '            _stderr_lines.append(str(text))',
        '    def flush(self):',
        '        pass',
        '',
        'sys.stdout = _StdoutCapture()',
        'sys.stderr = _StderrCapture()',
      ].join('\n')
    );

    // Execute user code
    returnValue = await pyodide.runPythonAsync(code);
    success = true;

    // Read captured output
    stdout = pyodide.globals.get('_stdout_lines').toJs().join('');
    stderr = pyodide.globals.get('_stderr_lines').toJs().join('');

    // Scan output files
    outputFiles = await scanOutputFiles();
  } catch (err) {
    console.log('[PyodideWorker] Execution error: ' + (err instanceof Error ? err.message : String(err)));
    throw err;
  }

  const executionTime = Date.now() - startTime;

  return {
    stdout: stdout,
    stderr: stderr,
    returnValue: returnValue,
    files: outputFiles,
    success: success,
    executionTime: executionTime,
    executionTimestamp: startTime,
  };
}

function mountFile(name: string, data: Uint8Array) {
  const path = '/workspace/data/' + name;
  try {
    pyodide.FS.writeFile(path, data);
    console.debug('[PyodideWorker] Mounted file: ' + path);
    return { success: true };
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    console.debug('[PyodideWorker] Failed to mount file: ' + errMsg);
    return { success: false, error: errMsg };
  }
}

function unmountFile(name: string) {
  const path = '/workspace/data/' + name;
  try {
    pyodide.FS.unlink(path);
    console.debug('[PyodideWorker] Unmounted file: ' + path);
    return { success: true };
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    console.debug('[PyodideWorker] Failed to unmount file: ' + errMsg);
    return { success: false, error: errMsg };
  }
}

self.onmessage = async function (e: MessageEvent) {
  const msg = e.data;
  if (msg.type === 'init') {
    try {
      console.debug('[PyodideWorker] Init message received, starting loadPyodide...');
      await loadPyodideRuntime();
      console.debug('[PyodideWorker] loadPyodide completed successfully');
      self.postMessage({ type: 'initComplete' });
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      console.debug('[PyodideWorker] Init failed: ' + errMsg);
      self.postMessage({ type: 'initError', error: errMsg });
    }
  } else if (msg.type === 'execute') {
    try {
      const result = await executePython(msg.code);
      self.postMessage({ type: 'result', result: result });
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      self.postMessage({
        type: 'result',
        result: {
          stdout: '',
          stderr: errMsg,
          returnValue: null,
          files: [],
          success: false,
          executionTime: 0,
        },
      });
    }
  } else if (msg.type === 'mountFile') {
    const result = mountFile(msg.name, msg.data);
    self.postMessage({ type: 'mountResult', result: result });
  } else if (msg.type === 'unmountFile') {
    const result = unmountFile(msg.name);
    self.postMessage({ type: 'unmountResult', result: result });
  } else if (msg.type === 'abort') {
    console.debug('[PyodideWorker] Abort received');
    initAborted = true;
  } else {
    console.debug('[PyodideWorker] Unknown message: ' + msg.type);
  }
};
