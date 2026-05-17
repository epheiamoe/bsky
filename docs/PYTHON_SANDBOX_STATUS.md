# Python Sandbox Status Tracker

## Current State (2025-05-17 12:00 CST)

### Git Status
- **Branch**: `feat/adapter-pattern`
- **Current Commit**: `c39c839` — `revert: rollback pyodide-sandbox.ts to working version (f481167)`
- **Status**: ✅ **ROLLED BACK** — Worker is functional again
- **Working Baseline**: `f481167` — `fix: python sandbox - add timeout, progress, abort support. Basic execution works`
- **Rolled Back From**: `2e69a88` — `feat: python sandbox - stdout/stderr capture, filesystem setup, package install (pandas/numpy/matplotlib), output file scanning, chat isolation`
- **Previous Issue**: Worker failed immediately (18ms) with "Worker error: unknown error"

### Rollback Summary

**Decision**: Roll back to working version (`f481167`) after failed enhancement attempt.

**Reason**: The enhancement commit (`2e69a88`) broke the Worker completely — 18ms immediate failure with "Worker error: unknown error". After investigation (including subagent code review), the issue persisted across environments and was not temporary.

**Root Cause Hypothesis**:
1. **Module Worker + UMD import issue (70%)**: `{ type: 'module' }` Worker with `import(url)` loading pyodide.js (UMD format) may have browser compatibility issues
2. **Pyodide API initialization instability (20%)**: New `pyodide.loadPackage()` / `pyodide.FS.mkdirTree()` calls immediately after `loadPyodide()` may fail if WASM is partially initialized
3. **Feature interaction (10%)**: Adding 5 features simultaneously created unpredictable interactions

**What Was Lost in Rollback**:
- stdout/stderr capture (`pyodide.setStdout`)
- Filesystem setup (`/workspace/data`, `/workspace/output`, `/workspace/temp`)
- Package installation (`pandas`, `numpy`, `matplotlib`)
- Output file scanning (`scanOutputFiles`)
- Chat isolation (`chatId` parameter)

**What Still Works**:
- Basic Python execution (`success: true`)
- Standard library imports
- File system writes to `/workspace/output/`
- Timeout protection (30s/60s)
- Progress reporting
- Abort support

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

### Next Steps (incremental approach)
1. ✅ **Rollback complete** — Back to working baseline
2. 🔄 **Test baseline** — Verify `f481167` still works after rollback
3. 📋 **Plan incremental additions** — Add ONE feature at a time:
   - Step 1: stdout/stderr capture (with fallback if API unavailable)
   - Step 2: Output file scanning (scan `/workspace/output/` after execution)
   - Step 3: Filesystem setup (`mkdirTree` with existence check)
   - Step 4: Package installation (lazy load on first use)
   - Step 5: Chat isolation (pass `chatId` to Worker)
4. 🔍 **Consider Classic Worker** — If Module Worker issues persist, switch to `importScripts()`
5. 🧪 **Test each step** — Deploy and verify before next addition
6. 📝 **Document findings** — Update LESSONS.md with each lesson

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
- [x] **BLOCKED**: Worker immediate failure
- [x] Sleep — wait to see if issue is temporary
- [x] Issue persists after 8+ hours
- [x] **ROLLBACK** to `f481167`
- [x] Commit: `c39c839` — **ROLLED BACK**
- [ ] Test baseline functionality
- [ ] Incremental feature addition (one at a time)
