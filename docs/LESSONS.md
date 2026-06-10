# Lessons Learned — Bsky Project

> 详细教训记录，按类别分组。
> 当前共 76 课，涵盖 AI、认证、UI、API、存储、DM、Worker、WASM 等领域。
>
> **快速查找**：按类别浏览，或使用下方表格索引。

---

## Category Index

| Category | File | Lessons | Description |
|----------|------|---------|-------------|
| **UI/UX** | [lessons/ui.md](lessons/ui.md) | 1, 4, 5, 6, 7, 8, 12, 14, 16, 52, 54, 56, 64 | 组件、动画、布局、事件、无障碍 |
| **AI/Prompting** | [lessons/ai.md](lessons/ai.md) | 2, 3, 17, 18, 68 | 工具调用、格式化、数据映射 |
| **API/Network** | [lessons/api.md](lessons/api.md) | 9, 13, 20, 46, 47, 48 | 端点、重试、CORS、去重 |
| **Auth/Session** | [lessons/auth.md](lessons/auth.md) | 53, 55, 77 | JWT、认证钩子、凭证管理 |
| **Storage** | [lessons/storage.md](lessons/storage.md) | 10, 11, 49, 50, 51, 69, 78 | IndexedDB、文件系统、缓存、竞态 |
| **DM/Messaging** | [lessons/dm.md](lessons/dm.md) | 19, 30, 31, 33, 35 | 私信、对话、反应、认证演进 |
| **Worker/WASM** | [lessons/worker-wasm.md](lessons/worker-wasm.md) | 57, 58, 59, 60, 61, 62, 63, 67, 70, 71, 72, 73, 74, 75, 76 | Pyodide、Worker、二进制数据、字体、Python API 设计 |
| **React/Hooks** | [lessons/react-hooks.md](lessons/react-hooks.md) | 66 | useCallback、闭包、依赖项 |
| **PWA** | [lessons/pwa.md](lessons/pwa.md) | 65 | Service Worker、Cache API |
| **Process** | [lessons/process.md](lessons/process.md) | 15, 60 | 构建顺序、增量开发、测试策略 |

> **Lessons 21-45**（早期会话教训）已归档至 `docs/archive/LESSONS_ARCHIVE.md`。
> 这些教训涵盖：AI 自动发帖防御、编辑消息回滚、Feed 删除保护、handle 链接编码、默认 Feed、搜索重构、Feed 刷新、引用帖解析、点赞计数、SVG 图标、帖子列表统一、公开 API 403、view_image 提示、浏览器 fetch 错误、DNS 污染、AI 配置更新、场景模型解析、图片上下文持久、tool_call_id 全链路修复、无限工具轮次、JSON 解析容错、组件栏互斥、持久化回调、多帖润色、草稿同步、TUI 提交、ALT 弹窗、视频播放、滚动恢复、DM 自动滚动、收藏虚拟滚动、AI 标题生成、上下文过滤、ThreadView 设计、搜索历史布局、handle 布局、emoji 分组、PDS 发现、JWT 刷新、下载 Blob、DidDocument 类型、CORS 提示、i18n 补全。

---

## Numbered Index

