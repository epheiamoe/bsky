# Python Sandbox Status Tracker

## Current State (2025-05-17)

### Git Status
- **Branch**: `feat/adapter-pattern`
- **Stash**: `wip: v0.14.0 python sandbox - broken worker state`
  - Contains all v0.14.0 work including broken Worker code
  - 43 modified files + 18 new files
- **Working tree**: Clean (after stash)

### Problem
Worker fails immediately with `new Worker(blobUrl, { type: 'module' })`:
```
[Pyodide] Worker error: unknown error
{ message: undefined, filename: undefined, lineno: undefined, colno: undefined, error: undefined }
```

**Key facts**:
- Minimal Worker test works: `const testCode = 'self.onmessage = () => self.postMessage("ok")';`
- So Blob URL + module worker creation works
- Problem is in WORKER_CODE string content
- Previously worked with `.js` UMD + `import(url)` + `self.loadPyodide`

### Goal
Implement a **minimal working** Python sandbox:
1. Worker initializes successfully
2. Can execute basic Python code
3. Returns stdout
4. No packages, no file scanning, no workspace integration yet

### Architecture
- `packages/pwa/src/services/pyodide-sandbox.ts` - PyodideSandbox class + WORKER_CODE
- `packages/core/src/ai/python-sandbox.ts` - PythonSandboxEngine interface
- `packages/core/src/ai/tools.ts` - execute_python tool definition
- `packages/pwa/src/components/ai/PythonResult.tsx` - Result rendering

### Worker Requirements
- Inline Blob URL Worker (avoids `.ts` MIME issues on CDN)
- CDN: jsdelivr → unpkg fallback
- Pyodide v0.25.0
- Lazy init on first `execute()` call
- Message types: `init`, `execute`

### CDN URLs (JS UMD format)
```
https://cdn.jsdelivr.net/pyodide/v0.25.0/full/pyodide.js
https://unpkg.com/pyodide@0.25.0/full/pyodide.js
```

### Loading Pattern (known working)
```javascript
await import(url);
const loadFn = self.loadPyodide || globalThis.loadPyodide;
pyodide = await loadFn({ indexURL: baseUrl + '/' });
```

### Next Steps
1. Implement minimal Worker with ONLY init + execute
2. Test in browser
3. Commit immediately
4. Then add features incrementally

## Progress Log

### 2025-05-17
- [x] Git stash saved broken state
- [ ] Create minimal Worker
- [ ] Test and commit
