# Worker & WebAssembly Lessons

> Web Workers, Pyodide, WASM, and sandbox environments
>
> Part of the [Lessons Learned](../LESSONS.md) collection.

---

## Lesson 57: Web Worker Module vs Classic — UMD Script Loading

**Category**: Worker/Browser API

**Root Cause**: 在 `{ type: 'module' }` Worker 中使用 `import(url)` 加载 Pyodide.js（UMD 格式）脚本。虽然代码语法正确，但浏览器在解析/安全检查阶段可能拒绝加载 UMD 脚本到模块 Worker 中，导致 Worker 在 18ms 内立即崩溃，错误信息为 "Worker error: unknown error"。

**Context**: 
- commit `f481167`（基础执行）在普通窗口测试通过
- commit `2e69a88`（添加 stdout/文件系统/包安装后）在无痕窗口测试立即失败
- 子代理审查确认 Worker 代码无语法错误
- 错误来自 `worker.onerror`（而非 `initError`），说明崩溃发生在解析/加载阶段

**Fix Options**:
1. **Classic Worker**（推荐）: `new Worker(url)`（无 `{ type: 'module' }`）+ `importScripts(url)` 替代 `import(url)`
2. **Module Worker + 容错**: 保持 `{ type: 'module' }` 但添加 API 存在性检查和详细错误日志
3. **Revert + Incremental**: 回滚到 `f481167`，逐一添加功能并测试

**Lesson Learned**:
1. **Module Worker 不是加载 UMD 脚本的可靠方式** — `import()` 在模块 Worker 中加载传统脚本存在浏览器兼容性风险，即使代码语法正确
2. **18ms 失败 = 解析/安全检查阶段崩溃** — 不是网络或运行时错误，而是浏览器拒绝执行 Worker 代码
3. **无痕窗口测试很重要** — 缓存可能掩盖模块加载问题，必须在无缓存环境验证
4. **大改动一次性提交风险高** — 添加了 stdout 捕获、文件系统、包安装、文件扫描、聊天隔离 5 个功能，任何一个出错都会导致整体失败

---

---

## Lesson 58: Pyodide API Call Sequencing — Initialization Stability

**Category**: WebAssembly/API

**Root Cause**: 在 `loadPyodide()` 成功后立即调用 `pyodide.loadPackage('micropip')` 和 `pyodide.FS.mkdirTree()`。如果 Pyodide WASM 处于部分初始化状态，这些 API 调用可能抛出无法被 JavaScript `try/catch` 完全捕获的异常，导致 Worker 异常终止。

**Context**:
- Pyodide v0.25.0 的 `loadPyodide()` 返回后，WASM 运行时可能尚未完全就绪
- `pyodide.FS`（Emscripten 文件系统）和 `pyodide.loadPackage`（包管理器）可能需要额外时间初始化
- 在 `try/catch` 中的代码仍可能导致 Worker 崩溃，因为异常可能发生在 C++ 层

**Fix Options**:
1. 每个 API 调用前检查存在性: `if (pyodide.FS && typeof pyodide.FS.mkdirTree === 'function')`
2. 延迟初始化: 将文件系统设置和包安装推迟到第一次 `execute()` 调用时
3. 分阶段加载: `loadPyodide()` → 等待 100ms → `mkdirTree` → 等待 → `loadPackage`

**Lesson Learned**:
1. **WASM 加载完成 ≠ API 完全可用** — `loadPyodide()` resolve 后，某些子系统可能仍在初始化
2. **防御性编程对 WASM 边界尤为重要** — C++ 抛出的异常可能绕过 JS 异常处理机制
3. **延迟初始化降低风险** — 将非必要的初始化推迟到实际需要时，减少启动失败概率

---

---

## Lesson 59: Binary Data Handling in Workers — Stack Overflow Risk

**Category**: Worker/Data Processing

