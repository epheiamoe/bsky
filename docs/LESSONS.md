# Lessons Learned — Session 2026-05-07

> ⚠️ 上下文压缩后的快速恢复参考。每次会话新建一个入口。

## 本期重点教训

### Lesson 1: Widget 排序索引与过滤列表的致命错位

**问题**：WidgetPanel 箭头点击后移动了错误的组件，或完全没效果。

**根因**：箭头使用 `enabledWidgets.map((w, idx) => ...)` 的 `idx`（过滤后的可见 widget 索引），但 `handleReorderWidget` 操作的是 `enabledIds`（完整启用的所有 widget ID 数组）。当某些 widget 有 `views` 限制（如 `polish` 只在 compose 页显示）时，它们不在当前视图的 `availableWidgets` 中，`enabledWidgets` 比 `enabledIds` 短，两个索引偏移。

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

**修复**：使用 `enabledIds.indexOf(w.id)` 获取 widget 在完整数组中的真实索引。

```typescript
// ❌ 错误 — 视觉 idx
onReorderWidget?.(idx, idx - 1);

// ✅ 正确 — 真实 enabledIds 索引
const realIdx = enabledIds.indexOf(w.id);
onReorderWidget?.(realIdx, realIdx - 1);
```

**教训**：任何涉及「过滤后列表索引」到「完整列表索引」的映射必须显式转换，不能假设相等。

---

### Lesson 2: tool_call_id 的三个死亡路径

**问题**：API 400 `missing field tool_call_id`，在会话恢复后反复出现。

**根因**：`tool_call_id` 在三个独立路径上丢失：
1. **assistant.ts:617** — 正常执行路径的 `tool_result` yield 缺少 `toolCallId: tc.id`（取消路径第 599 行有，正常路径忘了）
2. **useAIChat.ts:137** — 会话恢复路径将 `tool_call` 和 `tool_result` **都映射为 `role: 'tool'`**，导致 API 收到一系列连续的 tool 消息，但没有前面的 `assistant { tool_calls }` 消息 → API 400
3. **useAIChat.ts:371** — `mapMessages`（edit/undo 后恢复 UI 状态）丢失 `toolName` 和 `toolCallId`

**修复**：
1. `assistant.ts:617` 补上 `toolCallId: tc.id`
2. `useAIChat.ts` 恢复路径重写：`tool_call` → 重建 `assistant { tool_calls[] }` 消息，`tool_result` → `tool { tool_call_id }` 消息，保持正确序列
3. `useAIChat.ts:371` `mapMessages` 补上 `toolName: m.name, toolCallId: m.tool_call_id`

**教训**：存储格式（`AIChatMessage`）和 API 格式（`ChatMessage`）的转换是高风险区。每个 field 的路线都需要端到端验证——是否存在、是否在序列化中保留、是否在恢复中还原。

---

### Lesson 3: 双重格式化——tryJsonSummary vs formatToolResult

**问题**：工具结果预览始终显示 "Profile"、"Search results" 等泛泛标签，没有实际数据。

**根因**：`useAIChat.ts` 的流式处理器先用 `tryJsonSummary(event.content)` 把 JSON 压缩为短字符串（如 `"用户: @handle (name)"`），再存入 `AIChatMessage.content`。然后 `formatToolResult` 收到这个已压缩的字符串，尝试 `JSON.parse` → 失败 → 落到 fallback 显示 `"Profile"`。

**修复**：
- `useAIChat.ts` 改为直接存储原始 `event.content`（不经过 `tryJsonSummary`），让 `formatToolResult` 处理所有显示
- `formatToolResult` 的最终 fallback 改为显示内容第一行，而非 `toolLabel(name)`

**教训**：格式化层不能重复。如果有两个格式化函数，一个在数据处理层，一个在视图层，它们会互相干扰。只能保留一层——要么在数据层格式化（TUI 场景），要么在视图层（PWA 场景）。

---

### Lesson 4: SVG 图标必须硬编码到组件中

**问题**：ThinkingCard 和 ToolCard 中 `wrench`/`brain` 图标显示不稳定，有时出现 emoji。

**根因**：`Icon.tsx` 通过 `import.meta.glob` 动态加载 SVG 文件。如果文件路径/名称有细微差异，图标就加载不到，返回 `null`（无显示）。共享 `ai/` 目录下的组件引用 `../Icon.js` 跨目录查找，更容易出错。

