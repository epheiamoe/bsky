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
  if (pyodide !== null) {
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
      globalThis.postMessage({ type: 'initProgress', stage: 'downloading', progress: 0.1, message: 'Downloading Pyodide loader...' });
      
      await withTimeout(import(url), 30000, 'Download pyodide.js');

      var loadFn = globalThis.loadPyodide || globalThis.loadPyodide;
      if (typeof loadFn !== 'function') {
        throw new Error('loadPyodide not found after importing ' + url);
      }

      var lastSlash = url.lastIndexOf('/');
      var baseUrl = lastSlash > 0 ? url.substring(0, lastSlash + 1) : url + '/';
      console.debug('[PyodideWorker] Base URL: ' + baseUrl);
      globalThis.postMessage({ type: 'initProgress', stage: 'loading', progress: 0.3, message: 'Loading Pyodide WASM runtime...' });
      
      pyodide = await withTimeout(loadFn({ indexURL: baseUrl }), 60000, 'Load Pyodide WASM');
      console.debug('[PyodideWorker] Pyodide loaded successfully');
      
      // Setup filesystem
      globalThis.postMessage({ type: 'initProgress', stage: 'setup', progress: 0.5, message: 'Setting up workspace filesystem...' });
      try {
        pyodide.FS.mkdirTree('/workspace/data');
        pyodide.FS.mkdirTree('/workspace/output');
        pyodide.FS.mkdirTree('/workspace/temp');
        console.debug('[PyodideWorker] Workspace directories created');
      } catch (fsErr) {
        console.debug('[PyodideWorker] FS mkdir warning (may already exist): ' + String(fsErr));
      }
      
      // Load micropip for package management
      globalThis.postMessage({ type: 'initProgress', stage: 'setup', progress: 0.6, message: 'Loading package manager...' });
      await pyodide.loadPackage('micropip');
      console.debug('[PyodideWorker] micropip loaded');
      
      // Install common data science packages
      globalThis.postMessage({ type: 'initProgress', stage: 'setup', progress: 0.7, message: 'Installing pandas, numpy, matplotlib...' });
      var micropip = pyodide.pyimport('micropip');
      await micropip.install(['pandas', 'numpy', 'matplotlib']);
      console.debug('[PyodideWorker] Packages installed: pandas, numpy, matplotlib');
      
      globalThis.postMessage({ type: 'initProgress', stage: 'ready', progress: 1, message: 'Python sandbox ready' });
      return pyodide;
    } catch (err) {
      lastError = err;
      console.debug('[PyodideWorker] CDN failed: ' + url + ' - ' + String(err));
      globalThis.postMessage({ type: 'initProgress', stage: 'retry', progress: 0.1, message: 'CDN failed, trying next...' });
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

async function scanOutputFiles(chatId) {
  var workspaceDir = chatId ? '/workspace/output/' + chatId + '/' : '/workspace/output/';
  var files = [];
  try {
    var entries = pyodide.FS.readdir(workspaceDir);
    for (var i = 0; i < entries.length; i++) {
      var name = entries[i];
      if (name === '.' || name === '..') continue;
      
      var path = workspaceDir + name;
      var stat = pyodide.FS.stat(path);
      var type = getFileType(name);
      var content = '';
      
      try {
        if (isTextFile(type)) {
          content = pyodide.FS.readFile(path, { encoding: 'utf8' });
        } else {
          var binary = pyodide.FS.readFile(path);
          content = btoa(String.fromCharCode.apply(null, new Uint8Array(binary)));
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

async function executePython(code, chatId) {
  var workspaceDir = chatId ? '/workspace/output/' + chatId + '/' : '/workspace/output/';
  
  // Ensure workspace directory exists
  try {
    pyodide.FS.mkdirTree(workspaceDir);
  } catch (mkdirErr) {
    // Directory may already exist
  }
  var stdoutLines = [];
  var stderrLines = [];
  var returnValue = null;
  var success = false;
  
  try {
    // Setup stdout/stderr capture
    pyodide.setStdout({ 
      batched: function(texts) {
        for (var i = 0; i < texts.length; i++) {
          stdoutLines.push(texts[i]);
        }
      }
    });
    pyodide.setStderr({ 
      batched: function(texts) {
        for (var i = 0; i < texts.length; i++) {
          stderrLines.push(texts[i]);
        }
      }
    });
    
    returnValue = await pyodide.runPythonAsync(code);
    success = true;
  } catch (err) {
    console.debug('[PyodideWorker] Execution error: ' + (err.message !== undefined ? err.message : String(err)));
    throw err;
  } finally {
    // Reset stdout/stderr to prevent leaks between executions
    pyodide.setStdout({ batched: function() {} });
    pyodide.setStderr({ batched: function() {} });
  }
  
  // Scan output files
  var outputFiles = await scanOutputFiles(chatId);
  
  return { 
    stdout: stdoutLines.join('\n'), 
    stderr: stderrLines.join('\n'), 
    returnValue: returnValue, 
    files: outputFiles, 
    success: success, 
    executionTime: 0 
  };
}

globalThis.onmessage = async function(e) {
  var msg = e.data;
  if (msg.type === 'init') {
    try {
      console.debug('[PyodideWorker] Init message received, starting loadPyodide...');
      await loadPyodide();
      console.debug('[PyodideWorker] loadPyodide completed successfully');
      globalThis.postMessage({ type: 'initComplete' });
    } catch (err) {
      var errMsg = err.message !== undefined ? err.message : String(err);
      console.debug('[PyodideWorker] Init failed: ' + errMsg);
      globalThis.postMessage({ type: 'initError', error: errMsg });
    }
  } else if (msg.type === 'execute') {
    try {
      var result = await executePython(msg.code, msg.chatId);
      globalThis.postMessage({ type: 'result', result: result });
    } catch (err) {
      var errMsg = err.message !== undefined ? err.message : String(err);
      globalThis.postMessage({ type: 'result', result: { stdout: '', stderr: errMsg, returnValue: null, files: [], success: false, executionTime: 0 }});
    }
  } else if (msg.type === 'abort') {
    console.debug('[PyodideWorker] Abort received');
    initAborted = true;
  } else {
    console.debug('[PyodideWorker] Unknown message: ' + msg.type);
  }
};