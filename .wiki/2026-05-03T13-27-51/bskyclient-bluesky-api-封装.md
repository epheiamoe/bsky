# BskyClient: Bluesky API 封装

## 概览

`BskyClient` 是整个应用的 **API 接入层**，封装了 AT Protocol (Bluesky) 的所有 XRPC 端点调用。它位于 core 层的最底部，被 `createTools`、`AuthStore` 和各个 React Hook 直接依赖，是连接 Bluesky 网络的唯一通道。

[来源](packages/core/src/at/client.ts#L33-L231)

## 架构：双 KyInstance 设计

构造函数创建了两个独立的 `KyInstance`，对应两种不同的 API 访问模式：

| 实例 | 基址 | 用途 |
|---|---|---|
| `this.ky` | `https://bsky.social/xrpc` | 认证端点（时间线、发帖、通知等） |
| `this.publicKy` | `https://public.api.bsky.app/xrpc` | 公开端点（解析 handle、浏览资料等） |

**设计意图**：publicKy 不需要 JWT 令牌，因此可避免不必要的 401 错误和凭证泄露。对于可以降级为公开访问的方法（如 `getProfile`、`getPostThread`），代码会检查当前会话状态，有则走 `this.ky`，无则走 `this.publicKy`：

```typescript
const kyInstance = this.session ? this.ky : this.publicKy;
const headers = this.session ? { headers: this.getAuthHeaders() } : {};
```

这种模式在 `getAuthorFeed`、`getLikes`、`getFollows` 等 10 个方法中重复出现。

[来源](packages/core/src/at/client.ts#L9-L32)

## 认证与会话管理

会话状态存储在私有属性 `this.session` 中，类型为 `CreateSessionResponse | null`。

```typescript
async login(handle: string, password: string): Promise<CreateSessionResponse>
restoreSession(session: CreateSessionResponse): void
```

- **`login()`** — 向 `com.atproto.server.createSession` 发起 POST，成功后写入 `this.session`。
- **`restoreSession()`** — 用于从持久化存储（如 PWA 的 IndexedDB 或 TUI 的 .env）重建会话，无需重新请求。
- 辅助方法 `isAuthenticated()`、`getDID()`、`getHandle()`、`getAccessJwt()` 均基于 `this.session`。

所有认证方法的请求头由 `getAuthHeaders()` 统一生成：

```typescript
private getAuthHeaders(): Record<string, string> {
  if (!this.session) throw new Error('Not authenticated. Call login() first.');
  return { Authorization: `Bearer ${this.session.accessJwt}` };
}
```

[来源](packages/core/src/at/client.ts#L36-L44)

### JWT 自动刷新

`this.ky` 注册了一个 `afterResponse` 钩子 `withRefresh`。当请求返回 `400` 状态且错误为 `ExpiredToken` 或 `InvalidToken` 时，它会：

1. 使用 `this.session.refreshJwt` 向 `com.atproto.server.refreshSession` 发起 POST
2. 刷新成功则更新 `this.session`，并用新 `accessJwt` 重试原请求
3. 刷新失败则置空 `this.session`，后续调用将进入未认证状态

这个机制在 [认证与会话自动刷新](认证与会话自动刷新.md) 有深入分析。

[来源](packages/core/src/at/client.ts#L14-L32)

## 公开方法全览

所有公开方法均遵循 **一个方法对应一个 XRPC endpoint** 的映射规则，返回类型严格对应 AT Protocol 的 JSON schema。

### 认证

| 方法 | XRPC 端点 | 认证要求 |
|---|---|---|
| `login(handle, password)` | `com.atproto.server.createSession` | 无（端点本身需要密码） |

### Feed（时间线与帖子）

| 方法 | XRPC 端点 | 认证要求 |
|---|---|---|
| `getTimeline(limit?, cursor?)` | `app.bsky.feed.getTimeline` | **必须** |
| `getAuthorFeed(actor, limit?, cursor?, filter?)` | `app.bsky.feed.getAuthorFeed` | 可选 |
| `getPostThread(uri, depth?, parentHeight?)` | `app.bsky.feed.getPostThread` | 可选 |
| `getLikes(uri, limit?, cursor?)` | `app.bsky.feed.getLikes` | 可选 |
| `getRepostedBy(uri, limit?, cursor?)` | `app.bsky.feed.getRepostedBy` | 可选 |
| `searchPosts({ q, limit?, cursor?, sort? })` | `app.bsky.feed.searchPosts` | **必须** |
| `getFeed(feedUri, limit?, cursor?)` | `app.bsky.feed.getFeed` | 可选 |
| `getFeedGenerator(feed)` | `app.bsky.feed.getFeedGenerator` | 可选 |
| `getSuggestedFeeds(limit?, cursor?)` | `app.bsky.feed.getSuggestedFeeds` | **必须** |
| `getPopularFeedGenerators(limit?, cursor?)` | `app.bsky.unspecced.getPopularFeedGenerators` | 可选 |

**注**：`searchPosts` 和 `getSuggestedFeeds` 即使理论上可以公开访问，也强制走认证路径，因为公共 API 端点对它们返回 `403`。

[来源](packages/core/src/at/client.ts#L60-L141)

### 用户与资料

| 方法 | XRPC 端点 |
|---|---|
| `resolveHandle(handle)` | `com.atproto.identity.resolveHandle` |
| `getProfile(actor)` | `app.bsky.actor.getProfile` |
| `searchActors({ q, limit?, cursor? })` | `app.bsky.actor.searchActors` |

### 社交图（Graph）

| 方法 | XRPC 端点 |
|---|---|
| `getFollows(actor, limit?, cursor?)` | `app.bsky.graph.getFollows` |
| `getFollowers(actor, limit?, cursor?)` | `app.bsky.graph.getFollowers` |
| `getSuggestedFollows(actor)` | `app.bsky.graph.getSuggestedFollowsByActor` |
| `follow(did)` | 组合 `createRecord` + `app.bsky.graph.follow` |
| `unfollow(followUri)` | 组合 `deleteRecord` + URI 解析 |

[来源](packages/core/src/at/client.ts#L148-L166)

### 通知

| 方法 | XRPC 端点 | 认证要求 |
|---|---|---|
| `listNotifications(limit?, cursor?, priority?)` | `app.bsky.notification.listNotifications` | **必须** |

[来源](packages/core/src/at/client.ts#L105-L113)

### 仓库操作（写操作）

| 方法 | XRPC 端点 |
|---|---|
| `listRecords(repo, collection, limit?, cursor?)` | `com.atproto.repo.listRecords` |
| `getRecord(repo, collection, rkey)` | `com.atproto.repo.getRecord` |
| `createRecord(repo, collection, record, rkey?, swapCommit?)` | `com.atproto.repo.createRecord` |
| `deleteRecord(repo, collection, rkey)` | `com.atproto.repo.deleteRecord` |
| `deletePost(uri)` | 调用 `parseAtUri` 后转为 `deleteRecord` |

[来源](packages/core/src/at/client.ts#L143-L183)

### 媒体（Blob）

| 方法 | 端点 |
|---|---|
| `uploadBlob(data: Uint8Array, mimeType: string)` | `com.atproto.repo.uploadBlob` |
| `downloadBlob(did: string, cid: string)` | `com.atproto.sync.getBlob` |

[来源](packages/core/src/at/client.ts#L186-L199)

### 书签

| 方法 | XRPC 端点 |
|---|---|
| `getBookmarks(limit?, cursor?)` | `app.bsky.bookmark.getBookmarks` |
| `createBookmark(uri, cid)` | `app.bsky.bookmark.createBookmark` |
| `deleteBookmark(uri)` | `app.bsky.bookmark.deleteBookmark` |

`deleteBookmark` 在捕获异常时静默吞掉错误，逻辑是"如果书签不存在则无需报错"。

[来源](packages/core/src/at/client.ts#L212-L226)

### 视频

| 方法 | 说明 |
|---|---|
| `getVideoThumbnailUrl(did, cid)` | 返回 HLS 视频的缩略图 URL |
| `getVideoPlaylistUrl(did, cid)` | 返回 HLS 播放列表 URL |

这两个方法不发送 HTTP 请求，仅拼接 URL 字符串。

[来源](packages/core/src/at/client.ts#L228-L231)

## 写操作深度解析

### `createRecord` — 通用记录创建

这是写操作的 **统一入口**，签名如下：

```typescript
async createRecord(
  repo: string,           // 用户 DID
  collection: string,     // 记录类型标识，如 'app.bsky.feed.post'
  record: Record<string, unknown>,  // 记录主体
  rkey?: string,          // 可选：自定义记录键
  swapCommit?: string,    // 可选：乐观并发控制
): Promise<CreateRecordResponse>
```

**`record` 参数的结构**决定了你要创建什么。发帖时，它应该是一个 `PostRecord`：

```typescript
interface PostRecord {
  text: string;
  createdAt: string;
  embed?: ImageEmbed | ExternalEmbed | RecordEmbed | RecordWithMediaEmbed | VideoEmbed;
  facets?: Facet[];
  reply?: {
    root: { uri: string; cid: string };
    parent: { uri: string; cid: string };
  };
}
```

**嵌入类型**支持五种：

| 嵌入类型 | `$type` | 用途 |
|---|---|---|
| `ImageEmbed` | `app.bsky.embed.images` | 图片（可多张） |
| `ExternalEmbed` | `app.bsky.embed.external` | 链接卡片 |
| `RecordEmbed` | `app.bsky.embed.record` | 引用帖子/列表 |
| `RecordWithMediaEmbed` | `app.bsky.embed.recordWithMedia` | 引用+图片混合 |
| `VideoEmbed` | `app.bsky.embed.video` | HLS 视频 |

这些类型的完整定义见 `types.ts`。

[来源](packages/core/src/at/types.ts#L7-L38)

### `uploadBlob` — 二进制上传

```typescript
async uploadBlob(data: Uint8Array, mimeType: string): Promise<UploadBlobResponse>
```

- `data` 是原始二进制流，由调用方负责读取文件后传入。
- `mimeType` 设置 `Content-Type` 头，Bluesky 支持 `image/*` 和 `video/*`。
- 返回的 `blob.ref.$link` 是 CID，需要在创建嵌入时填入 `{ $type: 'blob', ref: { $link: cid }, mimeType, size }`。

**典型调用链**：读取文件 → `uploadBlob` → 获取 CID → 构造 `ImageEmbed` → `createRecord`。

[来源](packages/core/src/at/client.ts#L186-L192)

### `follow` / `unfollow` — 高级封装

`follow(did)` 是对 `createRecord` 的高层封装，自动使用当前用户 DID 和 collection `app.bsky.graph.follow`。`unfollow(followUri)` 则反过来解析 AT URI，提取 rkey 后调用 `deleteRecord`。

```typescript
async follow(did: string): Promise<{ uri: string }> {
  const res = await this.createRecord(this.getDID(), 'app.bsky.graph.follow', {
    subject: did,
    createdAt: new Date().toISOString(),
  });
  return { uri: res.uri };
}
```

[来源](packages/core/src/at/client.ts#L168-L182)

### `deletePost` — URI 解析删除

接收完整的 AT URI（格式 `at://did:plc:xxx/app.bsky.feed.post/rkey`），调用 `parseAtUri` 拆解为 `{ did, collection, rkey }` 后转发给 `deleteRecord`。

```typescript
const parsed = parseAtUri(uri);
// parsed: { uri, did, collection, rkey }
```

`parseAtUri` 函数的正则匹配模式为 `at://(did:plc:[^/]+)/([^/]+)/([^/]+)`。

[来源](packages/core/src/at/types.ts#L1-L11)

## 统一错误处理

所有失败的请求（非 2xx 状态）由 ky 本身抛出 HTTPError。认证端点的 `withRefresh` 钩子会拦截 `400` 状态并尝试自动刷新 token，刷新成功后重试。如果刷新失败或重试仍失败，则：

1. 置空 `this.session`
2. 错误向上传播，由调用方（如 `tools.ts` 或 `AuthStore`）捕获

此外，`console.error` 会记录每个失败请求的详细信息：

```
[bsky] 401 GET https://bsky.social/xrpc/app.bsky.feed.getTimeline → {"error":"ExpiredToken","message":"..."}
```

[来源](packages/core/src/at/client.ts#L31)

## 跨端使用

`BskyClient` 实例在 `AuthStore` 中创建，生命周期与登录会话绑定。`restoreSession` 是跨端会话持久化的关键：

- **TUI**：从 `.env` 读取凭据 → 调用 `login()` → 序列化 `session` → 下次启动直接 `restoreSession()`
- **PWA**：浏览器 IndexedDB 保存 `session` → 页面加载时 `restoreSession()` → 无感续期

详细机制参见 [环境变量与认证](环境变量与认证.md) 和 [认证与会话自动刷新](认证与会话自动刷新.md)。

[来源](packages/app/src/stores/auth.ts#L32-L56)

## 导出入口

`BskyClient` 和所有类型通过 `@bsky/core` 包的 `index.ts` 统一导出，上层（app/tui/pwa）只需 `import { BskyClient } from '@bsky/core'`。

[来源](packages/core/src/index.ts#L1-L4)

---

**推荐阅读**

- [三层架构设计](三层架构设计.md) — 理解 core 层在整个应用中的定位
- [认证与会话自动刷新](认证与会话自动刷新.md) — JWT 刷新钩子的实现细节
- [31 个工具系统详解](31-个工具系统详解.md) — 看 BskyClient 如何被 AI 工具调用
- [Feed 与时间线数据流](feed-与时间线数据流.md) — getTimeline 到 UI 的完整链路
- [测试体系与实践](测试体系与实践.md) — BskyClient 的集成测试覆盖