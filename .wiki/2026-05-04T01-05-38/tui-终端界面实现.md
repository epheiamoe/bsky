# TUI 终端界面实现

## App 布局引擎：四区域弹性架构

`App.tsx` 的渲染树是一个四层嵌套的 `Box` 结构，由终端窗口尺寸驱动，通过 `useStdout` 和 `resize` 事件实时响应：

```
┌─ topBar ─────────────────────────────────────────────────┐
│ 🦋 Bluesky  @user.bsky.social  🟢          🤖 AI对话  12:34 │
├─ sidebar ─────┐─ mainContent ─────────────────────────────┤
│               │                                            │
│  🦋 Bluesky   │  [PostList / UnifiedThreadView /           │
│  ───────────  │   AIChatView / ComposeView / ...]          │
│  📋 时间线 [t]│                                            │
│  🔔 通知   [n]│                                            │
│  🔍 搜索   [s]│                                            │
│  👤 个人   [p]│                                            │
│  🔖 书签   [b]│                                            │
│  🤖 AI    [a]│                                            │
│  ✏️ 发帖   [c]│                                            │
│               │                                            │
├─ bottomBar ────────────────────────────────────────────────┤
│ Esc:返回  j:下移  k:上移  Enter:查看                      12:34│
└────────────────────────────────────────────────────────────┘
```

### 尺寸计算链

```typescript
const { stdout } = useStdout();                        // Ink 提供的 TTY 流
const [cols, setCols] = useState(() => stdout?.columns ?? 80);
const [rows, setRows] = useState(() => stdout?.rows ?? 24);
const sidebarW = Math.max(16, Math.floor(cols * 0.14)); // 14% 宽度，最小 16
const mainW = cols - sidebarW - 2;                      // -2 为 sidebar 边框
```

