/**
 * Pyodide Web Worker — runs Python code in an isolated WebAssembly sandbox.
 * 
 * Communication protocol (postMessage):
 * Main → Worker: { type: 'init' }
 * Main → Worker: { type: 'execute', code: string }
 * Main → Worker: { type: 'mountFile', name: string, data: ArrayBuffer }
 * Main → Worker: { type: 'unmountFile', name: string }
 * 
 * Worker → Main: { type: 'initProgress', stage: string, progress: number, message: string }
 * Worker → Main: { type: 'initComplete' }
 * Worker → Main: { type: 'initError', error: string }
 * Worker → Main: { type: 'result', result: PythonExecutionResult }
 */

import type { PythonExecutionResult } from '@bsky/core';

// Pyodide is loaded dynamically from CDN
const PYODIDE_URL = 'https://cdn.jsdelivr.net/pyodide/v0.25.0/full/pyodide.js';

let pyodide: any = null;
let pyodideReady = false;

async function loadPyodide() {
  if (pyodide) return pyodide;
  
  // @ts-ignore
  const { loadPyodide: load } = await import(PYODIDE_URL);
  
  self.postMessage({
    type: 'initProgress',
    stage: 'loading',
    progress: 0.1,
    message: 'Loading Pyodide runtime...',
  });

  pyodide = await load({
    indexURL: 'https://cdn.jsdelivr.net/pyodide/v0.25.0/full/',
  });

  self.postMessage({
    type: 'initProgress',
    stage: 'loading',
    progress: 0.5,
    message: 'Pyodide loaded, initializing filesystem...',
  });

  // Create workspace directories
  pyodide.FS.mkdirTree('/workspace/data');
  pyodide.FS.mkdirTree('/workspace/output');
  pyodide.FS.mkdirTree('/workspace/temp');

  // Install micropip for package management
  await pyodide.loadPackage('micropip');

  self.postMessage({
    type: 'initProgress',
    stage: 'loading',
    progress: 0.8,
    message: 'Installing base packages...',
  });

  // Pre-install commonly used packages
  const micropip = pyodide.pyimport('micropip');
  await micropip.install('pandas');
  await micropip.install('numpy');
  await micropip.install('matplotlib');

  self.postMessage({
    type: 'initProgress',
    stage: 'ready',
    progress: 1.0,
    message: 'Python sandbox ready',
  });

  pyodideReady = true;
  return pyodide;
}

function scanOutputFiles(pyodide: any): Array<{ path: string; name: string; type: string; size: number; content: string }> {
  const files: Array<{ path: string; name: string; type: string; size: number; content: string }> = [];
  
  try {
    const outputDir = pyodide.FS.readdir('/workspace/output');
    for (const name of outputDir) {
      if (name === '.' || name === '..') continue;
      const path = `/workspace/output/${name}`;
      try {
        const stat = pyodide.FS.stat(path);
        if (pyodide.FS.isFile(stat.mode)) {
          const data = pyodide.FS.readFile(path);
          const size = data.length;
          const ext = name.split('.').pop()?.toLowerCase() || '';
          const type = ['csv', 'json', 'png', 'jpg', 'jpeg', 'txt', 'md'].includes(ext) ? ext : 'unknown';
          
          let content: string;
          if (['png', 'jpg', 'jpeg'].includes(type)) {
            // Binary files: base64 encode
            const bytes = new Uint8Array(data);
            let binary = '';
            for (let i = 0; i < bytes.length; i++) {
              binary += String.fromCharCode(bytes[i]!);
            }
            content = btoa(binary);
          } else {
            // Text files: decode as UTF-8
            const decoder = new TextDecoder('utf-8');
            content = decoder.decode(new Uint8Array(data));
          }
          
          files.push({ path, name, type, size, content });
        }
      } catch { /* skip unreadable files */ }
    }
  } catch { /* directory might not exist */ }
  
  return files;
}

async function executePython(code: string): Promise<PythonExecutionResult> {
  const startTime = Date.now();
  
  if (!pyodideReady) {
    await loadPyodide();
  }

  // Clear previous output
  try {
    const files = pyodide.FS.readdir('/workspace/output');
    for (const name of files) {
      if (name === '.' || name === '..') continue;
      pyodide.FS.unlink(`/workspace/output/${name}`);
    }
  } catch { /* ignore */ }

  // Capture stdout/stderr
  let stdout = '';
  let stderr = '';
  
  pyodide.setStdout({ batched: (text: string) => { stdout += text; } });
  pyodide.setStderr({ batched: (text: string) => { stderr += text; } });

  let returnValue: unknown = null;
  let success = false;

  try {
    // Execute the code
    returnValue = await pyodide.runPythonAsync(code);
    success = true;
  } catch (err) {
    stderr += err instanceof Error ? err.message : String(err);
    success = false;
  }

  // Restore stdout/stderr
  pyodide.setStdout();
  pyodide.setStderr();

  // Scan output files
  const files = scanOutputFiles(pyodide);

  return {
    stdout: stdout.trim(),
    stderr: stderr.trim(),
    returnValue,
    files,
    success,
    executionTime: Date.now() - startTime,
  };
}

function mountFile(name: string, data: ArrayBuffer) {
  if (!pyodide) return;
  const path = `/workspace/data/${name}`;
  pyodide.FS.writeFile(path, new Uint8Array(data));
}

function unmountFile(name: string) {
  if (!pyodide) return;
  const path = `/workspace/data/${name}`;
  try { pyodide.FS.unlink(path); } catch { /* ignore */ }
}

// Message handler
self.onmessage = async (e) => {
  const msg = e.data;
  
  switch (msg.type) {
    case 'init': {
      try {
        await loadPyodide();
        self.postMessage({ type: 'initComplete' });
      } catch (err) {
        self.postMessage({
          type: 'initError',
          error: err instanceof Error ? err.message : String(err),
        });
      }
      break;
    }
    
    case 'execute': {
      try {
        const result = await executePython(msg.code);
        self.postMessage({ type: 'result', result });
      } catch (err) {
        self.postMessage({
          type: 'result',
          result: {
            stdout: '',
            stderr: err instanceof Error ? err.message : String(err),
            returnValue: null,
            files: [],
            success: false,
            executionTime: 0,
          },
        });
      }
      break;
    }
    
    case 'mountFile': {
      mountFile(msg.name, msg.data);
      self.postMessage({ type: 'mounted' });
      break;
    }
    
    case 'unmountFile': {
      unmountFile(msg.name);
      self.postMessage({ type: 'unmounted' });
      break;
    }
    
    default:
      console.warn('Unknown worker message:', msg.type);
  }
};
