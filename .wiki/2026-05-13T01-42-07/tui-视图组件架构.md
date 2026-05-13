# TUI 视图组件架构

`App.tsx` 是整个 TUI 界面的 **单一入口组件**，同时承担了键盘事件中枢、动态布局计算和 15 个视图的挂载调度三项职责。这是一个典型的"厚控制器"模式——所有分支逻辑集中在 ~400 行的 `useInput` 回调中，通过条件守卫链依次裁决。

---

## 1. 键盘事件中枢：条件守卫链

单一 `useInput` 回调（第 218–595 行）按以下优先级顺序裁决每个键盘事件。一旦命中 `return`，后续分支不再执行：

```
Tab / Escape ──→ AI面板独占 ──→ 叠加层守卫 ──→ 方向键 ──→ Enter
    │                │               │             │          │
    │                │          showFeedConfig    ↑/↓       feed/bookmarks
    │                │          creatingList      │          提交/thread
    │                │          editingListUri    └──→ j/k
    │                │                                              │
    ▼                ▼                                          Ctrl+G → AI Chat
Esc: 后退/退出       focusedPanel === 'ai' → 跳过                    , → Settings
Tab: AI焦点切换        整段 handler                                   单字母 → 全局导航
                                                                              │
                                                                         t/n/p/s/a/c/b/L/m/?
                                                                              │
                                                                    ──→ 视图专属键
                                                                         feed: j/k/m/r/f/v/q
                                                                         bookmarks: j/k/r/d/q
                                                                         lists: j/k/r/d/c/e
                                                                         listDetail: j/k/r/tab/e
                                                                         dm: j/k/r/enter
```

**守卫阶段（第 219–253 行）：**

| 守卫条件 | 行为 |
|---|---|
| `key.tab` | AI 聊天双面板焦点切换；多帖 compose 切换活动帖子索引 |
| `key.escape` | 逐层退出：创建列表 → 编辑列表 → Feed 配置 → 搜索（交予子组件）→ AI 聊天聚焦退出/后退 → Compose 草稿保存提示/草稿列表/图片路径 → 通用 `goBack()` |
| `focusedPanel === 'ai'` | 键盘事件完全交由 `AIChatView` 内部 `useInput` 处理 |
| `showFeedConfig` | 跳过所有全局键，由 `FeedConfigOverlay` 内部 `useInput` 处理 |
| `creatingList \|\| editingListUri` | 跳过所有全局键，内联 `TextInput` 捕获输入 |

