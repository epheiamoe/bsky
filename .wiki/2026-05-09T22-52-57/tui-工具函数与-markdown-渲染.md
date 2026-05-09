# TUI 工具函数与 Markdown 渲染

TUI 终端环境面临两个 PWA 不存在的问题：**字符宽度不可知**（CJK 象形文字在等宽终端中占 2 列，ASCII 占 1 列）和 **无原生滚动事件**。本项目通过三个零外部依赖的工具模块解决这些问题：CJK 感知文本换行、ANSI 鼠标追踪，以及轻量 Markdown → Ink ReactNode 映射器。

---

## CJK 感知文本换行

终端中「宽度」不是字符个数而是视觉列数，这是 CJK 文本换行的核心难点。`text.ts` 提供了两个函数解决此问题。

### visualWidth — 视觉列宽计算

```typescript
export function visualWidth(str: string): number
```

遍历字符串的每个码点，用 `isWide()` 判定是否为宽字符（返回 2），否则返回 1。零宽字符（`\0`、零宽空格 `U+200B`）不计数。

`isWide()` 覆盖的 Unicode 区块：

| 区块 | 范围 | 示例 |
|------|------|------|
| 谚文 Jamo | `U+1100–U+115F` | ㄱㄴㄷ |
| CJK 统一字 + 彝文 | `U+2E80–U+A4CF` | 中文日文 |
| 谚文音节 | `U+AC00–U+D7A3` | 한글 |
| CJK 兼容字 | `U+F900–U+FAFF` | 金羅 |
| CJK 兼容形式 | `U+FE30–U+FE6F` | ︰︱︲ |
| 全角形式 | `U+FF01–U+FF60` | ＡＢＣ |
| 全角符号 | `U+FFE0–U+FFE6` | ￠￡ |
| Emoji + 杂项符号 | `U+1F300–U+1F9FF` | 😀🔥🧠 |
| 国际象棋符号 | `U+1FA00–U+1FA6F` | 🨀🨁 |
| CJK 扩展 B+ | `U+20000–U+2FFFF` | 𠀀𪚥 |

关键设计决策：**不使用 Unicode 官方 East Asian Width 标准**，而是手写码点范围。这是因为 East Asian Width 将部分符号标记为 Ambiguous（如 `±`、`©`），不同终端渲染不同，而硬编码范围保证了跨终端行为一致。

