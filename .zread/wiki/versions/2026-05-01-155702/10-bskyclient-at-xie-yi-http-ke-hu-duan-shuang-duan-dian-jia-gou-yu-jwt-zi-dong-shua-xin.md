**源码位置**：`packages/core/src/at/client.ts` — 核心导出，无 UI 依赖
**文件大小**：385 行，单一 class 实现，零继承

BskyClient 是整个应用与 Bluesky AT 协议通信的唯一枢纽，承担了两项关键设计：**双端点架构**将认证流量与公共流量分离以降低 PDS 负载；**JWT 自动刷新**通过 ky 的 afterResponse 钩子实现了对 ExpiredToken 的无缝恢复。它不是一个抽象接口，而是一个具体的、有状态的 class 实例——session 状态直接存于内存，这意味着应用层需要自行处理 session 持久化（TUI 通过 .env 文件，PWA 通过 localStorage）。

---

## 双端点架构

构造函数在实例化时创建了两个独立的 ky HTTP 客户端实例，分别对应两个不同的 Bluesky API 端点：

```typescript
const BSKY_SERVICE = 'https://bsky.social';
const PUBLIC_API = 'https://public.api.bsky.app';

this.ky = ky.create({
  prefixUrl: BSKY_SERVICE + '/xrpc',
  timeout: 30000,
  hooks: { afterResponse: [withRefresh] },
});
this.publicKy = ky.create({
  prefixUrl: PUBLIC_API + '/xrpc',
  timeout: 30000,
});
```

关键区别在于：`this.ky` 挂载了 `withRefresh` JWT 刷新钩子，而 `this.publicKy` 则是一个纯净的 HTTP 客户端，没有任何 hooks。这种分离确保了原本不需要认证的请求（如 `resolveHandle`）不会被不必要的认证逻辑干扰，同时减少了 PDS 的请求负载。

**请求路由策略**是理解 BskyClient 内部逻辑的核心：每个方法在执行前会根据操作类型判断使用哪个客户端实例。代码中存在三种模式：

| 路由模式 | 代表方法 | 说明 |
|----------|----------|------|
| **强制认证** | `getTimeline`, `listNotifications`, `createRecord`, `uploadBlob` | 始终使用 `this.ky`，需要 auth headers |
| **条件路由** | `getProfile`, `getPostThread`, `getAuthorFeed` | 有 session 走 `this.ky`，否则走 `this.publicKy` |
| **始终公开** | `resolveHandle` | 固定使用 `this.publicKy`，无需认证信息 |

条件路由的实现模式如下所示，这是 BskyClient 中最常见的代码片段：

```typescript
const kyInstance = this.session ? this.ky : this.publicKy;
const headers = this.session ? { headers: this.getAuthHeaders() } : {};
return kyInstance.get('app.bsky.actor.getProfile', {
  searchParams: { actor },
  ...headers,
}).json<ProfileView>();
```

这里的巧妙之处在于：即使有 session，条件路由也允许未认证请求使用公开 API 端点，这符合 AT 协议的架构设计——许多数据读取端点可以通过公开 API 获取，无需消耗 PDS 资源。

