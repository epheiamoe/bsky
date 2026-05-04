# Ink 渲染与终端适配

本项目 TUI 终端客户端建立在 **Ink v5** 之上——一个将 React 组件模型映射到终端 ANSI 输出的框架。与 PWA 的 DOM + CSS 渲染不同，终端渲染面临三个根本性约束：**无 CSS 布局**（只能使用 `Box`/`Text` 的 flex 布局）、**无像素级定位**（只有字符网格）、**无鼠标点击解析**（需要手动编码 ANSI 序列）。本章从入口到渲染管线，逐一拆解 TUI 如何在这些约束下实现接近原生 GUI 的体验。

---

## 1. 入口流程：Env → Raw Mode → 分支渲染

### 1.1 环境变量加载

`cli.ts` 的入口执行两个搜索路径的 `.env` 加载：优先从可执行文件所在目录的 `../../.env`（monorepo 根目录）查找，回退到 `process.cwd()` 下的 `.env`。

```typescript
const envPaths = [
  path.resolve(__dirname, '..', '..', '..', '.env'),
  path.resolve(process.cwd(), '.env'),
];
for (const envPath of envPaths) {
  dotenv.config({ path: envPath });
}
```

`getConfigFromEnv()` 从 `process.env` 中提取 `BLUESKY_HANDLE`、`BLUESKY_APP_PASSWORD`、`LLM_API_KEY` 等字段，若缺少关键凭据则返回 `null`，触发 **SetupWizard** 分支。配置的完整字段映射见 [环境变量与认证](环境变量与认证.md)。

