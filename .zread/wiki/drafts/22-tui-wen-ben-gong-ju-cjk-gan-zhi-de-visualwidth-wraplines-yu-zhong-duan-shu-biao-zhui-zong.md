终端界面（TUI）面临两个 PWA 天然不存在的问题：**文本宽度计算**和**鼠标事件捕获**。浏览器通过 CSS `word-wrap` 和原生 `scroll` 事件自动处理这些，而终端只能通过转义序列和逐字计算来模拟。本页面深入剖析 `@bsky/tui` 的解决方案——`packages/tui/src/utils/text.ts` 中的 CJK 感知文本工具和 `packages/tui/src/utils/mouse.ts` 中的终端鼠标追踪——从第一性原理解释其设计决策、算法实现和集成模式。

---

## 问题空间：终端文本为什么需要特殊处理？

在浏览器中，一个 `<div>` 加上 `word-wrap: break-word` 就能完美处理中日韩（CJK）文本换行。但在终端中，每个字符占用的"视觉列数"并不统一：

- **ASCII 字符**（`a`, `1`, `@`）占用 1 列
- **CJK 字符**（`你`, `好`, `世`）占用 2 列
- **Emoji 字符**（`🦋`, `🖼`）也占用 2 列
- **零宽字符**（U+0000, U+200B）占用 0 列

`string.length` 或 `Buffer.byteLength` 都无法给出正确的视觉宽度——前者返回 Unicode 码点数量，后者返回字节数。以"你好世界ABC测试"为例，`str.length` 返回 12，但终端实际占用 `8×2 + 3×1 = 19` 列。

这是 `visualWidth()` 函数要解决的核心问题。

