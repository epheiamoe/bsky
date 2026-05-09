# PWA 架构与组件映射

PWA 客户端（`@bsky/pwa`）与 TUI 客户端共享 100% 的业务逻辑——所有数据流、AI 引擎、认证、导航状态、草稿管理、Widget 注册表均来自 `@bsky/app` 包。差异仅在渲染层：PWA 使用 **React DOM + Tailwind CSS**，TUI 使用 **Ink（React for Terminal）**。理解这层映射，是掌握双界面架构的关键。

---

## 核心架构：AppView 联合类型

两个客户端的导航状态统一由 `AppView` 联合类型描述，定义在 `packages/app/src/state/navigation.ts`：

```typescript
export type AppView =
  | { type: 'feed'; feedUri?: string }
  | { type: 'detail'; uri: string }
  | { type: 'thread'; uri: string }
  | { type: 'compose'; replyTo?: string; quoteUri?: string; draftId?: string; initialText?: string }
  | { type: 'profile'; actor: string; profileTab?: string }
  | { type: 'notifications' }
  | { type: 'search'; query?: string; searchTab?: string }
  | { type: 'aiChat'; contextUri?: string; sessionId?: string; contextPost?: string; contextProfile?: string }
  | { type: 'bookmarks' }
  | { type: 'drafts' }
  | { type: 'components' }
  | { type: 'dm' }
  | { type: 'dmChat'; conversationId: string }
  | { type: 'lists'; actor?: string }
  | { type: 'listDetail'; uri: string; tab?: 'posts' | 'members' }
  | { type: 'about' }
  | { type: 'atplay' }
  | { type: 'atplaySocialCircle' };
```

