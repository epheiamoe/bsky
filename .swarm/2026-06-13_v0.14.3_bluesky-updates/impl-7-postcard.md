---
step: 7
agent: implementer
task: Integrate GalleryCard and ExternalLinkCard into PostCard.tsx
upstream: [.swarm/2026-06-13_v0.14.3_bluesky-updates/architecture.md]
produced_at: 2026-06-13T12:00:00+08:00
status: completed
estimated_time: 25min
---

## 实现摘要

更新 `PostCard.tsx` 以渲染新的 `GalleryCard`（gallery embed）和 `ExternalLinkCard`（替代内联外部链接）。同时集成 `ImageLightboxDialog` 为 gallery 图片提供灯箱查看。

## 变更清单

- [x] `packages/pwa/src/components/PostCard.tsx` — 主要变更文件
  - 新增导入：`GalleryCard`, `ExternalLinkCard`, `ImageLightboxDialog`
  - 导入 React hooks：`useState`, `useCallback`, `useRef`
  - 新增类型导入：`ExtractGallery`, `ExtractGalleryItem`
  - 移除不再需要的导入：`getCdnImageUrl`, `getVideoThumbnailUrl`, `getVideoPlaylistUrl`, `useI18n`, `isBskyAppUrl`, `bskyUrlToAppView`, `BskyLinkCard`
  - 新增 `gallery` 变量声明并从 `extractEmbeds()` 解构
  - 新增 gallery lightbox 状态：`galleryLightbox`, `galleryContainerRef`, `handleGalleryClick`
  - Video 之后、external link 之前插入 gallery 渲染块
  - 替换内联 `<a>` 外部链接渲染为 `<ExternalLinkCard>` 组件
  - Return 包裹在 `<>...</>` Fragment 中以容纳 lightbox dialog
  - 新增 `ImageLightboxDialog` 用于 gallery lightbox

- [x] `packages/app/src/index.ts` — 类型导出补充
  - 新增导出：`ExtractGallery`, `ExtractGalleryItem`（PWA 依赖）

## 关键决策

1. **ExternalLinkCard 替代方案**：`ExternalLinkCard` 内部已处理 `isBskyAppUrl` 判断，当 URL 为 bsky.app 且提供了 `onOpenInternal` 时自动委托给 `BskyLinkCard`。因此 PostCard 不再需要直接导入 `BskyLinkCard` 或调用 `isBskyAppUrl`。

2. **Lightbox 集成简化**：`ImageLightboxDialog` 需要 `sourceRects` 用于打开/关闭缩放动画。由于 `GalleryCard` 是独立组件，在 PostCard 中精确追踪所有轮播图片的 DOM rect 较为复杂。当前使用 fallback rect（居中 120×120），lightbox 仍能正常功能——仅缺失从缩略图位置的缩放动画。后续可在 GalleryCard 上暴露 `rects` 回调优化。

3. **Fragment 包装**：`ImageLightboxDialog` 通过 `createPortal` 渲染到 `document.body`，但 React 要求相邻的 JSX 元素使用 Fragment 包装。将 return 包裹在 `<>...</>` 中，不影响 DOM 结构。

4. **类型导出修复**：`ExtractGallery` 和 `ExtractGalleryItem` 在 `extractEmbeds.ts` 中定义但未从 `@bsky/app/index.ts` 导出，导致 PWA 编译失败。已在 `packages/app/src/index.ts` 补充导出。

5. **死代码清理**：移除 `PostCard` 中不再使用的导入（`getCdnImageUrl`, `getVideoThumbnailUrl`, `getVideoPlaylistUrl`, `useI18n`, `isBskyAppUrl`, `bskyUrlToAppView`），减少依赖噪音。

## 嵌入渲染顺序

PostCard 中 embed 渲染的最终顺序（从上到下）：
1. `ImageGrid`（images embed，1-4 张图片）
2. `VideoCard`（video embed）
3. `GalleryCard`（gallery embed，5+ 张图片）← **新增**
4. `ExternalLinkCard`（external link embed）← **替换原内联 `<a>`**
5. `ListEmbedCard`（list embed）
6. 引用帖子（quoted post）

## 遇到的问题

1. **类型未导出**：`ExtractGallery` 和 `ExtractGalleryItem` 未从 `@bsky/app/index.ts` 导出，导致 PWA typecheck 失败。解决：在 `packages/app/src/index.ts` 补充类型导出后重新构建 `@bsky/app`。

2. **Fragment 语法错误**：初次编辑时忘记添加 `<>` 开头标签，仅添加了 `</>` 结尾，导致 TS 解析错误。修复后通过 typecheck。

## 下游依赖

- `@reviewer` 应审查 PostCard 的嵌入式组件渲染顺序和 lightbox 集成
- Gallery lightbox 的 `sourceRects` 使用 fallback 值——后续可通过 GalleryCard 暴露 DOM rects 回调优化动画
- `isBskyAppUrl` 行为微调：当 `goTo` 为 `undefined` 时，`ExternalLinkCard` 会将 bsky.app URL 渲染为普通外部链接（原行为总是用 `BskyLinkCard`）。如果 `goTo` 总是定义好的则无影响。
