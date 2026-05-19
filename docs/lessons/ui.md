# UI/UX Lessons

> User interface, experience design, component architecture, and visual behavior
>
> Part of the [Lessons Learned](../LESSONS.md) collection.

---

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

---

## Lesson 4: SVG Icons Must Be Hardcoded

**Category**: UI

**Root Cause**: `Icon.tsx` 通过 `import.meta.glob` 动态加载 SVG 文件。如果文件路径/名称有细微差异，图标就加载不到，返回 `null`（无显示）。共享 `ai/` 目录下的组件引用 `../Icon.js` 跨目录查找，更容易出错。

**Fix**: 将 SVG path 直接硬编码为 `const WRENCH_SVG = '<path d="..." />'` 常量，用 `dangerouslySetInnerHTML` 渲染。不再依赖 `Icon.tsx` 的 glob loader。

**Lesson Learned**: 被多个上下文引用的共享组件不能依赖动态文件加载——SVG 应该硬编码。参考 AGENTS.md：「在支持SVG的场景总是使用SVG（如Lucide）而不是emoji」，执行方式应改为**硬编码 inline SVG**。

---

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

---

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

---

## Lesson 54: React Events Bubble Through Fiber Tree, Not DOM

**Category**: UI

**Root Cause**: ALT Modal 使用 `createPortal(document.body)` 后，点击背景仍触发 PostCard 的 `onClick` → 导航。React 合成事件沿 **Fiber 树**（组件层级）冒泡，非 DOM 树。Portal 解决 CSS 包含块问题，不解决事件冒泡。

**Fix**: Modal 背景 + 居中包装器的点击均调用 `e.stopPropagation()`。

**Lesson Learned**:
1. Portal 解决 CSS 问题（`fixed` 在 `transform` 内相对定位），React Fiber 树解决事件问题——两正交问题
2. 调试时先隔离错误来源——诊断页面正确区分了 CDN CORS vs. LLM API CORS vs. PDS JWT 过期

---

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