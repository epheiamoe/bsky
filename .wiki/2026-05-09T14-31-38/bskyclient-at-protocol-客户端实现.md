以下是更新后的 Wiki 页面，所有行号引用已修正为与当前 835 行版本的 `client.ts` 一致，内容细节已核实。

---

# BskyClient：AT Protocol 客户端实现

`BskyClient` 是整个项目的网络层基石——它是 Bluesky **AT Protocol** 的完整 HTTP 客户端封装，负责所有与 **PDS**（Personal Data Server）、**AppView**（公共 API）和 **Chat 服务**的通信。类内部维护会话状态、自动处理 Token 过期与刷新、并根据端点是否需要认证在两条路由之间透明切换。

[来源](packages/core/src/at/client.ts#L55-L834)

## 三 ky 实例：端点分流架构

构造函数中创建三个独立的 **ky** HTTP 客户端实例，每个指向不同的 AT Protocol 服务端点：

| 实例 | 目标 URL | 挂载 hook | 用途 |
|---|---|---|---|
| `this.ky` | `https://bsky.social/xrpc` | `afterResponse: [withRefresh]` | 认证操作（发帖、关注、私信等） |
| `this.publicKy` | `https://public.api.bsky.app/xrpc` | 无 | 公开只读查询（解析 handle、获取公开资料） |
| `this.chatKy` | `https://api.bsky.chat/xrpc` | `afterResponse: [withRefresh]` | 私信（DM）操作 |

三个实例共享相同的超时（30 秒）和重试配置（对 408/413/429/500/502/503/504 状态码最多重试 1 次）。`BSKY_SERVICE` 是主 PDS 端点，所有需要 **session** 的写操作和认证读操作都走它；`PUBLIC_API` 是无需认证的 **AppView** 端点，用于公开数据的检索；`CHAT_API` 是独立的聊天服务，处理 `chat.bsky.*` 命名空间的全部请求。

[来源](packages/core/src/at/client.ts#L51-L129)

## 自动 JWT 刷新：`afterResponse` hook

整个客户端最精巧的机制隐藏在 `_withRefresh` 函数中。它是一个 ky `afterResponse` hook，在每次 HTTP 响应返回后被调用——无论请求来自 `this.ky` 还是 `this.chatKy`。

### 检测流程

```
响应到达
  ↓
response.ok === false?
  ↓是
status === 400 且 session 存在?
  ↓是
解析 JSON body, 检查 error 字段
  ↓
ExpiredToken 或 InvalidToken?
  ↓是
触发刷新
```

[来源](packages/core/src/at/client.ts#L69-L110)

### 刷新机制

当检测到 Token 过期或无效时，逻辑如下：

1. **共享锁**：`_refreshPromise` 闭包变量充当互斥锁。如果在第一次刷新完成之前又有第二个 400 到达，它不会发起第二个刷新请求，而是直接 `await` 同一个 promise。这避免了并发刷新导致竞态条件。
2. **短延迟**：`await new Promise(r => setTimeout(r, 200))` — 200ms 的刻意延迟，给可能同时发生的其他请求让路。
3. **用 refreshJwt 刷新**：向 `com.atproto.server.refreshSession` 发送 POST 请求，携带 `refreshJwt` 换取新的 `accessJwt` 和 `refreshJwt`。成功则更新 `this.session`。
4. **透明重试**：刷新成功后，用 `fetch`（注意此处直接使用 fetch，而非 ky 实例，避免递归进入 hook）以新的 `accessJwt` 重新发送原始请求。如果重试成功，直接返回 `retryRes`。
5. **静默失效**：如果刷新失败（网络错误或服务端拒绝），`self.session` 被置为 `null`，所有后续需要认证的请求将抛出 `'Not authenticated'` 错误。

刷新失败或非 Token 过期的 400 错误，最终都会落到 `console.error`，记录错误日志。注意网络错误不会清空 session——catch 分支直接返回 `null`，保留现有 session 供后续请求继续尝试。

[来源](packages/core/src/at/client.ts#L67-L110)

## 公共 API vs 认证 API 自动切换

18 个**只读**方法在 `this.ky` 和 `this.publicKy` 之间动态选择：

```typescript
const kyInstance = this.session ? this.ky : this.publicKy;
const headers = this.session ? { headers: this.getAuthHeaders() } : {};
return kyInstance.get('app.bsky.actor.getProfile', {
  searchParams: { actor },
  ...headers,
}).json<ProfileView>();
```

核心逻辑：**如果已登录（`this.session` 不为 null），走认证端点 `this.ky`，否则走公共端点 `this.publicKy`**。这意味着同一个方法在登录前后都能工作，只是后者返回的数据量更少（不包含 `viewer` 状态如点赞、关注关系）。

受此模式影响的方法：`getProfile`、`getAuthorFeed`、`getPostThread`、`getLikes`、`getRepostedBy`、`getFollows`、`getFollowers`、`getList`、`getLists`、`getListFeed`、`getPopularFeedGenerators`、`getFeedGenerator`、`getTrends`、`getFeed`、`listRecords`、`getRecord`、`getActorLikes`、`getRelationships`。其中 `getActorLikes` 和 `getRelationships` 两个方法为 [AT Play 实验功能](at-play-实验功能.md) 的社交圈分析提供数据。

有 10 个只读方法始终要求认证（直接使用 `this.ky`）：`searchPosts`（代码中有注释说明公共 API 返回 403）、`getTimeline`、`getSuggestedFollows`、`getListBlocks`、`getListMutes`、`getListsWithMembership`、`getBookmarks`、`getDrafts`、`getSuggestedFeeds`、`listNotifications`。

另外两个方法始终使用公共端点 `this.publicKy`，即使已登录也不切换：`resolveHandle`（解析 DID 无需认证上下文）和 `searchActors`（Bluesky 公共搜索端点支持未认证请求）。

[来源](packages/core/src/at/client.ts#L195-L202)、[来源](packages/core/src/at/client.ts#L234-L243)、[来源](packages/core/src/at/client.ts#L267-L273)

## 70+ API 方法的命名空间覆盖

所有方法的路径直接使用 AT Protocol 的 **Lexicon** 命名约定（如 `app.bsky.feed.getTimeline`），与 XRPC 端点路径一一对应。按 namespace 分类：

### `com.atproto.*` — 底层协议操作

| 方法 | 端点 |
|---|---|
| `login()` | `com.atproto.server.createSession` |
| `resolveHandle()` | `com.atproto.identity.resolveHandle` |
| `createRecord()` | `com.atproto.repo.createRecord` |
| `putRecord()` | `com.atproto.repo.putRecord` |
| `deleteRecord()` | `com.atproto.repo.deleteRecord` |
| `listRecords()` | `com.atproto.repo.listRecords` |
| `getRecord()` | `com.atproto.repo.getRecord` |
| `uploadBlob()` | `com.atproto.repo.uploadBlob` |
| `downloadBlob()` | `com.atproto.sync.getBlob` |

**`login()` 流程**包含三个关键步骤：① 向入站 PDS 发送 `createSession` 请求，响应中包含 `CreateSessionResponse` 和可选的 `didDoc`；② 从 DID 文档的 `#atproto_pds` 服务条目发现用户真实 PDS 地址；③ 若 `didDoc` 未随响应返回，回退调用 `_discoverPdsFromDid()` 通过 `com.atproto.identity.resolveDid` 重新查询。最后将 `this.ky` 重新创建指向真实 PDS，后续请求自动路由到用户归属服务器。

[来源](packages/core/src/at/client.ts#L136-L177)、[来源](packages/core/src/at/client.ts#L179-L187)

### `app.bsky.*` — 社交功能

**Feed / 帖子**：`getTimeline`、`getAuthorFeed`、`getPostThread`、`getLikes`、`getRepostedBy`、`searchPosts`、`getFeed`、`getSuggestedFeeds`、`getFeedGenerator`、`getPopularFeedGenerators`、`deletePost`、`getTrends`。此外有 `getVideoThumbnailUrl()` 和 `getVideoPlaylistUrl()` 两个 URL 构造器（非 API 调用），返回视频资源的 CDN 路径，格式为 `https://video.bsky.app/watch/{did}/{cid}/thumbnail.jpg` 和 `https://video.bsky.app/watch/{did}/{cid}/playlist.m3u8`。

[来源](packages/core/src/at/client.ts#L204-L211)、[来源](packages/core/src/at/client.ts#L644-L654)、[来源](packages/core/src/at/client.ts#L695-L701)

**Actor**：`getProfile`、`searchActors`、`putProfile`。`putProfile` 通过 `com.atproto.repo.putRecord` 写入 `app.bsky.actor.profile` 集合，使用固定 `rkey: 'self'` 标识用户档案记录，可更新 `displayName`、`description`、`avatar`、`banner`。注意 `putProfile` 直接构造 HTTP 请求体而非调用内部的 `putRecord` 方法，因为它的参数签名包含了完整的 blob 对象而非原始 record。

```typescript
const record = {
  $type: 'app.bsky.actor.profile',
  displayName: params.displayName,
  description: params.description,
};
if (params.avatar) record.avatar = params.avatar;
if (params.banner) record.banner = params.banner;
await this.ky.post('com.atproto.repo.putRecord', {
  headers: this.getAuthHeaders(),
  json: { repo: did, collection: 'app.bsky.actor.profile', rkey: 'self', record },
});
```

[来源](packages/core/src/at/client.ts#L786-L799)

**Graph（社交图谱）**：`getFollows`、`getFollowers`、`getSuggestedFollows`、`follow`、`unfollow`、`createList`（支持 `avatar` 参数，接受 `UploadBlobResponse['blob']` 类型）、`deleteList`、`updateList`（先通过 `getList` fetch 现存 list，提取 `purpose`、`name`、`createdAt`，再调用 `putRecord` 部分更新）、`getList`、`getLists`、`getListFeed`、`getListBlocks`、`getListMutes`、`getListsWithMembership`、`addListItem`、`removeListItem`、`blockList`、`unblockList`、`muteActorList`、`unmuteActorList`。其中 `getLists` 和 `getListsWithMembership` 支持 `purposes` 数组参数通过 `URLSearchParams` 的 `append` 方法传输多值。

[来源](packages/core/src/at/client.ts#L275-L457)

**Notification**：`listNotifications`（支持可选的 `priority` 布尔参数过滤高优先级通知，传入后以 `params.priority = priority` 形式加入 query string）。

[来源](packages/core/src/at/client.ts#L459-L467)

**Bookmark（扩展功能）**：`createBookmark`、`deleteBookmark`（静默忽略不存在的 bookmark，通过空 catch 块实现）、`getBookmarks`。

[来源](packages/core/src/at/client.ts#L626-L663)

**Draft（扩展功能）**：`createDraft`、`updateDraft`（注意请求体结构为 `{ draft: { id, draft } }` 嵌套）、`getDrafts`、`deleteDraft`。

[来源](packages/core/src/at/client.ts#L665-L693)

**AT Play（实验功能）**：`getActorLikes`（获取指定用户点赞过的帖子列表，通过 `app.bsky.feed.getActorLikes` 端点）、`getRelationships`（批量查询用户之间的关系状态——`following` 和 `followedBy`。实现中自动将 `others` 数组按 30 个一组分块请求，避免 XRPC 参数过长，再合并结果。每个分块通过 `URLSearchParams` 构建多个 `others` 参数）。

[来源](packages/core/src/at/client.ts#L801-L833)

### `chat.bsky.*` — 私信

`listConvos`、`getConvoForMembers`、`getMessages`、`sendMessage`、`addReaction`、`removeReaction`、`updateRead`、`deleteMessageForSelf`、`muteConvo`、`unmuteConvo`、`leaveConvo`。

这些方法统一通过 `chatGet<T>()` 和 `chatPost<T>()` 两个私有泛型辅助方法调用 `this.chatKy`，而非直接操作 ky 实例。注意 `getConvoForMembers` 将 `members` 数组以逗号拼接为字符串参数传输。

[来源](packages/core/src/at/client.ts#L705-L784)

## 类型系统

`types.ts` 定义了完整的 AT Protocol 类型体系，全部为纯接口（interface）和类型别名，无运行时依赖（除 `parseAtUri` 函数外）。

[来源](packages/core/src/at/types.ts#L1-L497)

### 核心视图类型

- **`PostView`**：帖子的完整视图，包含 `uri`、`cid`、`author`（ProfileViewBasic）、`record`（PostRecord）、嵌入内容（`embed`）、计数（`likeCount`、`replyCount`、`repostCount`）以及 `viewer`（当前用户的交互状态）。新增 `embedCount` 字段用于多 embed 场景。
- **`ProfileView` / `ProfileViewBasic`**：`Basic` 仅含 `did`、`handle`、`displayName`、`avatar`，完整版增加 `description`、各种计数（`followersCount`、`followsCount`、`postsCount`）和 `banner`。
- **`ViewerState`**：当前用户与此对象的交互状态——`muted`、`blockedBy`、`following`（follow URI）、`followedBy`、`like`（like URI）、`repost`。
- **`ThreadViewPost`**：递归线程结构，内含 `post`、`parent`、`replies`，`parent` 和 `replies` 可能是 `ThreadViewPost` 或 `NotFoundPost`。

[来源](packages/core/src/at/types.ts#L63-L114)

### 嵌入类型

五种嵌入类型对应 Bluesky 的内容嵌入模型：`ImageEmbed`、`ExternalEmbed`（链接卡片）、`RecordEmbed`（引用帖子）、`RecordWithMediaEmbed`（引用+媒体）、`VideoEmbed`（视频，包含 `aspectRatio`、`alt`、`captions`）。每个嵌入的 `$type` 字段用于运行时判别。

[来源](packages/core/src/at/types.ts#L29-L56)

### 会话与记录

`CreateSessionResponse` 包含 `accessJwt`、`refreshJwt`、`handle`、`did`、`email`、`emailConfirmed`、`emailAuthFactor`。`parseAtUri()` 函数将 `at://did:plc:abc123/app.bsky.feed.post/3lk123` 格式解析为 `{ uri, did, collection, rkey }` 结构，这在 `deletePost`、`deleteRecord` 等方法中被广泛使用。

[来源](packages/core/src/at/types.ts#L8-L19)、[来源](packages/core/src/at/types.ts#L247-L255)

### 社交图谱与列表类型

`ListPurpose` 类型别名定义了三种列表用途：`'app.bsky.graph.defs#modlist'`（moderation 列表）、`'app.bsky.graph.defs#curatelist'`（策展列表）、`'app.bsky.graph.defs#referencelist'`（参考列表）。`ListViewerState` 记录当前用户对列表的交互状态（`muted?`、`blocked?`）。`ListViewBasic` 和 `ListView` 构成列表的层级类型体系，后者多出 `creator`（ProfileViewBasic）、`description`、`descriptionFacets`。`ListItemView` 将列表成员映射为 `{ uri, subject: ProfileViewBasic }`。相关的响应类型包括 `GetListResponse`（含 `items` 数组）、`GetListsResponse`、`GetListBlocksResponse`、`GetListMutesResponse`、`GetListsWithMembershipResponse`（含 `ListWithMembership[]`，每个元素包含 `list` 和可选的 `listItem`）。

[来源](packages/core/src/at/types.ts#L333-L397)

### Draft 与 Bookmark 类型

- **Draft**：`DraftInput` 包含 `posts: DraftPostInput[]` 数组和可选的 `deviceId`、`deviceName`、`langs`。`DraftView` 扩展了 `DraftInput` 嵌套结构——`DraftView.draft` 即为 `DraftInput`，外加 `id`、`createdAt`、`updatedAt`。响应类型为 `DraftsResponse`（含 `drafts: DraftView[]`）和 `CreateDraftResponse`（仅 `id`）。
- **Bookmark**：`BookmarkResult` 包含 `subject`（被收藏帖子的 uri/cid）、`createdAt`、`item`（完整 `PostView`）。`GetBookmarksResponse` 返回 `bookmarks: BookmarkResult[]`。另有 `DeleteBookmarkRequest` 记录待删除的 bookmark uri。

[来源](packages/core/src/at/types.ts#L304-L329)、[来源](packages/core/src/at/types.ts#L286-L302)

### Feed 与趋势类型

`FeedGeneratorView` 是 Feed 生成器的完整视图（含 `creator`、`displayName`、`likeCount`、`viewer`）。`TrendingTopic` 包含 `topic`、`displayName`、`description`、`link`。`GetTrendsResponse` 支持可选的 `personalizedFor` 字段指示个性化目标 DID。

[来源](packages/core/src/at/types.ts#L127-L138)、[来源](packages/core/src/at/types.ts#L217-L228)

### 聊天类型

`ConvoView` 包含 `id`、`rev`、`members`、`lastMessage`、`lastReaction`（`{ message: MessageView; reaction: ReactionView }`）、`muted`、`status`（`'request' | 'accepted'`）、`unreadCount`、`kind`（`'direct' | 'group'`）。消息有三种变体：`MessageView`（含 `text`、`facets`、`embed`、`reactions: ReactionView[]`）、`DeletedMessageView`、`SystemMessageView`。`ReactionView` 包含 `value`（表情符号字符串）、`sender.did`、`createdAt`。`MessageInput` 支持可选的 `facets` 和 `embed`（仅 `app.bsky.embed.record` 类型）。`SendMessageResponse` 提供了发送返回的 `id`/`rev`/`text` 精简视图。

[来源](packages/core/src/at/types.ts#L401-L476)

### Actor 点赞与关系类型

- **`GetActorLikesResponse`**：`{ cursor?, feed: Array<{ post: PostView }> }`，与 `GetFeedResponse` 结构相似但仅包含 `post` 字段，无 `reply` 或 `reason`。
- **`RelationshipInfo`**：`{ did, following?, followedBy? }`，标记两个用户间是否存在关注关系（值为 AT URI）。
- **`GetRelationshipsResponse`**：`{ actor?, relationships: RelationshipInfo[] }`，返回批量查询结果。

[来源](packages/core/src/at/types.ts#L478-L497)

## 会话生命周期与外部集成

`BskyClient` 对外暴露五个会话查询方法：`getDID()`、`getHandle()`、`getAccessJwt()`、`isAuthenticated()`、`restoreSession(session, pdsUrl?)`。其中 `restoreSession` 接受一个 `CreateSessionResponse` 对象直接赋值给 `this.session` 并重建 `this.ky` 实例，不发起任何网络请求——这是唯一不经过登录流程建立 session 的途径。这为 [认证与会话管理](认证与会话管理.md) 中的 PWA 持久化场景提供了入口：从 localStorage 恢复 session 后调用 `restoreSession()` 即可跳过重新登录。

在架构层面，`BskyClient` 实例通过 `createAuthStore` 单例化，由 [认证与会话管理](认证与会话管理.md) 中的 `createAuthStore` 创建（见 `packages/app/src/stores/auth.ts`），并通过 `createTools` 注入到所有 36 个 AI 工具中，确保所有工具的写操作共享同一个 session。

[来源](packages/core/src/at/client.ts#L596-L624)
[来源](packages/app/src/stores/auth.ts#L19-L74)

---

**推荐阅读**：[36 个 AI 工具：从定义到执行](36-个-ai-工具-从定义到执行.md) 展示了 BskyClient 如何作为底层驱动被 AI 工具调用；[AT Protocol 类型系统与工具](at-protocol-类型系统与工具.md) 深入解析 `parseAtUri` 和 Feed 配置；[AT Play 实验功能](at-play-实验功能.md) 中 `getActorLikes` 和 `getRelationships` 是社交圈分析数据管线的核心依赖。