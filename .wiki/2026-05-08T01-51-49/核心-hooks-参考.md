# 核心 Hooks 参考

`@bsky/app` 层提供了 **22 个 React Hooks**，作为纯状态层（Store）与 UI 组件之间的桥梁。所有 Hook 位于 `packages/app/src/hooks/` 目录下，通过 `packages/app/src/index.ts` 统一导出。

---

## 单订阅者 Store 模式

整个 Hook 体系的核心设计模式是**单订阅者 Store**：将状态逻辑提取到纯 JavaScript 对象（Store）中，Hook 仅作为 React 胶水层，负责订阅和重新渲染。

```typescript
// Store —— 纯对象，无 React 依赖
function createAuthStore(): AuthStore {
  const store = {
    data: null,
    loading: false,
    listener: null as (() => void) | null,

    async load() {
      store.loading = true;
      store._notify();       // 通知 React 重新渲染
      // ... 异步操作 ...
      store.loading = false;
      store._notify();
    },

    _notify() { if (store.listener) store.listener(); },
    subscribe(fn: () => void) {
      store.listener = fn;
      return () => { store.listener = null; };
    },
  };
  return store;
}

// Hook —— React 胶水层
function useStore() {
  const [store] = useState(() => createStore());
  const [, force] = useState(0);
  const tick = useCallback(() => force(n => n + 1), []);

  useEffect(() => store.subscribe(tick), [store, tick]);

  return { data: store.data, loading: store.loading };
}
```

