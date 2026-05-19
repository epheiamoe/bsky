# Workspace & Python Sandbox

> 文件上传工作区 + Python 沙箱执行环境。v0.14.0 新增。

---

## 概述

工作区允许用户在 AI 对话中上传任意文件（CSV、JSON、图片等），AI 可通过 `execute_python` 工具运行 Python 代码分析这些文件。Python 沙箱运行在浏览器内的隔离 WebAssembly 环境中。

---

## 架构

```
User uploads file
    │
    ▼
WorkspaceStorage.saveFile()     ← @bsky/app 接口
    │
    ├─ PWA: IndexedDBWorkspaceStorage (IndexedDB)
    └─ TUI: FileWorkspaceStorage (~/.bsky-tui/workspace/)
    │
    ▼
AIChatPage 消息引用: [文件: /workspace/data/filename.csv]
    │
    ▼
AI 调用 execute_python(code)
    │
    ▼
PyodideSandbox (PWA)            ← Vite ?worker Web Worker
    │
    ├─ Worker 加载 Pyodide from CDN
    ├─ 安装 pandas, numpy, matplotlib
    ├─ 挂载 /workspace/data/ (read-only)
    ├─ 执行 Python 代码
    └─ 扫描 /workspace/output/ → 返回文件列表
    │
    ▼
PythonResult 组件 (PWA)
    ├─ stdout (等宽字体, 可展开)
    ├─ stderr (警告色)
    ├─ CSV → HTML table
    ├─ PNG/JPG → <img> base64
    ├─ JSON → 格式化树
    └─ Meta: Success/Failed · Nms
```

---

## 文件

| 文件 | 说明 |
|------|------|
| `packages/app/src/services/workspaceStorage.ts` | WorkspaceStorage 接口 + FileWorkspaceStorage (TUI) + 工厂 |
| `packages/pwa/src/services/indexeddb-workspace-storage.ts` | IndexedDBWorkspaceStorage (PWA) |
| `packages/pwa/src/services/pyodide-sandbox.ts` | PyodideSandbox — Web Worker (Vite ?worker) |
| `packages/pwa/src/components/WorkspaceModal.tsx` | 工作区文件管理弹窗 |
| `packages/pwa/src/components/ai/PythonResult.tsx` | Python 执行结果渲染 |
| `packages/core/src/ai/python-sandbox.ts` | PythonSandboxEngine 接口定义 |
| `packages/core/src/ai/tools.ts` | execute_python 工具 (34 个工具之一) |

---

## Worker 实现细节

### Vite ?worker Import

Worker 代码放在独立文件 `pyodide.worker.ts` 中，通过 Vite 的 `?worker` 语法导入：

```typescript
import PyodideWorker from './pyodide.worker.ts?worker';
const worker = new PyodideWorker();
```

Vite 自动将 Worker 代码打包为独立 chunk，无需内联或 Blob URL。Classic Worker 模式（非 module）用于兼容 UMD 格式的 Pyodide 脚本。

### CDN Fallback

Worker 尝试两个 CDN，失败时自动切换：

1. `https://cdn.jsdelivr.net/pyodide/v0.25.0/full/pyodide.js`
2. `https://unpkg.com/pyodide@0.25.0/full/pyodide.js`

### UMD Import

Pyodide CDN 是 UMD 格式（非 ESM），`import()` 只执行脚本，不导出绑定。正确方式：

```javascript
await import(url);
const load = self.loadPyodide || globalThis.loadPyodide;
```

### 实时进度汇报

Worker 发送 `initProgress` 消息，UI 实时更新横幅：

| 阶段 | 进度 | 消息 |
|------|------|------|
| downloading | 0.1-0.15 | 从 CDN 1/2 下载... |
| loading | 0.3 | 加载 WASM 运行时... |
| setup | 0.5 | 设置工作区... |
| packages | 0.6-0.9 | 安装 micropip/pandas/numpy/matplotlib |
| ready | 1.0 | Python sandbox ready |

---

## Python 沙箱环境

### 虚拟文件系统

```
/workspace/
  ├── data/      ← 用户上传文件（只读）
  ├── output/    ← Python 输出文件（自动扫描返回）
  └── temp/      ← 临时文件（自动清理）
```

### 可用库

**预装（随 Pyodide 自带）**：json, math, statistics, csv, io, pathlib, datetime, re, collections, itertools, random, hashlib, base64

**按需安装**（首次初始化时）：pandas, numpy, matplotlib

### 限制

- 执行时间：30 秒
- 内存：256MB
- 单文件输出上限：1MB
- 总输出上限：5MB

---

## execute_python 工具

```typescript
{
  name: 'execute_python',
  description: 'Execute Python code in an isolated sandbox...',
  inputSchema: {
    properties: { code: { type: 'string' } },
    required: ['code']
  },
  requiresWrite: false  // 读操作，无需确认
}
```

### 最佳实践（提示词已告知 AI）

1. `print()` 输出简要状态
2. 结果保存到 `/workspace/output/`（.csv/.json/.png）
3. 用 `try/except` 处理错误
4. 不要用 `input()`（无交互）
5. 文件引用格式：`[文件: /workspace/data/filename.csv]`

---

## UI 设计

### 工作区弹窗

- 点击 AIChatPage 输入区 🗄 按钮打开
- 显示文件列表：图标 + 名称 + 大小 + 上传时间
- 操作：下载、删除
- 底部统计：文件数 + 总大小

### Python 执行结果

**折叠预览**：`Code · N lines`

**展开后**：
```
┌─ Python Code ──────────────────────────┐
│ 等宽字体代码块，max-h-200px scrollable  │
└────────────────────────────────────────┘
┌─ Standard Output · N lines ────────────┐
│ 等宽字体，超过 15 行可展开              │
└────────────────────────────────────────┘
┌─ Warnings / Errors (if any) ───────────┐
│ 黄色边框警告块                          │
└────────────────────────────────────────┘
┌─ Output Files ─────────────────────────┐
│ 📊 data.csv · 12KB [HTML table]        │
│ 🖼️ chart.png · 45KB [base64 img]       │
└────────────────────────────────────────┘
● Success · 1234ms
```

---

## 已知问题 & 限制

1. **首次加载慢**：Pyodide WASM ~5MB + stdlib ~6MB + packages，首次初始化需 10-30 秒
2. **TUI 已实现**：TUI 和 MCP 使用 `NodePythonSandbox`（`child_process` + 系统 Python），见 `packages/app/src/services/node-python-sandbox.ts`
3. **Worker CSP**：极少数企业环境可能阻止 `blob:` URL Worker
4. **内存限制**：WASM 内存受限，处理 >100MB 数据可能 OOM

---

## 未来改进

- [x] TUI Python 沙箱支持（NodePythonSandbox via child_process）
- [ ] 本地 Pyodide 缓存（IndexedDB 缓存 WASM 和包）
- [ ] 更多预装包（scipy, scikit-learn）
- [ ] 交互式 Matplotlib 输出（widget 模式）