**Root Cause**: `scanOutputFiles()` 中使用 `String.fromCharCode.apply(null, new Uint8Array(binary))` 将二进制数据转为字符串。`Function.prototype.apply` 有参数数量限制（通常 65,000-125,000），大文件会触发 `RangeError: Maximum call stack size exceeded`。

**Context**:
- 代码: `btoa(String.fromCharCode.apply(null, new Uint8Array(binary)))`
- 问题: `new Uint8Array(binary)` 的长度可能超过 apply 的限制
- 影响: 生成的图片/大文件会导致第二次崩溃（执行后扫描阶段）

**Fix**:
```javascript
function arrayBufferToBase64(buffer) {
  var bytes = new Uint8Array(buffer);
  var chunkSize = 65536;
  var result = '';
  for (var i = 0; i < bytes.length; i += chunkSize) {
    var chunk = bytes.subarray(i, i + chunkSize);
    result += String.fromCharCode.apply(null, chunk);
  }
  return btoa(result);
}
```

**Lesson Learned**:
1. **`Function.prototype.apply` 有参数上限** — 大数组必须用分块处理
2. **Worker 中栈溢出 = Worker 崩溃** — 没有优雅降级，直接导致 `onerror`
3. **输出文件大小需要限制** — 即使分块处理，也应该限制输出文件大小（如 1MB）

---

---

## Lesson 60: Incremental Feature Addition in Sandbox Environments

**Category**: Development Process

**Root Cause**: 一次性在 Worker 代码中添加了 5 个复杂功能（stdout 捕获、文件系统、包安装、文件扫描、聊天隔离），导致无法快速定位是哪个功能导致崩溃。

**Context**:
- 从 commit `f481167`（~170 lines Worker 代码）到 `2e69a88`（~300 lines）
- 虽然每个功能单独看都合理，但组合在一起产生了不可预期的交互
- 子代理审查虽然代码语法正确，但无法预测浏览器/WASM 运行时行为

**Lesson Learned**:
1. **Sandbox/Worker 环境特别脆弱** — 错误直接终止整个 Worker，没有部分失败模式
2. **逐个添加功能，每个都测试** — 特别是涉及浏览器 API、WASM、跨域加载的代码
3. **原子化提交不仅是 git 纪律，也是调试需要** — 每次只改一个功能，方便 bisect
4. **最小可工作版本优先** — 先确保基础功能（执行 Python + 返回结果）绝对稳定，再逐步增强

---

---

## Lesson 61: Vite Worker Import over Blob URL

**Category**: Worker

**Root Cause**: Inline Worker code embedded as a template string (`const WORKER_CODE = \`...\``) caused `SyntaxError: Invalid or unexpected token` after Vite minification. The minifier corrupted nested quotes/backticks in the bundled output (blob:...:183:489).

**Context**:
- Worker code was ~250 lines of JavaScript embedded in a TypeScript template literal
- Vite build process minified the outer bundle, which included the inner Worker code string
- Nested backticks, quotes, and special characters were not properly escaped during minification
- Error manifested only in production build, not in development

**Solution**: Extract Worker to standalone file `pyodide.worker.ts` and import via Vite's `?worker` syntax:
```typescript
import PyodideWorker from './pyodide.worker.ts?worker';
const worker = new PyodideWorker();
```

**Lesson Learned**:
1. **Never embed large code blocks as template strings** — minifiers may corrupt nested syntax
2. **Vite `?worker` handles bundling automatically** — no manual escaping needed
3. **Separate files enable TypeScript checking** for Worker code
4. **Code splitting** — Worker becomes independent chunk, reducing main bundle size

---

---

## Lesson 62: micropip Package Installation Batches

**Category**: WASM / Pyodide

**Root Cause**: Installing all third-party packages in a single `micropip.install()` call caused timeouts and made it impossible to identify which package failed.

**Context**:
- pandas (~10MB), numpy (~5MB), matplotlib (~15MB), scipy (~20MB), scikit-learn (~15MB)
- Total download: ~65MB on first load
- Single timeout of 120s was sometimes insufficient for slow connections
- One failed package (e.g., scipy) would abort the entire installation