`sidebarW` 采用**比例 + 最小值**策略：14% 在宽终端（>200 列）下约为 28 字符，在窄终端（80 列）下回退到 16。`mainW` 将这一尺寸下发给所有子视图，子视图据此做文本换行计算。[来源](packages/tui/src/components/App.tsx#L48-L53)

### 顶栏 (topBar)

高度 1 行，背景色 `#1a56db`（Brand Blue），从左到右排列五个区域：

1. `🦋 Bluesky`（粗体白字）
2. `@` + 用户 handle
3. 连接状态指示器：`🟢`（client 不为 null）/ `🔴`（未认证）
4. 当 `currentView.type !== 'feed'` 时显示当前视图的 emoji + i18n 标签（通过 `viewLabel()` 函数映射 `VIEW_EMOJI` 表）
5. 右侧当前时间

### 底栏 (bottomBar)

同色 1 行，通过 `footerHint()` 函数生成上下文敏感的快捷键提示。核心逻辑：若 `canGoBack` 为 true 则在左侧显示 `Esc:返回`；右侧拼接视图专属的操作提示，通过 `KEY_MAP` 表（`feed`→`keys.feed` 等）查 i18n key。AI 聊天视图下，根据 `focusedPanel` 切换显示 AI 面板或主内容区的操作提示。[来源](packages/tui/src/components/App.tsx#L418-L424)

### 侧边栏 (Sidebar)

`Sidebar.tsx` 组件渲染一个带蓝色边框的垂直菜单。七个导航项各自显示 emoji、国际化标签和快捷键字符 `[t]`、`[n]` 等。当前激活的视图项以蓝色背景 `#1e40af` + `▶` 前缀高亮。通知视图有未读数徽章（`notifCount > 0` 时在标签后显示数字）。顶部显示面包屑——当前视图的中文名称，底部的 `← Esc返回` 仅在栈深 > 1 时出现。[来源](packages/tui/src/components/Sidebar.tsx#L62-L83)

---

## 视图路由：`currentView.type` 分发器

TUI 没有 URL 路由，完全依赖 `@bsky/app` 的 `useNavigation()` 返回的状态机驱动。核心是 `renderView()` 函数内部的 `switch` 表达式：

```typescript
const renderView = () => {
  if (showSettings) return <SettingsView ... />;
  switch (currentView.type) {
    case 'feed':       return /* PostList + FeedConfigOverlay */;
    case 'thread':     return <UnifiedThreadView ... />;
    case 'compose':    return /* Compose box + TextInput */;
    case 'profile':    return <ProfileView ... />;
    case 'notifications': return <NotifView ... />;
    case 'search':     return <SearchView ... />;
    case 'aiChat':     return <AIChatView ... />;
    case 'bookmarks':  return /* 书签列表 */;
    default:           return <Text>{t('common.unknownPage')}</Text>;
  }
};
```

每个 case 对应一个独立的组件或内联视图，通过 TypeScript 类型收窄安全地解构携带的上下文参数（如 `(currentView as { uri: string }).uri`）。`showSettings` 是独立于导航栈的覆盖层——它拦截所有视图，渲染 `SettingsView` 并用自己的 `goBack` 回调关闭。[来源](packages/tui/src/components/App.tsx#L278-L346)

**关键传递参数**：每个子视图都接收 `cols`/`rows`（终端尺寸）、`client`（BskyClient 实例）、`goBack`/`goTo`（导航回调）。AI 相关视图额外接收 `aiConfig`、`targetLang` 等。这确保了子视图完全自包含——它们不依赖全局状态，所有依赖通过 props 注入。

---

## 全局键盘分发器：`useInput` 的五级优先级

`useInput` 钩子是 TUI 的**唯一输入入口**。其设计哲学是**级联门控**：每个条件检查都可能在当前输入被处理后提前 `return`，阻止后续处理。

```
useInput((input, key) => {
  // Level 1: Tab / Esc — 全局，永远处理
  // Level 2: 子视图独占模式 — 返回/拦截
  // Level 3: 箭头键 + Enter — 列表导航
  // Level 4: Ctrl+G, 逗号 — 特殊命令
  // Level 5: 字母快捷键 — t/n/p/s/a/c/b → 导航
  // Level 6: 视图专属操作 — j/k/m/r/f/v/q 等
});
```

### Level 1：Tab 与 Esc（全局）

**Tab**：仅在 `aiChat` 视图下生效，在 `'ai'` 和 `'main'` 两个焦点目标之间切换。`focusedPanel` 状态控制着 AI 面板是否接收键盘输入，以及底栏提示文字。其他视图下 Tab 被忽略。[来源](packages/tui/src/components/App.tsx#L119-L121)

**Esc**：状态机式返回链。在 compose 视图下逐级退出 `draftSavePrompt` → `draftListOpen` → `imagePathInput` → 草稿保存提示 → `goBack()`。在其他非 feed 视图下调用 `goBack()`（弹出导航栈）。在 feed 视图下不执行任何操作（已在主页）。[来源](packages/tui/src/components/App.tsx#L122-L146)

### Level 2：子视图独占模式

三个视图类型拥有输入独占权：

| 视图 | 独占机制 | 说明 |
|------|---------|------|
| `compose` | `if (currentView.type === 'compose')` 内全部处理，不 return 到外层 | 管理 draftSavePrompt/draftListOpen/imagePathInput 子状态 |
| `aiChat` + `focusedPanel === 'ai'` | `if (... && focusedPanel === 'ai') return;` | AI 面板焦点时，所有按键直接交给 AIChatView 处理 |
| `search` | `if (currentView.type === 'search') return;` | 完整放行给 SearchView |
| `showFeedConfig` | `if (showFeedConfig) return;` | Feed 配置覆盖层拥有独立 `useInput` |

### Level 3：箭头键 + Enter

上下箭头和 `j`/`k` 分别控制 `feed` 视图的 `feedIdx` 和 `bookmarks` 视图的 `bookmarkIdx`。Enter 将当前选中帖子（`posts[feedIdx]`）或书签的 URI 传入 `goTo` 跳转到 thread 视图。其他视图的箭头键由子组件自行处理。[来源](packages/tui/src/components/App.tsx#L152-L168)

### Level 4：Ctrl+G 与逗号

`Ctrl+G`（`\x07`）从任意视图触发 AI 聊天，创建新会话并携带当前上下文帖子的 URI。逗号 `,` 打开设置面板。两者均绕过导航栈。[来源](packages/tui/src/components/App.tsx#L171-L173)

### Level 5：导航快捷键

| 键 | 视图 | 行为 |
|---|------|------|
| `t` | Feed 时间线 | `goHome()`，回到 feed |
| `n` | 通知 | `goTo({ type: 'notifications' })` |
| `p` | 个人主页 | `goTo({ type: 'profile', actor: config.blueskyHandle })` |
| `s` | 搜索 | `goTo({ type: 'search' })` |
| `a` | AI 对话 | `goTo({ type: 'aiChat', sessionId: uuid, contextPost: ... })` |
| `c` | 发帖 | `goTo({ type: 'compose' })`（非 thread 视图下） |
| `b` | 书签 | `goTo({ type: 'bookmarks' })` |

其中 `t` 和 `a` 有防重复保护——已在目标视图时不执行 `goTo`，避免导航栈膨胀。[来源](packages/tui/src/components/App.tsx#L194-L207)

### Level 6：视图专属操作

Feed 下的 `j`/`k`（滚动）、`m`（加载更多）、`r`（刷新）、`f`（Feed 配置）、`v`（切换书签）、`q`（查看引用的帖子）。Bookmarks 下的 `d`（删除书签）、`q`（查看引用帖）。PgUp（`\x1b[5~`）和 PgDn（`\x1b[6~`）在 feed 视图下跳转 5 行。[来源](packages/tui/src/components/App.tsx#L208-L258)

---

## PostList：视口渲染与选中高亮

`PostList` 组件面临的核心约束是：终端不具备浏览器 CSS 盒模型的精确度，Ink 的 `Box` 嵌套在跨终端时渲染差异大。解决方案是**预计算扁平化策略**。

### 从 PostView 到 PostLine 的展开

`PostItem.tsx` 中的 `postToLines()` 将每条 `PostView` 展开为一个 `PostLine[]` 数组，包含：

1. **作者行**：`displayName @handle [索引号]`，`isName: true`
2. **正文行**：经 `wrapLines()` 做 CJK 感知换行，每行宽度 = `cols - 4`
3. **视频行**：OSC 8 超链接 `🎬 查看视频`
4. **图片行**：每张图片一行 OSC 8 超链接 `🖼 图片 n`
5. **引用帖行**：以 `│` 缩进，`color: magenta` 区分
6. **@handle 和 #tag 行**：OSC 8 超链接到对应 bsky.app 页面
7. **统计行**：♥ 点赞 + ♺ 转发 + 💬 回复 + 时间
8. **空分隔行**：各帖子间留白

每行携带 `isSelected` 和 `isName` 标记。[来源](packages/tui/src/components/PostItem.tsx#L13-L120)

### 视口窗口计算

```typescript
const allLines = useMemo(() => {
  const lines: PostLine[] = [];
  for (let i = 0; i < posts.length; i++) {
    lines.push(...postToLines(posts[i]!, i, i === selectedIndex, width, t, locale));
  }
  return lines;
}, [posts, selectedIndex, width, t, locale]);

const visibleLines = height - 4; // header + margins
const selectedLineStart = allLines.findIndex(
  l => l.text.includes(`[${selectedIndex}]`) && l.isName
);
const viewStart = Math.max(0, Math.min(
  allLines.length - visibleLines,
  (selectedLineStart >= 0 ? selectedLineStart : 0) - Math.floor(visibleLines / 3)
));
```

算法逻辑：找到当前 `selectedIndex` 对应的作者行在 `allLines` 中的位置，将视窗起点移动到该行上方约 1/3 视窗高度处。当选中行接近列表底部时，`Math.min` 保证不超出总行数。[来源](packages/tui/src/components/PostList.tsx#L16-L40)

### 滚动指示器

当 `viewStart > 0` 时显示 `▲ xx% (n/m)`——百分比表示当前滚动进度，括号内是选中序号/总数。当底部有内容时显示 `▼ xx%`。彩色青色，dim 样式，不占用选择高亮。[来源](packages/tui/src/components/PostList.tsx#L42-L50)

### 选中高亮

`PostListItem` 根据 `line.isSelected` 控制样式：

- 选中行的作者行：`color: cyanBright` + `bold`
- 未选中的作者行：`color: green`
- 未选中的正文行：`dimColor`
- 引用帖行（`quoteUri` 非空）：`color: magenta` + 基于 `isSelected` 的 `dimColor`[来源](packages/tui/src/components/PostItem.tsx#L123-L137)

---

## UnifiedThreadView：光标与焦点的分离设计

`UnifiedThreadView` 实现了线程浏览中一个关键的人机交互模式：**光标（cursor）与焦点（focused）分离**。

### 两套状态

| 状态 | 变量 | 更新方式 | 视觉效果 |
|------|------|---------|---------|
| **光标** | `cursorIndex` | 箭头键 / `j`/`k` 即时移动 | `backgroundColor: #0e4a6e` 深蓝高亮 |
| **焦点** | `focused`（来自 `useThread`） | Enter 确认 / `h` 回退 | `backgroundColor: #1e40af` 亮蓝背景 + 详细展示 |

```typescript
const { flatLines, loading, error, focusedIndex, focused, themeUri } = useThread(client, uri);
const [cursorIndex, setCursorIndex] = useState(0);

// 箭头/ jk → 只移动光标
if (key.upArrow || input === 'k') { setCursorIndex(i => Math.max(0, i - 1)); return; }
if (key.downArrow || input === 'j') { setCursorIndex(i => Math.min(..., i + 1)); return; }

// Enter → 使光标所在行成为新焦点（跳转到该帖子的线程）
if (key.return && cursorLine?.uri && cursorLine.uri !== uri) {
  refreshThread(cursorLine.uri); return;
}

// h → 回到主题帖（最初的根帖）
if ((input === 'h' || input === 'H') && themeUri) { refreshThread(themeUri); return; }
```

### 设计意图

光标是**浏览定位器**——让用户在回复列表中快速预览每条帖子的作者和摘要，无需等待网络请求。焦点是**操作主体**——所有操作（点赞 `l`、转发 `r`、回复 `c`、书签 `v`、删除 `d`、翻译 `f`、关注 `u`、查看主页 `g`）都作用于焦点帖子，而非光标所在的帖子。

这种分离在长线程中至关重要：用户可以用 `j`/`k` 在 50+ 条回复中快速扫描，看到感兴趣的帖子后按 Enter 将其变为焦点，然后执行操作或查看完整的渲染（包括图片、视频、引用帖的完整展示）。[来源](packages/tui/src/components/UnifiedThreadView.tsx#L27-L33)

### 三层视觉结构

线程视图渲染三个区域，用 `── ... ──` 分隔线区分：

1. **主题帖区**（`themeLines`）：深度 < 0 的帖子和根帖子（不包含当前焦点）。光标可在此区域移动但 Enter 会触发线程跳转。
2. **焦点帖子**：完整渲染包含头像信息、正文、图片（OSC 8 超链接）、视频、外部链接、统计、引用帖嵌套渲染。蓝色背景高亮。关注状态指示器 `✅ 已关注` / `【u】 关注 @handle`。
3. **回复列表**（`replyLines`）：当前焦点帖子的直接回复（depth ≤ focusedDepth + 1）。每条回复显示作者、摘录文本（slice 200 字符）、媒体标签、统计数据。有子回复的帖子旁显示 `[+]` 标记。[来源](packages/tui/src/components/UnifiedThreadView.tsx#L123-L172)

### 回复展开

线程使用 `useThread` Hook 的 `expandReplies()` 函数按需加载更多回复。当光标停留在 `isTruncation` 行时，Enter 触发展开。这是典型的**渐进式加载**——TUI 不会一次性拉取整个线程。[来源](packages/tui/src/components/UnifiedThreadView.tsx#L50-L51)

---

## 终端鼠标追踪：ANSI 转义序列解析

`mouse.ts` 实现了 TUI 独占的终端鼠标支持——PWA 使用原生 DOM 事件，因此不需要此模块。

### 启用与禁用

```typescript
export function enableMouseTracking(stdout: WriteStream): void {
  try { stdout.write('\x1b[?1000h'); } catch {}
}
export function disableMouseTracking(stdout: WriteStream): void {
  try { stdout.write('\x1b[?1000l'); } catch {}
}
```

`\x1b[?1000h` 是 Xterm 的 DEC private mode 序列，通知终端将鼠标点击和滚动事件以 SGR 编码格式发送到 stdin。`\x1b[?1000l` 关闭追踪。[来源](packages/tui/src/utils/mouse.ts#L15-L20)

### 序列解析

```
完整序列: ESC [ M <button> <col+32> <row+32>
上滚: button = 64 (0x40)
下滚: button = 65 (0x41)
```

`parseMouseEvent()` 维护一个模块级 `mouseBuf: string` 缓冲区，逐字符拼接从 `process.stdin.data` 事件流入的数据。当检测到 `\x1b[M` 前缀且缓冲区长度 ≥ 6 时，提取三个字节：

- `button = mouseBuf.charCodeAt(3)`：64 表示上滚，65 表示下滚
- `col = mouseBuf.charCodeAt(4) - 32`：列坐标（从 1 开始）
- `row = mouseBuf.charCodeAt(5) - 32`：行坐标（从 1 开始）

防溢出保护：当缓冲区长度 > 20 且不以 `\x1b[M` 开头时清空缓冲区。[来源](packages/tui/src/utils/mouse.ts#L29-L47)

### 与 App 的集成

```typescript
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

滚动事件仅作用于 `feed` 和 `bookmarks` 视图，通过 `currentView.type` 门控。卸载时清理事件监听并发送关闭序列。[来源](packages/tui/src/components/App.tsx#L260-L273)

**限制**：不支持鼠标点击。原因是 Ink 的 `useInput` 在 raw mode 下会截获所有 stdin 数据，与 xterm 的鼠标点击序列（`\x1b[M` 开头）冲突。若需要点击支持，需绕过 `useInput` 在更低层级处理。

---

## SetupWizard：首次运行配置流程

`SetupWizard` 是一个**表单状态机**，在 TUI 入口处凭据缺失时渲染。它替代了传统 CLI 的参数解析，提供交互式配置体验。

### 七步状态机

```typescript
type Step = 'handle' | 'password' | 'provider' | 'model' | 'apikey' | 'scenario' | 'locale' | 'done';
```

每个步骤渲染不同的 UI：

| 步骤 | UI 控件 | 输入方式 | 数据收集 |
|------|---------|---------|---------|
| `handle` | TextInput | 回车提交 | Bluesky handle |
| `password` | TextInput | 回车提交 | App Password |
| `provider` | 箭头选择列表 | ↑↓ 选择 + 回车 | Provider（DeepSeek/Mistral/...） |
| `model` | 箭头选择列表 + 自定义输入 | ↑↓ + 回车 / "Custom model..." | 模型 ID |
| `apikey` | TextInput | 回车提交 | API Key |
| `locale` | 水平箭头选择 | ←→ + 回车 | 中/英/日 |
| `scenario` | 切换开关 | ↑↓ 切换 + 回车开关 + Tab 完成 | 场景模型覆盖 |
| `done` | 回车 | 回车 | 写入配置 |

### 配置持久化

完成时执行两个写操作：

1. **`.env` 文件**（通过 `writeFileSync`）：写入 `BLUESKY_HANDLE` 和 `BLUESKY_APP_PASSWORD`，路径为 `path.resolve(process.cwd(), '.env')`[来源](packages/tui/src/components/SetupWizard.tsx#L133-L139)

2. **`bsky-tui.config.json`**（通过 `saveTuiConfig`）：写入 `targetLang`、`translateMode`、`aiConfig`（`baseUrl`、`model`、`provider`、`reasoningStyle`、`thinkingEnabled`、`visionEnabled`）、`apiKeys`、`scenarioModels`。该文件不包含凭据，适合提交到版本控制（但文档仍建议不要提交）。[来源](packages/tui/src/components/SetupWizard.tsx#L142-L156)

### 配置重载

`cli.ts` 中的 `Root` 组件在 `SetupWizard.onComplete` 回调中重新调用 `dotenv.config({ override: true })` 和 `getConfigFromEnv()`，然后用新的 `AppConfig` 触发重渲染，使 `App` 组件挂载。[来源](packages/tui/src/cli.ts#L52-L65)

### 供应商/模型元数据驱动

提供商的列表来源于 `@bsky/core` 的 `PROVIDERS` 常量数组，每个 `ProviderInfo` 包含 `id`、`label`、`baseUrl`、`reasoningStyle` 和 `models: ModelInfo[]`。模型列表动态渲染，附带能力标签（`💭` thinking、`👁` vision）。用户可以选择列表中的模型，也可以输入自定义模型 ID（"Custom model..." 选项）。[来源](packages/tui/src/components/SetupWizard.tsx#L70-L72)

场景模型配置区（`scenario` 步骤）允许用户为 AI 聊天、翻译、润色三个场景分别指派不同模型。格式为 `providerId/modelId`，留空表示使用默认模型。[来源](packages/tui/src/components/SetupWizard.tsx#L34-L37)

---

## 与 PWA 的架构对比

| 维度 | TUI (Ink) | PWA (React DOM) |
|------|-----------|-----------------|
| 文本换行 | 手动 `visualWidth` + `wrapLines` 贪心算法 | CSS `word-wrap` + `overflow-wrap` |
| 路由 | `currentView` 状态机 + `useNavigation` | `useHashRouter` + `#/path?params` URL |
| 键盘输入 | `useInput` 集中式分级分发器 | DOM 事件 + 标准表单 |
| 鼠标 | ANSI 转义序列解析（仅 Xterm 滚动） | 原生 `click`/`scroll`/`wheel` |
| 图片展示 | OSC 8 可点击超链接 | `<img>` 标签渲染 |
| 图片压缩 | `sharp` 库 >1MB 自动压缩 | 浏览器原生支持 |
| 媒体上传 | `fs.readFileSync` + `client.uploadBlob` | `<input type=file>` + `FormData` |
| 状态持久化 | `configStore` 文件 + `.env` 文件 | `localStorage` + 浏览器 Storage API |
| 国际化 | `useI18n` + 运行时切换 | 相同 Hook + 即时生效 |

详见 [PWA 网页应用实现](pwa-网页应用实现.md) 了解更多。

---

## 推荐阅读

- [状态管理与路由系统](状态管理与路由系统.md) — `AppView` 类型系统、`NavigationController` 栈式导航的完整定义
- [TUI 快捷键与导航](tui-快捷键与导航.md) — 全部快捷键映射速查表
- [@bsky/app：React Hooks 层](bsky-app-共享逻辑与-hooks.md) — `useThread`、`useTimeline`、`useNavigation` 等跨端共享 Store 模式
- [国际化 i18n 系统](国际化-i18n-系统设计.md) — 页面所有 `t()` 调用背后的三语翻译引擎
- [配置指南](配置指南.md) — TUI 双重配置体系（`.env` + `bsky-tui.config.json`）详解