Sources: [packages/core/src/at/client.ts#L1-L35](packages/core/src/at/client.ts#L1-L35)

---

## JWT 自动刷新机制

JWT 刷新是 BskyClient 中最具架构深度的设计。它通过 ky 的 `afterResponse` 钩子实现，但有一个关键细节——**刷新请求本身使用原生 `fetch` 而非 ky**，这是为了避免递归调用 hook 造成的死循环。

```typescript
const withRefresh = async (request, _options, response) => {
  if (!response.ok) {
    const body = await response.clone().text();
    if (response.status === 400 && self.session) {
      const err = JSON.parse(body);
      if (err.error === 'ExpiredToken' || err.error === 'InvalidToken') {
        const session = self.session;
        await new Promise(r => setTimeout(r, 200));  // 避让 TLS 连接竞争
        const refreshRes = await fetch(`${BSKY_SERVICE}/xrpc/com.atproto.server.refreshSession`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${session.refreshJwt}` },
        });
        if (refreshRes.ok) {
          self.session = await refreshRes.json();
          const retryRes = await fetch(request.url, {  // 重试原始请求
            method: request.method,
            headers: { Authorization: `Bearer ${self.session.accessJwt}` },
          });
          if (retryRes.ok) return retryRes;
        }
        self.session = null;  // 刷新失败 → 清除 session
      }
    }
  }
};
```

**刷新流程**可以用以下步骤概括：

1. 原始请求通过 `this.ky` 发出，返回 400 状态码
2. 钩子拦截响应，解析 JSON 判断是否为 `ExpiredToken` 或 `InvalidToken`
3. 等待 200ms 延迟——这是为了避免与 ky 的 keep-alive 机制竞争 TLS 连接
4. 使用 `session.refreshJwt` 通过原生 `fetch` 调用 `com.atproto.server.refreshSession`
5. 刷新成功 → 更新 `this.session`，使用新的 `accessJwt` 重试原始请求
6. 刷新失败或重试失败 → 将 `this.session` 置为 null，强制用户重新登录
7. 如果响应体不是合法 JSON，或错误类型不匹配，静默跳过（通过外层 try/catch）

这是一个**完全自动化的刷新机制**——上层调用者无需关心 token 是否过期，也无需实现重试逻辑。但需要注意它的两个隐含约定：第一，刷新只在 `ky` 的 `afterResponse` 钩子中触发，`publicKy` 没有这个钩子；第二，所有需要认证的方法必须通过 `this.ky` 发出请求，否则刷新逻辑不会被触发。

Sources: [packages/core/src/at/client.ts#L17-L42](packages/core/src/at/client.ts#L17-L42)

---

## Session 生命周期管理

BskyClient 的 session 状态以私有属性 `private session: CreateSessionResponse | null = null;` 的形式存储在内存中。这意味着每当你创建一个新的 BskyClient 实例，它都是从无状态开始的。

**session 的三种来源**：

| 方法 | 用途 | 行为 |
|------|------|------|
| `login(handle, password)` | 首次登录 | 调用 `com.atproto.server.createSession`，存储完整 session 对象 |
| `restoreSession(session)` | 恢复已有 session | 直接将传入的 session 对象赋值给 `this.session` |
| JWT 自动刷新 | 续期 token | 更新 `this.session` 中的 `accessJwt` 和 `refreshJwt` |

**辅助方法**提供了对 session 状态的查询和访问：

```typescript
isAuthenticated(): boolean    // session !== null
getDID(): string              // 当前用户 DID
getHandle(): string           // 当前用户 handle
getAccessJwt(): string        // 当前 access token（用于外部请求）
```

这些方法在 session 为 null 时会抛出一个明确的错误："Not authenticated. Call login() first."——这是防御性编程的体现，确保调用者在未登录状态下不会误用认证方法。

**关于 session 持久化**：BskyClient 本身不做持久化。TUI 端通过 `dotenv` 将 session JSON 序列化到 .env 文件，PWA 端通过 `localStorage` 存储。应用启动时先检查持久化存储中是否有 session，如果有则调用 `restoreSession` 恢复状态。这是 `useAuth` 钩子在 app 层的核心逻辑之一。

Sources: [packages/core/src/at/client.ts#L7-L16](packages/core/src/at/client.ts#L7-L16), [packages/core/src/at/client.ts#L320-L340](packages/core/src/at/client.ts#L320-L340)

---

## API 端点全景

BskyClient 完整实现了 30+ AT 协议端点，按功能域分类如下：

### 信息流 (Feed)
`getTimeline`, `getAuthorFeed`, `getPostThread`, `getLikes`, `getRepostedBy`, `searchPosts`, `getFeed`, `getPopularFeedGenerators`, `getFeedGenerator`

### 身份与资料 (Identity & Profile)
`resolveHandle`, `getProfile`, `searchActors`

### 社交图谱 (Graph)
`getFollows`, `getFollowers`, `getSuggestedFollows`

### 通知 (Notifications)
`listNotifications`

### 仓库操作 (Repository)
`listRecords`, `getRecord`, `createRecord`, `deleteRecord`

### 二进制数据 (Blobs)
`uploadBlob` — 接收 `Uint8Array` 和 `mimeType`，自动设置 Content-Type
`downloadBlob` — 使用 `com.atproto.sync.getBlob` 端点，30 秒超时

### 社交动作 (Social Actions)
`follow(did)` — 基于 `createRecord` 的便捷封装
`unfollow(followUri)` — 从 URI 中提取 rkey 后调用 `deleteRecord`

### 书签 (Bookmarks) —— 自定义扩展
`createBookmark`, `deleteBookmark`, `getBookmarks` — 这些不是标准的 AT 协议端点，而是自定义的 `app.bsky.bookmark.*` 命名空间

**分页约定**：所有支持分页的方法（如 `getTimeline`、`getAuthorFeed`、`searchPosts`）都接受可选的 `cursor` 参数，返回结构中都包含 `cursor` 字段。这是 AT 协议的标准游标分页模式。

**超时策略**：所有 ky 客户端使用 30 秒默认超时。`downloadBlob` 也使用 30 秒超时但独立调用，因为 blob 下载场景可能需要更灵活的配置。

Sources: [packages/core/src/at/client.ts#L50-L385](packages/core/src/at/client.ts#L50-L385)

---

## 类型系统

所有响应类型定义在 `packages/core/src/at/types.ts` 中，以接口形式导出。核心类型包括：

`CreateSessionResponse` — 包含 `accessJwt`、`refreshJwt`、`handle`、`did`
`PostView` — 帖子视图，包含作者、记录、互动计数
`TimelineResponse` — 时间线响应，`{ feed, cursor }`
`PostThreadResponse` — 帖子线程树
`CreateRecordResponse` — `{ uri, cid }`

BskyClient 的所有方法都通过泛型 `.json<T>()` 进行强类型返回，使得消费者不需要手动类型断言。

Sources: [packages/core/src/at/types.ts](packages/core/src/at/types.ts#L1-L260)

---

## 与工具箱系统的集成

BskyClient 并非孤立存在——它是整个 AI 工具系统（30 个 AI 工具）的底层驱动。工具定义在 `packages/core/src/at/tools.ts` 中，核心函数 `createTools(client: BskyClient): ToolDescriptor[]` 接收 BskyClient 实例并返回一组工具描述。

每个 `ToolDescriptor` 包含：
- `definition` — 工具名称、描述、JSON Schema 输入定义
- `handler` — 异步函数，内部调用 BskyClient 方法
- `requiresWrite` — 布尔值，标记该工具是否为写操作

这种设计使得 AI Assistant 可以通过统一的工具调用接口——而非直接调用 BskyClient——来操作 Bluesky API，实现读写安全门分类（write 操作需要用户确认）。

Sources: [packages/core/src/at/tools.ts](packages/core/src/at/tools.ts#L1-L30)

---

## 架构图

```
┌─────────────────────────────────────────────┐
│                BskyClient                    │
│  ┌─────────────────┐ ┌───────────────────┐  │
│  │   this.ky        │ │   this.publicKy   │  │
│  │ bsky.social/xrpc │ │ public.api.bsky   │  │
│  │ withRefresh hook │ │    no hooks       │  │
│  └────────┬────────┘ └──────────┬────────┘  │
│           │                     │           │
│           ▼                     ▼           │
│  ┌─────────────────────────────────────┐    │
│  │    请求路由逻辑（3 种模式）          │    │
│  │  强制认证 | 条件路由 | 始终公开      │    │
│  └─────────────────────────────────────┘    │
│           │                                 │
│           ▼                                 │
│  ┌─────────────────────────────────────┐    │
│  │       Session 状态管理              │    │
│  │  login → createSession             │    │
│  │  restoreSession → 内存恢复         │    │
│  │  JWT 刷新 → 自动续期 + 重试       │    │
│  └─────────────────────────────────────┘    │
└──────────────────┬──────────────────────────┘
                   │
                   ▼
       ┌─────────────────────┐
       │   AI 工具系统        │
       │  createTools(client) │
       │  30 ToolDescriptors  │
       └─────────────────────┘
```

## 延伸阅读

BskyClient 的下游消费者是 [AIAssistant：多轮工具调用引擎与 SSE 流式输出](12-aiassistant-duo-lun-gong-ju-diao-yong-yin-qing-yu-sse-liu-shi-shu-chu)，它通过 `createTools(client)` 将 BskyClient 包装为 AI 可调用的工具集合。

BskyClient 的 session 持久化逻辑分别在 [useAuth 钩子](17-shu-ju-gou-zi-qing-dan-useauth-usetimeline-usethread-useprofile-deng)（TUI & PWA 共用）和 [环境变量配置指南](4-huan-jing-bian-liang-pei-zhi-zhi-nan-tui-de-env-yu-pwa-de-localstorage) 中实现。