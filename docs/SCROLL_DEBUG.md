# Scroll Position Loss — Postmortem

> v0.10.4 – v0.10.6 · 2026-05-10 – 2026-05-11

## Bug Summary

PWA 所有虚拟滚动页面在导航 → 返回后滚动位置丢失，回到顶部。

历经三个迭代修复：

| 版本 | 修复内容 | 效果 |
|------|---------|------|
| v0.10.4 | FeedTimeline 专属修复 | FeedTimeline ✅，其它页面 ❌ |
| v0.10.5 | `useVirtualizedList` hook + 模块级 cache + RAF + layoutEffect fallback | 混乱，问题未解 |
| v0.10.6 | FeedTimeline 路径全面推广 + `items.length` deps | 全部页面 ✅ |

---

## 根因链

### 根因 1：scrollTop 保存时机（v0.10.5 修复 — scroll 事件实时保存）

**问题**：`useEffect` cleanup 保存 scrollTop 时 DOM 可能已移除 → `scrollTop = 0`。

**修复**：改用 FeedTimeline 的 scroll 事件实时回调模式。App.tsx 中每个页面持有一个 `useRef`，scroll 事件 → `onScrollTopChange(top)` → 实时更新 ref。不依赖 cleanup。

### 根因 2：RAF 初始报告覆盖已保存值（v0.10.5 发现并修复）

**问题**：`requestAnimationFrame(report)` 在 mount 时保存 `scrollTop = 0`，覆盖了上一轮已保存的非零值。

**修复**：放弃内部 RAF，改用 FeedTimeline 路径——scrollTop 由 App.tsx 的 `useRef` 持有，通过 props 传入 `initialScrollTop`。

### 根因 3：scroll listener 未挂到延迟出现的容器上（v0.10.6 修复 — **本次最终根因**）

**这是 SearchPage 和 ProfilePage 的致命问题**。

```
首次访问 SearchPage:
  render 1: loading=true → spinner → 无 scroll 容器
    ↓
  useEffect 执行 → scrollRef.current = null → return → listener 从未挂上
    ↓
  API 返回 → loading=false → scroll 容器出现
    ↓
  useEffect 未重新执行（deps `[onScrollTopChange, cacheKey]` 没变）
    → listener 仍然没挂！

  用户滚动 → onScrollTopChange 从未被调用 → ref 始终 0
    ↓
  返回 → initialScrollTop=0 → 位置丢失 ❌
```

**第二次返回时**：cache 命中 → loading=false 首屏就有容器 → listener 首次正常挂上。

**Fix**：`useEffect` deps 加 `items.length`：

```typescript
useEffect(() => {
    const el = scrollRef.current as any;
    if (!el) return;
    // ... 挂 scroll listener ...
    return () => { /* 移除 listener */ };
}, [options?.onScrollTopChange, cacheKey, items.length]);
//                                                   ^^^^^^^^^^^^
```

当 API 返回后 items 从 0→N，容器出现，effect 重新执行，listener 挂到新元素上。

### 根因 4：FeedTimeline 为什么一直正常

FeedTimeline 的 `useTimeline` 在 **App.tsx** 中调用，从不卸载。`useRef` 在 App.tsx 内部，值跨视图切换持久。`FeedTimeline` 组件虽然 mount/unmount，但 ref 和 `onScrollTopChange` 回调都在 App.tsx 中，从不丢失。

此外 FeedTimeline 的 scroll 容器始终存在（`loading && posts.length === 0` 条件保护，无 spinner 覆盖），所以 listener 从第一次 mount 就正确挂上，无需 `items.length` deps。

---

## 架构演进

```
v0.10.4: FeedTimeline 专属修复
  App.tsx ← useRef → FeedTimeline (props: initialScrollTop/onScrollTopChange)
  └── 其他页面: useScrollRestore + useEffect cleanup → ❌ 根因1

v0.10.5: 统一 useVirtualizedList hook
  useVirtualizedList 内部管理 scrollTop（模块级 Map + RAF + layoutEffect）
  └── 根因1 修复（scroll事件保存），根因2 修复（RAF > 0守卫）
  └── 但根因3 未修复（items.length deps 缺失）

v0.10.6: FeedTimeline 路径全面推广
  App.tsx ← useRef × N → 所有页面 (props: initialScrollTop/onScrollTopChange)
  └── 统一走 FeedTimeline 路径，所有差异消除
  └── items.length deps 修复根因3
```

---

## 文件改动

| 版本 | 文件 | 改动 |
|------|------|------|
| v0.10.4 | `useTimeline.ts` | `lastFeed.current` render body 初始化 |
| v0.10.4 | `FeedTimeline.tsx` | `_heightCache` + `initialOffset` + callback ref |
| v0.10.5 | `stores/cache.ts` | 模块级数据缓存层 |
| v0.10.5 | `hooks/useVirtualizedList.ts` | 统一虚拟滚动 hook（后废弃）|
| v0.10.6 | `hooks/useVirtualizedList.ts` | 改为 props 模式，加 `items.length` deps |
| v0.10.6 | `App.tsx` | 每页一个 `useRef` + props 透传 |
| v0.10.6 | 6 个 page 组件 | 接收 `initialScrollTop`/`onScrollTopChange` props |
| v0.10.6 | 5 个 data hook | `silent` 参数 |
| v0.10.6 | `useSearch.ts` | `initialQuery` 参数 + 自动 silent 恢复 |

---

## 验证

1. 登录 PWA，首次访问搜索 → 滚动 → 点帖子 → 返回 → 位置正确
2. 首次访问资料 → 滚动 → 点帖子 → 返回 → 位置正确
3. 通知/书签/列表 → 同上
4. 首次访问时间线 → 同上（回归测试）
5. 第二次返回 → 位置保持正常