**Solution**: Install in three batches with separate timeouts:
1. **Core** (pandas, numpy, matplotlib) — 120s timeout, must succeed
2. **Utility** (beautifulsoup4, pyyaml, openpyxl) — 60s timeout, best-effort
3. **Heavy** (scipy, scikit-learn) — 180s timeout, failure not fatal

**Lesson Learned**:
1. **Batch installation by size/criticality** — core packages first, optional packages later
2. **Separate timeouts** — heavy packages need longer timeouts
3. **Best-effort for optional packages** — failure should not block sandbox readiness
4. **Progress reporting per batch** — users see "Installing pandas..." then "Installing scipy..."

---

---

## Lesson 63: Matplotlib Fonts in WASM

**Category**: WASM / Pyodide

**Root Cause**: Matplotlib's `rcParams['font.sans-serif']` only sets font priority; if no font files exist in the system, text renders as boxes (tofu).

**Context**:
- Pyodide WASM environment has no system fonts installed
- Setting `matplotlib.rcParams['font.sans-serif'] = ['SimHei']` has no effect if SimHei.ttf doesn't exist
- matplotlib caches font list at `~/.cache/matplotlib/fontlist-v330.json`
- 63 glyph missing warnings when rendering Chinese text

**Solution Attempt**: Configure font fallback (partial fix):
```python
matplotlib.rcParams['axes.unicode_minus'] = False
# Try common CJK fonts in priority order
```

**Future Fix**: Download font file to Pyodide FS:
```javascript
const fontResponse = await fetch('https://cdn.../NotoSansCJKsc-Regular.otf');
const fontBuffer = await fontResponse.arrayBuffer();
pyodide.FS.writeFile('/home/pyodide/.fonts/NotoSansCJKsc-Regular.otf', new Uint8Array(fontBuffer));
```

**Lesson Learned**:
1. **Font configuration ≠ font availability** — rcParams only sets search priority
2. **WASM environments lack system resources** — fonts, locales, timezone data must be manually provided
3. **Font caching** — matplotlib caches font list; new fonts require cache refresh or pre-installation
4. **File size trade-off** — Noto Sans CJK is ~4MB; consider subset fonts for smaller footprint

---

---

## Lesson 67: FS.readFile Encoding for Binary Data

**Category**: WebAssembly / Pyodide

**Root Cause**: `pyodide.FS.readFile(path)` without options returns a JavaScript string (UTF-8 decoded). For binary files (PNG, JPG), `new Uint8Array(string)` throws TypeError, leaving content empty.

**Context**:
- Pyodide's Emscripten FS defaults to string return for `readFile()`
- Binary files need raw bytes, not UTF-8 decoded string
- `new Uint8Array(string)` is invalid — Uint8Array constructor doesn't accept strings

**Solution**: Explicitly request binary encoding:
```typescript
// Wrong (returns string, breaks binary files)
const rawData = pyodide.FS.readFile(path);

// Correct (returns Uint8Array, works for all files)
const rawData = pyodide.FS.readFile(path, { encoding: 'binary' });
```

**Lesson Learned**:
1. **Always specify encoding for FS.readFile** — default behavior varies by runtime
2. **Binary data must stay binary** — never convert to string and back
3. **Test with binary files** — images, PDFs, zip files expose encoding issues

---

---

## Lesson 70: Pyodide Proxy Objects — The Silent Data Loss

**Category**: WebAssembly / Pyodide

**Root Cause**: Pyodide `dict.toJs()` returns a JavaScript `Map` object, not a plain `Object`. `Object.entries(Map)` returns `[]`, so all dictionary keys are silently lost.

**Context**:
- Python `kwargs` dict passed to JS bridge as Pyodide proxy
- Bridge used `Object.entries(params)` to iterate parameters
- `Object.entries(new Map([['actor', 'handle']]))` → `[]` (empty array!)
- Result: All API calls had empty parameters, causing 400 errors

