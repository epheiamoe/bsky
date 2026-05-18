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
4. **Type guards after read** — verify returned type matches expectation

---