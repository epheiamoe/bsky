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
function toPlainJs(value: any): any {
  if (value === null || value === undefined) return value;
  // Pyodide proxy objects have .toJs() method
  if (typeof value.toJs === 'function') {
    return toPlainJs(value.toJs());
  }
  if (Array.isArray(value)) {
    return value.map(toPlainJs);
  }
  if (typeof value === 'object') {
    const result: Record<string, any> = {};
    for (const [k, v] of Object.entries(value)) {
      result[k] = toPlainJs(v);
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
function createToolBridge() {
  const bridge: Record<string, (...args: any[]) => any> = {};

  // Read operations
  bridge.resolve_handle = (handle: string, fields?: string[]) =>
    dispatchToMainThread('resolve_handle', { handle, fields });
  bridge.get_record = (uri: string, fields?: string[]) =>
    dispatchToMainThread('get_record', { uri, fields });
  bridge.list_records = (repo: string, collection: string, limit?: number, cursor?: string, fields?: string[]) =>
    dispatchToMainThread('list_records', { repo, collection, limit, cursor, fields });
  bridge.search_posts = (q: string, limit?: number, cursor?: string, sort?: string, fields?: string[]) =>
    dispatchToMainThread('search_posts', { q, limit, cursor, sort, fields });
  bridge.get_timeline = (limit?: number, cursor?: string, fields?: string[]) =>
    dispatchToMainThread('get_timeline', { limit, cursor, fields });
  bridge.get_author_feed = (actor: string, limit?: number, cursor?: string, fields?: string[]) =>
    dispatchToMainThread('get_author_feed', { actor, limit, cursor, fields });
  bridge.get_popular_feed_generators = (limit?: number, fields?: string[]) =>
    dispatchToMainThread('get_popular_feed_generators', { limit, fields });
  bridge.get_feed_generator = (feed: string, fields?: string[]) =>
    dispatchToMainThread('get_feed_generator', { feed, fields });
  bridge.get_feed = (feed: string, limit?: number, cursor?: string, fields?: string[]) =>
    dispatchToMainThread('get_feed', { feed, limit, cursor, fields });
  bridge.get_post_thread = (uri: string, depth?: number, format?: string, maxReplies?: number, fields?: string[]) =>
    dispatchToMainThread('get_post_thread', { uri, depth, format, maxReplies, fields });
  bridge.get_post_context = (uri: string, maxReplies?: number, fields?: string[]) =>
    dispatchToMainThread('get_post_context', { uri, maxReplies, fields });
  bridge.get_post_interactions = (uri: string, type?: string, limit?: number, cursor?: string, fields?: string[]) =>
    dispatchToMainThread('get_post_interactions', { uri, type, limit, cursor, fields });
  bridge.get_quotes = (uri: string, limit?: number, cursor?: string, fields?: string[]) =>
    dispatchToMainThread('get_quotes', { uri, limit, cursor, fields });
  bridge.search_actors = (q: string, limit?: number, cursor?: string, fields?: string[]) =>
    dispatchToMainThread('search_actors', { q, limit, cursor, fields });
  bridge.get_profile = (actor: string, fields?: string[]) =>
    dispatchToMainThread('get_profile', { actor, fields });
  bridge.get_connections = (actor: string, direction?: string, limit?: number, cursor?: string, fields?: string[]) =>
    dispatchToMainThread('get_connections', { actor, direction, limit, cursor, fields });
  bridge.get_suggested_follows = (actor: string, fields?: string[]) =>
    dispatchToMainThread('get_suggested_follows', { actor, fields });
  bridge.list_notifications = (limit?: number, cursor?: string, fields?: string[]) =>
    dispatchToMainThread('list_notifications', { limit, cursor, fields });
  bridge.extract_images_from_post = (uri: string, fields?: string[]) =>
    dispatchToMainThread('extract_images_from_post', { uri, fields });
  bridge.download_image = (did: string, cid: string, filename?: string, fields?: string[]) =>
    dispatchToMainThread('download_image', { did, cid, filename, fields });
  bridge.view_image = (did?: string, cid?: string, alt?: string, uploadIndex?: number, fields?: string[]) =>
    dispatchToMainThread('view_image', { did, cid, alt, uploadIndex, fields });
  bridge.extract_external_link = (uri: string) =>
    dispatchToMainThread('extract_external_link', { uri });
  bridge.fetch_web_markdown = (url: string) =>
    dispatchToMainThread('fetch_web_markdown', { url });
  bridge.search_web_ddg = (query: string) =>
    dispatchToMainThread('search_web_ddg', { query });
  bridge.search_wikipedia = (query: string, lang?: string) =>
    dispatchToMainThread('search_wikipedia', { query, lang });
  bridge.get_lists = (actor?: string) =>
    dispatchToMainThread('get_lists', { actor });
  bridge.get_list_feed = (listUri: string, limit?: number, cursor?: string) =>
    dispatchToMainThread('get_list_feed', { list: listUri, limit, cursor });

  // Write operations (main thread handles confirmation)
  bridge.create_post = (text: string, replyTo?: string, quoteUri?: string, images?: any[], threadgate?: any) =>
    dispatchToMainThread('create_post', { text, replyTo, quoteUri, images, threadgate });
  bridge.like = (uri: string) =>
    dispatchToMainThread('like', { uri });
  bridge.repost = (uri: string) =>
    dispatchToMainThread('repost', { uri });
  bridge.follow = (subject: string) =>
    dispatchToMainThread('follow', { subject });
  bridge.create_list = (name: string, purpose: string, description?: string) =>
    dispatchToMainThread('create_list', { name, purpose, description });
  bridge.edit_list_members = (listUri: string, subject: string, action?: string) =>
    dispatchToMainThread('edit_list_members', { listUri, subject, action });

  return bridge;
}

function analyzePythonCode(code: string): { hasWriteOperations: boolean; writeOperations: Array<{ tool: string; count: number }>; hasDynamicCalls: boolean; error?: string } {
  if (!pyodide) return { hasWriteOperations: false, writeOperations: [], hasDynamicCalls: false, error: 'Pyodide not initialized' };
  
  try {
    const result = pyodide.runPython(`
import ast
import json

code = """${code.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n')}"""

try:
    tree = ast.parse(code)
except SyntaxError as e:
    print(json.dumps({"error": str(e)}))
    exit()

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

from collections import Counter
counts = Counter(op["tool"] for op in write_ops)

result = {
    "hasWriteOperations": len(write_ops) > 0,
    "writeOperations": [{"tool": tool, "count": count} for tool, count in counts.items()],
    "hasDynamicCalls": len(dynamic_calls) > 0,
}

print(json.dumps(result))
    `);
    
    const output = pyodide.globals.get('_stdout_lines');
    const lines = output.toJs ? output.toJs() : output;
    const jsonStr = Array.isArray(lines) ? lines.join('') : String(lines);
    return JSON.parse(jsonStr);
  } catch (err) {
    return { hasWriteOperations: false, writeOperations: [], hasDynamicCalls: false, error: String(err) };
  }
}

const BSKY_TOOLS_PYTHON_WRAPPER = `
import js
import sys
from typing import List, Dict, Any, Optional, Union

class BskyToolsError(Exception):
    pass

class BskyTools:
    def __init__(self):
        # Auto-detect bridge from globals
        self._bridge = js.bskyToolsBridge if hasattr(js, 'bskyToolsBridge') else None
        if not self._bridge and 'bskyToolsBridge' in globals():
            self._bridge = globals()['bskyToolsBridge']

    def _call(self, method: str, *args, fields: Optional[Union[List[str], str]] = None):
        if not self._bridge:
            raise BskyToolsError("BskyTools not initialized. Auth required.")
        
        # Convert fields string to list
        if isinstance(fields, str):
            fields = [f.strip() for f in fields.split(',') if f.strip()]
        
        # Pass fields as last argument if provided
        if fields is not None:
            args = args + (fields,)
        
        result = getattr(self._bridge, method)(*args)
        if hasattr(result, 'to_py'):
            result = result.to_py()
        
        # Check for errors
        if isinstance(result, dict) and 'error' in result:
            raise BskyToolsError(result['error'])
        
        return result

    def resolve_handle(self, handle: str, fields: Optional[Union[List[str], str]] = None):
        # If input is already a DID, return it directly
        if handle.startswith('did:'):
            result = {'did': handle}
            if fields:
                result = {k: v for k, v in result.items() if k in (fields if isinstance(fields, list) else [f.strip() for f in fields.split(',')])}
            return result
        return self._call('resolve_handle', handle, fields=fields)
    def get_record(self, uri: str, fields: Optional[Union[List[str], str]] = None):
        return self._call('get_record', uri, fields=fields)
    def list_records(self, repo: str, collection: str, limit: int = 50, cursor: Optional[str] = None, fields: Optional[Union[List[str], str]] = None):
        return self._call('list_records', repo, collection, limit, cursor, fields=fields)
    def search_posts(self, q: str, limit: int = 25, cursor: Optional[str] = None, sort: str = 'top', fields: Optional[Union[List[str], str]] = None):
        return self._call('search_posts', q, limit, cursor, sort, fields=fields)
    def get_timeline(self, limit: int = 50, cursor: Optional[str] = None, fields: Optional[Union[List[str], str]] = None):
        return self._call('get_timeline', limit, cursor, fields=fields)
    def get_author_feed(self, actor: str, limit: int = 50, cursor: Optional[str] = None, fields: Optional[Union[List[str], str]] = None):
        return self._call('get_author_feed', actor, limit, cursor, fields=fields)
    def get_popular_feed_generators(self, limit: int = 50, fields: Optional[Union[List[str], str]] = None):
        return self._call('get_popular_feed_generators', limit, fields=fields)
    def get_feed_generator(self, feed: str, fields: Optional[Union[List[str], str]] = None):
        return self._call('get_feed_generator', feed, fields=fields)
    def get_feed(self, feed: str, limit: int = 50, cursor: Optional[str] = None, fields: Optional[Union[List[str], str]] = None):
        return self._call('get_feed', feed, limit, cursor, fields=fields)
    def get_post_thread(self, uri: str, depth: int = 3, format: str = 'flat', max_replies: int = 5, fields: Optional[Union[List[str], str]] = None):
        return self._call('get_post_thread', uri, depth, format, max_replies, fields=fields)
    def get_post_context(self, uri: str, max_replies: int = 5, fields: Optional[Union[List[str], str]] = None):
        return self._call('get_post_context', uri, max_replies, fields=fields)
    def get_post_interactions(self, uri: str, type: str = 'likes', limit: int = 50, cursor: Optional[str] = None, fields: Optional[Union[List[str], str]] = None):
        return self._call('get_post_interactions', uri, type, limit, cursor, fields=fields)
    def get_quotes(self, uri: str, limit: int = 25, cursor: Optional[str] = None, fields: Optional[Union[List[str], str]] = None):
        return self._call('get_quotes', uri, limit, cursor, fields=fields)
    def search_actors(self, q: str, limit: int = 25, cursor: Optional[str] = None, fields: Optional[Union[List[str], str]] = None):
        return self._call('search_actors', q, limit, cursor, fields=fields)
    def get_profile(self, actor: str, fields: Optional[Union[List[str], str]] = None):
        return self._call('get_profile', actor, fields=fields)
    def get_connections(self, actor: str, direction: str = 'following', limit: int = 50, cursor: Optional[str] = None, fields: Optional[Union[List[str], str]] = None):
        return self._call('get_connections', actor, direction, limit, cursor, fields=fields)
    def get_suggested_follows(self, actor: str, fields: Optional[Union[List[str], str]] = None):
        return self._call('get_suggested_follows', actor, fields=fields)
    def list_notifications(self, limit: int = 50, cursor: Optional[str] = None, fields: Optional[Union[List[str], str]] = None):
        return self._call('list_notifications', limit, cursor, fields=fields)
    def extract_images_from_post(self, uri: str, fields: Optional[Union[List[str], str]] = None):
        return self._call('extract_images_from_post', uri, fields=fields)
    def download_image(self, did: str, cid: str, filename: Optional[str] = None, fields: Optional[Union[List[str], str]] = None):
        return self._call('download_image', did, cid, filename, fields=fields)
    def view_image(self, did: Optional[str] = None, cid: Optional[str] = None, alt: Optional[str] = None, upload_index: Optional[int] = None, fields: Optional[Union[List[str], str]] = None):
        return self._call('view_image', did, cid, alt, upload_index, fields=fields)
    def extract_external_link(self, uri: str, fields: Optional[Union[List[str], str]] = None):
        return self._call('extract_external_link', uri)
    def fetch_web_markdown(self, url: str, fields: Optional[List[str]] = None):
        return self._call('fetch_web_markdown', url)
    def search_web_ddg(self, query: str, fields: Optional[List[str]] = None):
        return self._call('search_web_ddg', query)
    def search_wikipedia(self, query: str, lang: str = 'en', fields: Optional[List[str]] = None):
        return self._call('search_wikipedia', query, lang)
    def get_lists(self, actor: Optional[str] = None, fields: Optional[List[str]] = None):
        return self._call('get_lists', actor)
    def get_list_feed(self, list_uri: str, limit: int = 30, cursor: Optional[str] = None, fields: Optional[List[str]] = None):
        return self._call('get_list_feed', list_uri, limit, cursor)
    def create_post(self, text: str, reply_to: Optional[str] = None, quote_uri: Optional[str] = None, images: Optional[List[Dict]] = None, threadgate: Optional[Dict] = None, fields: Optional[List[str]] = None):
        return self._call('create_post', text, reply_to, quote_uri, images, threadgate)
    def like(self, uri: str, fields: Optional[List[str]] = None):
        return self._call('like', uri)
    def repost(self, uri: str, fields: Optional[List[str]] = None):
        return self._call('repost', uri)
    def follow(self, subject: str, fields: Optional[List[str]] = None):
        return self._call('follow', subject)
    def create_list(self, name: str, purpose: str, description: Optional[str] = None, fields: Optional[List[str]] = None):
        return self._call('create_list', name, purpose, description)
    def edit_list_members(self, list_uri: str, subject: str, action: str = 'add', fields: Optional[List[str]] = None):
        return self._call('edit_list_members', list_uri, subject, action)

# Create singleton instance
_bsky_tools_instance = BskyTools()

# Register as a proper Python module so 'import bsky_tools' works
import types
_bsky_tools_module = types.ModuleType('bsky_tools')
# Only export public methods and classes, NOT all globals
_bsky_tools_module.bsky_tools = _bsky_tools_instance
_bsky_tools_module.BskyTools = BskyTools
_bsky_tools_module.BskyToolsError = BskyToolsError
# Add convenience: from bsky_tools import search_posts, get_profile
for _name in dir(_bsky_tools_instance):
    if not _name.startswith('_'):
        setattr(_bsky_tools_module, _name, getattr(_bsky_tools_instance, _name))

sys.modules['bsky_tools'] = _bsky_tools_module

# Also keep global variable for backward compatibility
bsky_tools = _bsky_tools_instance
`;

async function executePython(code: string, enableWrite: boolean = false) {
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

    // Set BSKY_WORKSPACE environment variable
    pyodide.runPython(`
import os
os.environ['BSKY_WORKSPACE'] = '/workspace'
    `.trim());

    // Inject bsky_tools — always do this so `import bsky_tools` works
    // All tool calls are forwarded to the main thread via ToolDispatcher
    try {
      const bridge = createToolBridge();
      pyodide.globals.set('bskyToolsBridge', bridge);
      await pyodide.runPythonAsync(BSKY_TOOLS_PYTHON_WRAPPER);
      console.debug('[PyodideWorker] bsky_tools module registered');
    } catch (injectErr) {
      console.warn('[PyodideWorker] Failed to inject bsky_tools:', injectErr);
    }

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