**修复**：将 SVG path 直接硬编码为 `const WRENCH_SVG = '<path d="..." />'` 常量，用 `dangerouslySetInnerHTML` 渲染。不再依赖 `Icon.tsx` 的 glob loader。

**教训**：被多个上下文引用的共享组件不能依赖动态文件加载——SVG 应该硬编码。参考 AGENTS.md：「在支持SVG的场景总是使用SVG（如Lucide）而不是emoji」，执行方式应改为**硬编码 inline SVG**。

---

### Lesson 5: Widget 系统设计——统一 header bar**

**问题**：反复出现「两个标题」、「两个关闭按钮」、「没有标题」等 UI 混乱。

**根因**：WidgetPanel 和 widget 各自渲染标题和关闭按钮，反复相互重叠或缺失。设计原则来回切换（WidgetPanel 加/不加 header、widget 加/不加 header），每次改动都引入新问题。

**最终设计**：
```
┌─ WidgetPanel 统一提供 ──────────────────┐
│  [icon] [title]            [↑] [↓] [×]  │  ← WidgetPanel 的 inline header
├─────────────────────────────────────────┤
│  widget 内容（无标题、无关闭按钮）        │  ← 纯内容
└─────────────────────────────────────────┘
```

原则：
- **WidgetPanel 为所有 widget 提供统一的 header**（图标、标题、箭头、关闭按钮）
- **Widget 只负责自己的内容区域**，不渲染标题或关闭按钮
- 如果 widget 需要额外按钮（如 AIChatWidget 的 `[→]` 和 `[+]`），放在自己的内容区内

**教训**：跨组件职责边界必须明确。谁负责标题/关闭？答案必须统一，不能部分 widget 自己管、部分 WidgetPanel 管。

---

### Lesson 6: AI 卡片动画——不能条件渲染，必须 CSS transition

**问题**：展开/折叠 ThinkingCard 时文字闪烁和布局跳动。

**根因**：
- `{!expanded && <preview>} {expanded && <content>}` — 条件渲染导致元素从 DOM 中完全消失/出现，无法应用 CSS transition
- `absolute inset-x-0` 用于预览行，但父容器没有 `relative` → 相对于 viewport 定位 → 文字跳到屏幕左侧

**修复**：
- 预览行和内容始终在 DOM 中，用 `max-h-{0|600px} opacity-{0|100} invisible/visible` CSS 类控制
- 外层容器加 `relative`，确保 `absolute` 子元素相对容器定位
- `transition-all duration-300` 实现平滑动画

**教训**：CSS transition 需要元素始终在 DOM 中、有明确的起始值（如 `max-h-0`）和结束值（如 `max-h-[600px]`）。条件渲染（`{expanded && ...}`）让元素瞬间出现/消失，transition 无法生效。

---

### Lesson 7: 流式输出自动滚动——requestAnimationFrame 是必需的

**问题**：流式输出期间底部出现空白条，内容增长后滚动位置没跟上。

**根因**：React 的 `useEffect` 在 DOM 提交后触发，但此时浏览器还未完成布局/绘制。在 effect 中读 `scrollHeight` 并设 `scrollTop` 拿到的是旧值。

**修复**：
```typescript
// ❌ React 提交后立即滚 — 高度还没更新
container.scrollTop = container.scrollHeight;

// ✅ 等浏览器完成 paint 后再滚
requestAnimationFrame(() => {
  container.scrollTop = container.scrollHeight;
});
```

**教训**：`requestAnimationFrame` 延迟到浏览器完成 layout/paint 后执行，此时 DOM 尺寸已准确。`scrollIntoView({ behavior: 'smooth' })` 对流式场景不可靠——smooth 动画基于旧位置计算，新内容渲染后目标位置已改变。

---

### Lesson 8: Mobile 键盘弹窗——100dvh 不够，用 visualViewport.height

**问题**：手机端键盘弹出时聊天容器高度不变，内容被挤压上方，下方留白。

**根因**：`100dvh` 是布局视口高度，键盘弹出后 visual viewport 缩小但 layout viewport 不变。`100dvh` 返回 layout viewport 高度，容器不会自动缩小。