[来源](packages/app/src/stores/auth.ts#L4-L69)
[来源](packages/app/src/hooks/useAuth.ts#L6-L22)

### 设计要点

- **`listener` 是单个回调而非数组**。这意味着每个 Store 实例同一时间只能有一个订阅者。如果多个组件共享同一个 Store 实例，后订阅者会覆盖前者的监听器。
- **`useState(() => createStore())` 惰性初始化**。Store 在组件挂载时创建一次，生命周期与组件绑定。
- **`useCallback(() => force(n => n + 1), [])` 自增计数器**替代 `useState` 对象/数组，避免引用不变时 React 的浅比较跳过渲染。
- **`_notify()` 在每次状态变更后同步调用**，确保 React 在微任务中批量更新。

### 变体：多订阅者模式

两个例外使用数组式监听器，支持多组件共享：

- **`createNavigation`** — 使用 `listeners: Array<() => void>`，`subscribe(fn)` 推入数组，返回移除函数。[来源](packages/app/src/state/navigation.ts#L43-L46)
- **`createI18nStore`** — 使用 `Set<() => void>`，通过 `add`/`delete` 管理。[来源](packages/app/src/i18n/store.ts#L53-L56)

### 变体：模块级共享状态

对于跨视图的**瞬时状态**（不持久化、不随组件卸载而消失），采用模块级变量 + 监听器数组：

- `useActiveFeed` — 记录最近活跃的 feed URI，保证导航到 `detail`/`thread` 后返回时停留在同一 feed。[来源](packages/app/src/hooks/useActiveFeed.ts#L5-L6)
- `usePostActions` — 全局点赞/转发的 Set/Map，避免多个视图展示同一帖子时状态不一致。[来源](packages/app/src/hooks/usePostActions.ts#L5-L12)
- `useScrollRestore` — `Map<string, number>` 缓存每个视图的滚动位置。[来源](packages/app/src/hooks/useScrollRestore.ts#L4)

---

## Hook 完整清单

下表列出所有导出 Hook 及其对应的 Store 工厂函数和返回类型。

| Hook | Store 工厂 | 返回类型摘要 |
|------|-----------|-------------|
| `useAuth` | `createAuthStore()` | `{ client, session, profile, loading, error, login, restoreSession }` |
| `useTimeline` | `createTimelineStore()` | `{ posts, loading, cursor, error, loadMore, refresh }` |
| `usePostDetail` | `createPostDetailStore()` | `{ post, flatThread, loading, error, translations, translate, actions }` |
| `useNavigation` | `createNavigation()` | `{ currentView, canGoBack, goTo, goBack, goHome }` |
| `useThread` | 内联 `useState` | `{ flatLines, loading, error, focusedIndex, focused, themeUri, expandReplies, likePost, repostPost, isLiked, isReposted }` |
| `useCompose` | 内联 `useState` | `{ posts, addPost, removePost, setPostText, submitting, error, replyTo, setReplyTo, quoteUri, setQuoteUri, submit, loadFromDraft, toDraftData }` |
| `useAIChat` | `new AIAssistant()` | `{ messages, loading, guidingQuestions, send, stop, addUserImage, chatId, pendingConfirmation, confirmAction, rejectAction, edit, editByIndex }` |
| `useDrafts` | `createDraftsStore(client)` | `{ drafts, loading, saving, saveDraft, deleteDraft, syncDraft, refreshDrafts, loadDraft }` |
| `useI18n` | `getI18nStore()` (Singleton) | `{ t, locale, setLocale, availableLocales, localeLabels }` |
| `useChatHistory` | `FileChatStorage` (内联) | `{ conversations, loading, loadConversation, saveConversation, deleteConversation, refresh, storage }` |
| `useTranslation` | 内联 `Map` 缓存 | `{ translate, loading, cache, lang, setLang, mode, setMode, LANG_LABELS }` |
| `useProfile` | 内联 `useState` | `{ profile, loading, error, tab, setTab, posts, repostReasons, feedCursor, feedLoading, loadMoreFeed, isFollowing, handleFollow, handleUnfollow, followList, followItems, loadMoreFollowList, openFollowList, closeFollowList }` |
| `useSearch` | 内联 `useState` | `{ query, tab, posts, users, feeds, loading, search, setTab }` |
| `useNotifications` | 内联 `useState` | `{ notifications, loading, unreadCount, error, refresh }` |
| `useBookmarks` | 内联 `useState` | `{ bookmarks, loading, error, isBookmarked, addBookmark, removeBookmark, toggleBookmark, refresh }` |
| `useLists` | 内联 `useState` | `{ lists, loading, error, createList, deleteList, updateListInfo, refresh }` |
| `useListDetail` | 内联 `useState` | `{ list, loading, error, members, loadMoreMembers, feed, loadMoreFeed, isMuted, toggleMute, addMember, removeMember, updateListInfo, deleteList, refresh }` |
| `useConvoList` | 内联 `useState` | `{ convos, cursor, loading, error, load, refresh }` |
| `useChatMessages` | 内联 `useState` | `{ messages, convo, loading, sending, error, loadConvo, loadOlder, sendMessage, toggleReaction, refresh, deleteMessage, markRead, muteConvo, unmuteConvo }` |
| `useActiveFeed` | 模块级 ref | `{ resolveFeed, recordFeed, goHomeFeed }` |
| `usePostActions` | 模块级 Sets/Maps | `{ isLiked, isReposted, likePost, repostPost, seedFromPosts, seedFromPost }` |
| `useScrollRestore` | 模块级 Map | 副作用 Hook，无返回值 |

[来源](packages/app/src/index.ts#L1-L82)

---

## Hook 分组详解

### 认证与导航

**`useAuth()`** —— 无参数。通过 `createAuthStore` 管理 `BskyClient` 实例、会话和用户 profile。`login(handle, password)` 自动创建 `BskyClient`，`restoreSession(session)` 用于从持久化存储恢复。返回的 `client` 是 `BskyClient | null`，所有依赖客户端的 Hook 均以此为条件守卫。

[来源](packages/app/src/hooks/useAuth.ts#L6-L22)
[来源](packages/app/src/stores/auth.ts#L18-L69)

**`useNavigation()`** —— 无参数。通过 `createNavigation()` 管理 `AppView` 栈。`AppView` 是联合类型，涵盖了 feed、detail、thread、compose、profile、search、aiChat、bookmarks、drafts、dm、lists 等 18 种视图。导航栈支持 `push/pop/home` 三种操作。

[来源](packages/app/src/hooks/useNavigation.ts#L5-L20)
[来源](packages/app/src/state/navigation.ts#L1-L73)

### 内容浏览

**`useTimeline(client, feedUri?)`** —— 使用 `createTimelineStore`。加载后首次自动触发 `store.load()`，包含一次重试逻辑（JWT 刷新竞态补偿）。`loadMore` 使用 cursor 分页追加，`refresh` 重置游标重新加载。支持 feed 切换（URI 变化时自动清空并重载）。如果 `feedUri` 为 undefined，则回退到 "Following" 时间线。

[来源](packages/app/src/hooks/useTimeline.ts#L6-L47)
[来源](packages/app/src/stores/timeline.ts#L26-L93)

**`usePostDetail(client, uri?, goTo, aiKey, aiBaseUrl, targetLang?)`** —— 使用 `createPostDetailStore`。加载时通过 `getPostThread(uri, 3, 80)` 获取帖子和线程上下文，构建 `flatThread` 纯文本（深度展开 parent/replies）。内置翻译功能（通过 `fetch` 直接调用 LLM API），返回 `actions` 对象（like、repost、reply、translate、openAI、viewThread）。

[来源](packages/app/src/hooks/usePostDetail.ts#L15-L71)
[来源](packages/app/src/stores/postDetail.ts#L20-L127)

**`useThread(client, uri?)`** —— 纯内联 state，无 Store。通过 `client.getPostThread(uri, 5, 80)` 获取线程树，递归展平为 `FlatLine[]`。支持键盘焦点导航（`focusedIndex`）、增量展开回复（`expandReplies` 每次 +10）。媒体信息（图片 CDN 链接、视频缩略图/播放列表、引用帖）在扁平化时全部解析为 `FlatLine` 字段。[导航状态机](导航状态机.md) 联动 `usePostActions` 模块级状态获取点赞/转发状态。

[来源](packages/app/src/hooks/useThread.ts#L46-L132)

**`useProfile(client, actor?, initialTab?)`** —— 加载用户资料（含重试）、作者 feed（按 tab 分组 `posts`/`replies`）、关注/粉丝列表分页。`handleFollow`/`handleUnfollow` 通过 `client.follow()` / `client.unfollow()` 操作，成功后刷新 profile 以更新 `viewer.following`。

[来源](packages/app/src/hooks/useProfile.ts#L14-L192)

### 发帖与草稿

**`useCompose(client, goBack, onSuccess?)`** —— 支持多帖模式（`posts: ComposePostItem[]`），每个帖子独立 id/text。`submit` 遍历所有非空帖子，构建回复链（`root/parent`），处理 `quoteUri` + 媒体嵌入（图片/视频/引用+媒体组合）。部分提交失败时，error 信息会精确到"已发布 N 篇，剩余 M 篇因错误未发布"。

[来源](packages/app/src/hooks/useCompose.ts#L27-L234)

**`useDrafts(client)`** —— 使用 `createDraftsStore`。采用 PDS+local 双存储策略：优先同步到 PDS（`client.createDraft`/`updateDraft`），PDS 不可用时降级到本地 `DraftStorage`。`refreshDrafts` 会合并两端数据，PDS 为权威来源。`syncStatus` 标记区分 `synced`/`local`。

[来源](packages/app/src/hooks/useDrafts.ts#L199-L241)
[来源](packages/app/src/hooks/useDrafts.ts#L21-L197)

### AI 对话

**`useAIChat(client, aiConfig, contextUri?, options?)`** —— 最复杂的 Hook，内部管理 `AIAssistant` 实例。详细实现参见 [AI 对话 Hook 深度解析](ai-对话-hook-深度解析.md)。关键设计：

- **双模式发送**：`stream: true` 使用 `assistant.sendMessageStreaming()` 逐 token 推送；`stream: false`（默认）使用 `assistant.sendMessage()` 一次返回。
- **上下文注入**：通过 `contextPost`（at:// URI）和 `contextProfile`（handle）两种方式，分别触发 `PF_POST_CONTEXT` 和 `PF_PROFILE_CONTEXT` 系统提示片段。
- **自动保存**：每次 `send()` 成功后自动调用 `storage.saveChat()`。
- **写操作确认**：`pendingConfirmation` + `confirmAction`/`rejectAction` 构成护栏。
- **编辑与撤销**：`edit()` 获取最后一条用户消息，`editByIndex(n)` 获取第 N 条。

[来源](packages/app/src/hooks/useAIChat.ts#L37-L42)
[来源](packages/app/src/hooks/useAIChat.ts#L68-L86)

**`useChatHistory(storage?)`** —— 包装 `ChatStorage` 接口。默认使用 `FileChatStorage` 实例（在 TUI 中为 JSON 文件，在 PWA 中为 IndexedDB，由 `getDefaultStorage()` 工厂决定）。`refresh()` 自动在 mount 时调用。

[来源](packages/app/src/hooks/useChatHistory.ts#L14-L48)

### 国际化

**`useI18n(initialLocale?)`** —— 使用模块级单例 `getI18nStore()`。`t(key, params?)` 支持 `{placeholder}` 插值，查找链为：当前 locale → en → zh → 原始 key。`availableLocales` 为 `['zh', 'en', 'ja']`。详细设计参见 [国际化系统](国际化系统.md)。

[来源](packages/app/src/i18n/useI18n.ts#L6-L20)
[来源](packages/app/src/i18n/store.ts#L24-L78)

### 翻译

**`useTranslation(aiKey, aiBaseUrl, aiModel?, targetLang?, initialMode?)`** —— 内联 `Map` 缓存，key 为 `"${mode}::${lang}::${text}"`。双模式：`simple` 返回纯文本翻译；`json` 模式使用 `response_format: "json_object"`，额外返回 `sourceLang`。重试逻辑位于 `core` 层的 `translateText()`（最多 3 次指数退避）。参见 [翻译与润色系统](翻译与润色系统.md)。

[来源](packages/app/src/hooks/useTranslation.ts#L22-L54)

### 搜索与通知

**`useSearch(client, initialTab?)`** —— 四个搜索标签：`top`（`searchPosts` 默认排序）、`latest`（`searchPosts` 按时间排序）、`users`（`searchActors`）、`feeds`（`getPopularFeedGenerators` + 客户端侧名称/描述过滤）。

[来源](packages/app/src/hooks/useSearch.ts#L18-L57)

**`useNotifications(client)`** —— 自动加载最新 30 条通知，计算 `unreadCount`。包含一次 JWT 竞态重试。

[来源](packages/app/src/hooks/useNotifications.ts#L5-L33)

### 书签与列表

**`useBookmarks(client)`** —— `isBookmarked(uri)` 是同步的 `Set.has()` 查找，无需网络。书签持久化到 PDS 的 `app.bsky.graph.bookmark` 集合。`toggleBookmark` 封装 add/remove 为单一调用。

[来源](packages/app/src/hooks/useBookmarks.ts#L5-L59)

**`useLists(client, actor?)`** —— 获取用户的 moderation 列表。支持创建（`createList`）、删除、更新名称/描述。不指定 `actor` 时查询当前认证用户。

[来源](packages/app/src/hooks/useLists.ts#L5-L80)

**`useListDetail(client, listUri)`** —— 同时加载列表信息、成员列表和 feed 帖子。分页支持 `loadMoreMembers` 和 `loadMoreFeed` 独立游标。支持 mute/unmute、增删成员、删除列表。

[来源](packages/app/src/hooks/useListDetail.ts#L5-L123)

### 私信

**`useConvoList(client)`** —— 使用 `client.listConvos()` 通过 `chatKy`（独立 ky 实例，`api.bsky.chat/xrpc`）获取对话列表。`load(reset?)` 支持游标分页追加，`refresh()` 重置。

[来源](packages/app/src/hooks/useConvoList.ts#L4-L41)

**`useChatMessages(client)`** —— `loadConvo(conversationId)` 内部调用 `getConvoForMembers([did])` 解析目标 DID，然后 `getMessages(convoId)`。`sendMessage` 支持携带 embed，`toggleReaction` 幂等处理 add/remove。工具函数 `parsePostUri` 解析三种 URI 格式（`at://did:plc:...`、`at://handle/...`、`https://bsky.app/profile/.../post/...`）。参见 [DM 私信实现](dm-私信实现.md)。

[来源](packages/app/src/hooks/useChatMessages.ts#L9-L131)

### 跨视图状态

**`useActiveFeed()`** —— 返回 `{ resolveFeed, recordFeed, goHomeFeed }`。`resolveFeed(feedUri?)` 解析最终 feed URI（参数 → 模块级缓存 → feedConfig 默认），`recordFeed` 记录当前活跃 feed。模块级 `_listeners` 数组使所有使用此 Hook 的组件保持同步。

[来源](packages/app/src/hooks/useActiveFeed.ts#L17-L44)

**`usePostActions(client)`** —— 返回 `{ isLiked, isReposted, likePost, repostPost, seedFromPosts, seedFromPost }`。模块级 `_liked`/`_reposted` Set 和 `_likeRecords`/`_repostRecords` Map 是全局唯一的点赞/转发状态源。`likePost`/`repostPost` 是切换操作（再次调用即取消）。`seedPostViewers(posts)` 在 `useThread` 加载线程时调用，从 API viewer 数据填充初始状态。乐观计数调整（`_likeCountAdj`/`_repostCountAdj`）允许 UI 在 API 响应前更新显示。

[来源](packages/app/src/hooks/usePostActions.ts#L108-L127)
[来源](packages/app/src/hooks/usePostActions.ts#L52-L104)

**`useScrollRestore(key?, scrollRef, ready)`** —— 无返回值，纯副作用。在 `ready` 为 true 时恢复滚动位置，在 unmount 时保存。`key` 为视图标识（如 `'profile-actor'`、`'search-query'`），支持全局滚动和容器滚动两种模式。

[来源](packages/app/src/hooks/useScrollRestore.ts#L28-L51)

---

## Store 实现模式对比

| 模式 | 代表 Hook | 状态位置 | 生命周期 | 多组件共享 |
|------|-----------|---------|---------|-----------|
| **单订阅者 Store** | `useAuth`、`useTimeline`、`usePostDetail` | 组件内 `useState` 创建的 Store 对象 | 与组件相同 | ❌ 不支持 |
| **内联 useState** | `useThread`、`useCompose`、`useProfile`、`useSearch`、`useNotifications`、`useBookmarks`、`useLists`、`useListDetail`、`useConvoList`、`useChatMessages`、`useTranslation`、`useChatHistory` | React state 内 | 与组件相同 | ❌ 不支持 |
| **多订阅者 Store** | `useNavigation`、`useI18n` | 组件内创建的 Store，但监听器为数组 | 首次创建组件的生命周期 | ✅ 支持 |
| **模块级状态** | `useActiveFeed`、`usePostActions`、`useScrollRestore` | 模块级变量 | 页面会话生命周期 | ✅ 所有组件共享 |

---

## 推荐阅读

- [AI 对话 Hook 深度解析](ai-对话-hook-深度解析.md) — `useAIChat` 的完整实现细节
- [导航状态机](导航状态机.md) — `AppView` 联合类型与栈管理
- [国际化系统](国际化系统.md) — Singleton Store 模式详解
- [包架构深度解析](包架构深度解析.md) — 理解 `@bsky/app` 在 monorepo 中的位置
- [存储与持久化](存储与持久化.md) — `ChatStorage` / `DraftStorage` 接口实现
- [DM 私信实现](dm-私信实现.md) — `useConvoList` / `useChatMessages` 的底层 API