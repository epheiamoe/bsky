# Feed 滚动位置丢失 — 根因审查报告

> 审查日期: 2026-06-06
> 审查代理: Code Review Agent
> 状态: 待修复

## 审查方法

子代理完整阅读了以下7个文件：
1. `packages/pwa/src/components/FeedTimeline.tsx`
2. `packages/pwa/src/App.tsx`
3. `packages/app/src/hooks/useTimeline.ts`
4. `packages/app/src/stores/timeline.ts`
5. `packages/app/src/stores/feedCache.ts`
6. `packages/pwa/src/components/FeedHeader.tsx`
7. `packages/pwa/src/hooks/useHashRouter.ts`

审查方式为逐行代码分析，基于React渲染时序和@tanstack/react-virtual API行为，不猜测未确认的实现细节。

---

## 根因 1（核心）：竞态条件 + `restoredForRef` 过早锁定

### 时序

```
点击 Feed B Tab
  |
  v
App 渲染（第1次）
  |- timeline.posts = Feed A 的数据（旧值）
  |- FeedTimeline props: posts=Feed A, feedUri=Feed B
  |
  v
FeedTimeline 渲染（第1次）
  |- virtualizer: count = Feed A.length
  |- restoredForRef.current = Feed A（上一次的值）
  |
  v
React Commit
  |- 执行 useTimeline effect
  |   |- store.posts = Feed B cache（新值）
  |   |- store._notify() → 触发第2次渲染
  |
  v
App 渲染（第2次）
  |- timeline.posts = Feed B 的数据
  |- FeedTimeline props: posts=Feed B, feedUri=Feed B
  |
  v
FeedTimeline 渲染（第2次）
  |- virtualizer: count = Feed B.length
  |
  v
执行 restoration effect（第1次渲染注册的）
  |- key = Feed B
  |- restoredForRef.current = Feed A != key
  |- restoredForRef.current = Feed B（立即锁定！）
  |- rAF: virtualizer.scrollToOffset(initialScrollTop)
      |    // 闭包中的 virtualizer 是第1次渲染的对象
      |    // count = Feed A.length，totalSize 基于 Feed A
      |
      v
执行 restoration effect（第2次渲染注册的）
  |- key = Feed B
  |- restoredForRef.current === key → true
  |- return（跳过！posts 更新后的正确 restoration 被永远跳过）
```

### 代码证据

```tsx
// FeedTimeline.tsx:118-129
useEffect(() => {
    const key = feedUri ?? 'following';
    if (restoredForRef.current === key) return;  // ← 第121行：第二次渲染时直接return
    restoredForRef.current = key;                  // ← 第122行：第一次渲染时就锁定

    if (posts.length > 0 && initialScrollTop !== undefined && initialScrollTop > 0 && scrollRef.current) {
      requestAnimationFrame(() => {
        virtualizer.scrollToOffset(initialScrollTop, { align: 'start' });
      });
    }
  }, [feedUri, posts.length, initialScrollTop, virtualizer]);  // ← 仍然依赖 posts.length
```

**关键发现**：`docs/CONTEXT.md` 声称"移除 `posts` 依赖，改用 ref 读取"，但实际代码第129行仍然包含 `posts.length`。

---

## 根因 2（辅助）：`initialScrollTop > 0` 条件漏掉 scrollTop=0

```tsx
// FeedTimeline.tsx:124
if (posts.length > 0 && initialScrollTop !== undefined && initialScrollTop > 0 && scrollRef.current) {
```

当目标 feed 的 saved `scrollTop` 是 `0`（用户从未滚动过，或一直在顶部）：
- `initialScrollTop > 0` 为 **false**
- restoration **不执行**
- `scrollRef.current` 保留上一个 feed 的滚动位置
- 浏览器截断到新的 maxScrollTop

---

## 根因 3（辅助）：`initialOffset` 完全失效

```tsx
// FeedTimeline.tsx:112
initialOffset: (initialScrollTop ?? 0) > 0 ? initialScrollTop : 0,
```

由于 FeedTimeline 没有 `key` prop，组件在 feed 切换时不会 remount。`initialOffset` 只在 `useVirtualizer` 首次创建时读取一次，对新 feed **永远无效**。

---

## 根因 4（边缘）：feedUri 在 App.tsx 中有两种定义

```tsx
// App.tsx:71（传给 useTimeline）
const feedUri = currentView.type === 'feed' 
  ? ((currentView as { feedUri?: string }).feedUri ?? getFeedConfig().defaultFeedUri ?? undefined) 
  : undefined;

// App.tsx:353（传给 FeedTimeline prop）
feedUri={(currentView as { feedUri?: string }).feedUri}
```

- `useTimeline` 接收的 `feedUri` 有 fallback 到 `defaultFeedUri`
- `FeedTimeline` 的 `feedUri` prop **没有 fallback**
- 当 `currentView.feedUri` 缺失时，两者 key 不同

---

## 修复计划

### 方案 A（推荐）：给 FeedTimeline 加 `key`，让 React remount

```tsx
// App.tsx:343
<FeedTimeline
  key={feedUri ?? 'following'}  // ← 新增
  ...
/>
```

**效果**：
- FeedTimeline 在 feed 切换时完全重新挂载
- `restoredForRef`、`virtualizer`、`scrollRef` 全部重置
- `useVirtualizer` 的 `initialOffset` 对新 feed 生效
- `posts` 在 mount 时就是正确的值（因为 remount 发生在 useTimeline 更新 store 之后）
- 逻辑最简单，无副作用

**风险**：
- 可能有性能开销（remount vs reconcile），但 per-feed cache 使内容瞬间显示，可以接受

### 方案 B（备选）：移除 `restoredForRef`，用 `posts` 变化触发 restoration

```tsx
useEffect(() => {
    const key = feedUri ?? 'following';
    // 检查：feedUri 变化后，posts 是否也已经更新为对应 feed 的数据
    if (restoredForRef.current === key) return;
    
    // 延迟到 posts 确实匹配当前 feed 后再 restore
    // ...需要更复杂的判断逻辑
  }, [feedUri, posts.length, initialScrollTop, virtualizer]);
```

**风险**：
- 逻辑复杂，容易引入新的竞态
- 需要判断 "posts 已经更新为新 feed 的数据"，没有简单的判断方法

### 方案 C（补充修复）：修复 `initialScrollTop > 0` 条件

```tsx
// 将 > 0 改为 >= 0 或 !== undefined
if (posts.length > 0 && initialScrollTop !== undefined && scrollRef.current) {
  // ...
}
```

**效果**：
- scrollTop=0 的 feed 也能被正确 restore

### 方案 D（补充修复）：统一 App.tsx 中的 feedUri

```tsx
// App.tsx
const feedUri = currentView.type === 'feed' 
  ? ((currentView as { feedUri?: string }).feedUri ?? getFeedConfig().defaultFeedUri ?? undefined) 
  : undefined;

// 使用同一个 feedUri
feedUri={feedUri}  // 替换第353行的 (currentView as ...).feedUri
```

---

## 推荐执行顺序

1. **方案 A**（加 `key` prop）— 解决核心竞态
2. **方案 C**（修复 `> 0` 条件）— 解决 scrollTop=0 的情况
3. **方案 D**（统一 feedUri）— 消除边缘不一致
4. Playwright 验证

## 不修复项

- `docs/CONTEXT.md` 中声称"移除 `posts` 依赖"的描述与实际代码不符，需在修复后更新文档
- `saveFeedScrollTop` 只在 cache entry 存在时保存（不是主要根因，因为正常浏览的 feed 都会有 cache entry）
