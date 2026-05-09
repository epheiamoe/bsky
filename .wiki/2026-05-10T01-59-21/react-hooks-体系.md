现在我已完整理解所有变更，正在基于当前代码库编写更新版。

# React Hooks 体系

整个 `packages/app/src/hooks/` 目录包含 27 个 React Hook，构成 PWA 和 TUI 双端共享的数据消费层。所有 Hook 遵循同一底层模式——纯对象 Store 通过单监听器订阅桥接到 React 的 `useState` 重渲染循环，或者直接使用 `useState` 内联管理异步数据。详细模式见 [Store 订阅模式](store-订阅模式.md)。

## 架构概览

```mermaid
graph TD
    A[组件层] --> B[Hooks 层]
    B --> C1[Store 订阅<br/>useAuth / useTimeline / usePostDetail / useNavigation]
    B --> C2[内联状态<br/>useThread / useCompose / useProfile / useSearch / useBookmarks / useNotifications / useLists / useListDetail / useConvoList / useChatMessages / ...]
    B --> C3[模块级状态<br/>usePostActions / useActiveFeed / useScrollRestore / widgetStore]
    C1 --> D[纯对象 Store<br/>auth / timeline / postDetail / navigation]
    C2 --> E[useState + useEffect<br/>异步数据获取]
    C3 --> F[模块级 Set/Map/Ref<br/>跨组件共享]
```

三种状态管理策略对应不同场景：**Store 订阅**用于需要被多处组件共享的全局状态（auth、timeline）；**内联状态**用于视图内一次性数据获取（profile、search、bookmarks）；**模块级状态**用于跨组件/跨视图的共享但无需持久化的状态（post actions、scroll restore）。