[来源](packages/app/src/state/navigation.ts#L1-L19)

PWA 的 `App.tsx` 使用 `switch` 对 `currentView.type` 做分发，每个 `case` 渲染对应页面组件；TUI 的 `App.tsx` 做法完全相同。[来源](packages/pwa/src/App.tsx#L244-L354)

---

## 组件映射表：PWA ↔ TUI

下表中，"PWA 组件" 列列出 `packages/pwa/src/components/` 下的 React DOM 组件，"TUI 对应" 列列出 TUI 中等效的 Ink 组件或视图（来自 `@bsky/tui` 包），"路由路径" 列显示 `useHashRouter` 编码后的 URL 模式。

| PWA 组件 | TUI 对应 | AppView.type | 路由路径 |
|---|---|---|---|
| `LoginPage` | 无（TUI 使用 `.env`） | — | `/`（未登录） |
| `WelcomeCard` | 无 | — | 首次登录引导，设置后不再显示 |
| `FeedTimeline` | `FeedView`（ink-box 列表） | `feed` | `#/feed?feed=...` |
| `ThreadView` | `ThreadView`（ink-box 树） | `thread` | `#/thread?uri=...` |
| `ComposePage` | `ComposeView`（ink-text-input） | `compose` | `#/compose?replyTo=...&quoteUri=...&draftId=...&initialText=...` |
| `AIChatPage` | `AIChatView`（ink-box 对话） | `aiChat` | `#/ai?session=...&post=...&profile=...` |
| `ProfilePage` | `ProfileView`（ink-box） | `profile` | `#/profile?actor=...&tab=posts` |
| `SearchPage` | `SearchView` | `search` | `#/search?q=...&tab=top` |
| `NotifsPage` | `NotificationsView` | `notifications` | `#/notifications` |
| `BookmarkPage` | `BookmarksView` | `bookmarks` | `#/bookmarks` |
| `ListsPage` | `ListsView` | `lists` | `#/lists?actor=...` |
| `ListDetailPage` | — | `listDetail` | `#/list?uri=...&tab=posts\|members` |
| `ConvoListPage` | `DMsView` | `dm` | `#/dm` |
| `DMChatPage` | `DMChatView` | `dmChat` | `#/dm?conv=...` |
| `DraftsPage` | `DraftsView` | `drafts` | `#/drafts` |
| `AboutPage` | — | `about` | `#/about` |
| `ComponentsPage` | — | `components` | `#/components` |
| `AtPlayPage` | — | `atplay` | `#/atplay` |
| `AtPlaySocialCircle` | — | `atplaySocialCircle` | `#/atplay/social-circle` |

[来源](packages/pwa/src/App.tsx#L244-L354) | [来源](packages/pwa/src/hooks/useHashRouter.ts#L76-L167)

PWA 独有的组件（无 TUI 对应）：

| PWA 组件 | 用途 |
|---|---|
| `EditProfileModal` | 编辑用户头像、横幅和简介 |
| `WidgetModal` | 管理 Widget 启用/禁用/重排序 |
| `WidgetPanel` | 右侧面板，按视图渲染已启用的 Widget |
| `WidgetPicker` | 选择要激活的 Widget |
| `SettingsModal` | 配置 Bluesky 认证、AI 提供者、场景模型、通用设置（4 个 Tab） |
| `VideoCard` | 渲染嵌入的视频帖子 |
| `FeedHeader` | Feed 选择器头部，切换 following/discover/自定义 Feed |
| `AtPlayPage` | AT Play 实验功能入口页，列出所有可用实验卡片 |
| `AtPlaySocialCircle` | 社交圈分析页面：输入 handle → 分析互动数据 → 排名表 + Mermaid 图 |

[来源](packages/pwa/src/components/EditProfileModal.tsx#L1-L11) | [来源](packages/pwa/src/components/SettingsModal.tsx#L29)

底层容器的映射关系：

| TUI (Ink) | PWA (React DOM) |
|---|---|
| `<Box>` | `<div>` |
| `<Text>` | `<span>` / `<p>` |
| `useInput` | `onClick` / `onKeyDown` |
| `ink-text-input` | `<input>` / `<textarea>` |
| `borderStyle="single"` | `border: 1px solid` CSS |
| `color="cyan"` | `color: #00FFFF` CSS |

[来源](docs/PWA_GUIDE.md#L128-L138)

---

## useHashRouter：将 AppView 编码为 #/path URL

PWA 使用 **`useHashRouter`**（而非传统的 React Router）实现导航，原因是 PWA 部署在静态托管上（Cloudflare Pages、Netlify），不支持服务端 `pushState` fallback。哈希路由确保任意 URL 刷新后仍能定位到正确视图。[来源](packages/pwa/src/hooks/useHashRouter.ts#L6-L20)

### 编码规则

`encodeView(view)` 将 `AppView` 对象映射为哈希 URL。核心模式是 `#/{path}?{params}`：

```
feed       → #/feed?feed=at://... (默认: following/discover)
thread     → #/thread?uri=at://did:plc:xxx/app.bsky.feed.post/yyy
profile    → #/profile?actor=did:plc:xxx&tab=posts
compose    → #/compose?replyTo=...&quoteUri=...&draftId=...&initialText=...
aiChat     → #/ai?session=uuid&post=at://...&profile=did:plc:...
             #/ai?context=at://... (旧版兜底)
search     → #/search?q=关键词&tab=top
bookmarks  → #/bookmarks
lists      → #/lists?actor=did:plc:...
listDetail → #/list?uri=...&tab=members
dm         → #/dm (列表) 或 #/dm?conv=convId (单聊)
drafts     → #/drafts
about      → #/about
components → #/components
atplay     → #/atplay
atplaySocialCircle → #/atplay/social-circle
```

[来源](packages/pwa/src/hooks/useHashRouter.ts#L169-L247)

`ComposePage` 现在支持 `initialText` 预填充参数——`AtPlaySocialCircle` 的分享按钮利用此机制，将分析报告文本直接填入发帖框。[来源](packages/pwa/src/App.tsx#L285) | [来源](docs/ATPLAY.md#L184-L198)

### 访问时自动重定向到默认 Feed

`useHashRouter` 在初始化时检测哈希——如果为空、仅为 `/` 或 `/feed` 且无 `?feed=` 参数，则自动用 `getFeedConfig().defaultFeedUri`（或 `following`）替换当前历史记录条目，避免用户看到空白 Feed：[来源](packages/pwa/src/hooks/useHashRouter.ts#L27-L33)

```typescript
const raw = window.location.hash.replace(/^#/, '');
if (!raw || raw === '/' || raw === '/feed' || raw === '') {
  const defFeed = getFeedConfig().defaultFeedUri ?? BUILTIN_FEEDS.following;
  window.history.replaceState(null, '', `#/feed?feed=${encodeURIComponent(defFeed)}`);
}
```

[来源](packages/pwa/src/hooks/useHashRouter.ts#L29-L33)

### contextPost / contextProfile 持久化

AI 聊天页面的上下文注入最关键的两个参数——`contextPost` 和 `contextProfile`——被编码为 URL 参数 `&post=` 和 `&profile=`，确保页面刷新后不丢失：[来源](packages/pwa/src/hooks/useHashRouter.ts#L232-L243)

```typescript
// encodeView — aiChat 分支
case 'aiChat': {
  if (view.sessionId) {
    let url = `#/ai?session=${encodeURIComponent(view.sessionId)}`;
    if (post) url += `&post=${encodeURIComponent(post)}`;
    if (profile) url += `&profile=${encodeURIComponent(profile)}`;
    return url;
  }
  // ...旧版 contextUri 兜底
}
```

[来源](packages/pwa/src/hooks/useHashRouter.ts#L232-L243)

解析时，`parseHash` 从参数中恢复：[来源](packages/pwa/src/hooks/useHashRouter.ts#L151-L163)

```typescript
case '/ai': {
  const session = params.get('session');
  const post = params.get('post');
  const profile = params.get('profile');
  if (session) {
    const view: AppView = { type: 'aiChat', sessionId: decodeURIComponent(session) };
    if (post) (view as { contextPost?: string }).contextPost = decodeURIComponent(post);
    if (profile) (view as { contextProfile?: string }).contextProfile = decodeURIComponent(profile);
    return view;
  }
  // ...
}
```

[来源](packages/pwa/src/hooks/useHashRouter.ts#L151-L163)

这解决了 v0.3.0 之前"刷新页面后上下文丢失"的问题。[来源](docs/AI_CONTEXT.md#L233-L234)

### pushState + popstate 驱动

`useHashRouter` 通过 `window.history.pushState` 写入导航，通过 `popstate` 事件监听浏览器前进/后退。`goTo` 还会自动解析裸 `feed` 导航（不含 `feedUri`）为最后活跃或默认 Feed：[来源](packages/pwa/src/hooks/useHashRouter.ts#L46-L58)

```typescript
const goTo = useCallback((view: AppView) => {
  // Bare feed navigation → resolve to last active or default feed
  if (view.type === 'feed' && !view.feedUri) {
    const resolved = getLastFeedUri() ?? getFeedConfig().defaultFeedUri ?? BUILTIN_FEEDS.following;
    if (resolved) { view = { type: 'feed', feedUri: resolved }; }
  }
  const hash = encodeView(view);
  window.history.pushState(null, '', hash);
  setCurrentView(view);
  setCanGoBack(true);
}, []);
```

[来源](packages/pwa/src/hooks/useHashRouter.ts#L46-L58)

---

## Widget 系统：右侧面板

PWA 独有的 **Widget 系统** 是一个可插拔的右侧面板组件注册表，无 TUI 对应。`Layout` 根据当前视图类型渲染 `WidgetPanel`，动态显示匹配的 Widget。[来源](packages/pwa/src/App.tsx#L91-L135) | [来源](packages/pwa/src/components/Layout.tsx#L60-L130)

### Widget 注册

`App.tsx` 的初始化 Effect 中注册了 6 个 Widget：

| Widget ID | 渲染组件 | 绑定视图 | 默认打开 |
|---|---|---|---|
| `polish` | `PolishWidget` | `compose` | 是 |
| `profilePreview` | `ProfilePreviewWidget` | `thread` | 是 |
| `suggestedFollows` | `SuggestedFollowsWidget` | 全部 | 否 |
| `suggestedFeeds` | `SuggestedFeedsWidget` | 全部 | 否 |
| `trends` | `TrendsWidget` | 全部 | 否 |
| `aiChat` | `AIChatWidget`（含 `AIChatHeaderButtons`） | 全部 | 否 |

[来源](packages/pwa/src/App.tsx#L91-L135)

Widget 的启用状态持久化到 `AppConfig.enabledWidgets` 数组中（localStorage）。当进入全屏 `AIChatPage` 时，`Layout` 自动禁用 `aiChat` Widget 以避免重叠；离开时恢复：[来源](packages/pwa/src/components/Layout.tsx#L95-L109)

```typescript
useEffect(() => {
  if (currentView.type === 'aiChat') {
    const current = getEnabledWidgetIds();
    if (current.includes('aiChat')) { disableWidget('aiChat'); }
  } else if (widgetOrderRef.current.length > 0) {
    initEnabledWidgets(widgetOrderRef.current);
    widgetOrderRef.current = [];
  }
}, [currentView.type]);
```

[来源](packages/pwa/src/components/Layout.tsx#L96-L109)

---

## AI Chat 子组件架构

`AIChatPage` 将 AI 消息渲染拆分为 4 个独立子组件，所有位于 `components/ai/` 目录下：[来源](packages/pwa/src/components/ai/index.ts#L1-L5)

| 组件 | 用途 |
|---|---|
| `UserMessage` | 用户消息气泡，支持图片附件预览 |
| `AssistantMessage` | 助手回复渲染，支持 Markdown 格式 |
| `ThinkingCard` | 折叠式思维链展示（仅支持 `thinking` 字段的模型） |
| `ToolCard` | 工具调用卡片——显示调用名称、参数、展开/折叠式结果 |

这些组件取代了旧版 AIChatPage 中的内联渲染逻辑，使代码更模块化，也便于 TUI 未来复用类似设计。[来源](packages/pwa/src/components/AIChatPage.tsx#L8)

---

## 事件处理差异：TUI 的 useInput vs PWA 的 onClick/onKeyDown

| 维度 | TUI (Ink) | PWA (React DOM) |
|---|---|---|
| 输入模型 | 键盘优先，全局 `useInput` 捕获按键流 | 鼠标/触摸优先，`onClick` + 表单 `onKeyDown` |
| 滚动 | 上下箭头 / `jk` 逐行滚动 | 触摸滚动 / 鼠标滚轮 / `@tanstack/react-virtual` |
| 返回 | `Esc` | 浏览器返回按钮 / 页面内 `←` 按钮（`goBack`） |
| 回复 | `R` 键 | 点击 `Reply` 按钮（`PostActionsRow`） |
| 翻译 | `T` 键 | 点击 `Translate` 按钮 |
| 展开线程 | `H` 键 | 点击帖子卡片 → `goTo({ type: 'thread', uri })` |
| AI 分析 | `A` 键 → AI 面板 | 点击 AI 按钮 → `goTo({ type: 'aiChat', ... })` |
| 发帖 | 输入 `:p` 命令 | 点击 `Compose` 按钮 → 弹出 Composer |
| 输入焦点 | `Tab` 切换焦点 | 鼠标点击聚焦 `<input>` / `<textarea>` |

[来源](docs/PWA_GUIDE.md#L112-L127) | [来源](packages/pwa/src/components/AIChatPage.tsx#L155-L163)

PWA 的 `AIChatPage` 中，`onKeyDown` 处理 Enter 发送消息（Shift+Enter 换行）：[来源](packages/pwa/src/components/AIChatPage.tsx#L155-L163)

```typescript
const handleKeyDown = useCallback(
  (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  },
  [handleSend],
);
```

对比 TUI 中 `useInput` 的全局按键分发，PWA 的事件绑定在具体 DOM 元素上，利用事件冒泡机制。这意味着 PWA 天然支持多焦点区域（多个 `<input>`、`<textarea>`、`<button>`），而 TUI 需要手动管理焦点栈。

---

## AI 上下文注入架构

PWA 与 TUI 在上下文注入上的架构完全一致，由 `useAIChat` 的三个 Effect 分工驱动。完整的架构流程图参见 [AI 上下文注入机制](ai-上下文注入机制.md)：

```
点击 AI 按钮 (ThreadView/ProfilePage/PostActionsRow)
    │  goTo({ type: 'aiChat', sessionId: uuid, contextPost: uri })
    ▼
useHashRouter.encodeView → 编码到 URL
    │  #/ai?session=uuid&post=at://did:plc:xxx/app.bsky.feed.post/yyy
    ▼
App.tsx → AIChatPage
    │  contextPost / contextProfile 作为 props 传入
    ▼
useAIChat(client, aiConfig, contextUri?, options?)
    │
    ├─► Effect 1 (chatId 变化): 清空 + 注入 system prompt + 引导问题
    │
    ├─► Effect 2 (storage restore): 从 IndexedDB 恢复 context
    │
    ├─► Effect 3 (client 就绪): tools 初始化 + context 变化时重新注入
    │
    └─► Auto-start Effect: 仅 profile 上下文 → 自动发送分析消息
```

[来源](docs/AI_CONTEXT.md#L5-L26)

### viewContext 追踪

PWA 的 `App.tsx` 新增了一个 `viewContext` 状态，追踪进入 AI Chat 之前的最后一个非 AI 视图，用于 Widget 上下文传递：[来源](packages/pwa/src/App.tsx#L150-L156)

```typescript
const [viewContext, setViewContext] = useState<AppView | null>(null);
useEffect(() => {
  if (currentView.type !== 'aiChat' && currentView.type !== 'components') {
    setViewContext(currentView);
  }
}, [currentView]);
```

[来源](packages/pwa/src/App.tsx#L150-L156)

PWA 与 TUI 在传递 context 时的差异在于：TUI 将 `contextPost` 作为 `useAIChat` 的第三个参数（`contextUri`）传入；PWA 将第三个参数设为 `undefined`，全部通过 `options.contextPost` / `options.contextProfile` 传入。两种方式均有效。[来源](docs/AI_CONTEXT.md#L237)

---

## 场景模型配置与 AppConfig

PWA 的 `AppConfig` 支持 **per-scenario 模型重载**，允许用户为 AI 聊天、翻译、润色分别指定不同的模型/提供商。配置持久化在 `localStorage`（键 `bsky_app_config`）：[来源](packages/pwa/src/hooks/useAppConfig.ts#L5-L22)

```typescript
export interface AppConfig {
  aiConfig: AIConfig;           // 基础 AI 配置
  targetLang: string;           // 目标语言
  translateMode: 'simple' | 'json';
  darkMode: boolean;
  thinkingEnabled: boolean;     // 思维链开关
  visionEnabled: boolean;       // 多模态视觉开关
  apiKeys: Record<string, string>;  // 每个提供商独立 API 密钥
  scenarioModels: {             // 场景模型重载
    aiChat: string;             // "provider/model" 格式
    translate: string;
    polish: string;
  };
  enabledWidgets: string[];     // 已启用 Widget ID 列表
}
```

[来源](packages/pwa/src/hooks/useAppConfig.ts#L5-L22)

`App.tsx` 中的 `resolveScenarioConfig` 函数将 `"provider/model"` 字符串解析为完整的 `AIConfig` 对象，合并提供商的基础 URL、API 密钥、模型能力（thinking/vision）：[来源](packages/pwa/src/App.tsx#L59-L78)

```typescript
const resolveScenarioConfig = useCallback((scenarioModel: string): AIConfig => {
  if (!scenarioModel || !scenarioModel.includes('/')) return { ...appConfig.aiConfig };
  const [providerId, model] = scenarioModel.split('/');
  const provider = getProviderById(providerId);
  const modelInfo = provider ? getModelInfo(providerId, model) : undefined;
  return {
    ...appConfig.aiConfig,
    baseUrl: provider?.baseUrl || appConfig.aiConfig.baseUrl,
    model, apiKey: appConfig.apiKeys?.[providerId] || appConfig.aiConfig.apiKey,
    provider: provider?.id,
    reasoningStyle: provider?.reasoningStyle,
    thinkingEnabled: modelInfo?.thinking ?? true,
    visionEnabled: modelInfo?.vision ?? false,
  };
}, [appConfig]);
```

[来源](packages/pwa/src/App.tsx#L60-L78)

`SettingsModal` 提供 4 个 Tab 页面来配置这些值：**Bluesky**（重新登录）、**AI**（基础模型/API 密钥）、**Scenario**（场景模型重载）、**General**（语言/主题/思维链）。[来源](packages/pwa/src/components/SettingsModal.tsx#L29)

---

## Sidebar 导航

`Sidebar` 组件定义在 `packages/pwa/src/components/Sidebar.tsx`，包含 9 个核心导航项和 1 个次级入口（组件页面）。其中 v0.7.0 新增的 **AT Play** 入口使用 `flask-conical` 图标，导航至 `#/atplay`：[来源](packages/pwa/src/components/Sidebar.tsx#L17-L28)

```typescript
const SIDEBAR_TABS = [
  { icon: 'home',                  key: 'nav.feed',          type: 'feed' },
  { icon: 'bell',                  key: 'nav.notifications', type: 'notifications' },
  { icon: 'message-square',        key: 'nav.dm',            type: 'dm' },
  { icon: 'compass',               key: 'nav.search',        type: 'search' },
  { icon: 'bookmark',              key: 'nav.bookmarks',     type: 'bookmarks' },
  { icon: 'list',                  key: 'nav.lists',         type: 'lists' },
  { icon: 'at-sign',               key: 'nav.profile',       type: 'profile' },
  { icon: 'astroid-as-AI-Button',  key: 'nav.aiChat',        type: 'aiChat' },
  { icon: 'pen-line',              key: 'nav.compose',       type: 'compose' },
  { icon: 'flask-conical',         key: 'nav.atplay',        type: 'atplay' },
];
```

[来源](packages/pwa/src/components/Sidebar.tsx#L17-L28)

每个导航项会根据 `currentView.type` 自动高亮。`notifications`、`compose`、`dm` 三项支持未读计数徽章（通知数、草稿数、私信数）。[来源](packages/pwa/src/components/Sidebar.tsx#L58-L72)

---

## 推荐阅读

- [导航与状态管理](导航与状态管理.md) — `AppView` 联合类型的纯状态机实现，`createNavigation` 的发布订阅机制
- [React Hooks 架构与 Store 模式](react-hooks-架构与-store-模式.md) — `@bsky/app` 的 Hook 桥接模式，20+ Hook 全景
- [AI Chat 与聊天历史](ai-chat-与聊天历史.md) — `useAIChat` 的双模式流式/非流式实现，ChatStorage 接口
- [PWA 存储与离线能力](pwa-存储与离线能力.md) — IndexedDB 聊天存储、localStorage 配置持久化、Service Worker
- [Widget 系统与组合](widget-系统与组合.md) — 可插拔 Widget 注册表、视图绑定、ComposePage 双向同步
- [国际化（i18n）与主题](国际化-i18n-与主题.md) — 三语言切换、CSS 变量暗色模式在 PWA 中的应用
- [AI 上下文注入机制](ai-上下文注入机制.md) — 三个 Effect 的分工、system prompt 组装、扩展新上下文类型
- [AT Play 实验功能](at-play-实验功能.md) — 实验性功能游乐场架构、社交圈分析数据管线、Compose 预填充 API