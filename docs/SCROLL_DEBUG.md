# Scroll Position Loss — Postmortem

> v0.10.4 · 2026-05-10

## Bug Summary

PWA 时间线在 feed → thread → feed 导航后，滚动位置丢失，帖子列表从 40+ 条重置到 ~20 条，且 scrollTop 停留于中间位置而非进入推文前的位置。

## Root Cause 1: posts 重置（首要根因）

### 代码路径

`packages/app/src/hooks/useTimeline.ts`:

```ts
const lastFeed = useRef<string | undefined>(feedUri);  // initial: undefined
// ...
const effFeedUri = feedUri ?? lastGoodFeed.current;      // becomes "at://..." after auth

useEffect(() => {
    if (effFeedUri !== lastFeed.current) {               // undefined !== undefined → false
        // ... clear posts ...                            // FIRST mount: no reset
    }
}, [effFeedUri, store]);
```

### 问题

首次渲染时 `feedUri` prop 为 `undefined`（auth 未就绪），导致 `lastFeed.current` 也为 `undefined`。

Auth 完成后 App 重新渲染，`feedUri` 变为 `"at://..."`。此时：

```ts
lastFeed.current = undefined (从未更新)
effFeedUri       = "at://..." (有效值)
```

effect 比较 `effFeedUri !== lastFeed.current` → `"at://..." !== undefined` → **true** → 误判为 feed 切换 → 清空 posts、重置 loaded 标志 → `store.load()` 重新请求 20 条。

### 修复

```ts
// 在 render body 中、effect 运行之前初始化 lastFeed
if (lastFeed.current === undefined && effFeedUri !== undefined) {
    lastFeed.current = effFeedUri;
}
```

这确保了当 `effFeedUri` 首次变为有效值时，`lastFeed.current` 已经被设为相同值，effect 不会误触发。

### 根因链

```
首次渲染 feedUri=undefined
  → lastFeed.current = undefined (never updated)
  ↓ auth completes
  feedUri = "at://...", effFeedUri = "at://..."
  ↓ render body
  if (lastFeed.current === undefined && effFeedUri !== undefined)
    → lastFeed.current = "at://..."        ← 新加行，effect 前执行
  ↓ effect
  effFeedUri !== lastFeed.current?  ← "at://..." !== "at://..." → false → no reset
```

---

## Root Cause 2: scroll 偏移

### 代码路径

`packages/pwa/src/components/FeedTimeline.tsx`:

FeedTimeline 在视图切换时卸载/重建，`useVirtualizer` 随之销毁。重建后：

1. `estimateSize` 返回 120px（`ESTIMATED_POST_HEIGHT`），但实际每帖高度 ~170px（含 PostActionsRow）
2. 50 条帖子的累积偏差 = 50 × 50px = ~2500px
3. `requestAnimationFrame` 设置 `el.scrollTop = savedScrollTop`，但 virtualizer 内部 `scrollOffset` 仍为 0（它只通过 scroll 事件更新 offset，不读 DOM 属性）

### 尝试过的方案

| 方案 | 结果 | 原因 |
|------|------|------|
| `display:none` 保持挂载 | ❌ 更严重 | virtualizer `clientHeight=0` 混乱；RAF 效果不重跑 |
| `el.scrollTop = value` + `useLayoutEffect` | ❌ 回顶部 | virtualizer 不从 DOM 属性读 scrollTop |
| `position:fixed; left:-9999px` 隐藏 | ⚠️ 部分修复 | posts 重置问题掩盖了 scroll 修复效果 |
| `virtualizer.scrollToOffset()` | ❌ 回顶部 | 内部 `scheduleScrollReconcile` 用 RAF 延迟 |
| `initialOffset` | ✅ | 利用 `_willUpdate` → `_scrollToOffset` + `flushSync` 同步闭环 |

### 最终修复

```ts
const virtualizer = useVirtualizer({
    // ...
    initialOffset: (initialScrollTop ?? 0) > 0 ? initialScrollTop : 0,
});
```

Virtualizer 内部 `_willUpdate`（`useLayoutEffect`）在 mount 时自动执行：

```
_scrollToOffset(getScrollOffset())
  ↑ initialOffset → 5000
  → element.scrollTo({ top: 5000 }) → 原生 scroll 事件
  → offset handler → scrollOffset = 5000
  → notify(true) → flushSync(rerender) → 同步重渲染
```

这是 `@tanstack/virtual-core` 内建的 mount 时 scroll 同步闭环。

### 辅助修复

模块级 `_heightCache`（`Map<post.uri, measuredHeight>`）跨 mount 持久化实测高度：

```ts
const _heightCache = new Map<string, number>();

// estimateSize 优先读缓存
estimateSize: (index) => {
    const post = posts[index];
    if (post) {
        const cached = _heightCache.get(post.uri);
        if (cached) return cached;
    }
    return ESTIMATED_POST_HEIGHT;
},

// 回调 ref 在 measureElement 的同时缓存高度
ref={(el) => {
    if (el) {
        virtualizer.measureElement(el);
        const h = el.getBoundingClientRect().height;
        if (h > 0) _heightCache.set(post.uri, h);
    }
}}
```

---

## Failed Approaches Log

### Attempt 1: display:none

在 App.tsx 中用 `<div style={{ display: 'none' }}>` 保持 FeedTimeline 挂载。

**问题**:
- `getScrollElement().clientHeight = 0` → virtualizer 混乱
- RAF 效果 deps 不变不重跑
- 浏览器不保证 `display:none` 保留 scrollTop

### Attempt 2: height cache + useLayoutEffect

模块级高度缓存 + `useLayoutEffect` 设 `el.scrollTop = saved`。

**问题**:
- `el.scrollTop = value` 不触发 scroll 事件 → virtualizer 不知道
- virtualizer 不从 DOM 属性读 scrollTop，只从 scroll 事件更新

### Attempt 3: scrollToOffset

`virtualizer.scrollToOffset(saved)` 替代直接设 scrollTop。

**问题**:
- 内部 `element.scrollTo()` + `scheduleScrollReconcile`（RAF）→ 延迟
- `useLayoutEffect` 退出后 sync re-render 才发生 → 闪一下错误内容

### Attempt 4: position fixed offscreen

`position: fixed; left: -9999px` 保持 FeedTimeline 挂载但移至屏幕外。

**问题**:
- posts 重置（Root Cause 1）完全覆盖了 scroll 修复的效果
- 移屏的 position 切换可能在某些浏览器触发 layout 重算

### Final: lastFeed init + _heightCache + initialOffset

三合一，针对三个独立但叠加的问题分别修复。

---

## Verification

1. 登录 PWA，下拉时间线加载 40+ 条帖子
2. 滚动到非顶部位置
3. 点击任意帖子进入 ThreadView
4. 返回时间线
5. 验证：滚动位置准确恢复，帖子数量与进入前一致

## Related Files

| File | Purpose |
|------|---------|
| `packages/app/src/hooks/useTimeline.ts` | `lastFeed.current` 初始化修复 |
| `packages/pwa/src/components/FeedTimeline.tsx` | `_heightCache` + `initialOffset` |
| `packages/app/src/stores/timeline.ts` | limit=20（未来可优化） |