**Symptoms**:
- `get_profile("handle")` → 400 (actor parameter missing)
- `search_posts("AI")` → "Search query is empty" (q parameter missing)
- `fields` parameter never worked (also lost in params)

**Solution**: 
```typescript
// Wrong — Map has no enumerable string keys
for (const [key, value] of Object.entries(params)) { ... }

// Right — convert proxy to plain Object first
const plainParams = toPlainJs(params);
for (const [key, value] of Object.entries(plainParams)) { ... }

// Even better — convert at source
dict.toJs({ dict_converter: Object.fromEntries })
```

**Lesson Learned**:
1. **Pyodide proxies are not plain JS objects** — they implement Python protocols, not JS conventions
2. **`instanceof Map` is the correct check** after `.toJs()`, not `typeof === 'object'`
3. **`dict.toJs({dict_converter: Object.fromEntries})` converts at the C level** — cleanest solution
4. **Always validate data at boundaries** — Python↔JS boundary is where most bugs hide

---

---

## Lesson 71: Worker Should Only Handle Transport

**Category**: Web Worker / Architecture

**Root Cause**: PWA Worker hardcoded all 33 API handlers (27 read + 6 write), duplicating logic from `tools.ts`. Any API change required updating two places.

**Context**:
- Initial design: Worker implements handlers → sync XHR → BskyClient
- Refactored design: Worker is transport-only → SAB + Atomics → Main Thread ToolDispatcher
- TUI/MCP already used ToolDispatcher; PWA was the outlier

**Benefits of Refactor**:
- Single source of truth for all handlers
- Changes apply to all platforms instantly
- Worker file size: 26KB → 16KB
- Deleted `bsky-tools-pyodide.ts` (260 lines of duplicates)

**Lesson Learned**:
1. **Transport layer should not implement business logic** — separates concerns, enables reuse
2. **Refactor early, not late** — Day 4 refactor prevented days of dual-maintenance
3. **Unified architecture reduces test burden** — test handlers once, not per-platform
4. **Dynamic wrapper injection** — `generatePyodideWrapper()` in core generates wrapper for all platforms

---

---

## Lesson 72: COEP credentialless for Cross-Origin Media

**Category**: Browser Security / Headers

**Root Cause**: `Cross-Origin-Embedder-Policy: require-corp` enables SharedArrayBuffer but blocks all cross-origin resources without CORP headers. Bluesky's CDN (`cdn.bsky.app`) does not send CORP headers, breaking all images.

**Solution**: `Cross-Origin-Embedder-Policy: credentialless`
- Enables SharedArrayBuffer (needed for Worker sync communication)
- Allows cross-origin images without CORP headers
- Does not send cookies/credentials to cross-origin requests

**Trade-offs**:
- ✅ SAB works, images load
- ⚠️ No credentials on cross-origin requests (acceptable for CDN images)
- ⚠️ Must verify all third-party resources support CORS

**Lesson Learned**:
1. **`require-corp` is too strict for media-heavy apps** — most CDNs don't implement CORP
2. **`credentialless` is the pragmatic choice** for apps loading cross-origin media
3. **Test with real CDN resources** — local testing won't catch CDN header issues
4. **COEP affects ALL cross-origin subresources** — fonts, scripts, images, iframes

---

---

## Lesson 73: Keyword-Only Parameters Prevent Order Bugs

**Category**: Python API Design

**Root Cause**: Positional arguments caused parameter confusion. `get_timeline(None, 3)` was parsed as `cursor=None, limit=3` instead of `limit=3`.

**Solution**: `def method(self, *, ...)` — Python's keyword-only parameter syntax.

**Before**:
```python
def get_timeline(self, limit=50, cursor=None):  # Positional allowed
    pass

get_timeline(None, 3)  # cursor=None, limit=3 — WRONG
```

