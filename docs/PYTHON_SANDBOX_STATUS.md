# Python Sandbox Status Tracker

## Current State (2025-05-17 22:30 CST)

### Git Status
- **Branch**: `feat/adapter-pattern`
- **Current Commit**: `7bf38e2` — `feat(pwa): configure matplotlib for Chinese text support`
- **PWA Deployment**: https://14dfc951.ai-bsky.pages.dev
- **Previous Deployments**:
  - `f481167` — 基础执行功能（working baseline）
  - `061011b5` — Classic Worker + debug logging（失败）
  - `ac945156` — Vite `?worker` 导入 + 第三方包 + executionTime + mountFile
  - `14dfc951` — 当前版本（含 matplotlib 字体配置）

### Test Results (2025-05-17)

**PWA PyodideSandbox Test Report** — 全面通过 ✅

| 项目 | 结果 |
|------|------|
| Python 版本 | 3.11.3 (Pyodide WASM) |
| 平台 | Emscripten-3.1.46-wasm32-32bit |
| 标准库 | 13/13 全部通过 (json, math, statistics, csv, io, pathlib, datetime, re, collections, itertools, random, os, sys) |
| 第三方库 | 8/8 核心包通过（pandas 1.5.3, numpy 1.26.1, matplotlib 3.5.2, beautifulsoup4, pyyaml, openpyxl, scipy 1.11.2, scikit-learn 1.3.1） |
| 文件系统 | `/workspace/output`, `/workspace/temp`, `/workspace/data` 可读写 |
| stdout/stderr 捕获 | ✅ Python 层重定向（_StdoutCapture/_StderrCapture） |
| 执行时间 | ✅ 通过 Date.now() 测量 |
| 输出文件扫描 | ✅ pyodide.FS.readdir + readFile |
| mountFile/unmountFile | ✅ pyodide.FS.writeFile/unlink |
| 数学运算 | ✅ 全部正常 |
| 统计分析 | ✅ mean, median, stdev |
| 正则表达式 | ✅ match, search, sub |
| CSV/JSON/IO | ✅ 读写正常 |
| 容器/迭代器 | ✅ Counter, chain |
| 跨库联动 | ✅ pandas + sklearn + openpyxl + yaml + matplotlib 全流程 |

**已知限制**:
- ⚠️ matplotlib 中文字体缺失 — 无 CJK 字体文件，中文显示为方框（已配置字体回退，但 WASM 环境无字体文件）
- ⚠️ 无网络请求库（requests/urllib 不可用，WebAssembly 限制）
- ⚠️ 无子进程支持（WebAssembly 限制）
- ✅ 可用 `returnValue` 获取最后表达式结果
- ✅ stdout/stderr 完整捕获

**已知 Bug**:
- 🔴 **工作区显示为空** — Python 执行成功创建文件，ToolCard 显示文件列表，但点击「工作区」按钮显示空工作区
  - **根因分析**：
    1. Python 文件创建在 **Pyodide 虚拟文件系统** (`/workspace/output/` in WASM)
    2. 工作区组件读取 **IndexedDBWorkspaceStorage** (浏览器 IndexedDB)
    3. 两个存储系统完全独立，没有同步机制
    4. 文件通过 `result.files` 返回给 UI 仅用于展示，从未写入 IndexedDB
  - **修复方向**：在 AIChatPage 处理 `execute_python` 工具结果时，将 `result.files` 同步到 `WorkspaceStorage`
  - **代码位置**：
    - `packages/pwa/src/components/AIChatPage.tsx` — 消息处理逻辑
    - `packages/pwa/src/components/WorkspaceModal.tsx` — 工作区 UI
    - `packages/pwa/src/services/indexeddb-workspace-storage.ts` — IndexedDB 存储
    - `packages/pwa/src/services/pyodide.worker.ts` — Pyodide FS (虚拟文件系统)

### Architecture

```
                    PythonSandboxEngine (interface)
                           @bsky/core
                    /              |              \
        PyodideSandbox    NodePythonSandbox    (future: cloud sandbox)
           (PWA)            (MCP + TUI)
        Web Worker         child_process
        Pyodide WASM       System Python
        Vite ?worker       child_process.spawn
```

### Platform Support

| Platform | Implementation | File | Status |
|----------|---------------|------|--------|
| **PWA** | `PyodideSandbox` (Web Worker + Pyodide WASM) | `packages/pwa/src/services/pyodide-sandbox.ts` | ✅ stdout ✅ filesystem ✅ file scanning ✅ executionTime ✅ mountFile/unmountFile ✅ third-party packages |
| **MCP** | `NodePythonSandbox` (child_process) | `packages/app/src/services/node-python-sandbox.ts` | ✅ Implemented |
| **TUI** | `NodePythonSandbox` (child_process) | `packages/app/src/services/node-python-sandbox.ts` | ✅ Implemented |

