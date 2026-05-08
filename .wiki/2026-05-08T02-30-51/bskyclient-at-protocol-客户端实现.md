# BskyClient：AT Protocol 客户端实现

`BskyClient` 是整个项目的网络层基石——它是 Bluesky **AT Protocol** 的完整 HTTP 客户端封装，负责所有与 **PDS**（Personal Data Server）、**AppView**（公共 API）和 **Chat 服务**的通信。类内部维护会话状态、自动处理 Token 过期与刷新、并根据端点是否需要认证在两条路由之间透明切换。

## 三 ky 实例：端点分流架构

构造函数中创建三个独立的 **ky** HTTP 客户端实例，每个指向不同的 AT Protocol 服务端点：

| 实例 | 目标 URL | 挂载 hook | 用途 |
|---|---|---|---|
| `this.ky` | `https://bsky.social/xrpc` | `afterResponse: [withRefresh]` | 认证操作（发帖、关注、私信等） |
| `this.publicKy` | `https://public.api.bsky.app/xrpc` | 无 | 公开只读查询（解析 handle、获取公开资料） |
| `this.chatKy` | `https://api.bsky.chat/xrpc` | `afterResponse: [withRefresh]` | 私信（DM）操作 |

三个实例共享相同的超时（30 秒）和重试配置（对 408/413/429/500/502/503/504 状态码最多重试 1 次）。`BSKY_SERVICE` 是主 PDS 端点，所有需要 **session** 的写操作和认证读操作都走它；`PUBLIC_API` 是无需认证的 **AppView** 端点，用于公开数据的检索；`CHAT_API` 是独立的聊天服务，处理 `chat.bsky.*` 命名空间的全部请求。

