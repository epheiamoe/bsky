# Lessons Learned — Bsky Project

> 详细教训记录，按会话分组。每次会话新增一个章节。
> 当前共 65 课，涵盖 AI、认证、UI、API、存储、DM、Worker、WASM 等领域。
> 本文可快速索引；完整上下文见 `docs/CONTEXT.md`。

---

## Table of Contents

| # | Title | Category | Summary |
|---|-------|----------|---------|
| [1](#lesson-1-widget-sorting-index-mismatch) | Widget Sorting Index Mismatch | UI | 过滤列表的索引不能用于操作完整数组 |
| [2](#lesson-2-tool_call_id-loss-on-three-paths) | tool_call_id Loss on Three Paths | AI | 存储格式↔API格式转换是高风险区 |
| [3](#lesson-3-double-formatting-tryjsonsummary-vs-formattoolresult) | Double Formatting | AI | 格式化层不能重复，只能保留一层 |
| [4](#lesson-4-svg-icons-must-be-hardcoded) | SVG Icons Must Be Hardcoded | UI | 共享组件不能依赖动态文件加载 |
| [5](#lesson-5-widget-system-unified-header-bar) | Widget System Unified Header | UI | WidgetPanel 统一 header，widget 纯内容 |
| [6](#lesson-6-ai-card-animation-must-use-css-transition) | AI Card CSS Transition | UI | 条件渲染破坏 CSS transition |
| [7](#lesson-7-streaming-scroll-requires-requestanimationframe) | Streaming Scroll RAF | UI | 等浏览器 paint 后再滚动 |
| [8](#lesson-8-mobile-keyboard-visualviewport) | Mobile Keyboard Viewport | UI | 键盘弹出时用 visualViewport.height |
| [9](#lesson-9-ky-retry-must-explicit-statuscodes) | ky Retry Config | API | 显式声明 retry 状态码 |
| [10](#lesson-10-component-persistence-needs-callback) | Component Persistence | Storage | Module-level toggle 需要持久化回调 |
| [11](#lesson-11-array-vs-set-for-ordered-state) | Array vs Set | Storage | 有序状态用数组，不用 Set |
| [12](#lesson-12-i18n-interpolation-braces) | i18n Interpolation | UI | 使用单大括号 `{n}` |
| [13](#lesson-13-appview-dedup-vs-pds-raw) | AppView vs PDS Dedup | API | 处理重复数据用 PDS 层 API |
| [14](#lesson-14-widget-temporary-disable-snapshot) | Widget Temporary Disable | UI | 临时变更需保存-恢复配对 |
| [15](#lesson-15-build-order-commit-before-build) | Build Order | Performance | Commit hash 必须在 commit 后 build |
| [16](#lesson-16-widget-header-buttons-module-refs) | Widget Header Buttons | UI | Module ref 传递运行时 context |
| [17](#lesson-17-ai-card-data-retention-mapmessages) | AI Card Data Retention | AI | 存储↔API 字段映射必须双向完整 |
| [18](#lesson-18-buildtooldescription-for-write-tools) | buildToolDescription | AI | 新增 write 工具必须加确认描述 |
| [19](#lesson-19-markconvoread-optimistic) | markConvoRead | DM | 乐观清除未读标记 |
| [20](#lesson-20-searchactors-public-endpoint) | searchActors Public Endpoint | API | 不是所有端点都能走 PDS 代理 |
| [46](#lesson-46-duckduckgo-sec-fetch-detection) | DuckDuckGo Sec-Fetch | API | 浏览器指纹头导致 DDG 返回空字段 |
| [47](#lesson-47-wikipedia-api-endpoint) | Wikipedia API Endpoint | API | REST search 端点不存在，用 page/summary |
| [48](#lesson-48-mediawiki-api-cors) | MediaWiki CORS | API | 必须加 `&origin=*` |
| [49](#lesson-49-chatstorage-factory-pattern) | ChatStorage Factory | Storage | 工厂模式消除调用方选择责任 |
| [50](#lesson-50-autosave-race-condition) | autoSave Race Condition | Storage | void + put() + 同 key = 竞态 |
| [51](#lesson-51-autosave-write-queue) | autoSave Write Queue | Storage | Promise 链串行化异步 I/O |
| [52](#lesson-52-cvd-friendly-palette) | CVD-Friendly Palette | UI | 双重编码 + CSS 变量面向未来 |
| [53](#lesson-53-blob-download-ky-instance) | Blob Download JWT | Auth | 认证请求必须走 this.ky |
| [54](#lesson-54-react-portal-event-bubbling) | React Portal Events | UI | 合成事件沿 Fiber 树冒泡 |
| [55](#lesson-55-beforerequest-auth-hook) | beforeRequest Auth Hook | Auth | 集中化 hook 比 42 个手动调用更安全 |
| [56](#lesson-56-429-rate-limit-retry) | 429 Rate-Limit Retry | Performance | 指数退避是限速的标准模式 |
| [57](#lesson-57-web-worker-module-vs-classic) | Web Worker Module vs Classic | Worker | Module Worker 加载 UMD 脚本有风险 |
| [58](#lesson-58-pyodide-api-call-sequencing) | Pyodide API Sequencing | WASM | WASM 加载完成 ≠ API 就绪 |
| [59](#lesson-59-binary-data-handling-in-workers) | Binary Data in Workers | Data | apply() 有参数上限，大文件分块 |
| [60](#lesson-60-incremental-feature-addition) | Incremental Feature Addition | Process | Sandbox 环境逐个添加功能 |
| [61](#lesson-61-vite-worker-import-over-blob-url) | Vite Worker Import over Blob URL | Worker | Vite `?worker` 导入避免模板字符串转义问题 |
| [62](#lesson-62-micropip-package-installation-batches) | micropip Package Installation Batches | WASM | 第三方包分批次安装，失败不阻塞 |
| [63](#lesson-63-matplotlib-fonts-in-wasm) | Matplotlib Fonts in WASM | WASM | WASM 环境无系统字体，需手动加载字体文件 |
| [64](#lesson-64-event-propagation-in-nested-ui) | Event Propagation in Nested UI | UI | 嵌套组件中的按钮必须阻止事件冒泡 |
| [65](#lesson-65-cache-api-only-supports-get) | Cache API Only Supports GET | PWA | Cache API 只支持 GET 请求，POST 会抛异常 |

> Lessons 21-45 记录在 `docs/CONTEXT.md` 的「关键教训」章节。

---

# Session 2026-05-07

## Lesson 1: Widget Sorting Index Mismatch

**Category**: UI

**Root Cause**: 箭头使用 `enabledWidgets.map((w, idx) => ...)` 的 `idx`（过滤后的可见 widget 索引），但 `handleReorderWidget` 操作的是 `enabledIds`（完整启用的所有 widget ID 数组）。当某些 widget 有 `views` 限制（如 `polish` 只在 compose 页显示）时，它们不在当前视图的 `availableWidgets` 中，`enabledWidgets` 比 `enabledIds` 短，两个索引偏移。

```
enabledIds:           ['polish', 'suggestedFollows', 'profilePreview', 'trends', 'aiChat']  (5 items)
availableWidgets:     [suggestedFollows, trends, aiChat]  (polish/profilePreview excluded)
enabledWidgets:       [suggestedFollows, trends, aiChat]  (3 items, 按 enabledIds 顺序)
视觉 idx:              0                    1         2
enabledIds idx:        1                    3         4     ← 箭头用的视觉 idx=1，操作的是 enabledIds[1]='suggestedFollows'，正确！
                                                             但点击 idx=2 的 ↓: 操作 enabledIds[3]='trends'，正确！
                                                             但点击 idx=1 的 ↑: 操作 enabledIds[1]='suggestedFollows'，向上交换 enabledIds[0]='polish'！
                                                             视觉上 polish 不显示，所以看似「点了没反应」或「移错了」
```

**Fix**: 使用 `enabledIds.indexOf(w.id)` 获取 widget 在完整数组中的真实索引。

```typescript
// ❌ 错误 — 视觉 idx
onReorderWidget?.(idx, idx - 1);

// ✅ 正确 — 真实 enabledIds 索引
const realIdx = enabledIds.indexOf(w.id);
onReorderWidget?.(realIdx, realIdx - 1);
```

**Lesson Learned**: 任何涉及「过滤后列表索引」到「完整列表索引」的映射必须显式转换，不能假设相等。

---

## Lesson 2: tool_call_id Loss on Three Paths

**Category**: AI

**Root Cause**: `tool_call_id` 在三个独立路径上丢失：
1. **assistant.ts:617** — 正常执行路径的 `tool_result` yield 缺少 `toolCallId: tc.id`（取消路径第 599 行有，正常路径忘了）
2. **useAIChat.ts:137** — 会话恢复路径将 `tool_call` 和 `tool_result` **都映射为 `role: 'tool'`**，导致 API 收到一系列连续的 tool 消息，但没有前面的 `assistant { tool_calls }` 消息 → API 400
3. **useAIChat.ts:371** — `mapMessages`（edit/undo 后恢复 UI 状态）丢失 `toolName` 和 `toolCallId`

**Fix**:
1. `assistant.ts:617` 补上 `toolCallId: tc.id`
2. `useAIChat.ts` 恢复路径重写：`tool_call` → 重建 `assistant { tool_calls[] }` 消息，`tool_result` → `tool { tool_call_id }` 消息，保持正确序列
3. `useAIChat.ts:371` `mapMessages` 补上 `toolName: m.name, toolCallId: m.tool_call_id`

**Lesson Learned**: 存储格式（`AIChatMessage`）和 API 格式（`ChatMessage`）的转换是高风险区。每个 field 的路线都需要端到端验证——是否存在、是否在序列化中保留、是否在恢复中还原。

---

## Lesson 3: Double Formatting — tryJsonSummary vs formatToolResult

**Category**: AI

**Root Cause**: `useAIChat.ts` 的流式处理器先用 `tryJsonSummary(event.content)` 把 JSON 压缩为短字符串（如 `"用户: @handle (name)"`），再存入 `AIChatMessage.content`。然后 `formatToolResult` 收到这个已压缩的字符串，尝试 `JSON.parse` → 失败 → 落到 fallback 显示 `"Profile"`。

**Fix**:
- `useAIChat.ts` 改为直接存储原始 `event.content`（不经过 `tryJsonSummary`），让 `formatToolResult` 处理所有显示
- `formatToolResult` 的最终 fallback 改为显示内容第一行，而非 `toolLabel(name)`

**Lesson Learned**: 格式化层不能重复。如果有两个格式化函数，一个在数据处理层，一个在视图层，它们会互相干扰。只能保留一层——要么在数据层格式化（TUI 场景），要么在视图层（PWA 场景）。

---

## Lesson 4: SVG Icons Must Be Hardcoded

**Category**: UI

**Root Cause**: `Icon.tsx` 通过 `import.meta.glob` 动态加载 SVG 文件。如果文件路径/名称有细微差异，图标就加载不到，返回 `null`（无显示）。共享 `ai/` 目录下的组件引用 `../Icon.js` 跨目录查找，更容易出错。

**Fix**: 将 SVG path 直接硬编码为 `const WRENCH_SVG = '<path d="..." />'` 常量，用 `dangerouslySetInnerHTML` 渲染。不再依赖 `Icon.tsx` 的 glob loader。

**Lesson Learned**: 被多个上下文引用的共享组件不能依赖动态文件加载——SVG 应该硬编码。参考 AGENTS.md：「在支持SVG的场景总是使用SVG（如Lucide）而不是emoji」，执行方式应改为**硬编码 inline SVG**。

---

## Lesson 5: Widget System — Unified Header Bar

**Category**: UI

**Root Cause**: WidgetPanel 和 widget 各自渲染标题和关闭按钮，反复相互重叠或缺失。设计原则来回切换（WidgetPanel 加/不加 header、widget 加/不加 header），每次改动都引入新问题。

**Final Design**:
```
┌─ WidgetPanel 统一提供 ──────────────────┐
│  [icon] [title]            [↑] [↓] [×]  │  ← WidgetPanel 的 inline header
├─────────────────────────────────────────┤
│  widget 内容（无标题、无关闭按钮）        │  ← 纯内容
└─────────────────────────────────────────┘
```

- **WidgetPanel 为所有 widget 提供统一的 header**（图标、标题、箭头、关闭按钮）
- **Widget 只负责自己的内容区域**，不渲染标题或关闭按钮
- 如果 widget 需要额外按钮（如 AIChatWidget 的 `[→]` 和 `[+]`），放在自己的内容区内

**Lesson Learned**: 跨组件职责边界必须明确。谁负责标题/关闭？答案必须统一，不能部分 widget 自己管、部分 WidgetPanel 管。

---

## Lesson 6: AI Card Animation — CSS Transition Required

**Category**: UI

**Root Cause**:
- `{!expanded && <preview>} {expanded && <content>}` — 条件渲染导致元素从 DOM 中完全消失/出现，无法应用 CSS transition
- `absolute inset-x-0` 用于预览行，但父容器没有 `relative` → 相对于 viewport 定位 → 文字跳到屏幕左侧

**Fix**:
- 预览行和内容始终在 DOM 中，用 `max-h-{0|600px} opacity-{0|100} invisible/visible` CSS 类控制
- 外层容器加 `relative`，确保 `absolute` 子元素相对容器定位
- `transition-all duration-300` 实现平滑动画

**Lesson Learned**: CSS transition 需要元素始终在 DOM 中、有明确的起始值（如 `max-h-0`）和结束值（如 `max-h-[600px]`）。条件渲染（`{expanded && ...}`）让元素瞬间出现/消失，transition 无法生效。

---

## Lesson 7: Streaming Scroll — requestAnimationFrame Required

**Category**: UI

**Root Cause**: React 的 `useEffect` 在 DOM 提交后触发，但此时浏览器还未完成布局/绘制。在 effect 中读 `scrollHeight` 并设 `scrollTop` 拿到的是旧值。

**Fix**:
```typescript
// ❌ React 提交后立即滚 — 高度还没更新
container.scrollTop = container.scrollHeight;

// ✅ 等浏览器完成 paint 后再滚
requestAnimationFrame(() => {
  container.scrollTop = container.scrollHeight;
});
```

**Lesson Learned**: `requestAnimationFrame` 延迟到浏览器完成 layout/paint 后执行，此时 DOM 尺寸已准确。`scrollIntoView({ behavior: 'smooth' })` 对流式场景不可靠——smooth 动画基于旧位置计算，新内容渲染后目标位置已改变。

---

## Lesson 8: Mobile Keyboard — visualViewport.height

**Category**: UI

**Root Cause**: `100dvh` 是布局视口高度，键盘弹出后 visual viewport 缩小但 layout viewport 不变。`100dvh` 返回 layout viewport 高度，容器不会自动缩小。

**Fix**:
```typescript
const [visualHeight, setVisualHeight] = useState<number | null>(null);
useEffect(() => {
  const vv = window.visualViewport;
  if (!vv) return;
  const update = () => setVisualHeight(vv.height);
  vv.addEventListener('resize', update);
  return () => vv.removeEventListener('resize', update);
}, []);

// 然后用 visualHeight 设容器高度
style={visualHeight ? { height: visualHeight - 48 } : { height: 'calc(100dvh - 3rem)' }}
```

**Lesson Learned**: `window.visualViewport` API 提供键盘弹出后的实际可视高度。PWA 聊天等全屏应用必须使用此 API，而非 `100dvh` 或 `100vh`。

---

## Lesson 9: ky Retry — Explicit statusCodes

**Category**: API/Network

**Root Cause**: 虽然 ky 默认配置了重试逻辑（`retry: { limit: 2, statusCodes: [408, 413, 429, 500, 502, 503, 504] }`），但项目中没有显式传 `retry` 配置，ky 可能因为版本差异或内部逻辑不使用默认值。实际上看到 504 时没有重试日志。

**Fix**: 显式传入 retry 配置到所有 ky 实例：
```typescript
ky.create({
  retry: { limit: 1, statusCodes: [408, 413, 429, 500, 502, 503, 504] },
  ...
});
```

**Lesson Learned**: 网络库的重试行为不应依赖默认值——显式声明所需的 retry 状态码和次数。

---

## Lesson 10: Component Persistence — Module-Level Toggle Needs Callback

**Category**: Storage/Persistence

**Root Cause**: `PostActionsRow` 和 `ProfilePage` 的 AI 按钮调用 `toggleWidget('aiChat')`（module-level 操作），只改了 `_order` 数组，没有调用 `saveAppConfig()` 写入 localStorage。只有 `Layout.handleToggleWidget`（Layout 自己的 handler）会保存。

**Fix**: 在 `widgetStore.ts` 中引入 `_onWidgetToggle` 回调机制：
```typescript
let _onWidgetToggle: ((id: string) => void) | null = null;
export function setWidgetToggleCallback(fn) { _onWidgetToggle = fn; }

// toggleWidget 调用后触发回调
export function toggleWidget(id: string): boolean {
  if (isWidgetEnabled(id)) { disableWidget(id); }
  else { enableWidget(id); }
  _onWidgetToggle?.(id);
  return !enabled;
}
```

`Layout.tsx` mount 时注册 `saveAppConfig` 到回调：
```typescript
useEffect(() => {
  setWidgetToggleCallback((id) => {
    const updated = { ...config, enabledWidgets: getEnabledWidgetIds() };
    saveAppConfig(updated);
    onConfigChange(updated);
  });
  return () => setWidgetToggleCallback(null);
}, [config, onConfigChange]);
```

**Lesson Learned**: module-level 状态（`_order`）的变更必须有一个统一的持久化回调，确保无论从哪个入口调用 `enableWidget`/`disableWidget`/`toggleWidget`，都能触发 `saveAppConfig`。

---

## Lesson 11: Array vs Set — Use Array for Ordered State

**Category**: Storage/Persistence

**Root Cause**: 原来用 `Set` 管理 widget 启用状态。`Set` 的插入顺序会导致问题——`enableWidget` 时 `Set.add(id)` 总是追加到末尾。但 `initEnabledWidgets` 期望从 localStorage 恢复特定顺序。`Set` 的顺序不可信赖。

**Fix**: 完全改用 `string[]` 数组：
```typescript
let _order: string[] = [];
export function enableWidget(id: string): void {
  if (getWidget(id) && !_order.includes(id)) _order.push(id);
}
export function disableWidget(id: string): void {
  _order = _order.filter(x => x !== id);
}
```

**Lesson Learned**: 需要顺序保持的状态应使用数组而非 Set。Set 适合「是否包含」判断，但顺序行为不可靠（特别是 clear + add 模式）。

---

# Session 2026-05-08

## Lesson 12: i18n Interpolation — `{{n}}` vs `{n}`

**Category**: UI

**Root Cause**: i18n 的 `interpolate()` 使用正则 `/\{(\w+)\}/g`，匹配单大括号。`'{{n}}'` 在模板中 —— 外括号不匹配 `\{` 和 `\}`（因为正则期待 `\{` 后紧跟 `\w+`），内括号被匹配 → 替换为 `1`，外括号残留 → `{1}`。

**Fix**: 所有 i18n 模板字符串改为单大括号 `{n}`。
```json
// ❌ "{{n}} members"  → 显示为 "{5} members"
// ✅ "{n} members"     → 显示为 "5 members"
```

**Lesson Learned**: i18n 插值格式必须一致。项目中所有其他插值（`ai.messageCount`、`thread.replyCount`）都使用单大括号，新增键必须遵循同一约定。

---

## Lesson 13: AppView Dedup vs PDS Raw — `getList` vs `listRecords`

**Category**: API/Network

**Root Cause**: `app.bsky.graph.getList` 是 AppView 水合视图，Lexicon 规格明确规定会**去重 `(subject, list)` 对**。PDS 有两条记录，但 `getList` 只返回一条。`remove_from_list` 使用 `getList` + `find()` → 删除一条后，AppView 可能已标记为"不在列表" → 第二条残留无法删除。

**Fix**: 改用 `com.atproto.repo.listRecords`（PDS 层，不去重）查找所有匹配记录：
```typescript
// ❌ AppView 去重 → 只找到一条
const res = await client.getList(listUri);
const item = res.items.find(i => i.subject.did === subject);

// ✅ PDS 层不去重 → 找到全部重复
const all = await client.listRecords(did, 'app.bsky.graph.listitem');
const matches = all.records.filter(r => r.value.subject === subject && r.value.list === listUri);
for (const m of matches) await client.removeListItem(m.uri);
```

**Lesson Learned**: AppView（`app.bsky.graph.*`）提供水合视图（有去重、排序等），PDS（`com.atproto.repo.*`）提供原始数据。需要完整数据（特别是处理重复/脏数据）时，必须使用 PDS 层 API。

---

## Lesson 14: Widget Temporary Disable — Save _order Snapshot

**Category**: UI

**Root Cause**: 进入 AI 对话页面后，AI Widget 被 `disableWidget('aiChat')` 永久移除，离开后不恢复。`disableWidget` 直接修改 `_order` 数组（内存），无恢复机制。只有页面刷新时从 localStorage 重新初始化才会恢复。

**Fix**: `useRef` 保存进入 AI 页面前的 `_order` 快照，离开时 `initEnabledWidgets` 恢复：
```typescript
const widgetOrderRef = useRef<string[]>([]);
useEffect(() => {
  if (currentView.type === 'aiChat') {
    const current = getEnabledWidgetIds();
    if (current.includes('aiChat')) {
      widgetOrderRef.current = current;  // save
      disableWidget('aiChat');
    }
  } else if (widgetOrderRef.current.length > 0) {
    initEnabledWidgets(widgetOrderRef.current);  // restore
    widgetOrderRef.current = [];
  }
}, [currentView.type]);
```

**Lesson Learned**: 临时状态变更必须有「保存-恢复」配对，不能仅做单向操作。使用 `useRef` 存储快照是轻量方案（不触发重渲染），适合模块级状态的临时读写。

---

## Lesson 15: Build Order — Commit Before Build for Correct Hash

**Category**: Performance/Development

**Root Cause**: Vite `define: { __COMMIT_HASH__: execSync('git rev-parse HEAD') }` 在 build 时执行。如果先 `git add` + `git commit` 但用之前的 build artifact 部署，hash 就是上次 commit 的。

**Fix**: 流程改为 `git commit` → `pnpm build` → `wrangler deploy`。确保 build 时 HEAD 就是目标 commit。

**Lesson Learned**: 构建时注入的元数据（commit hash、build time）必须在 commit 之后产生，否则与代码不同步。

---

## Lesson 16: Widget Buttons to Header Inline — `headerButtons` + Module Refs

**Category**: UI

**Root Cause**: AIChatWidget 的「open in page」和「new chat」按钮在消息区内（随内容滚动），不在 header 行内。WidgetPanel header 只渲染箭头和关闭按钮，widget 自己的按钮在 `render()` 返回的 body 内。

**Fix**:
1. `WidgetDefinition` 新增 `headerButtons?: React.ComponentType<{ goTo, onClose }>` 字段
2. `WidgetPanel` header 行渲染 `headerButtons`（位于箭头左侧）
3. `AIChatWidget` 通过 module ref 传递运行时回调（`onNewChat`、`chatId`）给 `headerButtons`
4. `Layout` 传递 `goTo` 给 `WidgetPanel`

```typescript
// Module-level refs for header buttons
let _widgetCallbacks = {};
function AIChatHeaderButtons({ goTo, onClose }) {
  return <>
    <button onClick={() => { goTo({ type: 'aiChat', sessionId: _widgetCallbacks.chatId }); onClose(); }} />
    <button onClick={() => _widgetCallbacks.onNewChat?.()} />
  </>;
}
// In component:
useEffect(() => { _widgetCallbacks = { onNewChat, chatId }; return () => _widgetCallbacks = {}; });
```

**Lesson Learned**: Widget 的 header 按钮需要运行时 context（`goTo`、`onNewChat`），但 widget registration 是 module-level 的静态过程。Module ref 是桥梁——组件 mount 时写入，header buttons 读取。

---

## Lesson 17: AI Card Data Retention — `mapMessages` Must Rebuild Sequence

**Category**: AI

**Root Cause**: `AIChatMessage`（存储格式）缺少 `reasoning_content` 和 `tool_calls` 字段。`mapMessages`（`ChatMessage[]` → `AIChatMessage[]`）丢弃了这些字段。编辑/恢复后 UI 显示空白。

**Fix**:
1. `AIChatMessage` 加 `reasoning_content?: string` + `tool_calls?: any[]`
2. `mapMessages` 重写为遍历循环：assistant 消息有 `reasoning_content` → 先 emit thinking card；有 `tool_calls` → emit tool_call entries；然后 emit assistant 消息本身
3. 存储恢复路径保留 `reasoning_content`

**Lesson Learned**: 存储格式与 API 格式的字段映射必须是双向完整的。`ChatMessage`（API 格式）的每个重要字段都应在 `AIChatMessage`（存储格式）有对应字段，并且在 `mapMessages` 双向转换中保留。

---

## Lesson 18: `buildToolDescription` — New Write Tools Must Add Description

**Category**: AI

**Root Cause**: `buildToolDescription` 只有 `create_post`、`like`、`repost`、`follow`、`upload_blob` 的 switch case。新增工具 fall through 到 default 的 `JSON.stringify(args)` 截断。

**Fix**: 每个 `requiresWrite: true` 的工具必须在 `buildToolDescription` 添加 human-readable case：
```typescript
case 'create_list': return `创建列表: "${args.name}" (${args.purpose === 'moderation' ? '管理' : '精选'})`;
case 'add_to_list': return `添加用户 ${args.subject} 到列表`;
case 'remove_from_list': return `从列表移除用户 ${args.subject}`;
```

**Lesson Learned**: 确认门的三层（`requiresWrite` → `buildToolDescription` → UI 弹窗）必须完整覆盖。添加新 write 工具时，这三层都要检查。

---

## Lesson 19: `markConvoRead` — Optimistic Clear Unread Badge

**Category**: DM/Messaging

**Root Cause**: `markRead()`（`chat.bsky.convo.updateRead`）只更新服务端状态。客户端 `useConvoList.convos` 数组中的 `unreadCount` 保持旧值，直到 `silentPoll`（30s 间隔）拉回最新数据。`App.tsx` 的 `dmCount` 和 `Sidebar` 的标记均依赖此数据。

**Fix**: `useConvoList` 中新增 `markConvoRead(convoId)` 模块级函数：
```typescript
// Module-level setter — called by DMChatPage after markRead
let _clearUnread: ((convoId: string) => void) | null = null;
export function markConvoRead(convoId: string): void {
  _clearUnread?.(convoId);
}

// 在 hook 内部注册
useEffect(() => {
  _clearUnread = (id: string) => {
    setConvos(prev => prev.map(c =>
      c.id === id ? { ...c, unreadCount: 0 } : c
    ));
  };
  return () => { _clearUnread = null; };
}, []);
```

`DMChatPage` mount 时：`loadConvo().then(() => { markRead(); markConvoRead(convoId); })`。

**Lesson Learned**: 服务端状态变更必须同步反映到客户端——乐观更新是必需的，不能等到下一轮轮询。模块级函数（而非 prop drilling）适合在不同组件树分支间传递状态变更。

---

## Lesson 20: `searchActors` — Auth Endpoint 503, Public Endpoint 200

**Category**: API/Network

**Root Cause**: `searchActors` 使用 `this.session ? this.ky : this.publicKy` 模式。当已登录时走 authenticated endpoint → 503。其他公共读端点（`getLikes`、`getList` 等）使用同一模式但可行——唯独 `searchActors` 在 bsky.social 上不可用。

**Fix**: `searchActors` 统一使用 `this.publicKy`（不需要鉴权）：
```typescript
// ❌ session ? ky : publicKy — ky fails with 503
// ✅ always use publicKy — works on public.api.bsky.app
return this.publicKy.get('app.bsky.actor.searchActors', { searchParams });
```

**Lesson Learned**: 不是所有公共端点都能通过 PDS 代理（`bsky.social`）正常访问。遇到 503 时先测试 `public.api.bsky.app` 是否可用——如果可用，说明端点是纯公共读，不需要走 PDS 代理。

---

## Lesson 46: DuckDuckGo Sec-Fetch Detection — Browser vs CLI

**Category**: API/Network

**Root Cause**: DuckDuckGo Instant Answer API (`api.duckduckgo.com`) 使用 `Sec-Fetch-*` 系列请求头（`Sec-Fetch-Mode`, `Sec-Fetch-Site`, `Sec-Fetch-Dest`）做客户端指纹识别。当检测到这些浏览器专属头存在时，故意返回**字段值全空**的 JSON 响应（反爬/防前端直调）。这些头由浏览器自动附加且无法通过 JavaScript 删除或修改（forbidden headers）。

```
浏览器 fetch → 自动附加 Sec-Fetch-* → DDG API → HTTP 200, 全空字段
curl/Node.js → 无 Sec-Fetch-*      → DDG API → 完整数据
```

**Fix**: 在 `packages/pwa/functions/api/proxy.js` 创建 Cloudflare Pages Function，在服务端执行 fetch，附加 CORS 响应头返回给浏览器。

**Lesson Learned**: 遇到 curl 正常、浏览器异常的 API 调用，优先怀疑 `Sec-Fetch-*` 头。解决方案是服务端代理（Serverless Function > CORS proxy > JSONP）。

---

## Lesson 47: Wikipedia API — Search Endpoint Does Not Exist

**Category**: API/Network

**Root Cause**: Wikipedia REST API 的 `/api/rest_v1/search/title` 端点**不存在**（返回 404）。正确的搜索端点是 MediaWiki API 的 `w/api.php?action=opensearch`，但需要加 `&origin=*` 参数才能返回 CORS 头。

**Fix**: 完全绕过搜索步骤，直接调 `page/summary/{query}` — Wikipedia 自动处理重定向和模糊匹配：
- `page/summary/Bluesky%20social%20network` → 返回 "Bluesky" 的正确数据和 extract
- 不存在的查询（如 "xyzxyzxyz"）返回 404

**Lesson Learned**: 写 Wikipedia 集成时先查 REST API 文档确认端点是否存在。`page/summary` 是直接可用的知识摘要端点，自带 CORS。

---

## Lesson 48: `w/api.php` CORS Requirement

**Category**: API/Network

**Root Cause**: MediaWiki API 要求 URL 中显式包含 `&origin=*` 参数才会返回 `Access-Control-Allow-Origin: *`。仅靠 `Origin` 请求头是不够的。

```
https://en.wikipedia.org/w/api.php?action=opensearch&search=Bluesky&origin=*
// ↑ origin=* 是必需的
```

**Fix**: 任何使用 MediaWiki API 的浏览器端调用都必须附带 `&origin=*` 参数。`page/summary` REST API 则原生支持 CORS，无需额外参数。

**Lesson Learned**: 任何使用 MediaWiki API 的浏览器端调用都必须附带 `&origin=*` 参数。`page/summary` REST API 则原生支持 CORS，无需额外参数。

---

## Lesson 49: ChatStorage Factory Pattern

**Category**: Storage/Persistence

**Root Cause**: `useChatHistory` 硬编码 `new FileChatStorage()`（Node.js 文件系统），PWA 被迫在每个组件中手动 `new IndexedDBChatStorage()` 并传入参数。

**Fix**: 参照 DraftStorage 的工厂模式，在 `chatStorage.ts` 中引入 `setChatStorageFactory()` + `getDefaultChatStorage()`。

```
TUI:  自动检测 Node.js → FileChatStorage（无需注册）
PWA:  App.tsx 注册 setChatStorageFactory(() => new IndexedDBChatStorage())
      AIChatPage/AIChatWidget → 无参调用 useChatHistory()
```

**Lesson Learned**: 写第二个类似系统时（ChatStorage 先写，DraftStorage 后写），应直接使用工厂模式而非硬编码。工厂模式消除调用方选择责任。

---

## Lesson 50: autoSave Race Condition — Concurrent IndexedDB Writes

**Category**: Storage/Persistence

**Root Cause**: `useAIChat` 的 `send()` 函数有两处 `void autoSave()`：

```
send():
  1. setMessages(prev => { void autoSave(updated); return updated; })
     ← 用户消息发出时立即保存（仅用户消息，不等待）
  [streaming...]
  2. setMessages(prev => { void autoSave(prev); return prev; })
     ← 流结束后保存（完整消息，也不等待）
```

两个 `autoSave` 都对同一 `chatIdRef.current` 执行 `IndexedDB.put()`（upsert）。`void` 不等待，两个写入并发。**即便 IndexedDB 有事务排队机制，最后一个完成的写入覆盖前一个**——较小的数据包（仅用户消息）可能晚于完整数据包完成，覆盖完整数据。

**Fix**: 删除 `send()` 中的第 1 处过早保存，只保留流结束后的第 2 处保存。

**Lesson Learned**: `void` + `IndexedDB.put()` + 同一个 key = 竞态。所有写入同一个 key 的异步操作必须序列化，或只保留一个写入点。

---

## Lesson 51: autoSave Write Queue — Prevent Transaction Reordering

**Category**: Storage/Persistence

**Root Cause**: Lesson 50 移除了过早保存后，PWA 中若两次 `autoSave` 并发（如 auto-analysis 与用户手动发消息同时触发），IndexedDB 事务可能乱序完成——`autoSave A`（不完整数据）在 `autoSave B`（完整数据）之后完成，覆盖掉完整数据。

```
autoSave A: version=1, idx 写入 data_A  ← 发起
autoSave B: version=2, idx 写入 data_B  ← 发起
  [B 完成] → 磁盘 data_B（正确）
  [A 完成] → 磁盘 data_A（不完整！覆盖 B）
```

版本检查 `if (version !== saveVersionRef.current)` 在写入**之后**——无法阻止已发生的覆盖。

**Fix**: 引入 `saveQueueRef`（Promise 链），将所有 `storage.saveChat()` 串行化执行：

```typescript
const saveQueueRef = useRef<Promise<void>>(Promise.resolve());

// autoSave 中的核心变化：
await new Promise((resolve, reject) => {
  saveQueueRef.current = saveQueueRef.current.then(async () => {
    if (version !== saveVersionRef.current) { resolve(); return; }
    if (saveChatId !== chatIdRef.current) { resolve(); return; }
    await storage.saveChat(data);       // ← 入队执行
    // ... 标题生成等后续操作 ...
    resolve();
  }).catch(reject);
});
```

队列保证 `autoSave B` 的写入始终在 `autoSave A` 的写入**完成之后**才开始。加上 `saveChatId` 快照守卫（防止会话切换时错误覆盖），三重防护。

**Lesson Learned**: 异步 I/O 竞态不能靠"写入后检查"解决——写入本身不可逆。必须用 Promise 链（写队列）保证顺序，并在写入前做版本校验。

---

## Lesson 52: CVD-Friendly Color Palette

**Category**: UI/UX

**Root Cause**: DESIGN.md 声称 100% WCAG 2.1 AA 合规，但 PostActionsRow 用纯颜色（红/绿/黄）区分 like/repost/bookmark 状态；连接状态圆点为 8px 纯颜色；零 `role="alert"` 属性。颜色是色觉缺陷用户的唯一信息源。

**Fix**:
- **阶段 A**（始终生效）：修复 WCAG 1.4.1 违规。PostActionsRow 为所有 3 个按钮新增 `aria-pressed`；repost 已激活时计数文字加粗（无 filled 图标变体）；title 属性国际化（`action.like/liked` 等）。连接状态圆点改为圆点 + 可见文本"已连接/未连接"。15+ 个组件中新增 `role="alert"`（错误/警告横幅）和 `role="status"`（成功 toast 和草稿标签）。
- **阶段 B**（可选切换）：新增 `.cvd` class，用 CSS 变量将 Tailwind 的红/绿/黄工具类映射为品红（`#C2185B`）/ 蓝绿（`#00897B`）/ 琥珀（`#E65100`）——三种色觉缺陷类型均可区分的色觉安全三元组。32 条 CSS 覆盖规则处理 `.cvd` 和 `.dark.cvd` 组合。`cvdMode: boolean` 存储在 `AppConfig` 中，App.tsx 挂载时同步，设置弹窗中提供复选框。
- **基础设施**：新增 `--color-background` CSS 变量，替换 16 个组件文件中的 24 处 `bg-white dark:bg-[#0A0A0A]` → `bg-background`。实现无需逐个组件修改的主题切换。

**Lesson Learned**:
1. 色觉友好的 UI 需要双重编码：不应仅用颜色传达信息，也不应仅依赖调色板切换。正确的做法是两步：非颜色线索（加粗、`aria-pressed`、文本标签）+ 调色板作为额外保障。
2. CSS 变量使主题切换架构面向未来：在引入 `--color-background` 前，所有页面背景色以 `bg-white dark:bg-[#0A0A0A]` 硬编码。现在任何新主题（高对比度、暖色/冷色模式）都可以通过仅修改 `index.css` 实现——无需重新触碰任何组件。
3. `.cvd .text-red-500` 在不使用 `!important` 的情况下覆盖 Tailwind 工具类，因为 `.cvd .text-red-500` 的特异性（0 2 0）高于 Tailwind 生成的（0 1 0）。无需使用 `!important`。
4. 深色模式组合选择器在 CSS 中为 `.dark.cvd`（两个 class 均作用于 `<html>`），而非 `.cvd .dark`。`.dark` 和 `.cvd` 是平级的，都会影响同一个元素。
5. i18n 键缺失导致运行时显示原始键名：当 UI 语言设为英语或日语时，28 个缺失的设置/主题/通用键显示为 `settings.title`、`theme.switchDark` 等原始文本。只有 `zh.ts` 存在这些键。即使缺失，React 也不会产生控制台错误——UI 仅静默显示原始键文本。在合并前进行键审计至关重要。

---

## Lesson 53: PDS Blob Download Needs `this.ky` (JWT Auto-Refresh)

**Category**: Auth/Session

**Root Cause**: `BskyClient.downloadBlob()` 使用原始 `ky.get(url, { headers: this.getAuthHeaders() })` — 不经过 `this.ky`（带 `withRefresh` hook 的 `ky.create` 实例）。从 localStorage 恢复的 session JWT 可能已过期，`downloadBlob` 直接失败返回 400 ExpiredToken，无自动刷新。

**Fix**: `downloadBlob` 改用 `this.ky.get('com.atproto.sync.getBlob', { searchParams })`。`this.ky` 的 `afterResponse` hook 在 401/400 上触发 `withRefresh` → 刷新 JWT → 重试请求。与所有其他 XRPC 调用共享同一路径。

**Lesson Learned**:
1. 所有认证请求必须通过 `this.ky` — 不可用原始 `ky.get()` 手动加 auth header
2. CDN（`cdn.bsky.app`）对 `<img>` 可用，但不支持 `fetch()` CORS

---

## Lesson 54: React Events Bubble Through Fiber Tree, Not DOM

**Category**: UI

**Root Cause**: ALT Modal 使用 `createPortal(document.body)` 后，点击背景仍触发 PostCard 的 `onClick` → 导航。React 合成事件沿 **Fiber 树**（组件层级）冒泡，非 DOM 树。Portal 解决 CSS 包含块问题，不解决事件冒泡。

**Fix**: Modal 背景 + 居中包装器的点击均调用 `e.stopPropagation()`。

**Lesson Learned**:
1. Portal 解决 CSS 问题（`fixed` 在 `transform` 内相对定位），React Fiber 树解决事件问题——两正交问题
2. 调试时先隔离错误来源——诊断页面正确区分了 CDN CORS vs. LLM API CORS vs. PDS JWT 过期

---

## Lesson 55: beforeRequest Hook Centralizes Auth

**Category**: Auth/Session

**Root Cause**: 42 个方法各自手动调用 `headers: this.getAuthHeaders()`。`downloadBlob` 切换到 `this.ky` 时遗漏该行 → 所有 blob 请求无认证头 → PDS 返回 400。

**Fix**: 为所有 `this.ky` 和 `this.chatKy` 实例新增 `beforeRequest` 钩子（`_authHook`）——当 `this.session` 存在时自动注入 `Authorization: Bearer <jwt>`。4 个 `ky.create` 调用点均已注册。未来无需任何方法手动传递认证头。

**Lesson Learned**:
1. 集中化的 beforeRequest hook 比 42 个手动 auth 调用更安全——单点控制，不会遗漏。与现有的 `afterResponse`（`_withRefresh`）钩子形成对称架构：beforeRequest 注入 JWT，afterResponse 刷新 JWT
2. `ky.extend()` 保留钩子——`downloadBlob` 的 bsky.social 回退使用 `this.ky.extend({ prefixUrl: ... })` 创建临时实例，继承 `_authHook` 和 `_withRefresh`
3. `this.session` 可能为 null——`_authHook` 仅在 session 存在时注入，`getAuthHeaders()` 返回 `{}` 而非抛出异常。登录时的竞态条件（旧代码在 `login()` 完成前调用 `getAuthHeaders()`）现已消除

---

## Lesson 56: 429 Rate-Limit Retry — Exponential Backoff

**Category**: Performance/API

**Root Cause**: Mistral Tier 1 限速严格（~1 req/s）。AI ALT 每次生成 2 条请求（blob + vision API），连续快速点击 → 429。错误提示不足，用户困惑。

**Fix**: PostCard `handleGenerateAlt` 新增 429 检测 + 指数退避重试循环（1s→2s→4s→8s，最多 4 次）。等待期间显示「达到速率限制，正在重试（2/4）」。仅 429 触发重试——其他错误直接显示。

**Lesson Learned**:
1. 429 应在客户端重试，而非抛给用户——服务器明确告知何时可重试（Retry-After header，或使用指数退避作为安全回退）
2. 指数退避是 API 速率限制的标准模式——起始 1 秒，每次加倍，最多 4 次（总等待 15 秒）
3. 不要对非 429 错误重试——401、400 等不会因等待而自愈

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

## Lesson 64: Event Propagation in Nested UI

**Category**: UI / React

**Root Cause**: Clicking expand/collapse buttons inside `PythonResult` triggered the parent `ToolCard`'s `onToggle`, causing the entire card to collapse instead of just expanding the output text.

**Context**:
- `ToolCard` has `onClick={onToggle}` on its root div
- `PythonResult` renders inside `ToolCard`'s expanded content area
- `PythonResult` has its own expand/collapse buttons for long stdout/error text
- Clicking these buttons bubbled up to `ToolCard`, triggering card-level toggle

**Solution**: Add `e.stopPropagation()` to inner buttons:
```tsx
<button onClick={(e) => {
  e.stopPropagation();
  setExpanded(!expanded);
}}>
  {expanded ? '收起' : '展开'}
</button>
```

**Lesson Learned**:
1. **Nested interactive components need event isolation** — always consider propagation
2. **stopPropagation is not evil** — appropriate for preventing parent handlers when child has its own logic
3. **Component boundaries** — shared/nested components should document their event handling assumptions
4. **Test nested interactions** — click inner buttons, expect only inner state change

---

## Lesson 65: Cache API Only Supports GET

**Category**: PWA / Service Worker

**Root Cause**: Service Worker's `networkFirst` strategy called `cache.put(request, response)` for all requests, but the Cache API only supports GET requests. POST requests threw `TypeError: Failed to execute 'put' on 'Cache': Request method 'POST' is unsupported`.

**Context**:
- Service Worker caches API responses for offline support
- Bluesky API uses POST for most read operations (XRPC convention)
- `networkFirst` strategy: fetch → if OK → cache.put → return response
- `cache.put()` unconditionally called for all successful responses

**Solution**: Add method check before caching:
```javascript
async function networkFirst(request) {
  const response = await fetch(request);
  if (response.ok && request.method === 'GET') {
    const cache = await caches.open(CACHE_NAME);
    cache.put(request, response.clone());
  }
  return response;
}
```

**Lesson Learned**:
1. **Cache API is GET-only** — POST/PUT/DELETE cannot be cached via Cache API
2. **Always check request.method before cache.put()** — prevents runtime errors
3. **Service Worker errors are silent** — they appear in console but don't break functionality
4. **Different strategies for different methods** — GET = cacheable, POST = network-only

---

# Quick Reference by Category

## AI/Prompting
- [Lesson 2](#lesson-2-tool_call_id-loss-on-three-paths) — tool_call_id 存储↔API 转换风险
- [Lesson 3](#lesson-3-double-formatting-tryjsonsummary-vs-formattoolresult) — 格式化层不能重复
- [Lesson 17](#lesson-17-ai-card-data-retention-mapmessages) — 字段映射必须双向完整
- [Lesson 18](#lesson-18-buildtooldescription-for-write-tools) — write 工具必须加确认描述

## Authentication/Session
- [Lesson 53](#lesson-53-blob-download-ky-instance) — 认证请求必须走 this.ky
- [Lesson 55](#lesson-55-beforerequest-auth-hook) — 集中化 auth hook 比手动调用安全

## UI/UX
- [Lesson 1](#lesson-1-widget-sorting-index-mismatch) — 过滤列表索引映射
- [Lesson 4](#lesson-4-svg-icons-must-be-hardcoded) — SVG 必须硬编码
- [Lesson 5](#lesson-5-widget-system-unified-header-bar) — WidgetPanel 统一 header
- [Lesson 6](#lesson-6-ai-card-animation-must-use-css-transition) — CSS transition 条件
- [Lesson 7](#lesson-7-streaming-scroll-requires-requestanimationframe) — RAF 滚动
- [Lesson 8](#lesson-8-mobile-keyboard-visualviewport) — visualViewport 键盘适配
- [Lesson 12](#lesson-12-i18n-interpolation-braces) — i18n 单大括号
- [Lesson 14](#lesson-14-widget-temporary-disable-snapshot) — 临时状态保存-恢复
- [Lesson 16](#lesson-16-widget-header-buttons-module-refs) — Module ref 运行时 context
- [Lesson 52](#lesson-52-cvd-friendly-palette) — CVD 双重编码 + CSS 变量
- [Lesson 54](#lesson-54-react-portal-event-bubbling) — Portal 事件沿 Fiber 冒泡
- [Lesson 64](#lesson-64-event-propagation-in-nested-ui) — 嵌套组件按钮阻止事件冒泡

## API/Network
- [Lesson 9](#lesson-9-ky-retry-must-explicit-statuscodes) — ky retry 显式配置
- [Lesson 13](#lesson-13-appview-dedup-vs-pds-raw) — AppView vs PDS 去重
- [Lesson 20](#lesson-20-searchactors-public-endpoint) — 公共端点可能不走 PDS
- [Lesson 46](#lesson-46-duckduckgo-sec-fetch-detection) — Sec-Fetch 浏览器指纹
- [Lesson 47](#lesson-47-wikipedia-api-endpoint) — Wikipedia REST 端点确认
- [Lesson 48](#lesson-48-mediawiki-api-cors) — MediaWiki origin=* 参数

## Scroll/Virtualization
- [Lesson 7](#lesson-7-streaming-scroll-requires-requestanimationframe) — 流式 RAF 滚动

## Storage/Persistence
- [Lesson 10](#lesson-10-component-persistence-needs-callback) — Module-level 持久化回调
- [Lesson 11](#lesson-11-array-vs-set-for-ordered-state) — 有序状态用数组
- [Lesson 49](#lesson-49-chatstorage-factory-pattern) — ChatStorage 工厂模式
- [Lesson 50](#lesson-50-autosave-race-condition) — autoSave 竞态条件
- [Lesson 51](#lesson-51-autosave-write-queue) — 写队列串行化

## DM/Messaging
- [Lesson 19](#lesson-19-markconvoread-optimistic) — 乐观清除未读标记

## Performance
- [Lesson 15](#lesson-15-build-order-commit-before-build) — Commit 在 build 之前
- [Lesson 56](#lesson-56-429-rate-limit-retry) — 429 指数退避

## Worker/WebAssembly
- [Lesson 57](#lesson-57-web-worker-module-vs-classic) — Module Worker 加载 UMD 脚本有风险
- [Lesson 58](#lesson-58-pyodide-api-call-sequencing) — WASM 加载完成 ≠ API 就绪
- [Lesson 59](#lesson-59-binary-data-handling-in-workers) — apply() 有参数上限，大文件分块
- [Lesson 61](#lesson-61-vite-worker-import-over-blob-url) — Vite `?worker` 导入避免模板字符串转义问题
- [Lesson 62](#lesson-62-micropip-package-installation-batches) — 第三方包分批次安装，失败不阻塞
- [Lesson 63](#lesson-63-matplotlib-fonts-in-wasm) — WASM 环境无系统字体，需手动加载字体文件

## UI/UX (continued)
- [Lesson 64](#lesson-64-event-propagation-in-nested-ui) — 嵌套组件中的按钮必须阻止事件冒泡

## PWA/Service Worker
- [Lesson 65](#lesson-65-cache-api-only-supports-get) — Cache API 只支持 GET 请求，POST 会抛异常

## Development Process
- [Lesson 60](#lesson-60-incremental-feature-addition) — Sandbox 环境逐个添加功能

---

> 完整项目上下文、版本历史、功能状态见 `docs/CONTEXT.md`。
> Lessons 21-45 见 `docs/CONTEXT.md`「关键教训」章节。

---

## Lesson 66: Stale Closure in useCallback

**Category**: React / Hooks

**Root Cause**: `AIChatPage.tsx` `handleFileSelect` useCallback had empty dependency array `[]`, capturing initial `sessionId = undefined`. When user navigated to a specific chat session, `sessionId` prop updated but the callback was never recreated.

**Context**:
- `sessionId` prop changes when user opens different chat sessions
- `handleFileSelect` saves uploaded files with `chatId: sessionId`
- Empty deps `[]` meant `sessionId` was forever `undefined` from first render
- Files saved without `chatId` became "global" files visible in all sessions

**Solution**: Add dynamic dependencies to useCallback:
```typescript
const handleFileSelect = useCallback(async (e) => {
  // ... save file with chatId: sessionId
}, [sessionId]); // <-- must include sessionId
```

**Lesson Learned**:
1. **Empty dependency arrays are dangerous** — only for truly static callbacks
2. **Props used inside callbacks must be in deps** — ESLint exhaustive-deps rule catches this
3. **Closure captures value at creation time** — not a live reference
4. **Test multi-session workflows** — upload files in different sessions, verify isolation

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

## Lesson 68: Pass Context Through Tool Handlers

**Category**: AI / Architecture

**Root Cause**: `tools.ts` `execute_python` handler called `sandbox.execute(p.code)` without passing `chatId`, so Python-generated files were never saved to workspace storage.

**Context**:
- `PythonSandboxEngine.execute(code, chatId?)` accepts optional chatId for isolation
- `createTools(client)` creates tools without chat session context
- Tool handlers run in AIAssistant, which has access to chatId
- Missing chatId means `if (chatId && ...)` condition is always false

**Solution**: Pass getChatId function through tool creation:
```typescript
// createTools receives a function to get current chatId
export function createTools(client: BskyClient, getChatId?: () => string | undefined): ToolDescriptor[] {
  // ...
  handler: async (p) => {
    const result = await sandbox.execute(p.code as string, getChatId?.());
    // ...
  }
}
```

**Lesson Learned**:
1. **Tools need runtime context** — session ID, user preferences, etc.
2. **Use getter functions for dynamic values** — static values become stale
3. **Test tool execution in different sessions** — verify isolation
4. **Document context requirements** — each tool should declare what context it needs

---

## Lesson 69: Unified File Storage Across Platforms

**Category**: Architecture / Cross-Platform

**Root Cause**: Initially planned to pass file content through AI tool results (from Worker → tools.ts → UI), but content was stripped to save tokens. Files ended up empty in workspace.

**Context**:
- PWA uses IndexedDB for file storage
- TUI uses filesystem for file storage
- Both implement `WorkspaceStorage` interface
- AI messages shouldn't carry binary content (wastes tokens)

**Solution**: Store files in workspace at sandbox layer, return metadata-only to AI:
```
Worker → content ✅
  → Sandbox.saveToWorkspace(chatId) ✅
  → tools.ts → metadata JSON → AI
  → UI loads from workspace by chatId ✅
```

**Lesson Learned**:
1. **Separate data storage from AI messaging** — don't put files in chat history
2. **Use shared abstractions** — `WorkspaceStorage` interface works for both PWA and TUI
3. **Metadata is lightweight** — name, size, type are enough for AI context
4. **Cross-platform consistency** — PWA + TUI + MCP share same data flow
5. **Test on all platforms** — IndexedDB and filesystem have different characteristics