Sources: [text.ts](packages/tui/src/utils/text.ts#L1-L38)

---

## visualWidth：视觉宽度计算引擎

`visualWidth()` 的实现遵循一个简单而精确的规则：遍历字符串的每个 Unicode 码点，对 CJK/Emoji 范围内的字符加 2，ASCII 加 1，零宽字符跳过。

```typescript
export function visualWidth(str: string): number {
  let w = 0;
  for (const ch of str) {
    const cp = ch.codePointAt(0)!;
    if (isWide(cp)) w += 2;
    else if (cp === 0 || cp === 0x200b) { /* skip */ }
    else w += 1;
  }
  return w;
}
```

关键在于 `isWide()` 函数——它定义了一个精心筛选的 Unicode 范围集合，涵盖所有东亚宽字符和常见 Emoji：

| 范围 | 覆盖内容 |
|------|---------|
| U+1100–U+115F | 韩文 Jamo（谚文声韵母） |
| U+2E80–U+A4CF | CJK 部首 + 扩展 + 彝文 |
| U+AC00–U+D7A3 | 韩文音节（现代谚文） |
| U+F900–U+FAFF | CJK 兼容汉字 |
| U+FE30–U+FE6F | CJK 兼容形式（竖排标点等） |
| U+FF01–U+FF60 | 全角 ASCII 形式 |
| U+FFE0–U+FFE6 | 全角符号（￠、￡、￥等） |
| U+1F300–U+1F9FF | Emoji + 杂项符号 + 表情符号 |
| U+1FA00–U+1FA6F | 国际象棋符号 |
| U+20000–U+2FFFF | CJK 扩展 B 区及以后 |

这个范围选择是**保守但精确**的——它涵盖了几乎所有终端中需要双倍宽度的字符，同时避免了将零宽连接符（ZWJ）序列或变体选择符错误计宽。对比 npm 包 `wcwidth`，这个内联实现零依赖、类型安全，对 `for...of` 迭代天然正确处理代理对（surrogate pairs）——因为 JavaScript 的字符串迭代基于码点而非 UTF-16 代码单元。

Sources: [text.ts](packages/tui/src/utils/text.ts#L10-L37)

---

## wrapLines：CJK 感知的文本换行算法

`wrapLines()` 是整个 TUI 文本处理的核心。它接受原始文本、最大列数和可选的缩进宽度，返回一个字符串数组，每行都在 `maxCols` 视觉列内。

### 算法流程

```
输入文本 → 按 \n 分段 → 逐段处理
                        ↓
          剩余宽度 > 0 && 视觉宽度 > 行宽？
                    ↙          ↘
                  是            否
                   ↓             ↓
           findBreakPoint()   添加整行
                   ↓
            切分 → 缩进 → 进入下一行
```

### 换行点优先级

`findBreakPoint()` 内部实现了一个三层优先级的断点选择策略：

1. **空格边界**（最高优先级）：找到最后一个在 `maxVisual` 范围内的空格位置，在此断开。这保留了单词完整性。
2. **字符边界**（中间优先级）：如果没有可用的空格，则在超出宽度的字符处强行断开——对于 CJK 文本，这通常发生在两个汉字之间，恰好是自然的"词"边界。
3. **连续行缩进**：第二行及后续行自动添加 `indent` 个空格前缀，用于缩进层次结构（如 AIChatView 中的工具调用结果缩进）。

```typescript
function findBreakPoint(text: string, maxVisual: number): number {
  const chars = [...text];       // 正确分割 Unicode 字符（含代理对）
  let vis = 0;
  let lastSpace = -1;
  for (let i = 0; i < chars.length; i++) {
    const cp = chars[i]!.codePointAt(0)!;
    const w = isWide(cp) ? 2 : 1;
    if (vis + w > maxVisual) {
      if (lastSpace > 0) return lastSpace;
      return i;                  // 硬换行
    }
    if (chars[i] === ' ') lastSpace = i + 1;
    vis += w;
  }
  return chars.length;
}
```

这里有一个精妙的细节：`lastSpace` 记录的是**空格之后的位置**（`i + 1`），而非空格本身的位置。这意味着当断点落在空格时，空格被包含在前一行末尾（通过后续的 `trimEnd()` 清理），而非后一行开头——这与浏览器的 `word-wrap` 行为一致。

Sources: [text.ts](packages/tui/src/utils/text.ts#L40-L82)

### 典型输出示例

```
wrapLines("你好世界ABC测试", 6)
→ ["你好世界", "ABC测试"]
//  "你好"=4列, "世界"=4列 → 超6列 → 在'世'前断
//  第二行 "ABC测试"：A=1, B=1, C=1, 测=2, 试=2 → 总7列 → 同样逻辑
```

```
wrapLines("这是一段包含空格 longword 的中文", 10, 2)
→ ["这是一段包含空格", "  longword 的中文"]
//  优先在空格处断，"这是一段包含空格"=10列，完美对齐
//  第二行缩进2空格，"  longword 的中文"=9+2=11列...?
//  注意：缩进占用的是 maxCols 内的配额，所以第二行实际内容宽度 = maxCols - indent
```

Sources: [text.ts](packages/tui/src/utils/text.ts#L40-L82)

---

## 集成模式：wrapLines 在组件树中的应用

`wrapLines` 在 TUI 中有三个关键消费点，每个的用法各有侧重。

### PostItem：帖子文本展示

在 `PostItem.tsx` 中，`wrapLines` 负责将 Bluesky 帖子的文本内容转换为终端可渲染的行。关键配置是 `maxCols = Math.max(20, cols - 4)`——保留左右 2 列边距。这里使用的是**一次调用、逐行封装**的模式：

```typescript
const maxCols = Math.max(20, cols - 4);
for (const l of wrapLines(text, maxCols)) {
  lines.push({ text: l, isSelected, isName: false });
}
```

没有缩进——帖子文本左右对齐，所有行宽度一致。

Sources: [PostItem.tsx](packages/tui/src/components/PostItem.tsx#L63-L66)

### AIChatView：多角色消息布局

`AIChatView.tsx` 是 `wrapLines` 使用最密集的地方，对不同角色采用不同参数：

| 角色 | 缩进 | 前缀 | 说明 |
|------|------|------|------|
| `user` | 2 空格 | `▸` | 用户输入与 AI 响应视觉分离 |
| `tool_result` | 4 空格 | `⮡` | 工具调用结果，缩进更深以示嵌套 |
| `thinking` | 0 | `| Thinking:` | 思考过程有独立前缀，内容区域宽度动态计算 |
| `assistant` | 不调用 wrapLines | 使用 markdown 渲染 | AI 响应经过 markdown 解析，有丰富格式 |

值得注意的是 `thinking` 消息的处理——它先将 `maxCols` 削减 13 个字符（前缀 `"| Thinking: "` 的长度），再用 `wrapLines` 处理，然后用循环将多行结果与前缀拼接：

```typescript
const prefix = '| Thinking: ';
const contPrefix = '|           ';
const innerWidth = Math.max(1, maxCols - 13);
const wrapped = wrapLines(msg.content, innerWidth, 0);
for (let i = 0; i < wrapped.length; i++) {
  const p = i === 0 ? prefix : contPrefix;
  lines.push(...);
}
```

这种做法保证多行思考内容视觉上对齐前缀位置，形成连续块级效果。

Sources: [AIChatView.tsx](packages/tui/src/components/AIChatView.tsx#L83-L113)

---

## 终端鼠标追踪：从转义序列到滚动事件

浏览器用 `element.addEventListener('scroll', handler)` 处理滚动。终端则以转义序列为基础——当用户滚动鼠标滚轮时，支持 xterm 控制序列的终端会向 stdin 写入特定格式的字节流。

### 控制序列协议

`mouse.ts` 实现的是 xterm 的 **1000 模式**（`x1b[?1000h`），即"普通按钮事件追踪"。启用后，每次鼠标按钮操作（包括滚轮）都会发送格式为 `x1b[M<button><col+32><row+32>` 的序列：

- **滚轮上划**（scroll up）：`button` = 64（0x40，即 `@` 字符的 ASCII 码）
- **滚轮下划**（scroll down）：`button` = 65（0x41，即 `A` 字符的 ASCII 码）
- **列和行**：减去 32 后得到实际的 1-based 坐标

### 解析器实现

`parseMouseEvent()` 采用**累加缓冲区模式**——因为 stdin 是流式的，一个鼠标事件可能分多次到达。关键设计：

```typescript
let mouseBuf = '';

export function parseMouseEvent(data: Buffer): MouseEvent | null {
  const str = data.toString();
  for (const ch of str) {
    mouseBuf += ch;
    if (mouseBuf.startsWith('\x1b[M') && mouseBuf.length >= 6) {
      const button = mouseBuf.charCodeAt(3);
      const col = mouseBuf.charCodeAt(4) - 32;
      const row = mouseBuf.charCodeAt(5) - 32;
      mouseBuf = '';
      if (button === 64) return { type: 'scrollUp', col, row };
      if (button === 65) return { type: 'scrollDown', col, row };
    }
    if (mouseBuf.length > 20 && !mouseBuf.startsWith('\x1b[M')) {
      mouseBuf = '';  // 防失控缓冲区增长
    }
  }
  return null;
}
```

这里有三个重要的工程决策：

1. **按字符而非按块**：逐字符追加而非一次性处理，正确处理事件跨边界到达的情况
2. **魔数 6**：`\x1b[M` 占 3 字节 + 3 个参数字节 = 6 字节，长度校验确保完整接收
3. **防失控机制**：当缓冲区超过 20 字节且不以 `\x1b[M` 开头时清空——防止非鼠标数据导致内存泄漏

Sources: [mouse.ts](packages/tui/src/utils/mouse.ts#L1-L53)

### 生命周期管理

在 `App.tsx` 中，鼠标追踪通过 `useEffect` 进行完整的生命周期管理：

```typescript
useEffect(() => {
  if (!stdout) return;
  enableMouseTracking(stdout);         // 挂载时开启

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
    process.stdin.off('data', onData); // 清理监听器
    disableMouseTracking(stdout);       // 卸载时关闭
  };
}, [stdout, currentView.type, posts.length]);
```

当前仅支持 feed 视图的鼠标滚动。这种设计具有可扩展性——只需在 `dispatch` 部分增加对其他 `currentView.type` 的处理即可扩展到 AI 对话历史滚动、帖子详情滚动等场景。

Sources: [App.tsx](packages/tui/src/components/App.tsx#L312-L329)

### 终端兼容性矩阵

| 终端 | 滚动支持 | 说明 |
|------|---------|------|
| Windows Terminal | ✅ | 原生支持 1000 模式 |
| iTerm2 | ✅ | 默认启用鼠标报告 |
| Kitty | ✅ | 支持 xterm 兼容模式 |
| WezTerm | ✅ | 完全兼容 |
| tmux 3.3+ | ✅ | 需配置 `mouse on` |
| ConEmu | ❌ | 静默失败——`write` 被忽略 |
| 传统 cmd.exe | ❌ | 静默失败 |

关键设计：`enableMouseTracking` 中使用了 `try/catch` 包裹 `stdout.write`，在不支持的环境中完全静默降级——用户既不会看到转义序列字符，也不会看到错误信息。

Sources: [mouse.ts](packages/tui/src/utils/mouse.ts#L22-L24)

---

## 架构决策：为什么不在 PWA 中使用？

这两套工具是**纯 TUI 的专属工具**。PWA 完全不依赖它们，原因如下：

```
TUI 端（需要 text.ts + mouse.ts）          PWA 端（不需要）
─────────────────────────                  ────────────────
终端字符宽度不统一                          CSS word-wrap 自动处理
无原生滚动事件                              window.addEventListener('scroll')
无原生文本换行                              word-break: break-all
stdin 是流式字节流                          DOM Event API
```

这个架构决策体现了 `@bsky/tui` 的分层设计原则——PWA 通过 CSS 解决渲染问题，TUI 通过纯 JS 计算解决。两者共享的业务逻辑位于 `@bsky/app` 层。

Sources: [text.ts](packages/tui/src/utils/text.ts#L3-L4), [mouse.ts](packages/tui/src/utils/mouse.ts#L4-L6)

---

## 工程启示

从这两个小工具的演进可以提炼出几条值得在任何终端应用中借鉴的经验：

**性能取舍**：`visualWidth()` 遍历整个字符串——对于典型的 Bluesky 帖子（几百字符）完全可接受。但对于大文本（如长文章），可以考虑缓存计算结果或分块处理。当前设计在可读性和性能之间取得了恰当的平衡。

**零依赖策略**：npm 上有 `wcwidth`、`string-width` 等现成包，但本项目选择了内联实现。原因有三：减少依赖树大小、完全控制 Unicode 范围更新、避免 CJS/ESM 互操作问题（本项目为 ESM-only）。

**缓冲区安全**：`mouseBuf` 的防失控机制展示了处理流式数据的通用模式——始终假设输入是恶意的/非预期的，在缓冲区增长到阈值时自愈。

**静默降级**：鼠标追踪的 `try/catch` 和 `process.stdin.on('data', ...)` 的优雅清理，确保了在不支持高级功能的终端中仍然可以正常使用键盘导航。

Sources: [text.ts](packages/tui/src/utils/text.ts#L10-L37), [mouse.ts](packages/tui/src/utils/mouse.ts#L39-L53)

---

## 延伸阅读

- **[键盘快捷键架构：5 个 useInput 处理器与全局保留键规则](21-jian-pan-kuai-jie-jian-jia-gou-5-ge-useinput-chu-li-qi-yu-quan-ju-bao-liu-jian-gui-ze)**：理解了鼠标滚动后，键盘导航架构展示了 TUI 的另一个输入通道
- **[自研 Markdown 渲染器：零依赖的 Ink 终端 Markdown 解析](23-zi-yan-markdown-xuan-ran-qi-ling-yi-lai-de-ink-zhong-duan-markdown-jie-xi)**：wrapLines 处理纯文本，而 markdown.tsx 处理格式化内容——两者在 AIChatView 中联合作战
- **[TUI 入口与 SetupWizard：交互式首次配置流程](20-tui-ru-kou-yu-setupwizard-jiao-hu-shi-shou-ci-pei-zhi-liu-cheng)**：从 cli.ts 入口到组件树的完整启动流程