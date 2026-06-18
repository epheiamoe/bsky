# 2026-06-06: Feed 滚动位置偏移 — 已知问题

## 状态
- **严重程度**: 低（不影响功能，只影响体验）
- **修复状态**: 部分修复
- **优先级**: 待后续优化

## 问题描述

feed 切换时，滚动位置已从"完全丢失"改善为"大部分保留"，但仍有**轻微偏移**：
- 切换回之前浏览过的 feed 时，位置接近但不完全等于之前的位置
- 偏差通常在几十到几百像素
- 偏差方向不固定，有时偏上有时偏下

## 已完成的修复

1. `e455214` fix: feed scroll position lost on switch
   - 给 `FeedTimeline` 加 `key={feedUri}` 强制 remount
   - 修复 `initialScrollTop > 0` 条件漏掉 `scrollTop=0` 的情况
   - 统一 App.tsx 中 `feedUri` prop 的定义

## 剩余可能原因

### 1. 虚拟滚动高度估算误差
`@tanstack/react-virtual` 使用 `estimateSize` 作为初始高度估算：

```tsx
// FeedTimeline.tsx:103-110
estimateSize: (index) => {
  const post = posts[index];
  if (post) {
    const cached = _heightCache.get(post.uri);
    if (cached) return cached;
  }
  return ESTIMATED_POST_HEIGHT; // ← 固定估算 120px
},
```

当帖子实际高度与 120px 估算值不一致时：
- 滚动位置保存的是 DOM 像素值
- 恢复时虚拟滚动的 `totalSize` 基于估算高度
- 实际渲染后高度变化，导致位置偏移

### 2. 图片/媒体加载后高度变化
帖子中的图片、外链卡片等媒体内容加载完成后：
- `measureElement` 会更新 `_heightCache`
- 但滚动位置已经 restore 过了
- 后续高度变化造成位置漂移

### 3. 高度缓存失效时机
当 moderation decisions 变化时，高度缓存会被清除：

```tsx
// FeedTimeline.tsx:73-97
if (hasChanges) {
  virtualizer.measure();
}
```

如果 restore 发生在 moderation batch 处理完成之前，高度估算可能不准确。

### 4. `initialOffset` 的 `align: 'start'` 语义

```tsx
virtualizer.scrollToOffset(initialScrollTop, { align: 'start' });
```

`'start'` 对齐意味着将指定偏移量放到视口顶部。如果目标帖子部分可见，可能会跳到帖子顶部而不是精确像素位置。

## 可能的优化方向

1. **按帖子 URI 恢复而非像素值**
   - 保存 "顶部可见帖子的 URI + 相对偏移"
   - restore 时先滚动到该 URI，再微调偏移
   - 这是之前尝试过的方案，但可能因缓存缺失失败

2. **延迟 restore 到所有图片加载完成**
   - 使用 `ResizeObserver` 或 `load` 事件
   - 等待虚拟滚动高度稳定后再 restore

3. **使用 `@tanstack/react-virtual` 的 `scrollToIndex`**
   - 如果有稳定的 index 可用
   - 但我们以 URI 为 key，index 会随 feed 变化

4. **更精确的初始高度估算**
   - 根据帖子类型（文字、图片、引用等）动态估算
   - 减少与真实高度的偏差

## 验证方法

1. 用 Playwright 测量切换前后的 `scrollTop`
2. 比较偏差大小与帖子高度变化的关系
3. 检查 `_heightCache` 中的高度是否在 restore 前已填充

## 相关文件

- `packages/pwa/src/components/FeedTimeline.tsx`
- `packages/app/src/stores/feedCache.ts`
- `docs/plan/feed-scroll-position-bug-report.md`
