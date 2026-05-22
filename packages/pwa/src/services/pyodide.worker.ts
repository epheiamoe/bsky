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

      // Fetch Pyodide loader via CORS (compatible with COEP)
      console.debug('[PyodideWorker] Fetching Pyodide loader...');
      await withTimeout(
        (async () => {
          const response = await fetch(url, { mode: 'cors' });
          if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
          }
          const code = await response.text();
          // Use eval instead of importScripts (COEP-compatible)
          (0, eval)(code);
          console.debug('[PyodideWorker] Pyodide loader loaded via fetch+eval');
        })(),
        30000,
        'Download pyodide.js via fetch'
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

          // Configure matplotlib backend and font
          pyodide.runPython(`
import matplotlib
matplotlib.use('Agg')  # Headless backend — required in WASM, no GUI dependencies
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

// ══════════════════════════════════════════════════════════════════
// Tool Dispatcher Transport (Worker ↔ Main Thread)
// ══════════════════════════════════════════════════════════════════

let requestIdCounter = 0;
const pendingResults = new Map<number, any>();

// SharedArrayBuffer for synchronous blocking between worker and main thread.
// The main thread writes the JSON result into the SAB starting at byte 4,
// then calls Atomics.notify on the first Int32 to wake the worker.
const TOOL_SAB_SIZE = 1048576; // 1MB
let toolSab: SharedArrayBuffer | null = null;
let toolSabInt32: Int32Array | null = null;

try {
  toolSab = new SharedArrayBuffer(TOOL_SAB_SIZE);
  toolSabInt32 = new Int32Array(toolSab);
} catch (e) {
  console.warn('[PyodideWorker] SharedArrayBuffer not available. Tool dispatcher requires COOP/COEP headers.');
}

/**
 * Convert Pyodide proxy objects to plain JS objects.
 * Pyodide proxies (from Python lists/dicts) cannot be serialized via postMessage.
 */
function toPlainJs(value: any, seen = new WeakSet<any>()): any {
  if (value === null || value === undefined) return value;
  if (typeof value !== 'object') return value;

  // Circular reference guard
  if (seen.has(value)) {
    console.warn('[PyodideWorker] Circular reference in toPlainJs');
    return null;
  }
  seen.add(value);

  // Pyodide proxy objects have .toJs() method
  // Use dict_converter to convert Python dicts directly to plain objects
  if (typeof value.toJs === 'function') {
    return toPlainJs(value.toJs({ dict_converter: Object.fromEntries }), seen);
  }

  if (Array.isArray(value)) {
    return value.map(item => toPlainJs(item, seen));
  }

  // Defensive fallback: Pyodide dict.toJs() without dict_converter returns Map
  if (value instanceof Map) {
    const result: Record<string, any> = {};
    for (const [k, v] of value) {
      result[String(k)] = toPlainJs(v, seen);
    }
    return result;
  }

  // Pyodide set.toJs() returns Set
  if (value instanceof Set) {
    return Array.from(value).map(item => toPlainJs(item, seen));
  }

  // Python datetime -> JS Date
  if (value instanceof Date) {
    return value.toISOString();
  }

  // Plain objects
  if (typeof value === 'object') {
    const result: Record<string, any> = {};
    for (const [k, v] of Object.entries(value)) {
      result[k] = toPlainJs(v, seen);
    }
    return result;
  }

  return value;
}

function dispatchToMainThread(method: string, params: Record<string, any>): any {
  if (!toolSab || !toolSabInt32) {
    throw new Error(
      'SharedArrayBuffer not available. The tool dispatcher requires COOP/COEP headers to be set. ' +
      'Please ensure your server sends Cross-Origin-Opener-Policy: same-origin and Cross-Origin-Embedder-Policy: require-corp.'
    );
  }

  const id = ++requestIdCounter;

  // Clear previous result from SAB
  const byteView = new Uint8Array(toolSab);
  byteView.fill(0);

  // Filter undefined values and convert Pyodide proxies to plain JS objects
  const cleanParams: Record<string, any> = {};
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) {
      cleanParams[key] = toPlainJs(value);
    }
  }

  // Send request to main thread with SAB reference
  self.postMessage({ type: 'toolCall', id, method, params: cleanParams, sab: toolSab });

  // Block until main thread signals completion via Atomics.notify
  Atomics.wait(toolSabInt32, 0, 0);

  // Read result from SAB (JSON string starts after the first 4 bytes)
  // Must copy to regular ArrayBuffer because TextDecoder cannot decode SAB views
  const rawBytes = byteView.subarray(4);
  const bytes = new Uint8Array(rawBytes.length);
  bytes.set(rawBytes);
  const decoder = new TextDecoder();
  const jsonStr = decoder.decode(bytes).replace(/\0/g, '');
  const result = JSON.parse(jsonStr);

  // Reset signal for next call
  Atomics.store(toolSabInt32, 0, 0);

  if (result && result.success === false) {
    return { error: result.error || `Tool '${method}' failed` };
  }

  // ToolDispatcher returns { success: true, result: <data> }
  return result.result !== undefined ? result.result : result.data;
}

// Create simplified transport-only bridge (no auth, no API logic).
// All tool calls are forwarded to the main thread via dispatchToMainThread.
// Write operations are blocked unless enableWrite=true (set after user confirmation).
function createToolBridge(enableWrite: boolean = false) {
  const bridge: Record<string, (kwargs: any) => any> = {};
  const writeTools = new Set(['create_post', 'like', 'repost', 'follow', 'create_list', 'edit_list_members']);

  function createBridgeMethod(method: string) {
    return (kwargs: any) => {
      if (writeTools.has(method) && !enableWrite) {
        throw new Error(`Write operation '${method}' blocked: requires user confirmation. The Python script must be approved before write operations are allowed.`);
      }
      return dispatchToMainThread(method, kwargs);
    };
  }

  // Read operations (always allowed)
  bridge.resolve_handle = createBridgeMethod('resolve_handle');
  bridge.get_record = createBridgeMethod('get_record');
  bridge.list_records = createBridgeMethod('list_records');
  bridge.search_posts = createBridgeMethod('search_posts');
  bridge.get_timeline = createBridgeMethod('get_timeline');
  bridge.get_author_feed = createBridgeMethod('get_author_feed');
  bridge.get_popular_feed_generators = createBridgeMethod('get_popular_feed_generators');
  bridge.get_feed_generator = createBridgeMethod('get_feed_generator');
  bridge.get_feed = createBridgeMethod('get_feed');
  bridge.get_post_thread = createBridgeMethod('get_post_thread');
  bridge.get_post_context = createBridgeMethod('get_post_context');
  bridge.get_post_interactions = createBridgeMethod('get_post_interactions');
  bridge.get_quotes = createBridgeMethod('get_quotes');
  bridge.search_actors = createBridgeMethod('search_actors');
  bridge.get_profile = createBridgeMethod('get_profile');
  bridge.get_connections = createBridgeMethod('get_connections');
  bridge.get_suggested_follows = createBridgeMethod('get_suggested_follows');
  bridge.list_notifications = createBridgeMethod('list_notifications');
  bridge.extract_images_from_post = createBridgeMethod('extract_images_from_post');
  bridge.download_image = createBridgeMethod('download_image');
  bridge.view_image = createBridgeMethod('view_image');
  bridge.extract_external_link = createBridgeMethod('extract_external_link');
  bridge.fetch_web_markdown = createBridgeMethod('fetch_web_markdown');
  bridge.search_web_ddg = createBridgeMethod('search_web_ddg');
  bridge.search_wikipedia = createBridgeMethod('search_wikipedia');
  bridge.get_lists = createBridgeMethod('get_lists');
  bridge.get_list_feed = createBridgeMethod('get_list_feed');

  // Write operations (blocked unless enableWrite=true)
  bridge.create_post = createBridgeMethod('create_post');
  bridge.like = createBridgeMethod('like');
  bridge.repost = createBridgeMethod('repost');
  bridge.follow = createBridgeMethod('follow');
  bridge.create_list = createBridgeMethod('create_list');
  bridge.edit_list_members = createBridgeMethod('edit_list_members');

  return bridge;
}

function analyzePythonCode(code: string): { hasWriteOperations: boolean; writeOperations: Array<{ tool: string; count: number }>; hasDynamicCalls: boolean; error?: string } {
  if (!pyodide) {
    console.error('[PyodideWorker] AST analysis skipped: pyodide not initialized');
    return { hasWriteOperations: false, writeOperations: [], hasDynamicCalls: false, error: 'Pyodide not initialized' };
  }

  try {
    const codeJson = JSON.stringify(code);

    // Setup stdout capture for AST analysis (same mechanism as executePython)
    pyodide.runPython(`
import sys
_ast_stdout_lines = []

class _ASTStdoutCapture:
    def write(self, text):
        if text:
            _ast_stdout_lines.append(str(text))
    def flush(self):
        pass

sys.stdout = _ASTStdoutCapture()
    `);

    // Run AST analysis and print JSON result to stdout
    pyodide.runPython(`
import ast
import json
from collections import Counter

code = ${codeJson}

try:
    tree = ast.parse(code)
    parse_error = None
except SyntaxError as e:
    parse_error = str(e)
    tree = None

if parse_error:
    result = {"hasWriteOperations": False, "writeOperations": [], "hasDynamicCalls": False, "error": parse_error}
else:
    write_tools = {"create_post", "like", "repost", "follow", "create_list", "edit_list_members"}
    write_ops = []
    dynamic_calls = []

    for node in ast.walk(tree):
        if isinstance(node, ast.Call):
            if isinstance(node.func, ast.Attribute) and isinstance(node.func.value, ast.Name) and node.func.value.id == 'bsky_tools':
                tool_name = node.func.attr
                if tool_name in write_tools:
                    write_ops.append({"tool": tool_name, "line": node.lineno})
            elif isinstance(node.func, ast.Name) and node.func.id == 'getattr':
                dynamic_calls.append(node.lineno)

    counts = Counter(op["tool"] for op in write_ops)

    result = {
        "hasWriteOperations": len(write_ops) > 0,
        "writeOperations": [{"tool": tool, "count": count} for tool, count in counts.items()],
        "hasDynamicCalls": len(dynamic_calls) > 0,
    }

print(json.dumps(result))
    `);

    // Read captured stdout
    const stdoutLines = pyodide.globals.get('_ast_stdout_lines').toJs();
    const stdoutText = Array.isArray(stdoutLines) ? stdoutLines.join('') : String(stdoutLines);

    if (!stdoutText || !stdoutText.trim()) {
      console.error('[PyodideWorker] AST analysis produced no stdout output');
      return { hasWriteOperations: false, writeOperations: [], hasDynamicCalls: false, error: 'AST analysis produced no output' };
    }

    const result = JSON.parse(stdoutText.trim());
    console.debug('[PyodideWorker] AST analysis result:', JSON.stringify(result));
    return result;
  } catch (err) {
    console.error('[PyodideWorker] AST analysis failed:', err);
    // [FIX] Analysis failure is a technical issue, not a security indicator.
    // Return false so execution continues; actual write safety is enforced
    // by createToolBridge(enableWrite) at execution time.
    return { hasWriteOperations: false, writeOperations: [], hasDynamicCalls: false, error: String(err) };
  }
}

async function executePython(code: string, enableWrite: boolean = false) {
  let returnValue: any = null;
  let success = false;
  let stdout = '';
  let stderr = '';
  let outputFiles: Awaited<ReturnType<typeof scanOutputFiles>> = [];
  const startTime = Date.now();

  try {
    // [FIX] Snapshot existing files in /workspace/output/ before execution
    // so we can distinguish files created by THIS execution vs previous ones.
    const existingFiles = new Set<string>();
    try {
      if (pyodide.FS && typeof pyodide.FS.readdir === 'function') {
        const entries = pyodide.FS.readdir('/workspace/output/');
        for (const name of entries) {
          if (name !== '.' && name !== '..') {
            existingFiles.add(name);
          }
        }
      }
    } catch (e) {
      console.debug('[PyodideWorker] Could not snapshot existing files:', e);
    }

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

    // Set BSKY_WORKSPACE environment variable
    pyodide.runPython(`
import os
os.environ['BSKY_WORKSPACE'] = '/workspace'
    `.trim());

    // [FIX] Update bridge reference (enableWrite may have changed since init).
    // The wrapper code was already injected during init; we only need to
    // refresh the bridge object in Python globals.
    try {
      const bridge = createToolBridge(enableWrite);
      pyodide.globals.set('bskyToolsBridge', bridge);
      console.debug('[PyodideWorker] Bridge updated for enableWrite=', enableWrite);
    } catch (injectErr) {
      console.error('[PyodideWorker] Failed to update bridge:', injectErr);
    }

    // Execute user code
    returnValue = await pyodide.runPythonAsync(code);
    success = true;

    // Read captured output
    stdout = pyodide.globals.get('_stdout_lines').toJs().join('');
    stderr = pyodide.globals.get('_stderr_lines').toJs().join('');

    // Scan output files and filter to only those created during THIS execution
    const allFiles = await scanOutputFiles();
    outputFiles = allFiles.filter(f => !existingFiles.has(f.name));
    console.debug('[PyodideWorker] Found', allFiles.length, 'total files,', outputFiles.length, 'new files this execution');
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
      
      // [FIX] Inject bsky_tools wrapper during init (before initComplete)
      // so it's available before any execute calls.
      if (msg.wrapperCode) {
        try {
          const bridge = createToolBridge(false);  // default: no write until confirmed
          pyodide.globals.set('bskyToolsBridge', bridge);
          await pyodide.runPythonAsync(msg.wrapperCode);
          console.debug('[PyodideWorker] bsky_tools injected during init');
        } catch (injectErr) {
          console.error('[PyodideWorker] Failed to inject bsky_tools during init:', injectErr);
        }
      }
      
      self.postMessage({ type: 'initComplete' });
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      console.debug('[PyodideWorker] Init failed: ' + errMsg);
      self.postMessage({ type: 'initError', error: errMsg });
    }
  } else if (msg.type === 'analyze') {
    try {
      const result = analyzePythonCode(msg.code);
      self.postMessage({ type: 'analysisResult', result });
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      self.postMessage({ type: 'analysisResult', result: { error: errMsg } });
    }
  } else if (msg.type === 'execute') {
    try {
      const enableWrite = msg.enableWrite === true;
      const result = await executePython(msg.code, enableWrite);
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
  } else if (msg.type === 'toolResult') {
    // Store result for any async handling (SAB is the primary sync mechanism)
    pendingResults.set(msg.id, msg.result);
  } else if (msg.type === 'setAuth') {
    // No-op: auth is managed by main thread; kept for backward compatibility
    console.debug('[PyodideWorker] Auth config received (ignored — main thread manages auth)');
  } else if (msg.type === 'abort') {
    console.debug('[PyodideWorker] Abort received');
    initAborted = true;
  } else {
    console.debug('[PyodideWorker] Unknown message: ' + msg.type);
  }
};