[来源](cli.ts#L20-L27) | [来源](cli.ts#L33-L50)

### 1.2 Raw Mode 检测与输入流适配

终端输入的核心矛盾：Ink 要求 `stdin` 提供 `setRawMode` 方法（`tty.ReadStream`），但在非 TTY 环境（如管道重定向）下 `process.stdin.isTTY` 为 `undefined`。代码采用 **主动探测 + fallback 流桥接** 策略：

```typescript
let isRawMode = false;
try {
  const stdin = process.stdin as ReadStream;
  if (stdin.isTTY) {
    stdin.setRawMode(true);
    isRawMode = true;
  }
} catch {}
```

当 raw mode 不可用时（如 Git Bash 或 Windows 非 ConPTY），创建一个 `Readable` 假流，手动注入 `isTTY`、`setRawMode`、`ref`/`unref` 桩方法，并将真实 `stdin` 的 `data` 事件桥接到假流上。这保证了 Ink 的 `useInput` hook 在任何环境下都能注册键盘回调。

**`isRawMode` 标志** 被传递给 `Root` 组件，最终流入 `App` 的 `isRawModeSupported` props，在底部状态栏显示警告："⚠ Raw mode not supported — some keys may not work"。

[来源](cli.ts#L82-L102)

### 1.3 双分支：SetupWizard vs App

`Root` 组件是一个纯条件渲染器：

```
┌─ getConfigFromEnv() 返回 null?
│   ├─ 是 → <SetupWizard onComplete={...} />
│   │     用户填写字段 → writeEnvFile() 写入 .env → re-run getConfigFromEnv
│   │     若仍为 null → process.exit(1)
│   └─ 否 → <App config={...} isRawModeSupported={...} />
│           进入主 TUI 界面
```

`SetupWizard` 是一个 8 字段的交互式表单（handle / password / LLM key / base URL / model / thinking / vision / locale），使用 `ink-text-input` 的文本输入和 `useInput` 的上下/ Tab 导航。提交后调用 `writeEnvFile()` 将配置持久化到 `process.cwd()/.env`，再重新加载配置。详细交互见 [安装向导与环境校验](安装向导与环境校验.md)。

`App` 接收 `config` 和 `isRawModeSupported`，启动完整的 TUI 主流程。

[来源](cli.ts#L67-L81) | [来源](SetupWizard.tsx#L158-L196)

---

## 2. Ink 渲染引擎适配：终端即画布

Ink 的渲染模型与 React DOM 有本质差异：

| 维度 | React DOM (PWA) | Ink (TUI) |
|------|-----------------|-----------|
| 布局 | CSS 盒模型 + Flexbox | `Box` 组件（flexDirection, flexGrow） |
| 文本 | `<span>` + CSS font | `<Text>` 组件（color, bold, dimColor） |
| 尺寸 | px / rem / vw | `columns` / `rows`（字符网格） |
| 事件 | onClick / onScroll | `useInput` / 原始 stdin |

### 2.1 终端尺寸追踪

`App.tsx` 通过 `useStdout()` 获取 `WriteStream`，监听 `resize` 事件动态更新 `cols` 和 `rows`：

```typescript
const { stdout } = useStdout();
const [cols, setCols] = useState(() => stdout?.columns ?? 80);
const [rows, setRows] = useState(() => stdout?.rows ?? 24);
useEffect(() => {
  const onResize = () => { setCols(stdout?.columns ?? 80); setRows(stdout?.rows ?? 24); };
  stdout?.on('resize', onResize);
  return () => { stdout?.off('resize', onResize); };
}, [stdout]);
```

所有子组件收到 `cols`/`rows` 后用于计算可用宽度——这是整个 TUI 响应式布局的基础。

[来源](App.tsx#L35-L41)

### 2.2 布局策略：Sidebar + Main + Footer 三区

`App` 返回一个三层 `Box` 结构：

1. **Header** (高1行)：蓝底白色标题栏，左侧显示 `🦋 Bluesky @handle`，右侧时钟。
2. **Main** (flexGrow:1)：水平 `flexDirection="row"` 包含 `Sidebar`（宽度 = `Math.max(16, cols * 0.14)`）和主内容区（`mainW = cols - sidebarW - 2`）。
3. **Footer** (高1行)：蓝底快捷键提示，根据 `currentView.type` 和 `canGoBack` 渲染不同提示文本。

这种结构保证了渲染器在任何终端尺寸下都能自适应——sidebar 最小 16 列，main 区填充剩余宽度。

[来源](App.tsx#L347-L365)

---

## 3. Viewport 渲染策略：虚拟列表的纯行模型

终端没有滚动容器。所有"滚动"效果本质上是**重新渲染**——Ink 在每次 state 变化时 diff 整棵组件树并重绘。这意味着大量帖子时，不做优化会导致严重的性能问题。

### 3.1 PostList：可见行预计算

`PostList` 的核心策略是 **合并行模型**：将帖子列表拍平为 `PostLine[]` 数组，然后只渲染当前视口内的行。

```typescript
const allLines = useMemo(() => {
  const lines: PostLine[] = [];
  for (let i = 0; i < posts.length; i++) {
    const postLines = postToLines(posts[i]!, i, i === selectedIndex, width, t, locale);
    for (const l of postLines) lines.push(l);
  }
  return lines;
}, [posts, selectedIndex, width, t, locale]);
```

**选中的帖子索引**被用来决定视口位置。`selectedLineStart` 查找当前选中帖子的首行（通过 `isName` 标记和 `[${selectedIndex}]` 文本模式），然后计算 `viewStart` 使其在视口中居中：

```typescript
const viewStart = Math.max(0, Math.min(
  allLines.length - visibleLines,
  (selectedLineStart >= 0 ? selectedLineStart : 0) - Math.floor(visibleLines / 3)
));
```

**滚动指示器**：当视口上方或下方有内容时，显示 `▲ scrollPct% (1/20)` 和 `▼ remaining%`。

这种模型避免了每个帖子作为一个独立 React 组件节点，大幅减少了 Ink 的 diff 开销。

[来源](PostList.tsx#L18-L44)

### 3.2 PostItem：postToLines 的行生成器

`postToLines` 函数将 `PostView` 结构化为 `PostLine[]` 数组。每个帖子的行序列为：

```
[0] 作者名 @handle   ← isName=true, 选中时 bold+cyanBright
帖子正文（CJK 感知换行）
视频链接（OSC 8 超链接）
图片链接（OSC 8 超链接）
│ @quotedAuthor      ← quoteUri 引用帖, magenta 色
│ 引用正文缩进
@mention 超链接       ← OSC 8 可点击
#hashtag 超链接       ← OSC 8 可点击
♥ 42 ♺ 12 💬 7 · 04/12 14:30  ← 统计行
                        ← 空白分隔行
```

关键设计决策：

- **OSC 8 超链接序列**：`\x1b]8;;<url>\x07<text>\x1b]8;;\x07` 使支持超链接的终端（iTerm2, Kitty, WezTerm）中 Ctrl+Click 可直接打开图片/视频/用户/话题。
- **引用帖缩进**：`│ @handle` 和 `│ quoted text` 使用 `│` 前缀和 `magenta` 色，视觉区分原始帖和引用帖。
- **统计行格式化**：`♥ ♺ 💬` 使用 unicode 符号 + 计数，减少字符数。

**PostListItem** 渲染器按 `line.isSelected` 和 `line.isName` 分四级视觉权重：

| isSelected | isName | 样式 |
|-----------|--------|------|
| true | true | `cyanBright` + `bold`（当前帖子作者行）|
| true | false | `cyanBright`（当前帖子正文）|
| false | true | `green`（其他帖子作者行）|
| false | false | `dimColor`（其他帖子正文）|

[来源](PostItem.tsx#L13-L96) | [来源](PostItem.tsx#L99-L112)

---

## 4. CJK 文本排版引擎

终端字符不是等宽的。CJK 字宽 2 列，emoji 可能占 2 列，零宽字符占 0 列。`text.ts` 提供了纯 TypeScript 的列宽感知工具，替代 CSS 的 `word-wrap`。

### 4.1 visualWidth——视觉列宽计算

```typescript
export function visualWidth(str: string): number {
  let w = 0;
  for (const ch of str) {
    const cp = ch.codePointAt(0)!;
    if (isWide(cp)) w += 2;
    else if (cp === 0 || cp === 0x200b) { /* zero-width */ }
    else w += 1;
  }
  return w;
}
```

`isWide` 函数覆盖了 Unicode 中所有宽字符区间：Hangul Jamo (0x1100-0x115f)、CJK 统一表意文字 (0x2e80-0xa4cf)、Hangul 音节 (0xac00-0xd7a3)、CJK 兼容区 (0xf900-0xfaff)、全角符号 (0xff01-0xff60)、Emoji (0x1f300-0x1f9ff)、CJK 扩展 B+ (0x20000-0x2ffff) 等。

这与 CSS 的 `unicode-bidi` 不同——它不依赖浏览器排版引擎，是完全可预测的纯字符宽度模型。

[来源](text.ts#L5-L34)

### 4.2 wrapLines——CJK 感知行拆分

`wrapLines` 将文本按 `\n` 分段，对每段进行行内拆分：

1. 若 `visualWidth(remaining) <= lineMax`，直接结束当前段。
2. 否则调用 `findBreakPoint` 找到断点。
3. 断点策略：**优先空格**（保持单词完整性）**→ 否则硬断**（在超出 `maxVisual` 的第一个字符处断开）。
4. 续行支持 `indent` 缩进（用于引用帖的 `│ ` 前缀）。

`findBreakPoint` 逐个字符累积视觉宽度，一旦 `vis + w > maxVisual`，回退到最后一个空格位置；若无空格，就在当前位置硬断。

```typescript
function findBreakPoint(text: string, maxVisual: number): number {
  const chars = [...text];
  let vis = 0;
  let lastSpace = -1;
  for (let i = 0; i < chars.length; i++) {
    const cp = chars[i]!.codePointAt(0)!;
    const w = isWide(cp) ? 2 : 1;
    if (vis + w > maxVisual) {
      if (lastSpace > 0) return lastSpace;
      return i;
    }
    if (chars[i] === ' ') lastSpace = i + 1;
    vis += w;
  }
  return chars.length;
}
```

注意 `chars = [...text]` 确保了字符迭代的正确性——JavaScript 的 `string.length` 在 CJK 字符（如 `」`）面前不可靠，因为部分宽字符在 UCS-2 中被编码为代理对。展开运算符正确处理了这些情况。

[来源](text.ts#L43-L79) | [来源](text.ts#L81-L96)

---

## 5. 鼠标追踪系统：ANSI 序列编码

终端没有原生鼠标事件。Xterm 兼容终端支持 **DEC private mode 1000** 发送鼠标事件 ANSI 序列。`mouse.ts` 封装了这一协议。

### 5.1 启用/禁用

```typescript
export function enableMouseTracking(stdout: WriteStream): void {
  try { stdout.write('\x1b[?1000h'); } catch {}
}
export function disableMouseTracking(stdout: WriteStream): void {
  try { stdout.write('\x1b[?1000l'); } catch {}
}
```

`\x1b[?1000h` 启用基本鼠标追踪（仅报告按钮事件和滚动），`\x1b[?1000l` 关闭。选择模式 1000 而非模式 1002（拖拽追踪）是为了避免过多无用的鼠标移动事件污染 stdin 流。

### 5.2 解析引擎

`parseMouseEvent` 维护一个累积缓冲区 `mouseBuf`，按字节流模式解析：

```
ESC [ M <button+32> <col+32> <row+32>
```

滚动事件映射：`button === 64`（0x60）→ scrollUp，`button === 65`（0x61）→ scrollDown。

```typescript
if (mouseBuf.startsWith('\x1b[M') && mouseBuf.length >= 6) {
  const button = mouseBuf.charCodeAt(3);
  const col = mouseBuf.charCodeAt(4) - 32;
  const row = mouseBuf.charCodeAt(5) - 32;
  mouseBuf = '';
  if (button === 64) return { type: 'scrollUp', col, row };
  if (button === 65) return { type: 'scrollDown', col, row };
}
```

**防泄漏**：若缓冲区长度超过 20 且不以 `\x1b[M` 开头，则清空——防止乱码序列导致内存膨胀。

### 5.3 在 App 中的集成

`App` 的 `useEffect` 中挂载 `process.stdin` 的 `data` 监听器：

```typescript
useEffect(() => {
  if (!stdout) return;
  enableMouseTracking(stdout);
  const onData = (data: Buffer) => {
    const evt = parseMouseEvent(data);
    if (!evt) return;
    if (evt.type === 'scrollUp') {
      if (currentView.type === 'feed') setFeedIdx(i => Math.max(0, i - 1));
    } else if (evt.type === 'scrollDown') {
      if (currentView.type === 'feed') setFeedIdx(i => Math.min(posts.length - 1, i + 1));
    }
  };
  process.stdin.on('data', onData);
  return () => {
    process.stdin.off('data', onData);
    disableMouseTracking(stdout);
  };
}, [stdout, currentView.type, posts.length]);
```

注意 `deps` 数组：当 `currentView.type` 或 `posts.length` 变化时重建监听器，确保 scroll 边界始终有效。

[来源](mouse.ts#L7-L47) | [来源](App.tsx#L225-L239)

---

## 6. useInput 调度架构

`App.tsx` 中唯一的 `useInput` 回调是整个 TUI 的**键盘路由中心**。它按照优先级分层调度：

### 6.1 优先级 0——全局保留键

- **Tab**：切换 AI 面板焦点（`focusedPanel: 'main' ↔ 'ai'`），立即 return，不往下传递。
- **Esc**：关闭覆层 → 返回上一视图 → 草稿保存提示 → 直接退出。
- **Ctrl+G** (`\x07`)：全局跳转到 AI 聊天视图。

### 6.2 优先级 1——视图内专用模式

- **compose 模式**：草稿保存提示（y/n）、草稿列表（j/k/Enter/d/n）、图片路径输入模式。
- **search 模式**：所有按键被 SearchView 接管（`return` 跳过）。
- **aiChat + focusedPanel === 'ai'**：AI 面板独占键盘。

### 6.3 优先级 2——Feed 特定键

| 键 | 动作 |
|----|------|
| `j` / `↓` | 选中下一帖 |
| `k` / `↑` | 选中上一帖 |
| `Enter` | 打开帖子线程 |
| `m` | 加载更多 |
| `r` | 刷新 |
| `f` | 打开 Feed 配置 |
| `v` | 切换书签 |
| `q` | 跳转到引用帖 |
| `PgUp` (`\x1b[5~`) | 上移 5 个 |
| `PgDn` (`\x1b[6~`) | 下移 5 个 |

### 6.4 优先级 3——全局导航

`t` → 主页，`n` → 通知，`p` → 个人资料，`s` → 搜索，`a` → AI 聊天，`c` → 发帖，`b` → 书签。

这种分层架构避免了按键冲突——每个视图可以声明自己的键位集，而全局键始终保持可用。详细键位表见 [键盘快捷键完整系统](键盘快捷键完整系统.md)。

[来源](App.tsx#L89-L224)

---

## 7. 渲染边界情况

### 7.1 非 Raw Mode 降级

当 `isRawModeSupported` 为 `false` 时，App 底部渲染黄色警告行：

```tsx
{!isRawModeSupported && (
  <Box width={cols} height={1}>
    <Text backgroundColor="#92400e" color="yellow">
      {'⚠ '}{t('common.rawModeWarning')}
    </Text>
  </Box>
)}
```

缺少 raw mode 时，Ctrl+C 无法正确拦截（可能直接终止进程），部分 ANSI 转义码可能被终端解释器吞掉。这是 TUI 的已知局限。

[来源](App.tsx#L365-L369)

### 7.2 UTF-8 代理对与 visualWidth

`visualWidth` 使用 `string.codePointAt(0)` 而非 `charCodeAt` 来正确处理 4 字节字符（如 `𝄞` U+1D11E）。如果使用 `charCodeAt`，代理项会被拆分为两个无效码点，导致宽度计算错误。这是 `emoji` 和 CJK 扩展区频繁出现的陷阱。

### 7.3 滚动边界与视口溢出

`PostList` 的 `viewStart` 计算使用 `Math.max(0, Math.min(allLines.length - visibleLines, ...))` 的双边界保护，确保不会出现负的起始行或超出末尾的切片。当 `allLines.length <= visibleLines` 时，`viewStart` 恒为 0。

[来源](PostList.tsx#L29-L31)

---

## 总结

Ink 渲染层在三个维度实现了终端适配：

1. **布局层面**：`Box` + `flexGrow` 的响应式分割，结合 `resize` 事件动态跟踪终端尺寸。
2. **排版层面**：`visualWidth` + `wrapLines` 的自制文本引擎，解决 CSS 在终端中的缺失。
3. **交互层面**：`useInput` 的分层调度 + `mouse.ts` 的 ANSI 序列解析，弥合终端与 GUI 的事件模型差距。

这种架构使得整个 TUI 在从 80×24 到 200×50 的终端窗口范围内都能保持可用性——不依赖 `overflow: scroll`，不依赖 CSS grid，全部通过纯字符网格的数学计算实现。

---

## 推荐阅读

- [键盘快捷键完整系统](键盘快捷键完整系统.md) — useInput 分层注册的完整键位表
- [安装向导与环境校验](安装向导与环境校验.md) — SetupWizard 的交互式配置流程
- [环境变量与认证](环境变量与认证.md) — .env 配置字段的完整映射
- [导航路由与视图管理](导航路由与视图管理.md) — AppView 导航状态机与 useInput 的联动
- [三层架构设计](三层架构设计.md) — core→app→tui 的分层职责