**修复**：
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

**教训**：`window.visualViewport` API 提供键盘弹出后的实际可视高度。PWA 聊天等全屏应用必须使用此 API，而非 `100dvh` 或 `100vh`。

---

### Lesson 9: ky retry 配置——显式指定 retry statusCodes

**问题**：Bluesky 服务端 504（UpstreamTimeout）导致趋势 API 失败但不自动重试。

**根因**：虽然 ky 默认配置了重试逻辑（`retry: { limit: 2, statusCodes: [408, 413, 429, 500, 502, 503, 504] }`），但项目中没有显式传 `retry` 配置，ky 可能因为版本差异或内部逻辑不使用默认值。实际上看到 504 时没有重试日志。

**修复**：显式传入 retry 配置到所有 ky 实例：
```typescript
ky.create({
  retry: { limit: 1, statusCodes: [408, 413, 429, 500, 502, 503, 504] },
  ...
});
```

**教训**：网络库的重试行为不应依赖默认值——显式声明所需的 retry 状态码和次数。

---

### Lesson 10: 组件持久化——module-level toggle 需要回调

**问题**：Widget 开关状态在页面刷新后会丢失。

**根因**：`PostActionsRow` 和 `ProfilePage` 的 AI 按钮调用 `toggleWidget('aiChat')`（module-level 操作），只改了 `_order` 数组，没有调用 `saveAppConfig()` 写入 localStorage。只有 `Layout.handleToggleWidget`（Layout 自己的 handler）会保存。

**修复**：在 `widgetStore.ts` 中引入 `_onWidgetToggle` 回调机制：
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

**教训**：module-level 状态（`_order`）的变更必须有一个统一的持久化回调，确保无论从哪个入口调用 `enableWidget`/`disableWidget`/`toggleWidget`，都能触发 `saveAppConfig`。

---

### Lesson 11: `Array.splice` vs `Set.add` — 用数组管理有序状态

**问题**：Widget 顺序在多次 toggle 后逐渐错乱。

**根因**：原来用 `Set` 管理 widget 启用状态。`Set` 的插入顺序会导致问题——`enableWidget` 时 `Set.add(id)` 总是追加到末尾。但 `initEnabledWidgets` 期望从 localStorage 恢复特定顺序。`Set` 的顺序不可信赖。

**修复**：完全改用 `string[]` 数组：
```typescript
let _order: string[] = [];
export function enableWidget(id: string): void {
  if (getWidget(id) && !_order.includes(id)) _order.push(id);
}
export function disableWidget(id: string): void {
  _order = _order.filter(x => x !== id);
}
```

**教训**：需要顺序保持的状态应使用数组而非 Set。Set 适合「是否包含」判断，但顺序行为不可靠（特别是 clear + add 模式）。

---

## 架构升级（本次会话新增）

| 组件 | 位置 | 说明 |
|------|------|------|
| `packages/pwa/src/components/ai/` | 共享 AI 卡片组件 | ThinkingCard, ToolCard, UserMessage, AssistantMessage, formatToolResult |
| `packages/pwa/src/components/widgets/AIChatWidget.tsx` | 侧边栏 AI 对话 | 持久化会话、折叠卡片、/view 命令 |
| `packages/pwa/src/components/AboutPage.tsx` | 关于页面 | commit hash / build time（Vite define 注入） |
| `packages/pwa/src/icons/brain.svg, wrench.svg, chevron-up.svg, grip-vertical.svg` | 新增 SVG | Lucide 官方图标 |
| Widget 系统重构 | WidgetPanel + 5 个 widget | 统一 header bar（icon+title+^+v+x），widget 纯内容 |

---

# Lessons Learned — Session 2026-05-08

> ⚠️ 本次会话主题：列表功能全栈实现 + 大量细节修复。

## 本期重点教训

### Lesson 12: `{{n}}` vs `{n}` — i18n 模板插值陷阱

**问题**：列表人数显示为 `{1}` 而非 `1`（花括号留在屏幕上）。

**根因**：i18n 的 `interpolate()` 使用正则 `/\{(\w+)\}/g`，匹配单大括号。`'{{n}}'` 在模板中 —— 外括号不匹配 `\{` 和 `\}`（因为正则期待 `\{` 后紧跟 `\w+`），内括号被匹配 → 替换为 `1`，外括号残留 → `{1}`。