[来源](packages/tui/src/components/App.tsx#L218-L253)

**全局导航键（第 489–498 行）：** 所有字母快捷键均为小写 `k` 比较（`k = input.toLowerCase()`），但 `L`（列表）和 `m`（私信）使用大写字母以区分同首字母的不同视图：

| 键 | 目标视图 | 特殊守卫 |
|---|---|---|
| `t` | 回到 `feed` 主页 | 不在 AI Chat 时执行 |
| `n` | `notifications` | — |
| `p` | `profile` | — |
| `s` | `search` | — |
| `a` | `aiChat` 新会话 | 不在 AI Chat 时 |
| `c` | `compose` | 不在 thread 时 |
| `b` | `bookmarks` | — |
| `L` | `lists` | 大写避免与 feed 的 `l` 冲突 |
| `m` | `dm` | 不在 feed 时（feed 中 `m` = loadMore） |
| `?` | `about` | — |

[来源](packages/tui/src/components/App.tsx#L489-L498)

**视图专属键（第 502–594 行）：** 各视图在 `currentView.type` 守卫下独立处理。`j/k` 普遍用于上下导航，`r` 用于刷新，`v`（收藏切换）、`q`（跳转引用帖子）、`f`（Feed 配置）等为特定视图保留。

---

## 2. 动态布局计算

布局在每次渲染时即时计算（第 618–619 行），基于终端宽度 `cols`：

```typescript
const sidebarW = Math.max(16, Math.floor(cols * 0.14));
const mainW = cols - sidebarW - 2;
```

- **sidebarW：** 取 `cols * 0.14` 与 16 的最大值，确保侧边栏至少有 16 列宽容纳快捷键提示
- **mainW：** 剩余宽度减去 2 列边框边距
- **rows：** 用于 `PostList`、`NotifView`、列表等组件的可视区域计算，传入 `rows - 5` 为内容区高度（减去顶栏 1、边框 2、底栏 1、状态栏 1）

终端大小变化通过 `stdout.on('resize', ...)` 事件捕获，更新 `cols` 和 `rows` 状态触发重渲染。

[来源](packages/tui/src/components/App.tsx#L48-L55)

---

## 3. 视图挂载/卸载条件

`renderView()` 函数（第 623–865 行）是一个大型 `switch/case`，通过 `currentView.type` 决定渲染哪个视图组件。此外还有两个**叠加层**优先级高于视图：

```
showSettings === true  ?  SettingsView
                          │
currentView.type === ???  └──→ switch/case
```

| 视图类型 | 渲染的组件 | 挂载条件 | 卸载触发 |
|---|---|---|---|
| `feed` | 内联 `PostList` + 可选 `FeedConfigOverlay` | `currentView.type === 'feed'` | `goHome()` 或 `goTo()` 其他视图 |
| `thread` | `UnifiedThreadView` | `currentView.type === 'thread'` | `goBack()` 或 `goTo()` |
| `compose` | `ComposeView` | `currentView.type === 'compose'` | `goBack()`（含草稿保存检查） |
| `profile` | `ProfileView` | `currentView.type === 'profile'` | `goBack()` |
| `notifications` | `NotifView` | `currentView.type === 'notifications'` | `goBack()` 或 Enter 跳转 thread |
| `search` | `SearchView` | `currentView.type === 'search'` | `goBack()` |
| `aiChat` | `AIChatView` | `currentView.type === 'aiChat'` | Esc（AI 面板失去焦点）→ `goBack()` |
| `lists` | 内联列表渲染（含创建/编辑输入框） | `currentView.type === 'lists'` | `goBack()` |
| `bookmarks` | 内联书签渲染 | `currentView.type === 'bookmarks'` | `goBack()` |
| `listDetail` | 内联列表详情（posts/members 双 tab） | `currentView.type === 'listDetail'` | `goBack()` |
| `dm` | 内联 + `DMListView` | `currentView.type === 'dm'` | `goBack()` 或 Enter 打开对话 |
| `dmChat` | `DMChatView` | `currentView.type === 'dmChat'` | `goBack()` |
| `about` | 内联文本渲染 | `currentView.type === 'about'` | `goBack()` |
| `settings` | `SettingsView` | `showSettings === true` | `setShowSettings(false)` |

[来源](packages/tui/src/components/App.tsx#L623-L865)

**关键挂载守卫：** `authLoading` 为 `true` 时，所有视图均被替换为"连接中"提示文本，只有 Sidebar 保持可见。这不阻断键盘事件——handler 依然运行，但导航跳转可能因 `client === null` 而失败。

[来源](packages/tui/src/components/App.tsx#L880-L883)

---

## 4. useInput 注册顺序与冲突规避

Ink 模型中，`useInput` 注册的 handler **全部独立接收事件**，不存在 DOM 事件冒泡或 `stopPropagation`。冲突规避完全依赖**条件守卫链** + **子组件主动接管**。

### 4.1 同一时间可能活跃的 useInput

在典型运行状态下，最多 **4–5 个** `useInput` handler 同时注册：

| 编号 | 所在组件 | 文件 | 活跃条件 | 职责 |
|---|---|---|---|---|
| ① | `App.tsx` 主 handler | `App.tsx#L218` | 始终 | 全局导航 + 视图专属键 + 叠加层守卫 |
| ② | `FeedConfigOverlay` | `App.tsx#L921` | `showFeedConfig === true` | Feed URI 选择、添加、删除 |
| ③ | 子视图 handler | 多个文件 | 视图挂载时 | 视图内部键盘操作 |

子视图内的 `useInput` 分布：

| 子视图 | 文件 | 所在行 | 备注 |
|---|---|---|---|
| `NotifView` | `NotifView.tsx` | L20 | Esc/j/k/r/Enter |
| `ProfileView` | `ProfileView.tsx` | L49 | 多模式：关注列表、用户搜索、tab 切换 |
| `SearchView` | `SearchView.tsx` | L54 | 搜索输入 + 结果导航 + tab 切换 |
| `AIChatView` | `AIChatView.tsx` | L169, L254 | **两个** useInput：聊天消息输入 + 历史会话选择/删除 |
| `UnifiedThreadView` | `UnifiedThreadView.tsx` | L68 | Esc/j/k/h/r/l/v/b/f/etc. 复杂键位映射 |
| `DMChatView` | `DMChatView.tsx` | L35 | Esc/j/k/r/reaction mode |
| `SettingsView` | `SettingsView.tsx` | L108 | Tab/j/k/r/model selection |
| `SetupWizard` | `SetupWizard.tsx` | L108 | 初始化向导（独立运行，不与 App 共存） |

[来源](packages/tui/src/components/NotifView.tsx#L20-L32) [来源](packages/tui/src/components/ProfileView.tsx#L49) [来源](packages/tui/src/components/SearchView.tsx#L54) [来源](packages/tui/src/components/AIChatView.tsx#L169) [来源](packages/tui/src/components/UnifiedThreadView.tsx#L68) [来源](packages/tui/src/components/DMChatView.tsx#L35) [来源](packages/tui/src/components/SettingsView.tsx#L108)

### 4.2 冲突规避策略

**策略一：App 主 handler 对子视图主动退让。** 当 `currentView.type === 'search'` 时，主 handler 在第 487 行直接 `return`，将所有键位交给 `SearchView` 的 `useInput`。同理，`aiChat` 视图在 `focusedPanel === 'ai'` 时也完全退让。

**策略二：子视图内部消化。** 如 `NotifView` 在 handler 中处理 Esc 后调用 `goBack()`，此时 `currentView.type` 变化，App 主 handler 的接下来的输入自然分派到新视图。

**策略三：FeedConfigOverlay 的直接守卫。** 由于 `FeedConfigOverlay` 渲染在 `feed` 视图内部而非独立视图，App 主 handler 在第 249 行通过 `showFeedConfig` 显式守卫跳过所有后续逻辑，而 `FeedConfigOverlay` 内部 `useInput` 此时接管。

**策略四：双重 useInput 的 AIChatView。** `AIChatView` 注册了两个 `useInput`——第二个（第 254 行）专门处理历史会话列表的导航和删除，这与消息输入（第一个，第 169 行）形成两阶段切换。两者通过 `showHistory` 状态的切换来互斥激活。

[来源](packages/tui/src/components/App.tsx#L246-L249) [来源](packages/tui/src/components/AIChatView.tsx#L169-L254)

---

## 5. 15 视图组件清单

以下是 TUI 中所有视图组件的完整清单。其中 10 个由 `AppView` 联合类型驱动，另有 5 个辅助组件/面板。

| # | 组件名 | 文件路径 | 职责 |
|---|---|---|---|
| 1 | `Sidebar` | `packages/tui/src/components/Sidebar.tsx` | 左侧导航栏：面包屑、9 个 Tabs 导航（含通知角标）、返回/主页按钮 |
| 2 | `PostList` | `packages/tui/src/components/PostList.tsx` | Feed 帖子列表：基于 `PostItem` 的行预计算、选区居中滚动、滚动百分比指示器 |
| 3 | `PostItem` | `packages/tui/src/components/PostItem.tsx` | 单条帖子的多行渲染：作者行 + CJK 感知文本换行 + 图片/视频/引用链接 |
| 4 | `ProfileView` | `packages/tui/src/components/ProfileView.tsx` | 用户资料页：头像/简介/banner、posts/replies 双 tab、关注/取关、关注列表弹层 |
| 5 | `SearchView` | `packages/tui/src/components/SearchView.tsx` | 搜索面板：4 tab（热门/最新/用户/动态源）、搜索输入框、结果导航、状态持久化 |
| 6 | `NotifView` | `packages/tui/src/components/NotifView.tsx` | 通知列表：各类型通知预览（关注/转发/点赞/回复）、Enter 跳转 thread |
| 7 | `AIChatView` | `packages/tui/src/components/AIChatView.tsx` | AI 聊天：多轮对话、历史会话浏览器、Markdown 渲染、图片输入、工具调用确认门、导出/复制 |
| 8 | `AIPanel` | `packages/tui/src/components/AIPanel.tsx` | 内联 AI 助手面板（被 `AIChatView` 替代，未在 App 中使用） |
| 9 | `UnifiedThreadView` | `packages/tui/src/components/UnifiedThreadView.tsx` | 帖子线程：扁平化 thread 渲染、主题/回复分区、喜欢/转发/回复/书签、翻译 |
| 10 | `ComposeView` | `packages/tui/src/components/ComposeView.tsx` | 发帖编辑器：多帖模式、媒体上传、草稿管理、润色工具（AI polish）、ALT 文本输入 |
| 11 | `DMListView` | `packages/tui/src/components/DMListView.tsx` | 私信对话列表：最近对话、未读计数、会话成员显示 |
| 12 | `DMChatView` | `packages/tui/src/components/DMChatView.tsx` | 私信聊天：消息历史和发送、Emoji reaction 选择器 |
| 13 | `SettingsView` | `packages/tui/src/components/SettingsView.tsx` | 设置面板：4 tab（模型选择/场景配置/语言/API Keys）、配置持久化 |
| 14 | `SetupWizard` | `packages/tui/src/components/SetupWizard.tsx` | 首次运行向导：Bluesky Handle → 密码 → PDS → LLM 提供商 → API Key → 语言 |
| 15 | `Dialogs` | `packages/tui/src/components/Dialogs.tsx` | 确认对话框组件（ConfirmDialog）：Y/N 操作确认、通用提示框 |

**注意：** `AppView` 联合类型中还定义了 `detail`、`drafts`、`components`、`atplay`、`atplaySocialCircle` 五种视图类型，但它们**未在 `renderView()` 中实现**，由 `default` 分支统一渲染"未知页面"文本。`SetupWizard` 在 `cli.ts` 中条件渲染（当检测到无配置时），与 `App` 组件互斥。

[来源](packages/tui/src/components/App.tsx#L626-L864) [来源](packages/app/src/state/navigation.ts#L1-L19)

---

## 6. 键盘事件流序列图

```
用户按键
    │
    ▼
┌─ Ink 运行时 ─────────────────────────────────────┐
│  同时广播给所有 useInput handler                   │
│  (无事件冒泡/阻止传播机制)                         │
└──────────────────────────────────────────────────┘
    │                                │
    ▼                                ▼
① App.tsx 主 handler           ② 子视图 handler
   (line 218)                     (如 NotifView, ProfileView...)
    │                                │
    ├─ Tab/Esc 处理                  ├─ 处理视图内部键位
    │   │                            │   (j/k/r/Enter/Esc...)
    │   ▼                            │
    ├─ AI 面板守卫                   └─ 调用 goBack/goTo
    │   └─ focusedPanel=ai? → return    改变 currentView
    │
    ├─ 叠加层守卫
    │   ├─ showFeedConfig? → return
    │   ├─ creatingList? → return
    │   └─ editingListUri? → return
    │
    ├─ 方向键 / Enter (feed/bookmarks)
    │
    ├─ Ctrl+G / , (AI Chat / Settings)
    │
    ├─ 全局导航单键 (t/n/p/s/a/c/b/L/m/?)
    │
    └─ 视图专属键块 (j/k/m/r/f/v/q 等)
        受 currentView.type 守卫

同时，FeedConfigOverlay 内 useInput
在 showFeedConfig=true 时独立处理其列表导航
```

**关键结论：** 多个 `useInput` 之间不存在优先级内置机制，冲突通过**守卫前置 + 子视图独立处理 + App 主动退让**三层策略解决。App 主 handler 作为"第一道闸门"，对 Tab/Esc 等通用键优先处理，对 `escape` 键实现"从最内层叠加层到全局回退"的逐层退出语义。

---

## 推荐阅读

- [导航状态机](导航状态机.md) — `AppView` 联合类型定义和 Stack 驱动的路由状态转换
- [React Hooks 体系](react-hooks-体系.md) — 所有数据 hooks 的签名与返回类型
- [TUI 入口与配置加载](tui-入口与配置加载.md) — `SetupWizard` 与 `App` 的启动逻辑
- [TUI 工具函数与 Markdown 渲染](tui-工具函数与-markdown-渲染.md) — CJK 文本换行、鼠标追踪等底层工具