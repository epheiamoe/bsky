# Python Sandbox Status Tracker

## Current State (2025-05-18)

### Git Status
- **Branch**: `feat/adapter-pattern`
- **Current Commit**: `44a77ee` — `fix(app): save Python output files to workspace in NodePythonSandbox`
- **PWA Deployment**: https://4f8ca5b9.ai-bsky.pages.dev
- **Previous Deployments**:
  - `f481167` — 基础执行功能（working baseline）
  - `ac945156` — Vite `?worker` 导入 + 第三方包 + executionTime + mountFile
  - `14dfc951` — matplotlib 字体配置
  - `4f8ca5b9` — Workspace 统一存储（进行中）

### Critical Bugs Found (2025-05-18)

**Bug 1: 跨会话隔离失败** ❌
- **根因 A**: `AIChatPage.tsx` `handleFileSelect` useCallback 依赖数组 `[]`，`sessionId` 初始值 `undefined` 被捕获，上传文件保存时 `chatId: undefined`
- **根因 B**: `tools.ts` `execute_python` handler 调用 `sandbox.execute(p.code)` 未传 `chatId`，Python 生成的文件从未保存到 workspace
- **影响**: 所有文件成为全局文件，任何会话都能看到

**Bug 2: 文件下载/预览空白** ❌
- **根因**: `pyodide.worker.ts` `scanOutputFiles()` 调用 `pyodide.FS.readFile(path)` 默认返回字符串，二进制文件 `new Uint8Array(string)` 抛出异常，catch 后 `content: ''`
- **影响**: 所有二进制文件（PNG、JPG）和可能的文本文件内容为空

**修复计划**:
1. ✅ `pyodide-sandbox.ts` — 执行后保存文件到 workspace（已完成）
2. ✅ `PythonResult.tsx` — 从 workspace 加载文件（已完成）
3. ✅ `node-python-sandbox.ts` — 执行后保存文件到 workspace（已完成）
4. ⏳ `AIChatPage.tsx` — 修复 stale closure（添加 `sessionId` 到依赖数组）
5. ⏳ `tools.ts` — 传递 `chatId` 给 `sandbox.execute(code, chatId)`
6. ⏳ `pyodide.worker.ts` — 二进制文件读取使用 `encoding: 'binary'`
7. ⏳ `WorkspaceModal.tsx` — 简化 Blob 创建

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
- ⚠️ 无网络请求库（requests/urllib 不可用，WebAssembly 限制）
- ⚠️ 无子进程支持（WebAssembly 限制）
- ✅ 可用 `returnValue` 获取最后表达式结果
- ✅ stdout/stderr 完整捕获
- ✅ matplotlib 中文字体支持（Noto Sans CJK SC，从 CDN 下载）
- ⚠️ 工作区文件同步（存在隔离和内容 bug，修复中）

**已知 Bug**:
- 🔴 **跨会话隔离失败** — 文件未按 chatId 隔离
  - **根因**: `AIChatPage.tsx` stale closure + `tools.ts` 未传 chatId
  - **修复**: 见上方修复计划 4-5
  
- 🔴 **文件内容为空** — 下载/预览空白
  - **根因**: Worker 中 `FS.readFile()` 未指定 binary encoding
  - **修复**: 见上方修复计划 6

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

### Phase 7: Matplotlib Chinese Font Support ✅

**Status**: COMPLETED

**Implementation**:
- Download Noto Sans CJK SC from jsDelivr CDN (`https://cdn.jsdelivr.net/gh/googlefonts/noto-cjk@main/Sans/OTF/SimplifiedChinese/NotoSansCJKsc-Regular.otf`)
- Save font to `/home/pyodide/.fonts/NotoSansCJKsc-Regular.otf` via `pyodide.FS.writeFile`
- Configure matplotlib `font_manager` to use downloaded font via `addfont()`
- Set `axes.unicode_minus = False`
- Best-effort: font download failure is non-fatal

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

### Phase 11: Workspace File Isolation (In Progress)

**Status**: IN PROGRESS

**Goal**: Files created by Python should be isolated per chat session

**Architecture**: Unified data flow across PWA + TUI + MCP
- Sandbox layer saves files to WorkspaceStorage after execution
- Tool handler returns metadata-only JSON (no content) to AI
- UI loads files from WorkspaceStorage by chatId

**Unified Data Flow**:
```
PWA:  Worker → content → pyodide-sandbox.ts → save to IndexedDB Workspace
                                              → return metadata to tools.ts
                                              → AI receives metadata JSON
                                              → PythonResult loads from IndexedDB

TUI:  Python subprocess → content → node-python-sandbox.ts → save to FileSystem Workspace
                                                           → return metadata to tools.ts
                                                           → AI receives metadata JSON

MCP:  Same as TUI
```

**Completed**:
- ✅ `pyodide-sandbox.ts` — execute() saves files to IndexedDB after execution
- ✅ `node-python-sandbox.ts` — execute() saves files to filesystem after execution
- ✅ `PythonResult.tsx` — loads files from workspace storage instead of sync

**Remaining Fixes**:
- ⏳ `AIChatPage.tsx` — fix stale closure in handleFileSelect (add sessionId to deps)
- ⏳ `tools.ts` — pass chatId through execute_python handler
- ⏳ `pyodide.worker.ts` — binary file read with encoding: 'binary'
- ⏳ `WorkspaceModal.tsx` — simplify Blob creation

### Phase 12: Fix Binary File Content (In Progress)

**Status**: IN PROGRESS

**Root Cause**: `pyodide.FS.readFile(path)` returns string by default; `new Uint8Array(string)` throws for binary files

**Fix**: Use `pyodide.FS.readFile(path, { encoding: 'binary' })` to get Uint8Array

### Phase 13: Final Goal — AI Batch AT Tool Calls ⏳

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
- [x] **Phase 10**: Fix workspace empty display bug (commit `d55707e`)
- [ ] **Phase 11**: Fix chat isolation and binary file content (in progress)
- [ ] **Phase 12**: Create bsky_tools library for batch AT operations

### 2025-05-18
- [x] Subagent investigation: 3 independent bugs found
- [x] Commit: `88094d8` — fix chatId propagation for workspace isolation
- [x] Commit: `5cf75a4` — add diagnostic logging to pyodide worker
- [x] Deploy: https://9436c483.ai-bsky.pages.dev
- [x] User testing: logs show Worker returns content but PythonResult receives empty
- [x] Root cause identified: tools.ts strips content field
- [x] Decision: Plan B — save files to workspace in sandbox layer, load in UI
- [x] Commit: `f558fb4` — save Python output files to workspace storage
- [x] Commit: `44a77ee` — NodePythonSandbox saves to workspace
- [x] Deploy: https://4f8ca5b9.ai-bsky.pages.dev
- [ ] User testing: cross-session isolation still fails, files still empty
- [ ] Fixes remaining: AIChatPage stale closure, tools.ts chatId, worker binary read

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
10. **Uint8Array.buffer vs Uint8Array**: `file.data.buffer` may contain unused space causing empty files; use `file.data` directly for Blob creation
11. **Stale closures in useCallback**: Empty dependency arrays capture initial prop values; dynamic values like sessionId must be in deps
12. **FS.readFile encoding matters**: Pyodide's Emscripten FS defaults to string; binary files require explicit `{ encoding: 'binary' }`
13. **Tools should not carry binary content**: AI messages with base64 content waste tokens; store files in workspace, pass metadata only
14. **Unified architecture across platforms**: PWA + TUI + MCP should share the same file storage abstraction (WorkspaceStorage)