**修复**：所有 i18n 模板字符串改为单大括号 `{n}`。
```json
// ❌ "{{n}} members"  → 显示为 "{5} members"
// ✅ "{n} members"     → 显示为 "5 members"
```

**教训**：i18n 插值格式必须一致。项目中所有其他插值（`ai.messageCount`、`thread.replyCount`）都使用单大括号，新增键必须遵循同一约定。

---

### Lesson 13: AppView 去重 vs PDS 不去重 — `getList` vs `listRecords`

**问题**：用户被添加到列表两次（重复 listitem），`remove_from_list` 只删了第一条 → 残留记录在 PDS 但 AppView 返回「不在列表中」。

**根因**：`app.bsky.graph.getList` 是 AppView 水合视图，Lexicon 规格明确规定会**去重 `(subject, list)` 对**。PDS 有两条记录，但 `getList` 只返回一条。`remove_from_list` 使用 `getList` + `find()` → 删除一条后，AppView 可能已标记为"不在列表" → 第二条残留无法删除。

**修复**：改用 `com.atproto.repo.listRecords`（PDS 层，不去重）查找所有匹配记录：
```typescript
// ❌ AppView 去重 → 只找到一条
const res = await client.getList(listUri);
const item = res.items.find(i => i.subject.did === subject);

// ✅ PDS 层不去重 → 找到全部重复
const all = await client.listRecords(did, 'app.bsky.graph.listitem');
const matches = all.records.filter(r => r.value.subject === subject && r.value.list === listUri);
for (const m of matches) await client.removeListItem(m.uri);
```

**教训**：AppView（`app.bsky.graph.*`）提供水合视图（有去重、排序等），PDS（`com.atproto.repo.*`）提供原始数据。需要完整数据（特别是处理重复/脏数据）时，必须使用 PDS 层 API。

---

### Lesson 14: Widget 临时禁用与恢复 — 保存 _order 快照

**问题**：进入 AI 对话页面后，AI Widget 被 `disableWidget('aiChat')` 永久移除，离开后不恢复。

**根因**：`disableWidget` 直接修改 `_order` 数组（内存），无恢复机制。只有页面刷新时从 localStorage 重新初始化才会恢复。

**修复**：`useRef` 保存进入 AI 页面前的 `_order` 快照，离开时 `initEnabledWidgets` 恢复：
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

**教训**：临时状态变更必须有「保存-恢复」配对，不能仅做单向操作。使用 `useRef` 存储快照是轻量方案（不触发重渲染），适合模块级状态的临时读写。

---

### Lesson 15: 构建顺序 — 先 commit 再 build 才能拿到正确 hash

**问题**：About 页面显示的 commit hash 是旧版本的，代码改动已经生效但 hash 不对。

**根因**：Vite `define: { __COMMIT_HASH__: execSync('git rev-parse HEAD') }` 在 build 时执行。如果先 `git add` + `git commit` 但用之前的 build artifact 部署，hash 就是上次 commit 的。

**修复**：流程改为 `git commit` → `pnpm build` → `wrangler deploy`。确保 build 时 HEAD 就是目标 commit。

**教训**：构建时注入的元数据（commit hash、build time）必须在 commit 之后产生，否则与代码不同步。

---

### Lesson 16: Widget 按钮移到 header 行内 — `headerButtons` + module refs

**问题**：AIChatWidget 的「open in page」和「new chat」按钮在消息区内（随内容滚动），不在 header 行内。

**根因**：WidgetPanel header 只渲染箭头和关闭按钮，widget 自己的按钮在 `render()` 返回的 body 内。

**修复**：
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

**教训**：Widget 的 header 按钮需要运行时 context（`goTo`、`onNewChat`），但 widget registration 是 module-level 的静态过程。Module ref 是桥梁——组件 mount 时写入，header buttons 读取。

---

### Lesson 17: AI 卡片数据留存 — `mapMessages` 需重建 thinking/tool 序列

**问题**：编辑消息后，之前的思考内容丢失，工具调用显示异常（无工具名）。

**根因**：`AIChatMessage`（存储格式）缺少 `reasoning_content` 和 `tool_calls` 字段。`mapMessages`（`ChatMessage[]` → `AIChatMessage[]`）丢弃了这些字段。编辑/恢复后 UI 显示空白。

