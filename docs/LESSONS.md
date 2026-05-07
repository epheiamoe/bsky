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

## 版本

**v0.5.3** — AI Chat 页面重构 + 侧边栏 Widget 系统 + 关于页面 + 大量 bug 修复