[来源](packages/tui/src/utils/text.ts#L7-L31)

### wrapLines — 智能换行

```typescript
export function wrapLines(text: string, maxCols: number, indent = 0): string[]
```

换行算法分两层：

1. **段落分割**：按 `\n` 拆分，每个段落独立处理（保留原文的显式换行）。
2. **每段行内换行**：调用 `findBreakPoint()` 寻找断点，优先级为：**空格** > **硬断**。

`findBreakPoint` 的核心逻辑：遍历字符累加视觉宽度，当 `vis + w > maxVisual` 时触发截断。若有可用空格（`lastSpace > 0`），回退到空格处（包含该空格）；否则在当前字符处硬断。

```
输入: "你好世界ABC测试", maxCols=6
视觉宽度迭代: 你(2) 好(4) 世(6) → vis=6, 下一个"界"宽度2, vis+2=8>6
无空格 → 硬断 → ["你好世", "界ABC测试"]
```

```
输入: "Hello World Test", maxCols=10
视觉宽度: Hello(5) 空格(6) W(7) o(8) r(9) l(10) d(11) → 超过
lastSpace=6 (空格后) → 断在空格 → ["Hello", "World Test"]
```

第二行起添加 `indent` 空格前缀，用于引用块、列表延续等场景。

[来源](packages/tui/src/utils/text.ts#L40-L81)

### 使用位置

- **PostItem.postToLines()**：替换了原有的 `while` 切片循环，`maxCols = cols - 4`，第 0 行无缩进。[来源](packages/tui/src/components/PostItem.tsx#L24-L28)
- **AIChatView**：用户消息前缀 `▸`、AI 回复前缀 `🤖`，工具结果缩进 4 空格，均使用 `wrapLines`。[来源](packages/tui/src/components/AIChatView.tsx#L31-L46)

### 边界测试样例

基于代码逻辑推导的测试矩阵：

| 输入 | `maxCols` | `indent` | 期望输出 | 测试点 |
|------|-----------|----------|----------|--------|
| `"你好世界ABC测试"` | 6 | 0 | `["你好世界", "ABC测试"]` | CJK 硬断边界 |
| `"Hello World"` | 8 | 0 | `["Hello", "World"]` | 空格优先 |
| `"HelloWorld"` | 5 | 0 | `["Hello", "World"]` | 无空格硬断 |
| `"你好"` | 10 | 0 | `["你好"]` | 短于 maxCols |
| `""` | 10 | 0 | `[""]` | 空行段落 |
| `"A B C D E F"` | 3 | 0 | `["A B", "C D", "E F"]` | 连续空格分割 |
| `"  leading spaces"` | 40 | 0 | `["leading spaces"]` | 首尾 trim |
| `"中English混排"` | 8 | 0 | `["中Eng", "lish混排"]` | 混排混合宽度 |
| `"line1\n\nline2"` | 40 | 0 | `["line1", "", "line2"]` | 保留空段落 |
| `"long"` | 0 | 0 | `["long"]` | `maxCols ≤ 0` 保底 |
| `"wrap"` | 10 | 4 | `["wrap"]` | 单行不触发缩进 |
| `"wrap here please"` | 6 | 2 | `["wrap", "  here", "  please"]` | 多行缩进 |

> 注：上述为基于代码推导的期望行为，当前 `packages/tui/src/utils/` 目录下无测试文件。

---

## ANSI 鼠标追踪

终端内鼠标滚动不是原生事件，而是通过 ANSI escape sequence 模拟的。`mouse.ts` 实现了标准 SGR 鼠标追踪协议的子集（仅滚动事件）。

### 接口定义

```typescript
interface MouseEvent {
  type: 'scrollUp' | 'scrollDown';
  col: number;
  row: number;
}
```

只解析滚轮事件（button 64/65），不处理按钮点击、拖拽等。这是有意为之——TUI 的操作模型是键盘驱动，鼠标仅用于滚动辅助。

[来源](packages/tui/src/utils/mouse.ts#L8-L12)

### 三函数实现序列

**启用**：向 `stdout` 写入 `\x1b[?1000h`。`try/catch` 包裹，在不支持的终端上静默失败。

```typescript
export function enableMouseTracking(stdout: WriteStream): void {
  try { stdout.write('\x1b[?1000h'); } catch {}
}
```

**禁用**：写入 `\x1b[?1000l`。同样 `try/catch` 安全。

```typescript
export function disableMouseTracking(stdout: WriteStream): void {
  try { stdout.write('\x1b[?1000l'); } catch {}
}
```

**解析**：`parseMouseEvent` 使用模块级变量 `mouseBuf` 累积 stdin 数据块。当累积到完整的 6 字节 `\x1b[M + 3 payload bytes` 时解析：

| 字节偏移 | 含义 | 解码方式 |
|----------|------|----------|
| 0–2 | 前缀 | 固定 `\x1b[M` |
| 3 | button | `64 = scrollUp`, `65 = scrollDown` |
| 4 | col | `charCode - 32` |
| 5 | row | `charCode - 32` |

**防溢出守卫**：若 `mouseBuf` 超过 20 字节且不以 `\x1b[M` 开头，清空缓冲区。防止恶意/损坏数据撑爆内存。

[来源](packages/tui/src/utils/mouse.ts#L15-L52)

### 集成到 App.tsx

鼠标追踪在 `App.tsx` 的 `useEffect` 中生命周期管理：

```
mount → enableMouseTracking(stdout) → 注册 stdin 'data' 监听 → 根据 currentView.type 分发
                                                                     ↕ scrollUp: feedIdx-1
                                                                     ↕ scrollDown: feedIdx+1
unmount → 注销 'data' 监听 → disableMouseTracking(stdout)
```

关键细节：`useEffect` 的依赖数组包含 `[stdout, currentView.type, posts.length]`，确保切换视图时刷新分发逻辑。

[来源](packages/tui/src/components/App.tsx#L123-L148)

### 终端兼容性

| 终端 | 支持 | 备注 |
|------|------|------|
| Windows Terminal | ✅ | |
| iTerm2 | ✅ | |
| Kitty | ✅ | |
| WezTerm | ✅ | |
| tmux 3.3+ | ✅ | 需 `set -g mouse on` |
| ConEmu | ❌ | 写入静默忽略 |
| cmd.exe (传统) | ❌ | 写入静默忽略 |

---

## Markdown → Ink ReactNode 渲染器

`markdown.tsx` 是一个零外部依赖的轻量 Markdown 渲染器，输出 `React.ReactNode[]` 供 Ink 的 `<Text>` 组件直接消费。它不生成 ANSI 转义码，而是通过 Ink 的 props（`bold`、`color`、`dimColor`）表达样式。

### 支持的语法与映射

| Markdown 语法 | CSS / ANSI 等价 | Ink 映射 | 代码位置 |
|---------------|-----------------|----------|----------|
| **`---` 分割线** | `border-bottom: 1px solid` | `<Text dimColor>{'─'.repeat(36)}</Text>` | 第 64–67 行 |
| **`#` H1–H3 标题** | `font-weight: bold; color: ...` | `<Text bold color={level===1?'cyanBright':'cyan'}>` | 第 69–78 行 |
| **`> ` 引用块** | `border-left: 2px solid; opacity: 0.7` | `<Text dimColor>│ {tokenizeLine(content)}` | 第 80–85 行 |
| **`-`/`*` 无序列表** | `list-style-type: disc` | `{'  '.repeat(indent)}• {tokenizeLine(content)}` | 第 87–93 行 |
| **`1.` 有序列表** | `list-style-type: decimal` | `{pad}{number}. {tokenizeLine(content)}` | 第 95–101 行 |
| **``````` 代码块** | `font-family: monospace; opacity: 0.7` | `<Text dimColor>{'  '}{line}` | 第 37–57 行 |
| **URL / @handle 自动链接** | `color: blue` | `<Text color="blue">{match}</Text>` | 第 4–21 行 |
| **纯文本段落** | — | `<Text>{tokenizeLine(line)}</Text>` | 第 103 行 |
| **空行** | — | `<Text> </Text>` (空格占位) | 第 59–62 行 |

### 重要设计决策

**标题只支持 H1–H3**。正则 `^(#{1,3})\s+(.+)` 限定最多 3 级。这反映了实际使用场景——AI 生成的内容很少使用 4–6 级标题，而 TUI 排版空间有限，更多层级难以在 80 列终端内清晰表达。

**代码块不支持语法高亮**。所有代码行统一使用 `dimColor` 加 2 空格缩进。完整的语法高亮需要将 Ink 文本拆分为多段不同颜色的 `<Text>` 片段，复杂度与收益不成正比。

**内联样式（粗体/斜体/行内代码）未实现**。正则 `TOKEN_REGEX` 只识别 URL 和 @handle，不对 `**bold**`、`*italic*`、`` `code` `` 做解析。这同样基于实际使用模式——AI 回复中内联格式的使用频率远低于块级结构，而实现代价包括在 `tokenizeLine` 中嵌入子 `<Text>` 树的递归处理。

**自动链接渲染**：`/(https?:\/\/[^\s<>"']+|@[a-zA-Z0-9._-]+(?:\.[a-zA-Z]{2,})+)/g` 识别 HTTP URL 和带域名的 @handle，包裹在蓝色 `<Text>` 中。注意，纯 `@username`（无域名后缀）不被识别——AT Protocol 的完整 DID 格式才被匹配。

### 与 PWA 的对比

| 能力 | TUI (`renderMarkdown`) | PWA (`markdown.tsx` in PWA) |
|------|------------------------|-----------------------------|
| 渲染引擎 | Ink ReactNode | HTML DOM |
| 内联粗体/斜体 | ❌ | 待确认 |
| 代码块高亮 | ❌ | 待确认 |
| 图片 | ❌ | 待确认 |
| 行内代码 | ❌ | 待确认 |
| 链接点击 | 不支持（仅视觉蓝色） | 支持 |
| 外部依赖 | 零 | 未知 |

TUI 的 Markdown 渲染器遵循**最小够用原则**：只处理 AI 回复中最常见的结构——标题、列表、引用、代码块、链接高亮。任何新语法支持都要先举证其在 AI 回复中的出现频率足够高。

[来源](packages/tui/src/utils/markdown.tsx#L1-L113)

---

## 与其他页面的关联

- **`[TUI 视图组件架构](tui-视图组件架构.md)`**：`App.tsx` 是鼠标追踪的宿主，`PostItem.tsx` 和 `AIChatView.tsx` 是 `wrapLines` 的主要消费者
- **`[AI 对话引擎](ai-对话引擎.md)`**：AI 回复的富文本内容通过 `renderMarkdown` 渲染，用户消息使用 `wrapLines` 换行
- **`[三层架构详解](三层架构详解.md)`**：这三个工具函数属于 TUI 层（Layer 2），PWA 层通过 CSS 解决同类问题，这正是「各层独立演化」的体现
- **`[38 个 AI 工具系统](38-个-ai-工具系统.md)`**：工具执行结果（`tool_result`）在 AIChatView 中经过 `wrapLines` 换行后展示，`renderMarkdown` 尚未用于工具结果渲染