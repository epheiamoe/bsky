---
step: 1
agent: implementer
task: Fix gallery lightbox close animation — smooth exit instead of abrupt unmount
upstream:
  - packages/pwa/src/components/ImageLightboxDialog.tsx
  - packages/pwa/src/components/PostPreviewCard.tsx
  - packages/pwa/src/components/PostCard.tsx
  - packages/pwa/src/components/ThreadView.tsx
  - packages/pwa/src/components/ImageGrid.tsx
produced_at: 2026-06-13T12:00:00+08:00
status: completed
estimated_time: 15min
---

## 实现摘要

修复了 gallery lightbox 关闭时动画丢失的问题。根因是 `PostPreviewCard` 和 `PostCard` 中条件渲染导致组件在退出动画播放前被立即卸载。

## 变更清单

- [x] `packages/pwa/src/components/PostPreviewCard.tsx`：移除 `galleryLightbox !== null &&` 条件守卫，改为始终渲染 `ImageLightboxDialog`（当 gallery 存在时）
- [x] `packages/pwa/src/components/PostCard.tsx`：同上
- [x] `packages/pwa/src/components/ThreadView.tsx`：同上（line 539 存在相同 bug）

## 关键决策

### 根因分析

`ImageLightboxDialog` 使用内部相位状态机 (`hidden → visible → exiting → hidden`) 管理动画：

- 打开：`open=true` → `setPhase('visible')`，80ms 后 `setCrossfade(true)`
- 关闭：`open=false` → `setPhase('exiting')`，250ms 后 `setPhase('hidden')` → 返回 `null`
- 组件在 `phase === 'hidden'` 时返回 `null`（line 181）

**问题**：在 `PostPreviewCard.tsx`（line 372）和 `PostCard.tsx`（line 313）中，`ImageLightboxDialog` 被条件渲染：

```tsx
{gallery && galleryLightbox !== null && (
  <ImageLightboxDialog open={galleryLightbox !== null} ... />
)}
```

当 `onClose()` 触发 `setGalleryLightbox(null)` 时：
1. 父组件重新渲染 → `galleryLightbox !== null` 为 `false`
2. **整个组件被从 DOM 中移除**，退出动画（spring 回弹 + overlay 淡出）从未播放
3. 用户看到的是瞬间消失

**对比**：`ImageGrid.tsx`（line 225）**始终渲染** `ImageLightboxDialog`，不使用条件守卫，因此退出动画正常工作。

### 修复方案

移除 `galleryLightbox !== null &&` 条件守卫，让组件始终挂载（当 gallery 存在时），由组件内部的 `phase` 状态机管理可见性：

```tsx
// Before (broken):
{gallery && galleryLightbox !== null && (
  <ImageLightboxDialog open={galleryLightbox !== null} ... />
)}

// After (fixed):
{gallery && (
  <ImageLightboxDialog open={galleryLightbox !== null} ... />
)}
```

同时对 `initial` 和 `naturalAspectRatio` 添加了 `null` 安全处理：
- `initial={galleryLightbox ?? 0}`（防止 `null` 传入）
- `naturalAspectRatio` 在 `galleryLightbox === null` 时提前返回 `1`

### 为什么这样修复是安全的

当 `galleryLightbox` 为 `null` 且组件以 `open={false}` 渲染时：
- `phase` 初始值为 `'hidden'`（line 27）
- `useEffect`（line 55）：`open` 为 `false`，`prevOpen.current` 为 `false` → 两个分支都不执行
- 组件在 line 181 返回 `null` → **不产生任何 DOM 开销**

仅在 React 组件实例化上有极小开销，与 `ImageGrid` 的模式一致。

## 遇到的问题

无。修复方案与 `ImageGrid.tsx` 中已有的正确模式完全一致。

## 下游依赖

- 退出动画时长 250ms（spring 约 183ms 收敛 + overlay CSS transition 250ms）已协调一致，无需调整
- `sourceRects` 仍使用固定的中心 fallback rect（`120x120`），gallery lightbox 退出时会回到屏幕中央而非精确的缩略图位置——这是已有行为，非此次引入