| # | Title | Category | File |
|---|-------|----------|------|
| 1 | Widget Sorting Index Mismatch | UI | [ui.md](lessons/ui.md) |
| 2 | tool_call_id Loss on Three Paths | AI | [ai.md](lessons/ai.md) |
| 3 | Double Formatting | AI | [ai.md](lessons/ai.md) |
| 4 | SVG Icons Must Be Hardcoded | UI | [ui.md](lessons/ui.md) |
| 5 | Widget System Unified Header | UI | [ui.md](lessons/ui.md) |
| 6 | AI Card CSS Transition | UI | [ui.md](lessons/ui.md) |
| 7 | Streaming Scroll RAF | UI | [ui.md](lessons/ui.md) |
| 8 | Mobile Keyboard Viewport | UI | [ui.md](lessons/ui.md) |
| 9 | ky Retry Config | API | [api.md](lessons/api.md) |
| 10 | Component Persistence | Storage | [storage.md](lessons/storage.md) |
| 11 | Array vs Set | Storage | [storage.md](lessons/storage.md) |
| 12 | i18n Interpolation | UI | [ui.md](lessons/ui.md) |
| 13 | AppView vs PDS Dedup | API | [api.md](lessons/api.md) |
| 14 | Widget Temporary Disable | UI | [ui.md](lessons/ui.md) |
| 15 | Build Order | Process | [process.md](lessons/process.md) |
| 16 | Widget Header Buttons | UI | [ui.md](lessons/ui.md) |
| 17 | AI Card Data Retention | AI | [ai.md](lessons/ai.md) |
| 18 | buildToolDescription | AI | [ai.md](lessons/ai.md) |
| 19 | markConvoRead | DM | [dm.md](lessons/dm.md) |
| 20 | searchActors Public Endpoint | API | [api.md](lessons/api.md) |
| 21-45 | *(archived)* | Various | [archive/LESSONS_ARCHIVE.md](archive/LESSONS_ARCHIVE.md) |
| 46 | DuckDuckGo Sec-Fetch | API | [api.md](lessons/api.md) |
| 47 | Wikipedia API Endpoint | API | [api.md](lessons/api.md) |
| 48 | MediaWiki CORS | API | [api.md](lessons/api.md) |
| 49 | ChatStorage Factory | Storage | [storage.md](lessons/storage.md) |
| 50 | autoSave Race Condition | Storage | [storage.md](lessons/storage.md) |
| 51 | autoSave Write Queue | Storage | [storage.md](lessons/storage.md) |
| 52 | CVD-Friendly Palette | UI | [ui.md](lessons/ui.md) |
| 53 | Blob Download JWT | Auth | [auth.md](lessons/auth.md) |
| 54 | React Portal Events | UI | [ui.md](lessons/ui.md) |
| 55 | beforeRequest Auth Hook | Auth | [auth.md](lessons/auth.md) |
| 56 | 429 Rate-Limit Retry | UI/Perf | [ui.md](lessons/ui.md) |
| 57 | Web Worker Module vs Classic | Worker | [worker-wasm.md](lessons/worker-wasm.md) |
| 58 | Pyodide API Sequencing | WASM | [worker-wasm.md](lessons/worker-wasm.md) |
| 59 | Binary Data in Workers | Worker | [worker-wasm.md](lessons/worker-wasm.md) |
| 60 | Incremental Feature Addition | Process | [process.md](lessons/process.md) |
| 61 | Vite Worker Import | Worker | [worker-wasm.md](lessons/worker-wasm.md) |
| 62 | micropip Package Batches | WASM | [worker-wasm.md](lessons/worker-wasm.md) |
| 63 | Matplotlib Fonts in WASM | WASM | [worker-wasm.md](lessons/worker-wasm.md) |
| 64 | Event Propagation in Nested UI | UI | [ui.md](lessons/ui.md) |
| 65 | Cache API Only Supports GET | PWA | [pwa.md](lessons/pwa.md) |
| 66 | Stale Closure in useCallback | React | [react-hooks.md](lessons/react-hooks.md) |
| 67 | FS.readFile Encoding | WASM | [worker-wasm.md](lessons/worker-wasm.md) |
| 68 | Pass Context Through Tool Handlers | AI | [ai.md](lessons/ai.md) |
| 69 | Unified File Storage | Storage | [storage.md](lessons/storage.md) |
| 70 | Pyodide Proxy Objects — Silent Data Loss | WASM | [worker-wasm.md](lessons/worker-wasm.md) |
| 71 | Worker Should Only Handle Transport | Worker | [worker-wasm.md](lessons/worker-wasm.md) |
| 72 | COEP credentialless for Cross-Origin Media | Browser | [worker-wasm.md](lessons/worker-wasm.md) |
| 73 | Keyword-Only Parameters Prevent Order Bugs | API Design | [worker-wasm.md](lessons/worker-wasm.md) |
| 74 | Optional Parameters Need Explicit Defaults | API Design | [worker-wasm.md](lessons/worker-wasm.md) |
| 75 | Fail-Safe Security Defaults | Security | [worker-wasm.md](lessons/worker-wasm.md) |
| 76 | sys.modules Registration for import Support | Python | [worker-wasm.md](lessons/worker-wasm.md) |
| 77 | JWT Refresh Retry Must Preserve Body | Auth | [2026-06-11-jwt-retry-lost-body.md](lessons/2026-06-11-jwt-retry-lost-body.md) |
| 78 | File Reference Becomes Stale Before Upload | Browser / Storage | [2026-06-11-file-reference-stale-upload.md](lessons/2026-06-11-file-reference-stale-upload.md) |

---

> **完整上下文恢复**：`docs/CONTEXT.md`
> **系统架构**：`docs/ARCHITECTURE.md`
> **版本历史**：`CHANGELOG.md`