**After**:
```python
def get_timeline(self, *, limit=50, cursor=None):  # Keyword-only
    pass

get_timeline(None, 3)      # TypeError — good!
get_timeline(limit=3)      # ✅ Correct
```

**Lesson Learned**:
1. **Python's `*,` is the keyword-only separator** — forces all subsequent params to be keyword
2. **Eliminates an entire class of parameter order bugs** — no more positional confusion
3. **Self-documenting API** — callers must write parameter names, improving readability
4. **Applies to ALL wrapper generators** — both Pyodide and Node.js wrappers

---

---

## Lesson 74: Optional Parameters Need Explicit Defaults

**Category**: Python API Design

**Root Cause**: BSKY_TOOLS metadata marked params as `required: false` but without `default` values. After adding `*` keyword-only, these became required parameters.

**Example**:
```typescript
// Metadata
{ name: 'cursor', type: 'string', required: false }  // No default!

// Generated Python (before fix)
def search_posts(self, *, q, limit=25, cursor):  # cursor is REQUIRED!
    pass
```

**Solution**: Auto-generate `=None` for optional params without explicit defaults:
```typescript
if (p.default !== undefined) {
    return `${pyName}=${formatDefault(p.default)}`;
} else if (!p.required) {
    return `${pyName}=None`;  // Auto-default to None
}
```

**Lesson Learned**:
1. **`required: false` is not enough** — Python needs a default value for keyword-only params
2. **Auto-generate `=None` as fallback** — safe default for optional API parameters
3. **Metadata must be self-consistent** — every optional param should have a default (explicit or auto)
4. **Test parameter omission** — `method(required_param)` without optional params should work

---

---

## Lesson 75: Fail-Safe Security Defaults

**Category**: Security / Sandboxing

**Root Cause**: AST analysis code had a bug — reading non-existent `_stdout_lines` variable caused a ReferenceError. The catch block returned `hasWriteOperations: false`, allowing write operations without confirmation.

**Impact**: **Security vulnerability** — AI could execute write operations without user confirmation.

**Fix**: Two layers of defense:
1. **Fail-safe default**: Analysis errors return `hasWriteOperations: true` (require confirmation)
2. **Worker gate**: `createToolBridge(enableWrite)` blocks write ops unless explicitly enabled

**Before** (vulnerable):
```typescript
try {
    const result = pyodide.runPython(analysisCode);
    return JSON.parse(result);  // May throw
} catch {
    return { hasWriteOperations: false };  // ❌ WRONG — allows writes
}
```

**After** (secure):
```typescript
try {
    const result = pyodide.runPython(analysisCode);
    return JSON.parse(result);
} catch {
    return { hasWriteOperations: true };  // ✅ SAFE — requires confirmation
}
```

**Lesson Learned**:
1. **Security analysis failures must default to the safest option** — deny, not allow
2. **Never return permissive defaults from catch blocks** — errors should restrict, not enable
3. **Multiple defense layers** — AST analysis + Worker gate + UI confirmation
4. **Security bugs are P0** — fix immediately, don't wait for next release

---

---

## Lesson 76: sys.modules Registration for import Support

**Category**: Python Module System

**Root Cause**: Python wrapper set `bsky_tools = BskyTools()` as a global variable but did not register it in `sys.modules`. Python's `import` mechanism only looks in `sys.modules`, so `import bsky_tools` failed with `ModuleNotFoundError`.

**Solution**: Add module registration:
```python
bsky_tools = BskyTools(bridge)
import sys
sys.modules['bsky_tools'] = bsky_tools  # Register for import
```

**Lesson Learned**:
1. **Python `import` checks `sys.modules`, not globals** — setting a global variable is not enough
2. **Module registration must happen before user code runs** — inject during init, not after
3. **Same fix needed for all environments** — Pyodide (globals via `pyodide.globals.set`) and Node.js (module namespace)
4. **Test `import module` explicitly** — don't assume global variables are importable
4. **Type guards after read** — verify returned type matches expectation

---