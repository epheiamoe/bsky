# Feed 与时间线数据流

从用户按下"刷新"到帖文渲染在屏幕上，中间跨越了四个独立层：定义于 core 的 feed 元数据、透过 BskyClient 的 AT Protocol API 调用、app 层的时间线状态存储与 React Hook 封装，最后是 TUI 与 PWA 各自的渲染组件。本文沿线追踪每一环，并重点剖析 feed 配置的本地持久化和跨端 feed URI 共享机制。

---

## 一、Feed 元数据层

所有 feed 的源头在 `packages/core/src/at/feeds.ts`。它定义了两个核心常量：

| 常量 | 值 | 含义 |
|---|---|---|
| `BUILTIN_FEEDS.following` | `at://did:plc:z72i7hdynmk6r22z27h6tvur/.../following` | 关注对象时间线（即主页） |
| `BUILTIN_FEEDS.discover` | `at://did:plc:z72i7hdynmk6r22z27h6tvur/.../whats-hot` | Bluesky 官方热门推荐 |

```typescript
export const BUILTIN_FEEDS = {
  discover: 'at://did:plc:z72i7hdynmk6r22z27h6tvur/app.bsky.feed.generator/whats-hot',
  following: 'at://did:plc:z72i7hdynmk6r22z27h6tvur/app.bsky.feed.generator/following',
} as const;
```