**修复**：
1. `AIChatMessage` 加 `reasoning_content?: string` + `tool_calls?: any[]`
2. `mapMessages` 重写为遍历循环：assistant 消息有 `reasoning_content` → 先 emit thinking card；有 `tool_calls` → emit tool_call entries；然后 emit assistant 消息本身
3. 存储恢复路径保留 `reasoning_content`

**教训**：存储格式与 API 格式的字段映射必须是双向完整的。`ChatMessage`（API 格式）的每个重要字段都应在 `AIChatMessage`（存储格式）有对应字段，并且在 `mapMessages` 双向转换中保留。

---

### Lesson 18: `buildToolDescription` — 新增 write 工具必须加确认描述

**问题**：新增的 `create_list` / `add_to_list` 在确认弹窗中显示原始 JSON `{"name":"...","purpose":"..."}`，不可读。

**根因**：`buildToolDescription` 只有 `create_post`、`like`、`repost`、`follow`、`upload_blob` 的 switch case。新增工具 fall through 到 default 的 `JSON.stringify(args)` 截断。

**修复**：每个 `requiresWrite: true` 的工具必须在 `buildToolDescription` 添加 human-readable case：
```typescript
case 'create_list': return `创建列表: "${args.name}" (${args.purpose === 'moderation' ? '管理' : '精选'})`;
case 'add_to_list': return `添加用户 ${args.subject} 到列表`;
case 'remove_from_list': return `从列表移除用户 ${args.subject}`;
```

**教训**：确认门的三层（`requiresWrite` → `buildToolDescription` → UI 弹窗）必须完整覆盖。添加新 write 工具时，这三层都要检查。

---

### Lesson 19: `markConvoRead` — 乐观清除未读标记，避免 30s 轮询延迟

**问题**：进入 DM 对话阅读消息后，侧边栏未读标记不消失，持续显示直到 30s 后轮询刷新。

**根因**：`markRead()`（`chat.bsky.convo.updateRead`）只更新服务端状态。客户端 `useConvoList.convos` 数组中的 `unreadCount` 保持旧值，直到 `silentPoll`（30s 间隔）拉回最新数据。`App.tsx` 的 `dmCount` 和 `Sidebar` 的标记均依赖此数据。

**修复**：`useConvoList` 中新增 `markConvoRead(convoId)` 模块级函数：
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

**教训**：服务端状态变更必须同步反映到客户端——乐观更新是必需的，不能等到下一轮轮询。模块级函数（而非 prop drilling）适合在不同组件树分支间传递状态变更。

---

### Lesson 20: `searchActors` — 鉴权请求 503，公共端点 200

**问题**：搜索用户时 `bsky.social` 返回 503/400，但 `public.api.bsky.app` 正常返回 200。

**根因**：`searchActors` 使用 `this.session ? this.ky : this.publicKy` 模式。当已登录时走 authenticated endpoint → 503。其他公共读端点（`getLikes`、`getList` 等）使用同一模式但可行——唯独 `searchActors` 在 bsky.social 上不可用。

**修复**：`searchActors` 统一使用 `this.publicKy`（不需要鉴权）：
```typescript
// ❌ session ? ky : publicKy — ky fails with 503
// ✅ always use publicKy — works on public.api.bsky.app
return this.publicKy.get('app.bsky.actor.searchActors', { searchParams });
```

**教训**：不是所有公共端点都能通过 PDS 代理（`bsky.social`）正常访问。遇到 503 时先测试 `public.api.bsky.app` 是否可用——如果可用，说明端点是纯公共读，不需要走 PDS 代理。

---

### Lesson 46: DuckDuckGo Sec-Fetch-* 检测 —— 浏览器与 CLI 的行为差异

**问题**：`instant_answer` 工具在 Node.js/TUI 端正常工作，但在 PWA/浏览器端所有查询都返回空字段（HTTP 200，JSON 结构完整但值全空）。

**根因**：DuckDuckGo Instant Answer API (`api.duckduckgo.com`) 使用 `Sec-Fetch-*` 系列请求头（`Sec-Fetch-Mode`, `Sec-Fetch-Site`, `Sec-Fetch-Dest`）做客户端指纹识别。当检测到这些浏览器专属头存在时，故意返回**字段值全空**的 JSON 响应（反爬/防前端直调）。这些头由浏览器自动附加且无法通过 JavaScript 删除或修改（forbidden headers）。