## Implementation Plan

### Phase 1: PWA stdout/stderr Capture ✅

**Status**: COMPLETED

**Solution**: Python-level stdout redirection (safer than JS API)

```python
class _StdoutCapture:
    def write(self, text):
        if text:
            _stdout_lines.append(str(text))
    def flush(self):
        pass

sys.stdout = _StdoutCapture()
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

### Phase 4: Third-Party Package Installation ✅

**Status**: COMPLETED

**Implementation**:
- Load `micropip` package on init via `pyodide.loadPackage('micropip')`
- Install in three batches:
  1. Core: pandas, numpy, matplotlib
  2. Utility: beautifulsoup4, pyyaml, openpyxl
  3. Heavy: scipy, scikit-learn (best-effort, failure not fatal)
- Show progress during installation ('packages' stage)
- Increased timeout: 120s for core, 60s for utility, 180s for heavy

### Phase 5: executionTime Calculation ✅

**Status**: COMPLETED

**Implementation**:
- Add `Date.now()` timing around `pyodide.runPythonAsync()` call
- Return actual execution time in milliseconds instead of hardcoded 0

### Phase 6: mountFile / unmountFile ✅

**Status**: COMPLETED

**Implementation**:
- Worker: add `mountFile(name, data)` and `unmountFile(name)` helpers using `FS.writeFile`/`FS.unlink`
- Worker: add 'mountFile' and 'unmountFile' message handlers
- PyodideSandbox: replace stubs with actual Worker round-trip messages
- Files mounted to `/workspace/data/` for Python access

### Phase 7: Matplotlib Chinese Font Support ⚠️

**Status**: PARTIAL

**Implementation**:
- Configure `matplotlib.rcParams` to try CJK fonts (SimHei, WenQuanYi, Noto Sans CJK SC)
- Set `axes.unicode_minus = False`
- **Limitation**: Pyodide WASM environment has no font files installed; rcParams only sets priority, doesn't provide fonts
- **Future fix**: Download font file (e.g., Noto Sans CJK, ~4MB) to Pyodide FS during init

### Phase 8: Fix Worker String Escaping ✅

**Status**: COMPLETED

**Root Cause**: Inline WORKER_CODE template string caused SyntaxError after Vite minification (line 183:489)

**Solution**: Extract Worker to standalone file `pyodide.worker.ts`, import via Vite `?worker`

**Benefits**:
- Zero escaping risk (Vite handles bundling)
- TypeScript support
- Automatic code splitting (Worker as separate chunk)
- Classic Worker compatible (IIFE format)

### Phase 9: Fix Service Worker POST Caching ✅

**Status**: COMPLETED

**Fix**: Add `request.method === 'GET'` check before `cache.put()` in all three cache strategies (networkFirst, cachedMatch, staleWhileRevalidate)

### Phase 10: UI Bug Fixes ✅

**Status**: COMPLETED

**Fix**: Add `e.stopPropagation()` to expand/collapse buttons in PythonResult (ErrorBlock and OutputBlock) to prevent event bubbling to parent ToolCard

### Phase 11: Final Goal — AI Batch AT Tool Calls ⏳

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
- [x] **Phase 4**: Extract Worker to standalone file via Vite `?worker` (commit `1996ea4`)
- [x] **Phase 4**: Install third-party packages via micropip (commit `fd6387c`)
- [x] **Phase 5**: Add executionTime calculation (commit `0fd02da`)
- [x] **Phase 6**: Implement mountFile/unmountFile (commit `88d2914`)
- [x] **Phase 7**: Configure matplotlib for Chinese text (commit `7bf38e2`)
- [x] **Phase 8**: Fix Service Worker POST caching (commit `1996ea4`)
- [x] **Phase 9**: Fix expand/collapse UI bug (commit `3823553`)
- [ ] **Phase 10**: Fix workspace empty display bug
- [ ] **Phase 11**: Create bsky_tools library for batch AT operations

## Key Lessons

1. **Incremental changes**: Adding 5 features at once made debugging impossible
2. **Test each commit**: Every change must be tested before next change
3. **Defensive coding**: Pyodide API may vary between versions; use try/catch
4. **chunkSize limit**: `String.fromCharCode.apply()` has 65535 arg limit
5. **Worker crash vs Python exception**: JS-level errors crash Worker; Python-level errors are catchable
6. **Baseline first**: Always have a known-working version to rollback to
7. **Vite ?worker over Blob URL**: Template string escaping in bundled Worker code causes SyntaxError; use Vite native Worker import
8. **Package installation batches**: Install heavy packages separately with longer timeouts; failure of optional packages should not block sandbox readiness
9. **Event propagation in nested UI**: Inner component buttons must call `e.stopPropagation()` to prevent triggering parent onClick handlers
