现在我已掌握全部素材，开始撰写页面。

---

# Hooks 全览与复用模式

项目中所有共享 React Hooks 位于 `packages/app/src/hooks/`，它们是将纯逻辑层（core）的 Store 或内联状态桥接到 React 渲染层的**唯一通道**。这是三层架构（core → app → tui/pwa）中 app 层的关键职责：**纯 TypeScript 状态管理 + React 订阅封装**。

## Hook → Store 映射全表

18 个 Hook 覆盖了认证、时间线、帖子详情、AI 对话、导航、国际化、滚动恢复等所有功能域。按照状态来源可分为三类：**Store 封装**（使用独立的 state 模块）、**模块级单例**（模块作用域的共享变量）和**内联状态**（`useState` + 闭包）。

| Hook | 状态来源 | 文件路径 |
|------|----------|----------|
| `useAuth` | `createAuthStore()` | [`hooks/useAuth.ts`](../../packages/app/src/hooks/useAuth.ts) |
| `useTimeline` | `createTimelineStore()` | [`hooks/useTimeline.ts`](../../packages/app/src/hooks/useTimeline.ts) |
| `usePostDetail` | `createPostDetailStore()` | [`hooks/usePostDetail.ts`](../../packages/app/src/hooks/usePostDetail.ts) |
| `useNavigation` | `createNavigation()` | [`hooks/useNavigation.ts`](../../packages/app/src/hooks/useNavigation.ts) |
| `useThread` | 内联 `useState` | [`hooks/useThread.ts`](../../packages/app/src/hooks/useThread.ts) |
| `useCompose` | 内联 `useState` | [`hooks/useCompose.ts`](../../packages/app/src/hooks/useCompose.ts) |
| `useAIChat` | `AIAssistant` 实例（core 层类） | [`hooks/useAIChat.ts`](../../packages/app/src/hooks/useAIChat.ts) |
| `useDrafts` | `createDraftsStore()` | [`hooks/useDrafts.ts`](../../packages/app/src/hooks/useDrafts.ts) |
| `useI18n` | Singleton `getI18nStore()` | [`i18n/useI18n.ts`](../../packages/app/src/i18n/useI18n.ts) |
| `useChatHistory` | `FileChatStorage` 实例 | [`hooks/useChatHistory.ts`](../../packages/app/src/hooks/useChatHistory.ts) |
| `useTranslation` | 内联 Map 缓存 | [`hooks/useTranslation.ts`](../../packages/app/src/hooks/useTranslation.ts) |
| `useProfile` | 内联 `useState` | [`hooks/useProfile.ts`](../../packages/app/src/hooks/useProfile.ts) |
| `useSearch` | 内联 `useState` | [`hooks/useSearch.ts`](../../packages/app/src/hooks/useSearch.ts) |
| `useNotifications` | 内联 `useState` | [`hooks/useNotifications.ts`](../../packages/app/src/hooks/useNotifications.ts) |
| `useBookmarks` | 内联 `useState` | [`hooks/useBookmarks.ts`](../../packages/app/src/hooks/useBookmarks.ts) |
| `useActiveFeed` | 模块级 `_lastFeedUri` 变量 | [`hooks/useActiveFeed.ts`](../../packages/app/src/hooks/useActiveFeed.ts) |
| `usePostActions` | 模块级 `Set`/`Map` + ticker | [`hooks/usePostActions.ts`](../../packages/app/src/hooks/usePostActions.ts) |
| `useScrollRestore` | 模块级 `_scrollTops` Map | [`hooks/useScrollRestore.ts`](../../packages/app/src/hooks/useScrollRestore.ts) |