[来源](../packages/core/src/at/feeds.ts#L2-L5)

`RECOMMENDED_FEEDS` 是面向新用户的初始推荐列表，内嵌 `FeedInfo` 结构（uri / label / description）。两个辅助函数 `getFeedLabel()` 和 `resolveFeedId()` 用于在简短名称（如 `"discover"`）和完整 AT URI 之间双向转换。

```typescript
export const RECOMMENDED_FEEDS: FeedInfo[] = [
  { uri: BUILTIN_FEEDS.discover, label: 'Discover', description: 'Bluesky 官方推荐 — 热门内容' },
  { uri: BUILTIN_FEEDS.following, label: 'Following', description: '仅你关注的用户（使用主页时间线）' },
];
```

[来源](../packages/core/src/at/feeds.ts#L16-L19)

---

## 二、API 层：getTimeline 与 getFeed 的双路策略

`BskyClient`（详见 [BskyClient: Bluesky API 封装](bskyclient-bluesky-api-封装.md)）提供了两套入口获取 feed 内容：

- **`getTimeline(limit, cursor?)`** — 对应 AT Protocol 的 `app.bsky.feed.getTimeline`，只返回用户关注对象的帖文（即 Following feed）。需要认证。
- **`getFeed(feedUri, limit, cursor?)`** — 对应 `app.bsky.feed.getFeed`，接受任意 feed generator 的 AT URI。可用于公共 API。

两个方法返回结构一致：`{ cursor?: string; feed: Array<{ post: PostView }> }`。

```typescript
// 客户端调用示例
async getTimeline(limit = 50, cursor?: string): Promise<TimelineResponse> {
  return this.ky.get('app.bsky.feed.getTimeline', {
    headers: this.getAuthHeaders(),
    searchParams: { limit, ...(cursor && { cursor }) },
  }).json<TimelineResponse>();
}

async getFeed(feedUri: string, limit = 50, cursor?: string): Promise<GetFeedResponse> {
  return this.ky.get('app.bsky.feed.getFeed', {
    searchParams: { feed: feedUri, limit, ...(cursor && { cursor }) },
  }).json<GetFeedResponse>();
}
```

[来源](../packages/core/src/at/client.ts#L115-L122) [来源](../packages/core/src/at/client.ts#L257-L265)

`TimelineResponse` 与 `GetFeedResponse` 的 `feed` 字段各元素都包含 `{ post: PostView }`，这也是 timeline store 最终提取并展示的数据格式。[来源](../packages/core/src/at/types.ts#L146-L154)

---

## 三、Store 层：统一的分页状态机

`createTimelineStore()` 位于 `packages/app/src/stores/timeline.ts`，是纯 TypeScript 的单监听器 Store（详见 [状态管理模式](状态管理模式.md)）。

核心设计：**一个 store，两个 API**。内部函数 `shouldUseTimeline()` 判断当前 feed URI 是否应走 `getTimeline`（Following 或未指定时），否则走 `getFeed`。

```typescript
function shouldUseTimeline(feedUri?: string): boolean {
  if (!feedUri) return true;
  if (feedUri === BUILTIN_FEEDS.following) return true;
  return false;
}
```

[来源](../packages/app/src/stores/timeline.ts#L18-L22)

Store 暴露三个异步方法：

| 方法 | 行为 |
|---|---|
| `load(client, feedUri?)` | 首次加载 20 条，替换全部 `posts` |
| `loadMore(client, feedUri?)` | 使用 `cursor` 追加下一页，合并到 `posts` |
| `refresh(client, feedUri?)` | 重置 `cursor` 和 `posts` 后重新 `load` |

每个方法在调用前后都会设置 `loading` 标志并触发 `_notify()`。[来源](../packages/app/src/stores/timeline.ts#L29-L102)

---

## 四、Hook 层：useTimeline 的响应式封装

`useTimeline(client, feedUri?)` 是 store 与 React 组件之间的桥梁（详见 [Hooks 全览与复用模式](hooks-全览与复用模式.md)）。

```typescript
export function useTimeline(client: BskyClient | null, feedUri?: string) {
  const [store] = useState(() => createTimelineStore());
  const [, force] = useState(0);
  // ...
}
```

[来源](../packages/app/src/hooks/useTimeline.ts#L1-L12)

其关键行为设计包括：

1. **feed 切换检测** — 用 `useRef(lastFeed)` 保存上一次的 feedUri。当传入新的 `feedUri`（且非 `undefined`）时，清空 store 的 posts/cursor/error，标记未加载状态，触发重新 `load`。
2. **延迟加载** — 只在 `client` 非 null 且 `loaded.current === false` 时自动触发首次加载，避免初始化时竞态。
3. **订阅重渲染** — `useEffect(() => store.subscribe(tick), [store, tick])` 确保 store 数据变更时组件重新渲染。
4. **提供回调** — 返回 `{ posts, loading, cursor, error, loadMore, refresh }`，供渲染层消费。

[来源](../packages/app/src/hooks/useTimeline.ts#L14-L49)

---

## 五、Feed 配置的本地持久化

`feedConfig.ts` 将用户的 feed 列表和默认设置持久化到 `localStorage`。

```typescript
export interface FeedConfigData {
  feeds: FeedInfo[];        // 用户自定义的 feed 列表
  defaultFeedUri: string | null; // null = 使用主页时间线
}
```

[来源](../packages/app/src/state/feedConfig.ts#L5-L9)

四个操作函数封装了读写逻辑：

| 函数 | 效果 |
|---|---|
| `getFeedConfig()` | 从 localStorage 读取，合并 `DEFAULT_CONFIG` |
| `saveFeedConfig(config)` | 全量覆盖写入 |
| `addFeed(uri, label?)` | 去重添加，写入 |
| `removeFeed(uri)` | 移除（保留 Following），若移除的是默认 feed 则重置为 null |
| `setDefaultFeed(feedUri)` | 设置默认 feed URI |

`DEFAULT_CONFIG` 以 `RECOMMENDED_FEEDS` 为基线，`defaultFeedUri` 为 null。[来源](../packages/app/src/state/feedConfig.ts#L11-L53)

---

## 六、跨端共享：setLastFeedUri 与 useActiveFeed

这是 TUI 和 PWA 共享同一用户"当前活动 feed"的关键机制。实现在 `packages/app/src/hooks/useActiveFeed.ts`。

**原理**：模块级（module-level）变量 `_lastFeedUri` 作为内存中的共享状态，不受 React 组件生命周期影响：

```typescript
let _lastFeedUri: string | null = null;
const _listeners: Array<() => void> = [];
```

[来源](../packages/app/src/hooks/useActiveFeed.ts#L5-L7)

三个导出函数：

- `getLastFeedUri()` — 读取当前内存值。
- `setLastFeedUri(uri)` — 写入新值，通知所有监听者。
- `useActiveFeed()` — React Hook，返回三个回调：
  - `resolveFeed(feedUri?)` — 按优先级解析：传入值 > `_lastFeedUri` > `feedConfig.defaultFeedUri` > `undefined`。
  - `recordFeed(uri)` — 记录当前 feed 到 `_lastFeedUri`。
  - `goHomeFeed()` — 返回配置的默认 feed URI。

[来源](../packages/app/src/hooks/useActiveFeed.ts#L10-L52)

### 两端的使用方式

**TUI**（`packages/tui/src/components/App.tsx`）：在 feed 浏览 useEffect 中将 `effectiveFeedUri` 写入共享状态。

```typescript
useEffect(() => {
  if (effectiveFeedUri) setLastFeedUri(effectiveFeedUri);
}, [effectiveFeedUri]);
```

[来源](../packages/tui/src/components/App.tsx#L73-L75)

**PWA**（`packages/pwa/src/App.tsx`）：监听路由变化时将当前 feed URI 写入共享状态。

```typescript
useEffect(() => {
  if (currentView.type === 'feed') {
    const uri = (currentView as { feedUri?: string }).feedUri;
    if (uri) setLastFeedUri(uri);
  }
}, [currentView]);
```

[来源](../packages/pwa/src/App.tsx#L46-L51)

**PWA 哈希路由**（`useHashRouter`）：当用户导航到未指定 feed URI 的 feed 视图时，通过 `getLastFeedUri()` 恢复上一个活动 feed。

```typescript
if (view.type === 'feed' && !view.feedUri) {
  const resolved = getLastFeedUri() ?? getFeedConfig().defaultFeedUri ?? BUILTIN_FEEDS.following;
  if (resolved) {
    view = { type: 'feed', feedUri: resolved };
  }
}
```

[来源](../packages/pwa/src/hooks/useHashRouter.ts#L48-L54)

---

## 七、渲染层：TUI 的 PostList 与 PWA 的 FeedTimeline

### TUI：终端列表渲染

`PostList` 组件（`packages/tui/src/components/PostList.tsx`）接收 `useTimeline` 返回的 `posts` 数组，通过 `postToLines()` 将 `PostView` 转换为纯文本行，采用简单的视口切片显示（非虚拟滚动）。键盘上下箭头切换 `selectedIndex`，按下回车进入帖子详情。[来源](../packages/tui/src/components/PostList.tsx#L17-L65)

数据流：`useTimeline → { posts, loading, loadMore, refresh } → PostList props`。[来源](../packages/tui/src/components/App.tsx#L69)

### PWA：虚拟滚动列表渲染

`FeedTimeline` 组件（`packages/pwa/src/components/FeedTimeline.tsx`）使用 `@tanstack/react-virtual` 实现虚拟滚动，支持：

- **无限滚动**：通过 `IntersectionObserver` 监听底部哨兵元素，自动触发 `loadMore`。
- **滚动位置恢复**：接收 `initialScrollIndex` 和 `onFirstVisibleIndexChange`，配合 [状态管理模式](状态管理模式.md) 中的 `viewStateStore` 在不同视图切换间保留滚动位置。
- **骨架屏**：首次加载时显示 5 个 `SkeletonCard`。[来源](../packages/pwa/src/components/FeedTimeline.tsx#L46-L166)

数据流：`useTimeline → { posts, loading, cursor, error, loadMore, refresh } → FeedTimeline props`。[来源](../packages/pwa/src/App.tsx#L24-L36)

---

## 八、完整数据流全景

```mermaid
flowchart LR
    subgraph Core
        F[feeds.ts\nBUILTIN_FEEDS\nRECOMMENDED_FEEDS] -->|FeedInfo| API
        API[BskyClient\ngetTimeline / getFeed] -->|TimelineResponse| S
    end

    subgraph App
        S[timeline.ts\ncreateTimelineStore] -->|subscribe| H[useTimeline Hook]
        C[feedConfig.ts\nlocalStorage 持久化] -->|defaultFeedUri| H
        A[useActiveFeed\n模块级 _lastFeedUri] -->|resolveFeed| H
    end

    subgraph TUI
        H -->|posts, loading, loadMore| PL[PostList\n视口切片渲染]
        PL -->|selectedIndex| Enter[帖子详情]
    end

    subgraph PWA
        H -->|posts, loading, loadMore| FT[FeedTimeline\n@tanstack/react-virtual]
        FT -->|IntersectionObserver| LM[自动 loadMore]
        FT -->|initialScrollIndex| SR[滚动恢复]
    end

    A -.->|setLastFeedUri| TUI
    A -.->|setLastFeedUri| PWA
```

两端都通过 `@bsky/app` 包共享同一份 `useTimeline` Hook、同一份 `timelineStore` 逻辑、和同一份 `feedConfig`。差异仅在渲染层：TUI 使用 Ink 的 `Box`/`Text` 元件做终端适配（详见 [Ink 渲染与终端适配](ink-渲染与终端适配.md)），PWA 使用 Tailwind CSS 的 `div` 做浏览器适配。

---

## 下一步

- 了解 feed 数据如何在帖子详情中被复用：[组件树与渲染层](组件树与渲染层.md)
- 探索时间线中的帖子交互（点赞/转发）如何通过 store 共享：[Hooks 全览与复用模式](hooks-全览与复用模式.md)
- 查看 AI 如何在 feed 文章上提供自动摘要：[AI 功能快速体验](ai-功能快速体验.md)