[来源](packages/app/src/hooks/useAuth.ts#L6-L23) | [来源](packages/app/src/stores/auth.ts#L19-L74) | [来源](packages/app/src/hooks/usePostActions.ts#L108-L127)

---

## 分类总览

| 类别 | Hooks | 数据来源 |
|------|-------|----------|
| 认证 | `useAuth` | AuthStore |
| 时间线 | `useTimeline`, `useActiveFeed` | TimelineStore / 模块级 ref |
| 帖子 | `usePostDetail`, `usePostActions` | PostDetailStore / 模块级 Set+Map |
| 线程 | `useThread` | 内联 useState |
| 发帖 | `useCompose`, `useDrafts` | 内联 useState / DraftStore |
| 资料 | `useProfile` | 内联 useState |
| 搜索 | `useSearch`, `useSearchHistory` | 内联 useState / localStorage |
| AI | `useAIChat`, `useTranslation` | AIAssistant 实例 / 内联缓存 |
| 私信 | `useConvoList`, `useChatMessages`, `useDmEmojiConfig` | 内联 useState / localStorage |
| 书签 | `useBookmarks` | 内联 useState |
| 列表 | `useLists`, `useListDetail` | 内联 useState |
| 社交圈 | `useSocialCircle` | 内联 useState |
| 实用工具 | `useNavigation`, `useNotifications`, `useChatHistory`, `useScrollRestore`, `widgetRegistry` / `widgetStore` | 各 Store / 模块级 Map |

---

## 认证

### `useAuth`

```typescript
function useAuth(): {
  client: BskyClient | null;
  session: CreateSessionResponse | null;
  pdsUrl: string | null;
  profile: ProfileView | null;
  loading: boolean;
  error: string | null;
  login: (handle: string, password: string, pdsUrl?: string) => Promise<void>;
  restoreSession: (s: CreateSessionResponse, pdsUrl: string) => void;
}
```

**说明**：通过 `createAuthStore()` 创建单例 Store，内部持有 `BskyClient` 实例。`login` 依次完成创建客户端、鉴权、获取 Profile 三个步骤。`restoreSession` 从持久化存储恢复已登录会话——如果 JWT 已过期，`getProfile()` 异步失败后将 `client` 和 `session` 置空并返回 `session_expired` 错误。返回的是 Store 属性的直接映射，非 React 代码可通过导入 `createAuthStore()` 获取相同 Store 对象。

[来源](packages/app/src/hooks/useAuth.ts#L6-L23) | [来源](packages/app/src/stores/auth.ts#L19-L74)

---

## 时间线

### `useTimeline`

```typescript
function useTimeline(
  client: BskyClient | null,
  feedUri?: string,           // 不传则跟随 lastGoodFeed 或加载主页时间线
): {
  posts: PostView[];
  loading: boolean;
  cursor: string | undefined;
  error: string | null;
  loadMore: (() => void) | undefined;
  refresh: (() => void) | undefined;
}
```

**说明**：通过 `createTimelineStore()` 订阅。`feedUri` 为可选的自定义 Feed（如 `at://did:plc:xxx/app.bsky.feed.generator/xxx`），留空则跟随 `lastGoodFeed` ref（导航离开/返回时不重置）。Store 内部通过 `shouldUseTimeline(feedUri)` 判断走 `client.getTimeline()` 还是 `client.getFeed()`。`loadMore` 使用 cursor 分页追加，`refresh` 重置 cursor 并重新加载。

**设计细节**：Store 在 `load()` 中内置了一次重试——首次请求若失败，等 1.5 秒后自动重试，以应对 JWT 刷新竞态。`lastGoodFeed` ref 确保导航离开/返回时不触发不必要的重置。

**典型用例**：
```tsx
const { posts, loading, loadMore, refresh } = useTimeline(client, feedUri);
```
结合虚拟滚动组件，在滚动到底时调用 `loadMore`。详见 [虚拟滚动与滚动恢复](虚拟滚动与滚动恢复.md)。

[来源](packages/app/src/hooks/useTimeline.ts#L6-L47) | [来源](packages/app/src/stores/timeline.ts#L26-L93)

### `useActiveFeed`

```typescript
function useActiveFeed(): {
  resolveFeed: (feedUri?: string | null) => string | undefined;
  recordFeed: (uri: string | undefined) => void;
  goHomeFeed: () => string | undefined;
}
```

**纯辅助 Hook**，不引发重渲染。`resolveFeed` 解析当前有效的 Feed URI（参数优先 → 模块级记忆 → 默认 Feed）。`recordFeed` 在用户切换 Feed 时调用保存记忆。`goHomeFeed` 返回配置的默认 Feed。

[来源](packages/app/src/hooks/useActiveFeed.ts#L4-L44)

---

## 帖子

### `usePostDetail`

```typescript
function usePostDetail(
  client: BskyClient | null,
  uri: string | undefined,
  goTo: (v: AppView) => void,
  aiKey: string,
  aiBaseUrl: string,
  targetLang?: string,      // 默认 'zh'
): {
  post: PostView | null;
  flatThread: string;       // 纯文本扁平线程（供 AI 上下文使用）
  loading: boolean;
  error: string | null;
  translations: Map<string, string>;
  translate: (text: string) => Promise<string>;
  actions: PostDetailActions;  // { like, repost, reply, translate, openAI, viewThread }
}
```

**说明**：通过 `createPostDetailStore()` 订阅。`flatThread` 是纯文本格式的线程拼接，专为 `useAIChat` 提供上下文。`actions` 中的 `reply` 跳转 `compose` 视图，`openAI` 跳转 `aiChat`，`translate` 调用 Store 内建的翻译方法。

[来源](packages/app/src/hooks/usePostDetail.ts#L15-L71)

### `usePostActions`

```typescript
function usePostActions(client: BskyClient | null): {
  isLiked: (uri: string) => boolean;
  isReposted: (uri: string) => boolean;
  likePost: (uri: string, cid?: string) => Promise<void>;
  repostPost: (uri: string, cid?: string) => Promise<void>;
  seedFromPosts: (posts: any[]) => void;
  seedFromPost: (post: any) => void;
}
```

**核心设计**：模块级 Set/Map 作为单一事实来源。所有赞/转发的状态（`_liked`、`_reposted`、`_likeCountAdj`、`_repostCountAdj`）存储在模块级变量中，通过 `notifyAll()` 触发所有监听 Hook 的 tick。`seedPostViewer(s)` 在时间线/线程加载时批量注入 API 返回的 `viewer` 状态。

**纯函数导出**：底层函数同时以纯函数形式导出（`isPostLiked`、`isPostReposted`、`likePost`、`repostPost`、`seedPostViewer`、`seedPostViewers`、`getLikeCount`、`getRepostCount`），可被任何非 React 代码导入使用（如 AI 工具系统中的 `formatPostSummary`）。

**关键行为**：like/repost 是**即时乐观更新**——调用 `likePost` 立即修改 Set 和 count 调整 Map，API 请求在后台进行。失败时仅打印错误，不回滚 UI。如果帖子已被点赞，再次调用 `likePost` 会执行取消点赞（toggle 行为）。

[来源](packages/app/src/hooks/usePostActions.ts#L4-L127)

---

## 线程

### `useThread`

```typescript
function useThread(
  client: BskyClient | null,
  uri: string | undefined,
): {
  flatLines: FlatLine[];
  loading: boolean;
  error: string | null;
  focusedIndex: number;
  focused: FlatLine | undefined;
  themeUri: string | undefined;
  expandReplies: () => void;
  likePost: (uri: string) => Promise<void>;
  repostPost: (uri: string) => Promise<boolean>;
  isLiked: (uri: string) => boolean;
  isReposted: (uri: string) => boolean;
}
```

**`FlatLine` 接口**包含 20+ 字段：`depth`（负数表示祖先，0 根节点，正数表示回复）、`cid`、`rkey`、`mediaTags`（如 `🖼 图片`、`🎬 视频`、`🔗 链接`、`📌 引用`）、`imageDetails`（CDN URL 数组）、`videoThumbnailUrl`、`videoPlaylistUrl`（HLS 播放列表）、`videoAlt`、`videoAspectRatio`、`quotedPost`（嵌套引用帖结构体）、`isRoot`、`isTruncation` 等。

**设计细节**：`flattenThreadTree()` 将 API 返回的嵌套 `ThreadViewPost` 树压平成基于 depth 的线性数组。`loadThread` 调用 `client.getPostThread(uri, 5, 80)`，并通过 `seedPostViewers(posts)` 批量注入 like/repost 状态。`expandReplies` 增加 `maxSiblings` 后重新展开。

[来源](packages/app/src/hooks/useThread.ts#L46-L132)

---

## 发帖

### `useCompose`

```typescript
function useCompose(
  client: BskyClient | null,
  goBack: () => void,
  onSuccess?: () => void,
): {
  posts: ComposePostItem[];     // [{ id, text }]
  addPost: () => void;
  removePost: (id: string) => void;
  setPostText: (id: string, text: string) => void;  // 自动截断 300 字符
  submitting: boolean;
  error: string | null;
  replyTo: string | undefined;
  setReplyTo: (uri: string | undefined) => void;
  quoteUri: string | undefined;
  setQuoteUri: (uri: string | undefined) => void;
  submit: (mediaMap?: Map<string, ComposeMedia[]>) => Promise<void>;
  loadFromDraft: (posts, replyTo?, quoteUri?) => void;
  toDraftData: () => { posts: { text: string }[]; replyTo?: string; quoteUri?: string };
}
```

**说明**：支持**多帖线程式发布**——`posts` 数组中的每个元素对应一个独立帖子，`submit` 按顺序循环提交，后续帖子自动以前帖为 `reply.parent`，形成回复链。`ComposeMedia` 支持 `image` 和 `video` 两种类型。`mediaMap` 键为帖子的 `id`，值为此帖附加的媒体文件列表。`replyTo` 和 `quoteUri` 仅对第一帖生效。

**嵌入逻辑**：第一帖支持 `app.bsky.embed.video`（视频）、`app.bsky.embed.images`（多图）、`app.bsky.embed.record`（引用帖）以及 `app.bsky.embed.recordWithMedia`（引用帖+图片组合）。后续帖子也可携带媒体。

**错误处理**：部分成功时（如已发布 3 篇中的前 2 篇），error 显示 `"已发布 2 篇，剩余 1 篇因错误未发布"`。

[来源](packages/app/src/hooks/useCompose.ts#L27-L234)

### `useDrafts`

```typescript
function useDrafts(client: BskyClient | null): {
  drafts: AppDraft[];
  loading: boolean;
  saving: boolean;
  saveDraft: (data, draftId?) => Promise<string>;
  deleteDraft: (id: string) => Promise<void>;
  syncDraft: (id: string) => Promise<void>;
  refreshDrafts: () => Promise<void>;
  loadDraft: (id: string) => AppDraft | undefined;
}
```

**设计细节**：`createDraftsStore(client)` 返回非 React Store 对象，Hook 通过 `useState` tick 桥接。Hook 始终通过 `useEffect` 同步最新 client 到 store。数据同时存储在本地（通过 `DraftStorage` 接口）和 PDS 服务端。`refreshDrafts()` 实现**三层合并策略**：先加载本地草稿 → 尝试从 PDS 拉取 → 按 `serverId` 匹配合并 → 排序输出。`AppDraft` 包含 `syncStatus: 'local' | 'synced'` 字段。

[来源](packages/app/src/hooks/useDrafts.ts#L199-L241)

---

## 资料

### `useProfile`

```typescript
function useProfile(
  client: BskyClient | null,
  actor: string | undefined,          // DID 或 handle
  initialTab?: 'posts' | 'replies',   // 默认 'posts'
): {
  profile: ProfileView | null;
  loading: boolean;
  error: string | null;
  tab: 'posts' | 'replies';
  setTab: (t: 'posts' | 'replies') => void;
  posts: PostView[];
  repostReasons: Record<string, string>;  // postUri → 转发者 handle
  feedCursor: string | undefined;
  feedLoading: boolean;
  loadMoreFeed: () => void;
  isFollowing: boolean;
  handleFollow: () => Promise<void>;
  handleUnfollow: () => Promise<void>;
  followList: 'follows' | 'followers' | null;
  followItems: FollowListItem[];
  followListCursor: string | undefined;
  followListLoading: boolean;
  openFollowList: (type: 'follows' | 'followers') => Promise<void>;
  closeFollowList: () => void;
  loadMoreFollowList: () => Promise<void>;
}
```

**说明**：管理资料页面的全部状态。`loadProfile` 内建一次 1.5 秒延迟的重试，应对 JWT 刷新竞态。`loadFeed` 根据 `tab` 选择 `posts_no_replies` 或全部含回复的帖子，并解析 `reasonRepost` 构建 `repostReasons` 映射。`handleFollow`/`handleUnfollow` 在 API 调用后重新获取 Profile 以更新 `viewer.following`。

[来源](packages/app/src/hooks/useProfile.ts#L14-L192)

---

## 搜索

### `useSearch`

```typescript
type SearchTab = 'top' | 'latest' | 'users' | 'feeds';

function useSearch(
  client: BskyClient | null,
  initialTab?: SearchTab,
): SearchState {
  query: string;
  tab: SearchTab;
  posts: PostView[];
  users: ProfileViewBasic[];
  feeds: FeedGeneratorView[];
  loading: boolean;
  search: (q: string, tab: SearchTab) => Promise<void>;
  setTab: (t: SearchTab) => void;
}
```

**说明**：`search` 方法根据 tab 调用不同 API：`top`/`latest` 走 `client.searchPosts()`，`users` 走 `client.searchActors()`，`feeds` 先调用 `getPopularFeedGenerators()` 获取全部热门 Feed，再在客户端做 displayName/description 过滤（因 AT Protocol 没有 Feed 搜索端点）。

[来源](packages/app/src/hooks/useSearch.ts#L18-L57)

### `useSearchHistory`

```typescript
function useSearchHistory(tab: SearchTab): {
  history: string[];       // 最多 10 条
  add: (query: string) => void;
  remove: (query: string) => void;
  clear: () => void;
}
```

**说明**：纯 localStorage 存储，4 个 tab 各自独立。`add` 自动去重并插到队首。模块级 `_listeners` Set 实现跨组件通知——多个 `useSearchHistory` 实例之间自动同步。导出的纯函数 `addToHistory`/`removeFromHistory`/`clearHistory`/`getHistory` 可供非 React 代码调用。

[来源](packages/app/src/hooks/useSearchHistory.ts#L30-L95)

---

## AI

### `useAIChat`（核心重点）

```typescript
interface UseAIChatOptions {
  chatId?: string;              // 加载已有对话
  stream?: boolean;             // 启用流式输出（默认 false，TUI 行为）
  userHandle?: string;
  userDisplayName?: string;
  environment?: 'tui' | 'pwa';
  locale?: string;
  contextProfile?: string;      // 用户导航传递的 profile handle（非 URL）
  contextPost?: string;         // 用户导航传递的 at:// URI
  onChatSaved?: () => void;
  onTitleChanged?: () => void;
}

function useAIChat(
  client: BskyClient | null,
  aiConfig: AIConfig,
  contextUri?: string,           // 传统方式传递的上下文 URI
  options?: UseAIChatOptions,
): {
  messages: AIChatMessage[];
  loading: boolean;
  guidingQuestions: string[];
  send: (text: string) => Promise<void>;
  stop: () => void;                            // AbortController.abort()
  addUserImage: (data: Uint8Array, mimeType: string, alt: string) => number;
  chatId: string;
  pendingConfirmation: { toolName: string; description: string } | null;
  confirmAction: () => void;
  rejectAction: () => void;
  undoLastMessage: () => void;
  edit: () => string | null;
  editByIndex: (n: number) => string | null;
}
```

**核心变更**：新版本不再接受 `storage` 参数（自动使用 `getDefaultChatStorage()`），新增 `contextProfile`/`contextPost` 选项替代传统 `contextUri` 参数。`AIConfig` 新增 `visionEnabled`、`thinkingEnabled`、`provider`、`reasoningStyle`、`customSystemPrompt` 字段。

**系统提示词构建**：`buildSystemPrompt` 动态拼接以下片段：
- `P_ASSISTANT_BASE` — 基础角色定义（Bluesky 助手）
- `PF_CURRENT_USER` — 当前用户身份标识
- `PF_PROFILE_CONTEXT` — 资料页面上下文（来自 `contextProfile`）
- `PF_POST_CONTEXT` — 帖子上下文（来自 `contextPost` 或 `contextUri`）
- `PF_ENVIRONMENT` — 运行环境（TUI/PWA）
- `PF_LOCALE_HINT` — 语言偏好
- `PF_CURRENT_TIME` — 系统当前时间
- `PF_VISION_HINT` — 视觉模式提示
- `P_CONCISE` — 简洁回答指令
- `aiConfig.customSystemPrompt` — 用户自定义提示词

[来源](packages/app/src/hooks/useAIChat.ts#L71-L92) | [来源](packages/core/src/ai/prompts.ts#L31-L65)

**上下文持久化**：`contextRef` 保存当前上下文（`{ type: 'post', uri }` 或 `{ type: 'profile', handle }`），写入 `ChatRecord.context` 字段。页面刷新后重新加载时，根据 `record.context` 恢复系统提示词。详见 [存储抽象层](存储抽象层.md)。

[来源](packages/app/src/hooks/useAIChat.ts#L123-L179) | [来源](packages/app/src/services/chatStorage.ts#L20-L21)

**Streaming 模式与非 Streaming 模式的行为差异**：

| 维度 | `stream: false`（默认，TUI） | `stream: true`（PWA） |
|------|------|------|
| API 调用 | `assistant.sendMessage(text)` | `assistant.sendMessageStreaming(text, signal)` |
| 返回形式 | 一次返回 `{ intermediateSteps, content }` | 逐 token 产出 `StreamEvent` |
| 消息更新 | 全部步骤一次性追加到 `messages` | 实时更新 `messages` 中最后一条 assistant 消息 |
| Thinking 展示 | 不展示 | `thinking` 事件实时累积到 thinking 消息 |
| 工具调用展示 | `tool_call` + `tool_result` 逐步追加 | `tool_call` 事件先清空流式内容再追加 tool_call 消息 |
| 中止能力 | `stop()` 调用 `AbortController.abort()` 即时终止 | 同左 |
| 错误处理 | 非 `aborted` 错误 → 追加 error 消息 | 同左 |

**Streaming 事件流**：`assistant.sendMessageStreaming()` 产生的 `StreamEvent` 类型包括：
- `token` — 文本片段，累积到 `streamingContent`，实时更新 UI
- `tool_call` — 追加工具调用消息（含 `toolName`、`toolCallId`）
- `tool_result` — 追加工具结果消息
- `thinking` — 累积到 thinking 消息（PWA 可展示推理过程）
- `confirmation_needed` — 写操作确认门，触发 `setPendingConfirmation`
- `done` — 流结束

[来源](packages/app/src/hooks/useAIChat.ts#L297-L354) | [来源](packages/core/src/ai/assistant.ts#L421-L644)

**自动保存**：两种模式均在消息更新时通过 `autoSave()` 写入 ChatStorage。首次助理回复后，Hook 动态 `import('@bsky/core').generateChatTitle` **异步生成标题**（不阻塞主流程），生成成功后覆盖保存。

[来源](packages/app/src/hooks/useAIChat.ts#L225-L286)

**编辑/回退机制**：`editByIndex(n)` 回滚 `AIAssistant` 内部消息到第 n 条用户消息之前，并返回该消息文本。`undoLastMessage()` 回滚到最后一条用户消息。两者均通过 `assistant.loadMessages(keep)` 重新加载裁剪后的消息列表。

[来源](packages/app/src/hooks/useAIChat.ts#L480-L519)

**自动分析**：当 `options.contextProfile` 首次设置且 `messages` 为空时，500ms 延迟后自动发送 `PF_AUTO_ANALYSIS(handle)` 提示词。

[来源](packages/app/src/hooks/useAIChat.ts#L416-L425) | [来源](packages/core/src/ai/prompts.ts#L192-L194)

### `useTranslation`

```typescript
type TargetLang = 'zh' | 'en' | 'ja' | 'ko' | 'fr' | 'de' | 'es';

interface TranslationResult {
  translated: string;
  sourceLang?: string;
}

function useTranslation(
  aiKey: string,
  aiBaseUrl: string,
  aiModel?: string,              // 默认 'deepseek-v4-flash'
  targetLang?: TargetLang,       // 默认 'zh'
  initialMode?: 'simple' | 'json',  // 默认 'simple'
): {
  translate: (text: string, overrideLang?: TargetLang) => Promise<TranslationResult>;
  loading: boolean;
  cache: Map<string, TranslationResult>;
  lang: TargetLang;
  setLang: (l: TargetLang) => void;
  mode: 'simple' | 'json';
  setMode: (m: 'simple' | 'json') => void;
  LANG_LABELS: Record<TargetLang, string>;
}
```

**双模式行为**：`simple` 模式直接返回翻译文本；`json` 模式使用 `response_format: "json_object"` 返回 `{translated, source_lang}` 结构。底层动态导入 `@bsky/core` 的 `translateText()`，该函数具备最多 3 次指数退避重试（基础间隔 800ms），遇空内容、缺少 translated 字段、JSON 解析失败时触发重试。

[来源](packages/app/src/hooks/useTranslation.ts#L22-L54) | [来源](packages/core/src/ai/assistant.ts#L727-L795)

---

## 私信（DM）

### `useConvoList`

```typescript
function useConvoList(client: BskyClient | null): {
  convos: ConvoView[];
  cursor?: string;
  loading: boolean;
  error: string | null;
  load: (reset?: boolean) => Promise<void>;   // false 时分页追加
  refresh: () => Promise<void>;
}
```

**说明**：通过 `client.listConvos(30, cursor)` 获取会话列表。内置 **30 秒静默轮询**，不触发 loading 状态。模块级 `_clearUnread` 函数支持乐观清除未读——`DMChatPage` 调用 `markConvoRead(convoId)` 后，`useConvoList` 立即将该会话的 `unreadCount` 置零。

[来源](packages/app/src/hooks/useConvoList.ts#L14-L75)

### `useChatMessages`

```typescript
function useChatMessages(client: BskyClient | null): {
  messages: AnyChatMessage[];         // MessageView | DeletedMessageView | SystemMessageView
  convo: ConvoView | null;
  loading: boolean;
  sending: boolean;
  error: string | null;
  loadConvo: (conversationId: string, reset?: boolean) => Promise<void>;
  loadOlder: () => Promise<void>;
  sendMessage: (text: string, embed?: MessageInput['embed']) => Promise<void>;
  toggleReaction: (messageId: string, value: string, isPresent: boolean) => Promise<void>;
  refresh: () => Promise<void>;
  deleteMessage: (messageId: string) => Promise<void>;
  markRead: () => Promise<void>;
  muteConvo: () => Promise<void>;
  unmuteConvo: () => Promise<void>;
}
```

**说明**：`loadConvo(id)` 先通过 `client.getConvoForMembers([did])` 获取或创建会话，再 `getMessages(convoId, 30)` 获取消息（结果反转以按时间升序排列）。内置 **10 秒静默轮询**检测新消息，通过比对 `lastMsgIdRef` 决定是否更新 UI。

`parsePostUri()` 纯函数解析三种 URI 格式：`at://did:plc:xxx/...`、`at://handle/...`、`https://bsky.app/profile/handle/post/rkey`，用于 DM 中嵌入帖子链接的自动识别。

详见 [Direct Messages 私信系统](direct-messages-私信系统.md)。

[来源](packages/app/src/hooks/useChatMessages.ts#L9-L184)

### `useDmEmojiConfig`

非典型 Hook——主要提供 `getDmEmojiConfig()`/`saveDmEmojiConfig()` 等纯函数和 `fetchAllEmojis()`（从 `/emoji.txt` 加载全量 Emoji）。`useDmEmojiConfig` 本身未在 hooks 中导出为 React Hook；Emoji 配置存储在 localStorage，键 `bsky_dm_emoji`。`EmojiItem` 接口包含 `key`、`emoji`、`hasVariants`、`variants` 字段，支持肤色变体分组。

[来源](packages/app/src/hooks/useDmEmojiConfig.ts#L1-L74)

---

## 书签

### `useBookmarks`

```typescript
function useBookmarks(client: BskyClient | null): {
  bookmarks: PostView[];
  loading: boolean;
  cursor: string | undefined;
  error: string | null;
  isBookmarked: (uri: string) => boolean;
  addBookmark: (uri: string, cid: string) => Promise<void>;
  removeBookmark: (uri: string) => Promise<void>;
  toggleBookmark: (uri: string, cid: string) => Promise<void>;
  refresh: () => Promise<void>;
}
```

**说明**：`isBookmarked` 是同步 `Set.has()` 操作。`toggleBookmark` 内部判断当前状态后调用 add/remove。书签存储于服务端 `app.bsky.graph.bookmark` 集合，通过 `client.getBookmarks(50)` 加载。自动加载（mount 时调用 `load()`），内建一次 1.5 秒重试。

[来源](packages/app/src/hooks/useBookmarks.ts#L5-L59)

---

## 列表

### `useLists`

```typescript
function useLists(client: BskyClient | null, actor?: string): {
  lists: ListView[];
  loading: boolean;
  cursor: string | undefined;
  error: string | null;
  createList: (name: string, purpose: ListPurpose, description?: string) => Promise<ListView | null>;
  deleteList: (uri: string) => Promise<void>;
  updateListInfo: (uri: string, params: { name?: string; description?: string }) => Promise<void>;
  refresh: () => Promise<void>;
}
```

**说明**：获取指定 actor 的所有订阅列表。`actor` 可选，不传则取当前登录用户（通过 `client.getHandle()`）。`createList` 在 API 返回后构造本地 `ListView` 对象并乐观插入列表头部。

[来源](packages/app/src/hooks/useLists.ts#L5-L80)

### `useListDetail`

```typescript
function useListDetail(client: BskyClient | null, listUri: string): {
  list: ListView | null;
  loading: boolean;
  error: string | null;
  members: ListItemView[];
  membersCursor: string | undefined;
  loadMoreMembers: () => Promise<void>;
  feed: PostView[];
  feedCursor: string | undefined;
  loadMoreFeed: () => Promise<void>;
  isMuted: boolean;
  toggleMute: () => Promise<void>;
  addMember: (subjectDid: string) => Promise<void>;
  removeMember: (itemUri: string) => Promise<void>;
  updateListInfo: (params) => Promise<void>;
  deleteList: () => Promise<void>;
  refresh: () => Promise<void>;
}
```

**说明**：同时管理成员列表和列表 Feed 两种数据，两者独立分页。`load()` 通过 `Promise.all` 并行获取列表详情和 Feed。`toggleMute` 调用 `muteActorList`/`unmuteActorList`。

[来源](packages/app/src/hooks/useListDetail.ts#L5-L123)

---

## 社交圈

### `useSocialCircle`

```typescript
function useSocialCircle(client: BskyClient | null): {
  state: SocialCircleState;
  analyze: (options: SocialCircleOptions) => Promise<void>;
  reset: () => void;
}

interface SocialCircleState {
  status: 'idle' | 'loading' | 'done' | 'error';
  progress: { phase: 'identity' | 'posts' | 'interactions' | 'outgoing' | 'graph' | 'done'; current: number; total: number };
  result: SocialCircleResult | null;
  error: string | null;
}

interface SocialCircleOptions {
  handle: string;
  maxPosts?: number;   // 默认 50
}

interface SocialCircleResult {
  summary: { totalInteractions; uniqueInteractors; mutualFollows; coreCircleCount; extendedCircleCount; postsAnalyzed };
  core: InteractorInfo[];
  extended: InteractorInfo[];
  potential: InteractorInfo[];
  mermaidCode: string;
}
```

**分析管线**（6 个阶段，串行执行，通过 `progress` 实时反馈）：
1. **Identity** — `client.resolveHandle(handle)` 获取 DID
2. **Posts** — `getAuthorFeed` 获取帖子（不含转发）
3. **Interactions** — 逐帖获取 `getLikes`/`getRepostedBy`，聚合所有互动者
4. **Outgoing** — `getActorLikes` 获取用户自己对别人的点赞
5. **Graph** — `getRelationships` 确定互关关系，按加权总分排序

**权重公式**（导出为 `INTERACTION_WEIGHTS` 常量）：赞 × 1.5 + 转发 × 2.0 + 回复 × 3.0（双向加权）。纯函数 `computeWeight()`、`computeIncomingWeight()`、`computeOutgoingWeight()`、`aggregateInteractions()` 可被 AI 工具系统复用。

详见 [AT Play 实验功能](at-play-实验功能.md)。

[来源](packages/app/src/hooks/useSocialCircle.ts#L59-L65) | [来源](packages/app/src/hooks/useSocialCircle.ts#L86-L135)

---

## 实用工具

### `useNavigation`

```typescript
function useNavigation(): {
  currentView: AppView;
  canGoBack: boolean;
  goTo: (v: AppView) => void;
  goBack: () => void;
  goHome: () => void;
}
```

通过 `createNavigation()` Store 订阅（来自 `state/navigation.ts`），管理视图栈。`AppView` 为联合类型（见 [导航状态机](导航状态机.md)）。

[来源](packages/app/src/hooks/useNavigation.ts#L5-L20)

### `useNotifications`

```typescript
function useNotifications(client: BskyClient | null): {
  notifications: Notification[];
  loading: boolean;
  unreadCount: number;
  error: string | null;
  refresh: () => Promise<void>;
}
```

`unreadCount` 在客户端计算（`notifications.filter(n => !n.isRead).length`）。通过 `client.listNotifications(30)` 加载，内建一次 1.5 秒重试。

[来源](packages/app/src/hooks/useNotifications.ts#L5-L33)

### `useChatHistory`

```typescript
function useChatHistory(storage?: ChatStorage): {
  conversations: ChatSummary[];
  loading: boolean;
  loadConversation: (id: string) => Promise<ChatRecord | null>;
  saveConversation: (chat: ChatRecord) => Promise<void>;
  deleteConversation: (id: string) => Promise<void>;
  refresh: () => Promise<void>;
  storage: ChatStorage;
}
```

**说明**：不传 `storage` 时自动使用 `getDefaultChatStorage()`（TUI 使用 `FileChatStorage`，PWA 使用 `IndexedDBChatStorage`）。`saveConversation` 和 `deleteConversation` 调用后自动 `refresh()` 更新列表。

[来源](packages/app/src/hooks/useChatHistory.ts#L5-L39) | [来源](packages/app/src/services/chatStorage.ts#L114-L132)

### `useI18n`

```typescript
function useI18n(initialLocale?: Locale): {
  t: (key: string, params?: Record<string, string | number>) => string;
  locale: string;
  setLocale: (l: Locale) => void;
  availableLocales: Locale[];
  localeLabels: Record<Locale, string>;
}
```

通过 `getI18nStore()` 单例 Store 订阅。支持三语言（zh/en/ja）运行时切换与插值语法。详见 [国际化（i18n）系统](国际化-i18n-系统.md)。

[来源](packages/app/src/i18n/useI18n.ts#L6-L20)

### `useScrollRestore`

```typescript
function useScrollRestore(
  key: string | undefined,  // 视图唯一键（如 'profile-actor'）
  scrollRef: any,           // 滚动容器 ref（null = 全局 scroll）
  ready: boolean,           // 数据是否就绪
): void
```

在组件挂载时恢复滚动位置（从模块级 `_scrollTops` Map 读取），卸载时保存当前滚动位置。仅首次 mount 恢复一次（`restored` ref 保护）。导出的纯函数 `saveScrollTop()`/`getScrollTop()` 可供非 React 代码使用。

[来源](packages/app/src/hooks/useScrollRestore.ts#L28-L51)

### `registerWidget` / Widget 辅助函数

```typescript
// widgetRegistry.ts
function registerWidget(def: WidgetDefinition, render: (props: WidgetProps) => ReactNode): void;
function getWidget(id: string): WidgetEntry | undefined;
function getWidgetsForView(viewType: string): WidgetEntry[];

// widgetStore.ts
function getEnabledWidgetIds(): string[];
function isWidgetEnabled(id: string): boolean;
function enableWidget(id: string): void;
function disableWidget(id: string): void;
function toggleWidget(id: string): boolean;
function getEnabledWidgetsForView(viewType: string): (WidgetDefinition & { enabled: boolean })[];
function initEnabledWidgets(ids: string[]): void;
function setWidgetToggleCallback(fn: ((id: string) => void) | null): void;
function initAIChatSession(): string;
function getAIChatSessionId(): string;
function setAIChatSessionId(id: string): void;
function resetAIChatSession(): string;
function setComposeDraftForWidgets(text: string): void;
function getComposeDraftForWidgets(): string;
function registerComposeDraftSetter(fn: ((text: string) => void) | null): void;
function replaceComposeDraft(text: string): void;
function setFocusedProfileActor(actor: string | null): void;
function getFocusedProfileActor(): string | null;
```

`widgetStore` 维护了 AI Chat 会话 ID 的桥接和 ComposePage 草稿桥接。`WidgetContext` 接口提供 `composeDraft`、`onComposeDraftChange`、`viewType`、`client`、`threadUri` 等上下文。`WidgetDefinition` 新增 `headerButtons` 字段。详见 [Widget 组件系统](widget-组件系统.md)。

[来源](packages/app/src/hooks/widgetRegistry.ts#L44-L58) | [来源](packages/app/src/hooks/widgetStore.ts#L1-L73)

---

## 推荐阅读

- [Store 订阅模式](store-订阅模式.md) — 理解纯对象 Store + 单监听器 Subscribe 的实现原理
- [三层架构详解](三层架构详解.md) — Hook 层在整个架构中的位置（core → app → tui/pwa）
- [AI 对话引擎](ai-对话引擎.md) — `AIAssistant` 类的多轮工具调用循环实现
- [38 个 AI 工具系统](38-个-ai-工具系统.md) — `createTools` 工厂函数，被 `useAIChat` 内部调用
- [AI 系统提示词与多提供商](ai-系统提示词与多提供商.md) — 集中式提示词管理、多 LLM 提供商注册表
- [Direct Messages 私信系统](direct-messages-私信系统.md) — DM 相关 Hook 背后的协议实现
- [AT Play 实验功能](at-play-实验功能.md) — 社交圈分析的数据管线与权重图构建