---
step: 1
agent: implementer
task: Fix PostPreviewCard missing gallery rendering
upstream: []
produced_at: 2026-06-13
status: completed
estimated_time: 10min
---

## 实现摘要

PostPreviewCard.tsx 现已支持 gallery embed 渲染和 lightbox 交互，与 PostCard.tsx 保持一致。同时将内联外部链接替换为 ExternalLinkCard 组件。

## 变更清单

- [x] `packages/pwa/src/components/PostPreviewCard.tsx`：
  - **新增 imports**：`GalleryCard`, `ExternalLinkCard`, `ImageLightboxDialog`, `ExtractGallery`, `ExtractGalleryItem`
  - **新增 state**：`galleryLightbox` (控制 lightbox 打开/关闭)
  - **新增变量**：`gallery: ExtractGallery | null`，从 `extractEmbeds(post)` 解构
  - **新增 JSX**：在 video 和 externalLink 之间插入 `<GalleryCard>` 渲染（含 media blur 支持）
  - **替换外部链接**：移除内联 `<a>` 标签 + `BskyLinkCard` 分支，统一使用 `<ExternalLinkCard>`（内部已处理 bsky.app URL）
  - **新增 lightbox dialog**：返回 JSX 包裹 `<>...</>` fragment，末尾添加 `<ImageLightboxDialog>` 逻辑
  - **清理 imports**：移除不再使用的 `isBskyAppUrl` 和 `BskyLinkCard`

## 关键决策

1. **遵循 PostCard.tsx 模式**：GalleryCard 渲染和 lightbox 逻辑与 PostCard 完全一致，包括 `DOMRect` sourceRects 和 aspectRatio 计算。
2. **ExternalLinkCard 替代内联实现**：ExternalLinkCard 内部已通过 `isBskyAppUrl` 委托给 BskyLinkCard，因此移除了 PostPreviewCard 中的重复分支逻辑。
3. **保留 moderation blur**：Gallery 区域同样受 `isMediaBlurred` 控制，与其他媒体类型行为一致。
4. **line 分支未添加 gallery**：FlatLine 类型目前不携带 gallery 数据，`extractEmbeds` 仅在 post 分支可用。

## 遇到的问题

无。TypeScript 编译通过，无类型错误。

## 下游依赖

- 需要 reviewer 确认 gallery 在 FeedTimeline、ProfilePage、BookmarkPage、SearchPage、ListDetailPage 中正常渲染
- 需要确认 lightbox 点击交互正常工作
