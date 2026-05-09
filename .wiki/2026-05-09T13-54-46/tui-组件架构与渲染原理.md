# TUI 组件架构与渲染原理

终端渲染和浏览器渲染共享 React 的声明式范式，但监牢不同。浏览器的 DOM 给你无限嵌套、像素级定位、滚动容器；终端的画布是一块固定尺寸的字符网格，每个单元格只能容纳一个字符加前景/背景色。Ink 在这块网格上映射 React 组件树，但映射规则处处是约束。理解这些约束，才能理解 TUI 的组件设计。

---

## Ink 渲染模型：终端里的 React

`cli.ts` 中，整个应用的起点是 Ink 的 `render()` 调用：

```tsx
const { waitUntilExit } = render(React.createElement(Root, { isRawModeSupported: isRawMode }), {
  stdin: inputStream,
  stdout: process.stdout,
  stderr: process.stderr,
  exitOnCtrlC: true,
});
```
[来源](packages/tui/src/cli.ts#L142-L147)

Ink 接管 stdout，将 React 组件树渲染为终端字符流。关键区别在于：**Ink 不支持 CSS 盒模型**。没有 `position: absolute`、`overflow-y: scroll`、`flexShrink`。所有布局由 `Box`（flexbox 子集）和 `Text`（纯文本节点）完成。

### 三条铁律

1. **无 Box 嵌套重叠** — 终端没有 z-index。组件通过 `flexDirection` 和 `width`/`height` 排列，不能叠加。
2. **预计算行列表渲染** — 所有"列表"组件都先将数据转为扁平行列表，再逐行渲染。`PostList` 没有虚拟滚动，因为 Ink 只渲染整个组件树——预计算并切片才是 TUI 的"虚拟化"。
3. **Text 元素扁平化** — 每个 `<Text>` 最终对应一行终端文本，不可嵌套交互组件。按钮、输入框均映射为格式化文本。

---

## App.tsx：视图路由与键盘分发

`App` 是万能的"上帝组件"，同时扮演视图路由器、键盘调度器和全局状态容器。

### 视图路由（`renderView`）

根据 `currentView.type` 做 switch-case 分发，每个 case 返回一个 Ink 组件。应用层不引入任何路由库——这是一个**纯函数式的联合类型路由器**：

```tsx
const renderView = () => {
  switch (currentView.type) {
    case 'feed': return <PostList ... />;
    case 'thread': return <UnifiedThreadView ... />;
    case 'compose': return <ComposeView ... />;
    // ... 12 个 case
  }
};
```
[来源](packages/tui/src/components/App.tsx#L619-L864)

布局为三段式：顶部状态栏（1 行）→ 主区域（`Sidebar` + `renderView()` 左右分栏）→ 底部提示栏（1 行）。侧栏宽度 `sidebarW = Math.max(16, Math.floor(cols * 0.14))`，弹性适应终端宽度。
[来源](packages/tui/src/components/App.tsx#L617-L618)

### 键盘调度（`useInput`）

所有键盘事件收敛到**一个** `useInput` handler，按优先级分层处理：

| 优先级 | 按键 | 行为 |
|--------|------|------|
| 1（最高） | Tab | 切换 AI 面板焦点 / 多帖草稿切换 |
| 2 | Escape | 后退、关闭弹层、退出草稿保存提示 |
| 3 | 方向键 | 列表导航（feed / bookmarks / lists / dm） |
| 4 | Enter | 打开帖子、提交表单 |
| 5 | 字母快捷键 | 全局导航（t=首页, n=通知, a=AI...） |
| 6 | 视图内专属 | feed 的 j/k/m/r/f/v/q，compose 的 i/D/P/X... |

[来源](packages/tui/src/components/App.tsx#L216-L594)

这种单 handler 设计避免了多组件键盘冲突——`[TUI 键盘快捷键完全参考](tui-键盘快捷键完全参考.md)` 中的冲突解决规则正是此架构的产物。

### 鼠标滚动

通过 ANSI 转义序列启用终端鼠标跟踪，在 `process.stdin` 的 `data` 事件中解析鼠标滚轮：

```tsx
useEffect(() => {
  enableMouseTracking(stdout);
  const onData = (data: Buffer) => {
    const evt = parseMouseEvent(data);
    if (!evt) return;
    if (evt.type === 'scrollUp') setFeedIdx(i => Math.max(0, i - 1));
    else if (evt.type === 'scrollDown') setFeedIdx(i => Math.min(posts.length - 1, i + 1));
  };
  process.stdin.on('data', onData);
  return () => {
    process.stdin.off('data', onData);
    disableMouseTracking(stdout);
  };
}, [stdout, currentView.type, posts.length]);
```
[来源](packages/tui/src/components/App.tsx#L596-L614)

鼠标事件的格式为 `\x1b[M<button_byte><col+32><row+32>`，其中 `button_byte=64` 表示滚轮向上、`65` 表示向下。`parseMouseEvent` 维护一个缓冲区（`mouseBuf`），积累完整序列后再解码，以防止粘包。
[来源](packages/tui/src/utils/mouse.ts#L31-L52)

> 注意：PWA 不需要此功能——浏览器直接暴露 `scroll` 事件。[来源](docs/ARCHITECTURE.md#L94-L95)

---

## PostList.tsx：预计算行列表 + Viewport 切片

`PostList` 没有传统的虚拟滚动。它的"虚拟化"策略是：

1. **预计算**：将 `posts[]` 中每个帖子的所有显示行，通过 `postToLines()` 合并为一个扁平的 `PostLine[]`。
2. **选中居中**：计算选中行在扁平列表中的位置，以它为中心确定可视窗口的起始索引。
3. **切片渲染**：从扁平列表中切出 `visibleLines` 行，仅在 JSX 中映射这些行。

```tsx
const allLines = useMemo(() => {
  const lines: PostLine[] = [];
  for (let i = 0; i < posts.length; i++) {
    const postLines = postToLines(posts[i]!, i, i === selectedIndex, width, t, locale);
    for (const l of postLines) lines.push(l);
  }
  return lines;
}, [posts, selectedIndex, width, t, locale]);

const visibleSlice = allLines.slice(viewStart, viewStart + visibleLines);
```
[来源](packages/tui/src/components/PostList.tsx#L20-L39)

每个 `PostLine` 是一个无子代的扁平对象：

```tsx
interface PostLine {
  text: string;
  isSelected: boolean;
  isName: boolean;
  quoteUri?: string;
}
```
[来源](packages/tui/src/components/PostItem.tsx#L7-L12)

这正是 **Text 元素扁平化**的体现——没有 `<PostCard>` 嵌套，只有 `<Text>` 行按顺序排列。`PostListItem` 接收一个 `PostLine`，将其渲染为带颜色/样式的 `<Text>`：

```tsx
return (
  <Text color={line.isSelected ? 'cyanBright' : line.isName ? 'green' : undefined}
        bold={line.isSelected && line.isName}
        dimColor={!line.isSelected && !line.isName}>
    {line.text}
  </Text>
);
```
[来源](packages/tui/src/components/PostItem.tsx#L137-L142)

### postToLines 的内部结构

`postToLines` 为每个帖子生成一个有序的行序列：

1. **作者行**：`{displayName} @{handle} [{index}]`
2. **文本行**：CJK 感知换行（`wrapLines`），最多 `cols - 4` 字符宽
3. **视频链接**：OSC 8 转义序列生成可点击超链接（Ctrl+click 在终端打开）
4. **图片链接**：同上，CDN 图片 URL
5. **引用帖子**：以 `│` 前缀缩进，递归换行
6. **@提及 / #话题**：同样 OSC 8 超链接
7. **统计行**：♥ ♺ 💬 + 时间
8. **空行分隔符**

[来源](packages/tui/src/components/PostItem.tsx#L14-L122)

```text
效果（简化）：
green: 张三 @zhangsan [0]
white: 这是一条测试帖子的内容文字…
      🖼 Image 1 (CDN)
      │ @李四
      │ 被引用的帖子文本
      ♥ 42 ♺ 7 💬 13 · 05/03 14:30

green: 李四 @lisi [1]
...
▲ 42% (2/20)
```

顶部的 `▲ 42%` 和底部的 `▼` 是**滚动指示器**，通过 `viewStart` 和 `allLines.length` 计算百分比，提供位置感知。
[来源](packages/tui/src/components/PostList.tsx#L41-L61)

---

## UnifiedThreadView.tsx：光标/焦点分离

这是 TUI 中最精妙的交互模式。它解决了终端交互中的一个矛盾：用户需要**浏览**（在回复间快速移动）和**操作**（对某个帖子点赞/回复/翻译），但终端没有鼠标 hover。

### 两条光标线

线程视图维护两个独立的状态：

| 状态 | 类型 | 触发方式 | 作用 |
|------|------|---------|------|
| `cursorIndex` | `number` | ↑↓ 或 j/k | 高亮当前可选的帖子（蓝色背景） |
| `focused` / `focusedIndex` | `FlatLine \| null` / `number` | Enter 或 h | 确定"当前主帖"，决定回复列表范围 |

```tsx
// Cursor = arrow movement target (highlighted in replies); focused = current post (only changes on Enter/h)
const [cursorIndex, setCursorIndex] = useState(0);
useEffect(() => { setCursorIndex(focusedIndex); }, [focusedIndex]);
```
[来源](packages/tui/src/components/UnifiedThreadView.tsx#L24-L26)

**箭头键只移动 `cursorIndex`**，高亮对应的回复行（蓝色背景 `#0e4a6e`）。**Enter 键**将光标处的帖子提升为新的 `focused`，触发 `refreshThread(cursorLine.uri)`，重新加载以该帖为中心的讨论串。**h 键**回退到主题帖（`themeUri`）。
[来源](packages/tui/src/components/UnifiedThreadView.tsx#L94-L104)

### 三种帖子分区

```tsx
// Theme posts = above focused, excluding focused itself
const themeLines = flatLines.filter(l => l.depth < 0 || (l.depth === 0 && l.isRoot && l.uri !== focusedUri));
// Replies = replies to focused (depth <= focusedDepth+1), excluding focused
const replyLines = flatLines.filter(l => (l.uri || l.isTruncation) && l.depth > 0 && l.depth <= focusedDepth + 1 && l.uri !== focusedUri);
```
[来源](packages/tui/src/components/UnifiedThreadView.tsx#L58-L60)

渲染为三段式：

```
── 讨论源 ──
  @Alice: 今日话题... ← 蓝色高亮（光标）  ← themeLines
  @Bob: 我也觉得...

── 当前帖子 ──
  @Charlie (蓝色背景 #1e40af)              ← focused（带操作面板）
  ♥ 42 ♺ 7 ...
  ✅ 关注中

── 回复 ──
  ↳ @David 说得好
  ↳ @Eve 不同意                    ← cursorIndex 在此处
  ↳ … 还有 X 条回复 [Enter 展开]
```

主题帖区域显示蓝色高亮光标提示 `← 导航`，但不会改变 `focused`。回复区每个条目同样带光标指示，而 `focused` 帖子始终以深蓝色背景 `#1e40af` 独立展现，且在其下方列出可执行操作（点赞、转发、回复、收藏、翻译、删除）。

这种分离的实用价值在于：**用户可以在不切换上下文的情况下浏览所有回复，同时在"当前帖子"上执行操作**。传统终端客户端往往只有一种选中态，浏览与操作混为一谈。

---

## TUI 特有工具函数

从 `ARCHITECTURE.md` 的对照表可以看出 TUI 和 PWA 在工具层的根本差异：

| 工具函数 | 文件 | 用途 | PWA 对应物 |
|---------|------|------|-----------|
| `visualWidth(str)` | `tui/src/utils/text.ts` | CJK 终端列宽计算 | CSS `word-wrap` |
| `wrapLines(text, cols, indent)` | `tui/src/utils/text.ts` | 智能换行（保留段落、空格优先、硬回退） | CSS `word-wrap` |
| `enableMouseTracking()` | `tui/src/utils/mouse.ts` | 写入 `\x1b[?1000h` 启用鼠标跟踪 | 浏览器 `scroll` 事件 |
| `parseMouseEvent(buf)` | `tui/src/utils/mouse.ts` | 解析 `\x1b[M...` 序列 | 浏览器 `scroll` 事件 |
| `postToLines(post, cols)` | `tui/src/components/PostItem.tsx` | 帖子展开为扁平行列表 | 虚拟列表（`@tanstack/react-virtual`） |

[来源](docs/ARCHITECTURE.md#L88-L97)

### visualWidth 的 CJK 感知

`visualWidth` 遍历字符串，对 CJK 字符（包括 Hangul、Emoji）计 2 列，ASCII 计 1 列，零宽字符（U+200B）跳过。`findBreakPoint` 配合此逻辑进行断行：优先在空格处断，次选字符边界，最后硬断。
[来源](packages/tui/src/utils/text.ts#L7-L81)

`wrapLines` 在各处使用：`PostItem.tsx` 中格式化帖子文本设 `indent=0`，`AIChatView` 中用户消息设 `indent=2`。首次调用后，后续行自动缩进。
[来源](docs/TUI_UTILS.md#L31-L36)

---

## 终端渲染的限制如何塑造架构

将上述所有设计联系起来，可以看到一个核心模式：**预计算 + 扁平化 + 显式状态切换**。

| 浏览器（PWA） | 终端（TUI） | 原因 |
|--------------|------------|------|
| 虚拟滚动（DOM 只渲染可见项） | 预计算全量行列表，内存切片 | 终端无需回收 DOM 节点，但必须控制行数不超过视口 |
| CSS `word-wrap` | `wrapLines()` 手动换行 | 终端不知 CJK 字符占用 2 列 |
| 鼠标 hover 显示操作面板 | 光标/焦点分离（方向键+Enter） | 终端无 hover 事件 |
| 滚动容器 + `overflow-y:auto` | 状态驱动的 `viewStart` 计算 | 终端不能"溢出滚动"，所有行必须能容纳 |
| 点击交互（`onClick`） | 键盘快捷键 + Enter | 终端无鼠标点击（滚轮是例外） |
| `position: absolute` 弹层 | `Box` 内联渲染条件式弹层 | 终端无层叠上下文 |

这些约束并非缺陷——它们是终端 UI 的硬性限制，而 `PostList` 的 viewport 切片和 `UnifiedThreadView` 的光标/焦点分离正是**在限制中做出正确取舍**的设计。

---

## 下一步

- 理解键盘架构的全貌和快捷键优先级规则 → [TUI 键盘快捷键完全参考](tui-键盘快捷键完全参考.md)
- 了解底层 Hook 如何在应用层连接 TUI 与 PWA → [React Hooks 架构与 Store 模式](react-hooks-架构与-store-模式.md)
- 整体应用层状态机和导航设计 → [导航与状态管理](导航与状态管理.md)