[来源](docs/HOOKS.md) · [来源: useAuth.ts](../../packages/app/src/hooks/useAuth.ts#L1-L19) · [来源: useActiveFeed.ts](../../packages/app/src/hooks/useActiveFeed.ts#L1-L42) · [来源: usePostActions.ts](../../packages/app/src/hooks/usePostActions.ts#L1-L119) · [来源: useScrollRestore.ts](../../packages/app/src/hooks/useScrollRestore.ts#L1-L48)

## 三种状态封装模式

理解这三种模式，就理解了为什么这些 Hook 可以跨 TUI 和 PWA 复用。

### 模式一：Store 封装（单监听器）

这是最标准、最可测试的模式。Store 是用纯 TypeScript 编写的普通对象，不依赖任何 React API。Hook 在其中创建 Store 实例并通过 `useState` 保持引用稳定，通过 `subscribe` + `force` 驱动重渲染。

```typescript
// Store（纯对象，无 React）
function createAuthStore(): AuthStore {
  const store = {
    client: null, session: null, loading: false,
    listener: null as (() => void) | null,
    async login(handle, password) { /* 异步逻辑 + _notify */ },
    _notify() { store.listener?.(); },
    subscribe(fn) { store.listener = fn; return () => { store.listener = null; }; },
  };
  return store;
}

// Hook（React 封装）
function useAuth() {
  const [store] = useState(() => createAuthStore());
  const [, force] = useState(0);
  const tick = useCallback(() => force(n => n + 1), []);
  useEffect(() => store.subscribe(tick), [store, tick]);
  return { client: store.client, session: store.session, /* ... */ };
}
```

**注意**：这是单监听器模型 —— 一个 Store 实例只能有一个活跃的 `subscribe`。多个组件用同一个 Store 实例会导致监听器被覆盖。但在实践中，每个组件挂载时创建自己的 Store 实例，或者 Store 以单例模式存在（如 `useI18n`），所以不会冲突。

[来源: auth.ts](../../packages/app/src/stores/auth.ts#L1-L76) · [来源: useAuth.ts](../../packages/app/src/hooks/useAuth.ts#L1-L19)

### 模式二：模块级单例（跨组件共享状态）

对于需要在多个视图间保持一致状态但不需要持久化的场景（如当前 Feed URI、点赞/转发现态），使用模块作用域的变量 + 监听器数组。

以 `usePostActions` 为例：点赞/转发状态存储在模块级的 `Set<string>` 中，并通过 `seedPostViewers()` 从 API 响应中填充。任何组件调用 `likePost()` 后，所有订阅的组件通过 `_tickers` 数组收到通知并重渲染。

```typescript
// 模块级状态
let _liked = new Set<string>();
let _reposted = new Set<string>();
const _tickers: Array<() => void> = [];

// 可脱离 React 直接调用的函数
export function isPostLiked(uri: string): boolean { return _liked.has(uri); }
export function seedPostViewers(posts: any[]): void { /* ... */ notifyAll(); }

// Hook — 注册 ticker 驱动重渲染
export function usePostActions(client: BskyClient | null) {
  const [, tick] = useState(0);
  useState(() => {
    const fn = () => tick(n => n + 1);
    _tickers.push(fn);
    return () => { /* 清理 */ };
  });
  return { isLiked: isPostLiked, /* ... */ };
}
```

`useActiveFeed` 和 `useScrollRestore` 也使用同样的模式。`usePostActions` 更特殊 —— 它同时导出了 `isPostLiked`、`likePost` 等纯函数，允许**非 React 代码**（如 core 层的 AI 工具）直接执行操作和读取状态，无需经过 Hook。

[来源: usePostActions.ts](../../packages/app/src/hooks/usePostActions.ts#L1-L119) · [来源: useActiveFeed.ts](../../packages/app/src/hooks/useActiveFeed.ts#L1-L42) · [来源: useScrollRestore.ts](../../packages/app/src/hooks/useScrollRestore.ts#L1-L48)

### 模式三：内联 useState

对于组件本地的临时状态（如发帖草稿、搜索输入、通知列表），直接在 Hook 内部使用 `useState` + `useCallback`。这些 Hook 每次挂载都会创建新的状态实例，组件卸载后自动销毁。

`useThread`、`useCompose`、`useProfile`、`useSearch`、`useNotifications`、`useBookmarks`、`useTranslation` 均属此类。它们通常接收 `client` 或配置参数作为输入，内部进行 API 调用并缓存结果。

```typescript
// useThread — 内联 state 示例
function useThread(client: BskyClient | null, uri: string | undefined) {
  const [flatLines, setFlatLines] = useState<FlatLine[]>([]);
  const [loading, setLoading] = useState(false);
  const [focusedIndex, setFocusedIndex] = useState(0);
  // ... 异步加载 + 键盘导航逻辑
}
```

[来源: docs/HOOKS.md#L21-L22]

## 导出清单分析

`packages/app/src/index.ts` 是 app 包的**公共 API 边界**。TUI 和 PWA 只能通过这个入口引用 app 包的功能。该文件导出了三类内容：

### 1. Store 与纯函数（可被 core 层或任意代码引用）

```
- createNavigation()          — 导航控制器工厂
- isPostLiked / isPostReposted — 同步状态查询
- getLikeCount / getRepostCount — 乐观计数
- likePost / repostPost        — 异步操作函数
- seedPostViewers / seedPostViewer — 状态注入
- getLastFeedUri / setLastFeedUri — Feed URI 管理
- saveScrollTop / getScrollTop    — 滚动位置缓存
- saveViewState / getViewState    — 视图状态持久化
- getFeedConfig / saveFeedConfig / addFeed / removeFeed / setDefaultFeed — Feed 配置
- getCdnImageUrl / getVideoThumbnailUrl / getVideoPlaylistUrl — CDN 图片工具
- availableLocales / localeLabels  — 国际化元数据
```

### 2. React Hooks（UI 层专用）

```
- useNavigation / useAuth / useTimeline / usePostDetail / useThread
- useCompose / useDrafts / useActiveFeed / useScrollRestore / usePostActions
- useAIChat / useChatHistory / useTranslation / useProfile / useSearch
- useNotifications / useBookmarks / useI18n
```

### 3. TypeScript 类型

```
- AppView / NavigationState / NavigationController
- PostDetailActions / FlatLine / ComposeMedia / ComposeImage / Draft
- DraftStore / AIChatMessage / ChatStorage / ChatRecord / ChatSummary
- TargetLang / TranslationResult / FollowListItem
- SearchTab / SearchState / UseI18nReturn / Locale / LocaleMessages
- FeedConfigData
```

[来源: index.ts](../../packages/app/src/index.ts#L1-L44)

## 复用设计哲学

这些 Hook 的设计遵循几条核心原则：

1. **纯 TypeScript 优先**：所有状态管理逻辑都在 Store 或模块级变量中，不依赖 React 上下文（`Context`）。这使得状态查询函数可以在任何地方（包括 core 层的 AI 工具）被调用。

2. **单监听器 + 数组 ticker**：整个项目没有使用 `useSyncExternalStore` 或 `React.Context`。选择更原始但更可控的订阅模式，避免不必要的 re-render 扩散。

3. **非对称导出**：`usePostActions` 和 `useActiveFeed` 同时导出了纯函数版本和 Hook 版本。纯函数版本供非 React 环境使用，Hook 版本供组件订阅重渲染。这种模式在其他 Hook 中也可以借鉴。

4. **零 Context 依赖**：没有全局 `Provider` 包裹。每个 Hook 要么接收 `client` 作为参数，要么从 Store 中获取。这让测试和组合更加直接。参见[](三层架构设计.md) 中对 `core → app → tui/pwa` 依赖方向的说明。

5. **状态来源透明**：通过上表可以清晰看到，哪些状态是 Store 持久化的（如 auth、timeline），哪些是临时内联的（如 compose、search），哪些是跨组件共享的单例（如 postActions、activeFeed）。这种透明性让调试和性能优化有据可依。

## 关键 Hook 签名速查

| Hook | 必需参数 | 核心返回 |
|------|----------|----------|
| `useAuth` | 无 | `{ client, session, profile, loading, login }` |
| `useTimeline` | `client` | `{ posts, loading, cursor, loadMore, refresh }` |
| `usePostDetail` | `client, uri, goTo, aiKey, aiBaseUrl` | `{ post, flatThread, translations, translate, actions }` |
| `useNavigation` | 无 | `{ currentView, canGoBack, goTo, goBack, goHome }` |
| `useThread` | `client, uri` | `{ flatLines, loading, focusedIndex, likePost, repostPost, focus }` |
| `useCompose` | `client` | `{ draft, submitting, replyTo, quoteUri, submit }` |
| `useAIChat` | `client, aiConfig` | `{ messages, loading, send, chatId, guidingQuestions }` |
| `useDrafts` | 无 | `{ drafts, saveDraft, deleteDraft, loadDraft }` |
| `useI18n` | `initialLocale?` | `{ t, locale, setLocale, availableLocales }` |
| `useChatHistory` | 无 | `{ conversations, loadConversation, saveConversation, deleteConversation }` |
| `useTranslation` | `aiKey, aiBaseUrl` | `{ translate, loading, cache, lang, setLang, mode }` |
| `useProfile` | `client, did` | `{ profile, loading, posts, tab, isFollowing, handleFollow }` |
| `useSearch` | `client` | `{ query, results, loading, search }` |
| `useNotifications` | `client` | `{ notifications, loading, unreadCount, refresh }` |
| `useBookmarks` | `client` | `{ bookmarks, loading, isBookmarked, toggleBookmark, refresh }` |
| `useActiveFeed` | 无 | `{ resolveFeed, recordFeed, goHomeFeed }` |
| `usePostActions` | `client` | `{ isLiked, isReposted, likePost, repostPost }` |
| `useScrollRestore` | `key, scrollRef, ready` | 无返回值（副作用 Hook） |

完整类型签名见 [`docs/HOOKS.md`](docs/HOOKS.md)，包括 `useAIChat` 的流式参数、`useTranslation` 的双模式行为（simple/json）以及 `useThread` 的 `FlatLine` 接口定义。

## 推荐阅读

- [](状态管理模式.md) — 深入 Store 的单监听器订阅机制与纯 TypeScript 设计
- [](三层架构设计.md) — app 包在整个架构中的桥梁定位
- [](useaichat-深度解析.md) — `useAIChat` 如何串联 AIAssistant 与 UI 层，含流式回调与会话持久化
- [](pwa-网页客户端入门.md) — PWA 端如何消费这些 Hook 构建完整 UI