[来源](packages/core/src/at/client.ts#L47-L124)

## 自动 JWT 刷新：`afterResponse` hook

整个客户端最精巧的机制隐藏在 `withRefresh` 函数中。它是一个 ky `afterResponse` hook，在每次 HTTP 响应返回后被调用——无论请求来自 `this.ky` 还是 `this.chatKy`。

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

[来源](packages/core/src/at/client.ts#L62-L106)

### 刷新机制

当检测到 Token 过期或无效时，逻辑如下：

1. **共享锁**：`_refreshPromise` 闭包变量充当互斥锁。如果在第一次刷新完成之前又有第二个 400 到达，它不会发起第二个刷新请求，而是直接 `await` 同一个 promise。这避免了并发刷新导致竞态条件。
2. **短延迟**：`await new Promise(r => setTimeout(r, 200))` — 200ms 的刻意延迟，给可能同时发生的其他请求让路。
3. **用 refreshJwt 刷新**：向 `com.atproto.server.refreshSession` 发送 POST 请求，携带 `refreshJwt` 换取新的 `accessJwt` 和 `refreshJwt`。成功则更新 `this.session`。
4. **透明重试**：刷新成功后，用 `fetch`（注意此处直接使用 fetch，而非 ky 实例，避免递归进入 hook）以新的 `accessJwt` 重新发送原始请求。如果重试成功，直接返回 `retryRes`。
5. **静默失效**：如果刷新失败（网络错误或服务端拒绝），`self.session` 被置为 `null`，所有后续需要认证的请求将抛出 `'Not authenticated'` 错误。

刷新失败或非 Token 过期的 400 错误，最终都会落到第 104 行的 `console.error`，记录错误日志。

[来源](packages/core/src/at/client.ts#L60-L106)

## 公共 API vs 认证 API 自动切换

约 25 个**只读**方法在 `this.ky` 和 `this.publicKy` 之间动态选择：

```typescript
const kyInstance = this.session ? this.ky : this.publicKy;
const headers = this.session ? { headers: this.getAuthHeaders() } : {};
return kyInstance.get('app.bsky.actor.getProfile', {
  searchParams: { actor },
  ...headers,
}).json<ProfileView>();
```

核心逻辑：**如果已登录（`this.session` 不为 null），走认证端点 `this.ky`，否则走公共端点 `this.publicKy`**。这意味着同一个方法在登录前后都能工作，只是后者返回的数据量更少（不包含 `viewer` 状态如点赞、关注关系）。

受此模式影响的方法包括：`getProfile`、`getAuthorFeed`、`getPostThread`、`getLikes`、`getRepostedBy`、`searchActors`、`getFollows`、`getFollowers`、`getList`、`getLists`、`getListFeed`、`getPopularFeedGenerators`、`getFeedGenerator`、`getTrends`、`getFeed`、`listRecords`、`getRecord`。

有几个例外始终要求认证：`searchPosts`（代码中有注释说明公共 API 返回 403）、`getTimeline`、`getSuggestedFollows`、`getListBlocks`、`getListMutes`、`getListsWithMembership`、`getBookmarks`、`getDrafts`、`getSuggestedFeeds`、`listNotifications`。

[来源](packages/core/src/at/client.ts#L146-L153)、[来源](packages/core/src/at/client.ts#L207-L215)

## 60+ API 方法的命名空间覆盖

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

[来源](packages/core/src/at/client.ts#L132-L549)

### `app.bsky.*` — 社交功能

**Feed / 帖子**：`getTimeline`、`getAuthorFeed`、`getPostThread`、`getLikes`、`getRepostedBy`、`searchPosts`、`getFeed`、`getSuggestedFeeds`、`getFeedGenerator`、`getPopularFeedGenerators`、`deletePost`、`getTrends`、`getVideoThumbnailUrl`、`getVideoPlaylistUrl`

**Actor**：`getProfile`、`searchActors`、`putProfile`

**Graph（社交图谱）**：`getFollows`、`getFollowers`、`getSuggestedFollows`、`follow`、`unfollow`、`createList`、`deleteList`、`updateList`、`getList`、`getLists`、`getListFeed`、`getListBlocks`、`getListMutes`、`getListsWithMembership`、`addListItem`、`removeListItem`、`blockList`、`unblockList`、`muteActorList`、`unmuteActorList`

**Notification**：`listNotifications`

**Bookmark（扩展功能）**：`createBookmark`、`deleteBookmark`、`getBookmarks`

**Draft（扩展功能）**：`createDraft`、`updateDraft`、`getDrafts`、`deleteDraft`

[来源](packages/core/src/at/client.ts#L155-L648)

### `chat.bsky.*` — 私信

`listConvos`、`getConvoForMembers`、`getMessages`、`sendMessage`、`addReaction`、`removeReaction`、`updateRead`、`deleteMessageForSelf`、`muteConvo`、`unmuteConvo`、`leaveConvo`

这些方法统一通过 `chatGet<T>()` 和 `chatPost<T>()` 两个私有泛型辅助方法调用 `this.chatKy`，而非直接操作 ky 实例。

[来源](packages/core/src/at/client.ts#L653-L732)

## 类型系统

`types.ts` 定义了完整的 AT Protocol 类型体系，全部为纯接口（interface）和类型别名，无运行时依赖。

### 核心视图类型

- **`PostView`**：帖子的完整视图，包含 `uri`、`cid`、`author`（ProfileViewBasic）、`record`（PostRecord）、嵌入内容（`embed`）、计数（`likeCount`、`replyCount`、`repostCount`）以及 `viewer`（当前用户的交互状态）。
- **`ProfileView` / `ProfileViewBasic`**：`Basic` 仅含 `did`、`handle`、`displayName`、`avatar`，完整版增加 `description`、各种计数和 `banner`。
- **`ViewerState`**：当前用户与此对象的交互状态——`muted`、`blockedBy`、`following`（follow URI）、`followedBy`、`like`（like URI）、`repost`。
- **`ThreadViewPost`**：递归线程结构，内含 `post`、`parent`、`replies`，`parent` 和 `replies` 可能是 `ThreadViewPost` 或 `NotFoundPost`。

### 嵌入类型

五种嵌入类型对应 Bluesky 的内容嵌入模型：`ImageEmbed`、`ExternalEmbed`（链接卡片）、`RecordEmbed`（引用帖子）、`RecordWithMediaEmbed`（引用+媒体）、`VideoEmbed`（视频，包含 `aspectRatio`、`alt`、`captions`）。每个嵌入的 `$type` 字段用于运行时判别。

### 会话与记录

`CreateSessionResponse` 包含 `accessJwt`、`refreshJwt`、`handle`、`did`、`email`。`parseAtUri()` 函数将 `at://did:plc:abc123/app.bsky.feed.post/3lk123` 格式解析为 `{ uri, did, collection, rkey }` 结构，这在 `deletePost`、`deleteRecord` 等方法中被广泛使用。

### 聊天类型

`ConvoView` 包含 `id`、`rev`、`members`、`lastMessage`、`muted`、`status`（`'request' | 'accepted'`）、`unreadCount`、`kind`（`'direct' | 'group'`）。消息有三种变体：`MessageView`（含 `text`、`facets`、`embed`、`reactions`）、`DeletedMessageView`、`SystemMessageView`。

[来源](packages/core/src/at/types.ts#L1-L459)

## 会话生命周期与外部集成

`BskyClient` 对外暴露四个会话查询方法：`getDID()`、`getHandle()`、`getAccessJwt()`、`isAuthenticated()`。关键的状态恢复方法是 `restoreSession(session)`——它接受一个 `CreateSessionResponse` 对象直接赋值给 `this.session`，不发起任何网络请求。这为 [认证与会话管理](认证与会话管理.md) 中的 PWA 持久化场景提供了入口：从 localStorage 恢复 session 后调用 `restoreSession()` 即可跳过重新登录。

在架构层面，`BskyClient` 实例是单例的，由 [AIAssistant](aiassistant-多提供者-llm-引擎.md) 中的 `createTools` 函数注入到所有 36 个 AI 工具中，确保所有工具的写操作共享同一个 session。

[来源](packages/core/src/at/client.ts#L551-L572)

---

**推荐阅读**：[36 个 AI 工具：从定义到执行](36-个-ai-工具-从定义到执行.md) 展示了 BskyClient 如何作为底层驱动被 AI 工具调用；[AT Protocol 类型系统与工具](at-protocol-类型系统与工具.md) 深入解析 `parseAtUri` 和 Feed 配置。