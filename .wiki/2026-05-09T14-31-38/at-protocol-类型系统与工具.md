# AT Protocol 类型系统与工具

整个 `@bsky/core` 包的 API 数据模型和工具函数集中在两个文件中：`types.ts` 定义所有 Bluesky 数据流的 TypeScript 接口，`feeds.ts` 提供内置 Feed 的 URI 常量与解析工具。它们支撑了客户端请求的响应类型推断、AI 工具的 URI 解析，以及 Feed 切换的短名称路由。

## 一、AT URI 解析：正则与结构

**AT URI** 是 Bluesky 生态中定位资源的统一格式，形如：

```
at://did:plc:abc123/app.bsky.feed.post/3lk123
```

`parseAtUri` 函数使用一行正则提取三个核心段：

```typescript
const match = uri.match(/^at:\/\/(did:[^:]+:[^/]+)\/([^/]+)\/([^/]+)$/);
```

| 捕获组 | 映射字段 | 含义 |
|--------|----------|------|
| `match[1]` | `did` | 用户 DID，如 `did:plc:abc123` 或 `did:web:example.com` |
| `match[2]` | `collection` | 记录集名称，如 `app.bsky.feed.post` |
| `match[3]` | `rkey` | 记录唯一键，如 `3lk123` |

返回的 `AtUri` 接口保留原始 `uri`、`did`、`collection`、`rkey` 四个字段。正则第一个捕获组从旧版的 `did:plc:[^/]+` 升级为 `did:[^:]+:[^/]+`，现在同时支持 `did:plc:` 和 `did:web:` 两种 DID 方法——后者在自托管 PDS 场景中使用。无效 URI 抛出 `Error`。[来源](packages/core/src/at/types.ts#L1-L18)

**在 AI 工具中的典型用法**：AI 工具接收到用户提供的 AT URI 后，先 `parseAtUri` 解析出 `did` + `collection` + `rkey`，再调用 `client.getRecord(did, collection, rkey)` 获取完整记录。这种方式在 `get_post_details`、`get_external_link`、`list_records` 等 10+ 个工具中反复出现。[来源](packages/core/src/ai/tools.ts#L86-L89)

详见 [BskyClient：AT Protocol 客户端实现](bskyclient-at-protocol-客户端实现.md) 中关于记录 API 的部分，以及 [36 个 AI 工具：从定义到执行](36-个-ai-工具-从定义到执行.md) 中各工具对 `parseAtUri` 的调用场景。

## 二、核心视图类型

视图（View）是 Bluesky API 返回的只读数据结构，区别于写入用的记录（Record）。所有视图类型集中在 `types.ts`。

### PostView — 帖子视图

帖子视图聚合了帖子本身（`record`）及其社交元数据：

```typescript
interface PostView {
  uri: string;
  cid: string;
  author: ProfileViewBasic;
  record: PostRecord;          // 帖子的实际内容
  embed?: Record<string, unknown>;
  embedCount?: number;
  likeCount?: number;
  replyCount?: number;
  repostCount?: number;
  indexedAt?: string;
  viewer?: ViewerState;        // 当前用户视角的状态
}
```

`PostRecord` 包含 `text`、`createdAt`、`embed`、`facets`、`reply` 等写入端字段。Embed 家族有五种变体：`ImageEmbed`（图片）、`ExternalEmbed`（链接卡片）、`RecordEmbed`（引用帖子）、`RecordWithMediaEmbed`（引用 + 媒体）、`VideoEmbed`（视频，含可选的 `aspectRatio`、`alt`、`captions`）。每种 Embed 通过 `$type` 字段做运行时判别。[来源](packages/core/src/at/types.ts#L20-L74)

### ProfileView / ProfileViewBasic — 用户视图

`ProfileViewBasic` 是轻量版本，仅包含 `did`、`handle`、`displayName`、`avatar`，用于列表场景。`ProfileView` 继承它并加上 `description`、`followersCount`、`followsCount`、`postsCount`、`banner`、`viewer` 等详情字段。[来源](packages/core/src/at/types.ts#L76-L91)

### ViewerState — 关系状态

标记当前用户与目标之间的关系：

| 字段 | 含义 |
|------|------|
| `muted` | 是否静音 |
| `blockedBy` | 是否被屏蔽 |
| `following` | 关注关系的 AT URI（有值表示已关注） |
| `followedBy` | 对方是否关注了自己 |
| `like` | 点赞记录 URI |
| `repost` | 转发记录 URI |

[来源](packages/core/src/at/types.ts#L93-L100)

### ThreadViewPost — 线程视图

递归结构组织帖子及其回复树：

```typescript
interface ThreadViewPost {
  $type: 'app.bsky.feed.defs#threadViewPost';
  post: PostView;
  parent?: ThreadViewPost | NotFoundPost;
  replies?: Array<ThreadViewPost | NotFoundPost>;
}
```

`NotFoundPost` 用于标记已删除或不可见的帖子节点，避免递归断裂。[来源](packages/core/src/at/types.ts#L102-L113)

这些类型在设计上与 [时间线、帖子与线程](时间线-帖子与线程.md) 中的 `useTimeline`、`useThread` Hook 一一对应——Hook 直接消费这些视图类型进行渲染。

## 三、ListView — 列表类型

列表（List）用于策展、屏蔽和引用，有三种用途由 `ListPurpose` 限定：

```typescript
type ListPurpose =
  | 'app.bsky.graph.defs#modlist'       // 屏蔽/静音列表
  | 'app.bsky.graph.defs#curatelist'    // 策展列表
  | 'app.bsky.graph.defs#referencelist'; // 引用列表
```

`ListViewBasic` 包含 `uri`、`cid`、`name`、`purpose`、`avatar`、`listItemCount`，以及 `labels`（标签数组）和 `viewer`（`ListViewerState`，含 `muted` 和 `blocked`）。`ListView` 在其基础上增加 `creator`（ProfileViewBasic）、`description`、`descriptionFacets`。`ListItemView` 表示列表中的单个成员项（`uri` + `subject`）。辅助类型 `ListWithMembership` 将 `ListView` 与可选的 `ListItemView` 关联，用于判断当前用户是否在列表中。[来源](packages/core/src/at/types.ts#L331-L397)

响应类型方面，`GetListResponse` 返回 `list` + `items`；`GetListsResponse`、`GetListBlocksResponse`、`GetListMutesResponse` 返回 `lists: ListView[]`；`GetListsWithMembershipResponse` 返回 `listsWithMembership: ListWithMembership[]`；`GetListFeedResponse` 返回带 `reply`/`reason` 元数据的帖文 feed。[来源](packages/core/src/at/types.ts#L362-L397)

这些类型在 [书签、列表、通知与搜索](书签-列表-通知与搜索.md) 中对应 `useList`、`useLists` 等 Hook 的数据流。

## 四、ConvoView — 私信会话

Chat/DM 体系的核心视图：

| 字段 | 含义 |
|------|------|
| `id` | 会话 ID |
| `rev` | 修订版本号 |
| `members` | 参与者列表 |
| `lastMessage` | 最后一条消息（联合类型） |
| `lastReaction` | 最后一条表情反应（含 `message` + `reaction` 引用） |
| `muted` | 是否静音 |
| `status` | `'request' \| 'accepted'` |
| `unreadCount` | 未读数 |
| `kind` | `'direct' \| 'group'` |

`lastReaction` 字段是新近加入的，指向 `{ message: MessageView; reaction: ReactionView }`，让会话列表能直接展示最新的表情回应而不必加载全文。[来源](packages/core/src/at/types.ts#L401-L411)

消息有三种视图：`MessageView`（普通消息，含 `text`、`facets`、`embed`、`reactions`）、`DeletedMessageView`（已删除，仅保留元数据）、`SystemMessageView`（系统消息内容在 `data` 中）。`ReactionView` 表示对消息的表情反应，包含 `value`（emoji）、`sender.did`、`createdAt`。`MessageInput` 用于发送消息，支持可选的 `facets` 和 `embed`（引用帖子）。[来源](packages/core/src/at/types.ts#L413-L454)

响应类型：`ConvoListResponse`（`convos: ConvoView[]`）、`GetMessagesResponse`（消息联合数组）、`GetConvoResponse`（单个 `convo: ConvoView`）、`SendMessageResponse`（返回 `id` + `rev` + `text` + `sender` + `sentAt`）。[来源](packages/core/src/at/types.ts#L456-L476)

这些类型在 [私信（DM）与聊天](私信-dm-与聊天.md) 中被 `useConvoList` 和 `useChatMessages` 直接消费。

## 五、响应类型全景

视图类型描述单个资源的结构，响应类型则封装 API 端点的返回值。`types.ts` 按功能领域组织了以下响应类型分组：

### Feed / 时间线

| 类型 | 用途 |
|------|------|
| `TimelineResponse` | 主页时间线，`feed: Array<{ post, reply?, reason? }>` |
| `AuthorFeedResponse` | 用户时间线，结构与 TimelineResponse 一致 |
| `SearchPostsResponse` | 搜索结果，`posts: PostView[]` + `hitsTotal?` |
| `PostThreadResponse` | 帖子线程，`thread: ThreadViewPost \| NotFoundPost` |
| `GetFeedResponse` | 自定义 Feed，`feed: Array<{ post, reply?, reason? }>` |
| `GetFeedGeneratorResponse` | Feed Generator 详情 + `isOnline` / `isValid` 状态 |
| `GetActorLikesResponse` | 用户点赞 feed，`feed: Array<{ post }>` |

[来源](packages/core/src/at/types.ts#L147-L166, L203-L210, L230-L234, L480-L483)

### 社交关系

| 类型 | 用途 |
|------|------|
| `GetLikesResponse` | 点赞列表，`likes: Array<{ actor, indexedAt, createdAt }>` |
| `GetRepostedByResponse` | 转发列表，`repostedBy: ProfileViewBasic[]` |
| `GetFollowsResponse` | 关注列表，`follows: ProfileViewBasic[]` |
| `GetFollowersResponse` | 粉丝列表，`followers: ProfileViewBasic[]` |
| `GetSuggestedFollowsResponse` | 推荐关注，`suggestions: ProfileView[]` |
| `GetRelationshipsResponse` | 关系查询，`relationships: RelationshipInfo[]`（含 `following`/`followedBy` 状态） |

[来源](packages/core/src/at/types.ts#L168-L201, L486-L496)

### 搜索 / 趋势

| 类型 | 用途 |
|------|------|
| `SearchActorsResponse` | 用户搜索，`actors: ProfileView[]` |
| `TrendingTopic` | 趋势话题，含 `topic`、`displayName`、`description`、`link` |
| `GetTrendsResponse` | 趋势列表，`trends: TrendingTopic[]` + `personalizedFor?` |

[来源](packages/core/src/at/types.ts#L182-L185, L217-L228)

### 记录 / 书签 / 草稿

| 类型 | 用途 |
|------|------|
| `ListRecordsResponse` | PDS 记录列表，`records: Array<{ uri, cid, value }>` |
| `GetRecordResponse` | 单条记录，`uri` + `cid?` + `value` |
| `CreateRecordResponse` | 创建记录结果，返回 `uri` + `cid` |
| `CreateBookmarkResponse` | 书签创建结果，返回 `uri` |
| `DeleteBookmarkRequest` | 删除书签请求体，`{ uri }` |
| `BookmarkResult` | 书签记录，含 `subject` + `createdAt` + `item: PostView` |
| `GetBookmarksResponse` | 书签列表，`bookmarks: BookmarkResult[]` |
| `DraftPostInput` | 草稿单帖输入，`{ text }` |
| `DraftInput` | 草稿整体输入，支持多帖 + `deviceId` + `deviceName` + `langs` |
| `DraftView` | 草稿视图，含 `id` + `draft` + `createdAt` + `updatedAt` |
| `DraftsResponse` | 草稿列表 + `cursor?` |
| `CreateDraftResponse` | 创建草稿结果，返回 `id` |

[来源](packages/core/src/at/types.ts#L236-L329)

### 认证 / 会话

| 类型 | 用途 |
|------|------|
| `CreateSessionResponse` | 登录响应，含 `accessJwt`、`refreshJwt`、`handle`、`did`、`email?` |
| `DidDocument` | DID 文档，含 `id`、`alsoKnownAs?`、`service[]?` |
| `ResolveDidResponse` | DID 解析结果，`did` + `didDoc` + `handle?` |
| `ResolveHandleResponse` | Handle 解析结果，`{ did }` |

[来源](packages/core/src/at/types.ts#L247-L275)

### 其他

| 类型 | 用途 |
|------|------|
| `UploadBlobResponse` | 上传 blob 结果，`blob: { ref, mimeType, size }` |
| `FeedGeneratorView` | Feed Generator 元数据，含 `creator`、`displayName`、`likeCount` |
| `GetFeedGeneratorsResponse` | 批量查询 Feed，`feeds: FeedGeneratorView[]` |
| `GetSuggestedFeedsResponse` | 推荐 Feed 列表，`feeds: FeedGeneratorView[]` + `cursor?` |
| `Notification` | 单条通知，含 `reason`、`reasonSubject?`、`isRead` |
| `ListNotificationsResponse` | 通知列表 + `priority?` + `seenAt?` |

[来源](packages/core/src/at/types.ts#L116-L145, L127-L138, L208-L215, L277-L279)

这些响应类型在 [BskyClient：AT Protocol 客户端实现](bskyclient-at-protocol-客户端实现.md) 中作为每个 API 方法的返回类型使用，并在 [时间线、帖子与线程](时间线-帖子与线程.md)、[书签、列表、通知与搜索](书签-列表-通知与搜索.md)、[私信（DM）与聊天](私信-dm-与聊天.md) 等 Hook 中被转为更扁平的应用层状态。

## 六、Feed 管理：内置源与短名称

### BUILTIN_FEEDS — 两个官方源

```typescript
export const BUILTIN_FEEDS = {
  discover: 'at://did:plc:z72i7hdynmk6r22z27h6tvur/app.bsky.feed.generator/whats-hot',
  following: 'at://did:plc:z72i7hdynmk6r22z27h6tvur/app.bsky.feed.generator/following',
} as const;
```

两个源的 DID 均指向 Bluesky 官方 Feed Generator（`did:plc:z72i7hdynmk6r22z27h6tvur`），collection 为 `app.bsky.feed.generator`，rkey 分别为 `whats-hot` 和 `following`。[来源](packages/core/src/at/feeds.ts#L1-L5)

### RECOMMENDED_FEEDS — 新用户推荐

```typescript
export const RECOMMENDED_FEEDS: FeedInfo[] = [
  { uri: BUILTIN_FEEDS.discover, label: 'Discover', description: 'Bluesky 官方推荐 — 热门内容' },
  { uri: BUILTIN_FEEDS.following, label: 'Following', description: '仅你关注的用户（使用主页时间线）' },
];
```

`FeedInfo` 类型包含 `uri`、`label`、`description`、`avatar`、`creator`。这个数组设计为可扩展——未来可以加入社区源或第三方 Feed Generator 作为推荐。[来源](packages/core/src/at/feeds.ts#L7-L19)

### getFeedLabel — URI 转显示名

给定一个 Feed URI，返回人类可读的标签：

1. 匹配 `BUILTIN_FEEDS.discover` → `'Discover'`
2. 匹配 `BUILTIN_FEEDS.following` → `'Following'`
3. 否则取 URI 的最后一个 `/` 分段作为标签（通常是 Feed Generator 的 rkey）

[来源](packages/core/src/at/feeds.ts#L21-L31)

### resolveFeedId — 短名称转完整 URI

反向操作，用于配置/路由场景：

```typescript
export function resolveFeedId(id: string): string {
  if (id === 'following') return BUILTIN_FEEDS.following;
  if (id === 'discover' || id === 'whats-hot') return BUILTIN_FEEDS.discover;
  return id; // 未匹配时原样返回，可传入完整 URI
}
```

`'whats-hot'` 是 `'discover'` 的别名，两者指向同一 URI。未识别的短名称直接返回输入值，兼容自定义 Feed Generator 的完整 URI 直接传入。[来源](packages/core/src/at/feeds.ts#L33-L40)

## 七、包导出

所有类型和工具函数通过 `packages/core/src/index.ts` 统一导出。`parseAtUri`、`BUILTIN_FEEDS`、`RECOMMENDED_FEEDS`、`getFeedLabel`、`resolveFeedId` 以及全部视图类型（`PostView`、`ProfileView`、`ThreadViewPost`、`ConvoView`、`ListView` 等）和响应类型（`TimelineResponse`、`GetFollowsResponse`、`GetRelationshipsResponse` 等）均属于公共 API surface。消费者只需 `import { parseAtUri, PostView, BUILTIN_FEEDS } from '@bsky/core'` 即可使用。[来源](packages/core/src/index.ts#L1-L61)

---

### 推荐阅读

- [BskyClient：AT Protocol 客户端实现](bskyclient-at-protocol-客户端实现.md) — 这些类型在客户端方法中的完整用法
- [36 个 AI 工具：从定义到执行](36-个-ai-工具-从定义到执行.md) — `parseAtUri` 在 AI 工具链中的 10+ 调用点
- [时间线、帖子与线程](时间线-帖子与线程.md) — PostView / ThreadViewPost 在 Hook 层的消费
- [私信（DM）与聊天](私信-dm-与聊天.md) — ConvoView / MessageView 驱动的聊天 UI 数据流
- [书签、列表、通知与搜索](书签-列表-通知与搜索.md) — ListView / Notification 在各功能 Hook 中的应用