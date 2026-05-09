# Store 订阅模式

一个不依赖第三方状态库、基于**纯对象 Store + 单监听器订阅 + React Hook 桥接**的轻量状态管理模式。整个 bsky 项目有三个采用此模式的内部 Store，分别管理认证、时间线和帖子详情。

---

## 模式的核心：纯对象 Store

每个 Store 都是一个普通 JavaScript 对象（非 class），由工厂函数 `createXxxStore()` 创建。它的核心契约只有两个方法和一个字段：

```typescript
// 三个 Store 的订阅接口完全一致
interface SubscribableStore {
  listener: (() => void) | null;
  _notify(): void;
  subscribe(fn: () => void): () => void;
}
```

`_notify` 的实现只有一行——直接调用挂载在 `listener` 上的函数；`subscribe` 则将传入的函数赋值给 `listener`，并返回一个清理函数用于取消订阅。这就是**单监听器模型**的全部。

```typescript
// 取自 packages/app/src/stores/auth.ts
_notify() { if (store.listener) store.listener(); },
subscribe(fn) {
  store.listener = fn;
  return () => { store.listener = null; };
},
```

[来源](packages/app/src/stores/auth.ts#L67-L71)

每次异步操作（如 `login`、`load`）改变状态后，都在操作**首尾**调用 `_notify()`——开始前通知 loading 变更，完成后通知数据更新。以 `login` 为例：

```typescript
async login(handle: string, password: string, pdsUrl?: string) {
  store.loading = true;
  store.error = null;
  store._notify();          // ① 通知：loading 变为 true
  try {
    const c = new BskyClient(pdsUrl ? { pdsUrl } : undefined);
    store.session = await c.login(handle, password);
    store.pdsUrl = c.pdsUrl;
    store.client = c;
    store.profile = await c.getProfile(handle);
  } catch (e) {
    store.error = e instanceof Error ? e.message : String(e);
  } finally {
    store.loading = false;
    store._notify();         // ② 通知：数据更新 / error 设置
  }
},
```

[来源](packages/app/src/stores/auth.ts#L29-L45)

## React Hook 桥接

Hook 文件相当于 Store 与 React 渲染管道之间的适配器。`useAuth`、`useTimeline`、`usePostDetail` 三个 hook 遵循完全相同的桥接模式：

```typescript
// 通用模式：packages/app/src/hooks/useAuth.ts
export function useAuth() {
  const [store] = useState(() => createAuthStore());  // ① 惰性创建，只一次
  const [, force] = useState(0);                       // ② 强制渲染计数器
  const tick = useCallback(() => force(n => n + 1), []); // ③ 稳定回调引用

  useEffect(() => store.subscribe(tick), [store, tick]); // ④ 订阅

  return {                                               // ⑤ 暴露视图数据
    client: store.client,
    session: store.session,
    pdsUrl: store.pdsUrl,
    profile: store.profile,
    loading: store.loading,
    error: store.error,
    login: (h, p, pdsUrl) => store.login(h, p, pdsUrl),
    restoreSession: (s, pdsUrl) => store.restoreSession(s, pdsUrl),
  };
}
```

[来源](packages/app/src/hooks/useAuth.ts#L6-L23)

关键设计点：

1. **`useState(() => createAuthStore())`** — 利用惰性初始化，Store 实例在组件挂载时创建一次，后续渲染不重复构建。
2. **`useState(0)` 作计数器** — 不关心当前值，只通过 `tick` 调用 `force(n => n + 1)` 触发重渲染。这是最轻量的 React 强制刷新方式。
3. **`useCallback` 稳定 `tick`** — 避免每次渲染都生成新函数，从而防止 `useEffect` 无限循环。
4. **`useEffect` 订阅** — 只运行一次（依赖 `[store, tick]` 不变），Store 状态变更通过 `_notify()` → `listener()` → `tick()` → `force()` → React 重渲染 的链条传播。

### useTimeline 的额外细节

`useTimeline` 在桥接模式基础上增加了 feed 切换检测和初始加载逻辑：

```typescript
export function useTimeline(client: BskyClient | null, feedUri?: string) {
  const [store] = useState(() => createTimelineStore());
  const [, force] = useState(0);
  const tick = useCallback(() => force(n => n + 1), []);
  const loaded = useRef(false);
  const lastFeed = useRef<string | undefined>(feedUri);
  const lastGoodFeed = useRef<string | undefined>(undefined);

  const effFeedUri = feedUri ?? lastGoodFeed.current;
  if (feedUri !== undefined) lastGoodFeed.current = feedUri;

  // 当 feedUri 变化时，重置 store 状态
  useEffect(() => {
    if (effFeedUri !== lastFeed.current) {
      lastFeed.current = effFeedUri;
      store.posts = [];
      store.cursor = undefined;
      store.error = null;
      loaded.current = false;
      store._notify();  // 直接调用 store 通知
    }
  }, [effFeedUri, store]);

  // 首次加载
  useEffect(() => {
    if (client && !loaded.current) {
      loaded.current = true;
      store.load(client, effFeedUri);
    }
  }, [client, store, effFeedUri]);

  useEffect(() => store.subscribe(tick), [store, tick]);

  return { posts, loading, cursor, error, loadMore, refresh };
}
```

[来源](packages/app/src/hooks/useTimeline.ts#L6-L47)

注意这里 `useEffect` 订阅必须放在最后，以确保前两个 `useEffect`（重置和首次加载）中的 `_notify()` 能通过 `tick` 触发正确的渲染。如果 `subscribe` 提前注册，初始状态下的 `store.posts = []` 等操作可能会触发不必要的首次渲染。

## 三个 Store 的状态结构对比

| Store | 数据字段 | 状态字段 | 动作方法 |
|-------|----------|----------|----------|
| **AuthStore** | `client`, `session`, `pdsUrl`, `profile` | `loading`, `error` | `login`, `restoreSession` |
| **TimelineStore** | `posts: PostView[]`, `cursor` | `loading`, `error` | `load`, `loadMore`, `refresh` |
| **PostDetailStore** | `post`, `flatThread: string`, `translations: Map` | `loading`, `error` | `load`, `translate`, `getCachedTranslation` |

三者的共同特征：

- 数据字段和状态字段**直接暴露在 Store 对象上**，没有 getter/setter 封装
- **没有 action 分发层** — 方法直接操作 store 属性后调用 `_notify()`
- **错误字段统一为 `string | null`**，loading 统一为 `boolean`
- 所有方法都是 **async**，内部自行管理 loading 状态的生命周期

[来源](packages/app/src/stores/auth.ts#L4-L17)
[来源](packages/app/src/stores/timeline.ts#L4-L17)
[来源](packages/app/src/stores/postDetail.ts#L4-L18)

## 单监听器模型的限制

这是理解本模式最关键的约束。**每个 Store 实例同时只能有一个订阅者。** 如果两个不同的 React 组件各自调用 `useXxxStore()`（实际是同一个 Store 实例），后调用的 `subscribe` 会覆盖前一个 `listener`，导致前一个组件失去更新。

```typescript
subscribe(fn: () => void) {
  store.listener = fn;      // 直接覆盖，不保留上一个
  return () => { store.listener = null; };
},
```

[来源](packages/app/src/stores/auth.ts#L68-L70)

这个设计隐含了一个前提：**每个 Store 实例关联唯一一个 React 组件**。在 `useAuth` 中，`useState(() => createAuthStore())` 保证 Store 实例与组件实例一一对应，因此不会出现多个订阅者冲突。如果你在组件树中多次调用同一个 `useXxxStore` hook，它们会各自创建独立的 Store 实例，互不干扰。

**⚠️ 注意事项：**

- **不要在组件外部调用 `store.subscribe()`** — 除非你能确保只有一个监听者
- **不要在同一个组件中多次订阅** — 后一次 `subscribe` 会使前一次失效
- **不使用多选器（selector）** — 不像 Zustand 的 `useStore(state => state.part)`，这个模式每次通知都引起整个组件重渲染。如果需要细粒度优化，需自己拆分 Store 或使用 `React.memo`

## 与主流方案的对比

| 维度 | 本模式 | Zustand | Redux Toolkit |
|------|--------|---------|---------------|
| **Store 形态** | 普通对象 | `create()` 返回的 hook | `createSlice` + `configureStore` |
| **订阅模型** | 单监听器，手动赋值 | 多监听器，自动去重 | `dispatch` → reducer → selector 订阅 |
| **选器（selector）** | 无，整个 store 通知 | 内置 `useStore(selector)` | `useSelector(selector)` |
| **中间件** | 无 | 内置 `devtools`/`persist`/`immer` | 强大的 middleware 生态 |
| **React 桥接** | 手写 `useState+useEffect` | 自动生成 hook | `Provider` + `useSelector` |
| **TS 类型开销** | 只需 interface | 自动推导 | 需声明 RootState + AppDispatch |
| **外部使用** | 直接读写属性 | 通过 `getState()` / `setState()` | `store.getState()` / `store.dispatch()` |

本模式的优势在于**零依赖**和**极致简单**——一个 Store 约 30 行，一个 Hook 约 15 行，加起来不到 50 行即可完成一个完整的状态模块。代价是缺少 Zustand/Redux 提供的所有进阶能力：中间件、时间旅行调试、持久化、选器优化、批量更新等。对于这个项目的状态规模（三个轻量 Store），这种取舍是合理的。

---

## 相关页面

- 查看所有 20+ hook 的完整签名：[](react-hooks-体系.md)
- 了解三层架构中 Store 层的位置：[](三层架构详解.md)
- 与 `useThread`、`useCompose` 等**内联状态**模式的对比（这些 hook 不使用纯 Store，而是在 hook 内直接用 `useState` 管理）：[](react-hooks-体系.md#hook--store-映射)