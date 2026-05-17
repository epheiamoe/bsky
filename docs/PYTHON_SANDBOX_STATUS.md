# Python Sandbox Status Tracker

## Current State (2025-05-17 17:20 CST)

### Git Status
- **Branch**: `feat/adapter-pattern`
- **Current Commit**: `2275ed0` — `feat: PWA Worker - safe stdout capture (Python-level), filesystem setup, output file scanning`
- **PWA Deployment**: https://991949c9.ai-bsky.pages.dev (with stdout + filesystem + file scanning)

### Test Results (2025-05-17)

**PWA PyodideSandbox Test Report** — 基础环境通过 ✅

| 项目 | 结果 |
|------|------|
| Python 版本 | 3.11.3 (Pyodide WASM) |
| 标准库 | 13/13 全部通过 (json, math, statistics, csv, io, pathlib, datetime, re, collections, itertools, random, os, sys) |
| 文件系统 | `/workspace/output`, `/workspace/temp` 可读写 |
| 数学运算 | ✅ 全部正常 |
| 统计分析 | ✅ mean, median, stdev |
| 正则表达式 | ✅ match, search, sub |
| CSV/JSON/IO | ✅ 读写正常 |
| 容器/迭代器 | ✅ Counter, chain |

**已知限制**:
- ⚠️ `print()` 输出不返回（stdout 未捕获）
- ⚠️ 第三方库未预装（pandas/numpy/matplotlib 需 micropip 安装）
- ⚠️ 无网络请求（无 requests/urllib）
- ⚠️ 无子进程支持（WebAssembly 限制）
- ✅ 可用 `returnValue` 获取最后表达式结果

### Architecture

```
                    PythonSandboxEngine (interface)
                           @bsky/core
                    /              |              \
        PyodideSandbox    NodePythonSandbox    (future: cloud sandbox)
           (PWA)            (MCP + TUI)
        Web Worker         child_process
        Pyodide WASM       System Python
```

### Platform Support

| Platform | Implementation | File | Status |
|----------|---------------|------|--------|
| **PWA** | `PyodideSandbox` (Web Worker + Pyodide WASM) | `packages/pwa/src/services/pyodide-sandbox.ts` | ✅ stdout capture ✅ filesystem ✅ file scanning ✅ |
| **MCP** | `NodePythonSandbox` (child_process) | `packages/app/src/services/node-python-sandbox.ts` | ✅ Implemented |
| **TUI** | `NodePythonSandbox` (child_process) | `packages/app/src/services/node-python-sandbox.ts` | ✅ Implemented |

## Implementation Plan

### Phase 1: PWA stdout/stderr Capture (IN PROGRESS)

**Problem**: `print()` 输出不返回，只能通过 `returnValue` 获取数据

**Root Cause**: Previous attempts to use `pyodide.setStdout({ batched: fn })` caused Worker crash ("Worker error: unknown error")

**Solution**: Use Python-level stdout redirection (safer than JS API)

**Implementation**:
```javascript
// In executePython():
// 1. Inject stdout/stderr capture classes
// 2. Execute user code
// 3. Read captured output from Python globals
```

**Benefits**:
- Pure Python implementation (no dependency on Pyodide JS API)
- Failure is a Python exception, not Worker crash
- Compatible with all Pyodide versions

### Phase 2: PWA Filesystem Setup ✅

**Status**: COMPLETED

**Implementation**:
- Create `/workspace/data`, `/workspace/output`, `/workspace/temp` on init
- Defensive coding: check API existence before calling
- Wrapped in try/catch with graceful fallback

### Phase 3: PWA Output File Scanning ✅

**Status**: COMPLETED

**Implementation**:
- Scan `/workspace/output/` after each execution
- Use `pyodide.FS.readdir()` and `pyodide.FS.readFile()`
- Fixed `chunkSize` to 32768 (below 65535 apply() limit)
- Return file metadata + content in result

### Phase 4: Third-Party Package Installation

**Status**: Pending Phase 3 completion

**Plan**:
- Load `micropip` package on init
- Install pandas, numpy, matplotlib
- Lazy loading: only install when first used
- Show progress during installation

### Phase 5: Final Goal — AI Batch AT Tool Calls

**Vision**: Enable AI to write Python scripts that batch-call AT Protocol tools

**Example**:
```python
from bsky_tools import search_posts, get_profile, follow
posts = search_posts(q="AI", limit=100)
for post in posts:
    profile = get_profile(post['author'])
    if profile['followersCount'] < 1000:
        follow(profile['did'])
        print(f"Followed {profile['handle']}")
```

**Steps**:
1. Create `bsky_tools` Python library
2. Inject into Python execution environment
3. Pass BskyClient instance to sandbox
4. Support async operations
5. Handle authentication (reuse existing session)

## Progress Log

### 2025-05-17
- [x] Git stash saved broken state
- [x] Create minimal Worker (subagent)
- [x] Fix double slash path
- [x] Remove unpkg (CORS blocked)
- [x] Commit: `f5d3a54` — v0.14.0 initial
- [x] Deploy to staging
- [x] Add timeout + progress + abort
- [x] Commit: `f481167` — **PWA WORKING baseline**
- [x] Attempt: stdout/stderr capture (commit `4c20c8e`)
- [x] Attempt: filesystem + file scanning (commit `358fb35`)
- [x] Commit: `2e69a88` — **BROKEN** (Worker crashes immediately)
- [x] Deploy to staging (60075760)
- [x] Subagent code review (identified `chunkSize` and `setStdout` issues)
- [x] Sleep — wait to see if issue is temporary
- [x] Issue persists after 8+ hours
- [x] **ROLLBACK** to `f481167`
- [x] Commit: `c39c839` — **ROLLED BACK**
- [x] Deploy rollback (ce30e42b)
- [x] **Implement NodePythonSandbox** for MCP + TUI
- [x] Commit: `bbfce8e` — NodePythonSandbox
- [x] Commit: `efd954a` — Remove temporary files
- [x] Deploy updated PWA (6e574d37)
- [x] **Fix execution time calculation** (tools.ts)
- [x] Commit: `4c20c8e` — Fix execution time
- [x] **Rollback again** to f481167 (stdout capture failed)
- [x] Commit: `14385e1` — **ROLLED BACK to working baseline**
- [x] Deploy baseline (87652969)
- [x] **Comprehensive test** — 13/13 standard libraries pass ✅
- [x] **Phase 1**: Implement Python-level stdout capture (safe approach) ✅
- [x] **Phase 2**: Add filesystem setup ✅
- [x] **Phase 3**: Add output file scanning ✅
- [ ] **Phase 4**: Install third-party packages (micropip)
- [ ] **Phase 5**: Create bsky_tools library

## Key Lessons

1. **Incremental changes**: Adding 5 features at once made debugging impossible
2. **Test each commit**: Every change must be tested before next change
3. **Defensive coding**: Pyodide API may vary between versions; use try/catch
4. **chunkSize limit**: `String.fromCharCode.apply()` has 65535 arg limit
5. **Worker crash vs Python exception**: JS-level errors crash Worker; Python-level errors are catchable
6. **Baseline first**: Always have a known-working version to rollback to
