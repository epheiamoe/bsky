# Python Sandbox Status Tracker

## Current State (2025-05-17 06:15 CST)

### Git Status
- **Branch**: `feat/adapter-pattern`
- **Last Working Commit**: `f481167` — `fix: python sandbox - add timeout, progress, abort support. Basic execution works`
- **Current Broken Commit**: `2e69a88` — `feat: python sandbox - stdout/stderr capture, filesystem setup, package install (pandas/numpy/matplotlib), output file scanning, chat isolation`
- **Issue**: Worker fails immediately (18ms) with "Worker error: unknown error"

### Problem Description

**Symptom**: After clicking "execute_python", the tool fails immediately with:
```
Execution failed: Worker error: unknown error
Failed · 18ms
```

**No initialization occurs**:
- No progress banner appears
- No "等待执行结果..." message
- No `[PyodideWorker]` console logs
- Worker terminates instantly (18ms)

**Testing environment**: Incognito window (no cache)

### Root Cause Analysis

**Subagent code review findings**:
1. Worker code syntax is VALID - no syntax errors found
2. The error comes from `worker.onerror` (not `initError`), meaning Worker crashes during parsing/loading phase
3. Most likely cause: `{ type: 'module' }` Worker + `import(url)` loading UMD script has browser compatibility issues

**Hypothesis** (probability ranking):
1. **Module Worker + UMD import issue (70%)**: `new Worker(url, { type: 'module' })` with `import(url)` loading pyodide.js (UMD format) may fail in certain browser/security contexts. The 18ms failure suggests browser rejects the module before any network request.
2. **Pyodide API initialization instability (20%)**: New code added `pyodide.loadPackage('micropip')` and `pyodide.FS.mkdirTree()` immediately after `loadPyodide()`. If pyodide is in a partially-initialized state, these calls may throw uncatchable errors.
3. **Environmental/temporary issue (10%)**: Network, CDN, or browser security policy changes between the two deployments.

### What Changed (f481167 → 2e69a88)

**Added to Worker code**:
- `pyodide.FS.mkdirTree('/workspace/data')` - filesystem setup
- `pyodide.loadPackage('micropip')` - package manager loading
- `pyodide.pyimport('micropip').install(['pandas', 'numpy', 'matplotlib'])` - package installation
- `pyodide.setStdout({ batched: fn })` / `pyodide.setStderr({ batched: fn })` - stdout/stderr capture
- `scanOutputFiles(chatId)` - output directory scanning
- `executePython(code, chatId)` - chat isolation parameter
- `getFileType()`, `isTextFile()` - helper functions

**Added to main thread**:
- `_currentChatId` field
- `setCurrentChatId()` implementation
- Pass `chatId` in execute message

### Previous Working State (commit f481167)

**Confirmed working features**:
- Basic Python execution (`success: true`)
- Standard library imports (`json`, `math`, `pathlib`, etc.)
- File system writes to `/workspace/output/`
- Timeout protection (30s/60s)
- Progress reporting (`downloading` → `loading` → `ready`)
- Abort support

**Known limitations of working version**:
- stdout/stderr always empty (no capture)
- Output files not scanned (always `files: []`)
- pandas/numpy/matplotlib not available
- No chat isolation

### Architecture
- `packages/pwa/src/services/pyodide-sandbox.ts` - PyodideSandbox class + WORKER_CODE
- `packages/core/src/ai/python-sandbox.ts` - PythonSandboxEngine interface
- `packages/core/src/ai/tools.ts` - execute_python tool definition
- `packages/pwa/src/components/ai/PythonResult.tsx` - Result rendering (stdout/stderr/files)
- `packages/pwa/src/components/ai/ToolCard.tsx` - Tool call card with Python preview

### Worker Configuration
- Inline Blob URL Worker (avoids `.ts` MIME issues on CDN)
- CDN: jsdelivr only (unpkg blocked by CORS)
- Pyodide v0.25.0
- Lazy init on first `execute()` call
- Message types: `init`, `execute`, `abort`

### CDN URL
```
https://cdn.jsdelivr.net/pyodide/v0.25.0/full/pyodide.js
```

### Proposed Fix Options

**Option A: Classic Worker (recommended)**
- Change `new Worker(url, { type: 'module' })` → `new Worker(url)`
- Change `await import(url)` → `importScripts(url)`
- Most robust solution for loading UMD scripts

**Option B: Defensive programming + enhanced logging**
- Add API existence checks before calling pyodide methods
- Add try/catch around each initialization step
- Improve error reporting in `worker.onerror`
- Keep module worker but make it more resilient

**Option C: Revert to working state, then incremental additions**
- Revert to commit f481167
- Add features one by one with testing between each

### Next Steps (when user returns)
1. Determine if issue is environmental (network/CDN/browser)
2. If persistent, implement Option A (Classic Worker) or Option C (incremental)
3. Test each feature incrementally with verification
4. Update LESSONS.md with new findings

## Progress Log

### 2025-05-17
- [x] Git stash saved broken state
- [x] Create minimal Worker (subagent)
- [x] Fix double slash path
- [x] Remove unpkg (CORS blocked)
- [x] Commit: `f5d3a54` — v0.14.0 initial
- [x] Deploy to staging
- [x] Add timeout + progress + abort
- [x] Commit: `f481167` — **WORKING baseline**
- [x] Add stdout/stderr capture
- [x] Setup filesystem (/workspace/*)
- [x] Install packages (pandas/numpy/matplotlib)
- [x] Add output file scanning
- [x] Implement chat isolation
- [x] Commit: `2e69a88` — **BROKEN**
- [x] Deploy to staging (60075760)
- [x] Subagent code review
- [ ] **BLOCKED**: Worker immediate failure