```
浏览器 fetch → 自动附加 Sec-Fetch-* → DDG API → HTTP 200, 全空字段
curl/Node.js → 无 Sec-Fetch-*      → DDG API → 完整数据
```

**尝试过的方案**：
- ❌ **JSONP**（`<script>` + callback）：仍携带 `Sec-Fetch-Dest: script`，DDG 同样返回空
- ❌ **第三方 CORS 代理**（corsproxy.io）：从 CLI 测试正常，但在用户网络环境下浏览器仍返回空
- ❌ **修改 User-Agent / Accept 头**：不是触发条件，从 CLI 无论设什么头都正常
- ❌ **尝试 `html.duckduckgo.com/html/`**：无 CORS，浏览器 fetch 被跨域拦截
- ✅ **Cloudflare Pages Function**：服务端 fetch 完全不带浏览器指纹头，DDG 返回完整数据

**正确方案**：在 `packages/pwa/functions/api/proxy.js` 创建 Cloudflare Pages Function，在服务端执行 fetch，附加 CORS 响应头返回给浏览器。

**教训**：遇到 curl 正常、浏览器异常的 API 调用，优先怀疑 `Sec-Fetch-*` 头。解决方案是服务端代理（Serverless Function > CORS proxy > JSONP）。

---

### Lesson 47: Wikipedia API —— 搜索端点会选择

**问题**：`search_wikipedia` 工具使用 `rest_v1/search/title` 搜索 Wikipedia，返回 404。

**根因**：Wikipedia REST API 的 `/api/rest_v1/search/title` 端点**不存在**（返回 404）。正确的搜索端点是 MediaWiki API 的 `w/api.php?action=opensearch`，但需要加 `&origin=*` 参数才能返回 CORS 头。

**最终方案**：完全绕过搜索步骤，直接调 `page/summary/{query}` — Wikipedia 自动处理重定向和模糊匹配：
- `page/summary/Bluesky%20social%20network` → 返回 "Bluesky" 的正确数据和 extract
- 不存在的查询（如 "xyzxyzxyz"）返回 404

**教训**：写 Wikipedia 集成时先查 REST API 文档确认端点是否存在。`page/summary` 是直接可用的知识摘要端点，自带 CORS。

---

### Lesson 48: `w/api.php` 的 CORS 要求

**问题**：MediaWiki API (`w/api.php`) 从浏览器调用时不返回 CORS 头。

**根因**：MediaWiki API 要求 URL 中显式包含 `&origin=*` 参数才会返回 `Access-Control-Allow-Origin: *`。仅靠 `Origin` 请求头是不够的。

```
https://en.wikipedia.org/w/api.php?action=opensearch&search=Bluesky&origin=*
// ↑ origin=* 是必需的
```

**教训**：任何使用 MediaWiki API 的浏览器端调用都必须附带 `&origin=*` 参数。`page/summary` REST API 则原生支持 CORS，无需额外参数。

---

## 架构升级（本次会话新增）

| 组件 | 位置 | 说明 |
|------|------|------|
| `instant_answer` 工具 | `tools.ts` | DuckDuckGo Instant Answer，浏览器路径走 Pages Function 代理 |
| `search_wikipedia` 工具 | `tools.ts` | Wikipedia 知识摘要，直接调用 `page/summary`（原生 CORS） |
| `/api/proxy` Pages Function | `packages/pwa/functions/api/proxy.js` | 服务端 fetch 代理，绕过 Sec-Fetch 检测 |
| `packages/pwa/functions/api/proxy.js` | 新建 | Cloudflare Pages Function，DDG API 代理 |
| `docs/PAGES_FUNCTION.md` | 新建 | Pages Function 架构文档 |
| Wikipedia 类型 | `tools.ts` | `WikipediaSummary` 接口 + `formatWikipediaSummary` 函数 |
| 工具总数 | `tools.ts` | 36 → **38**（instant_answer + search_wikipedia） |

## 版本

**v0.10.0** — 零密钥知识查询（instant_answer + search_wikipedia）+ Pages Function 代理 + 38 个 AI 工具
