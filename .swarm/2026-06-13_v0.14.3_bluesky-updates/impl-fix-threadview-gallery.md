---
step: 1
agent: implementer
task: Fix ThreadView gallery embed rendering (Bug 3)
upstream: [packages/pwa/src/components/ThreadView.tsx]
produced_at: 2026-06-13T00:00:00Z
status: completed
estimated_time: 10min
---

## 实现摘要

ThreadView 的 focused post 区域之前直接访问 `FlatLine` 属性（`imageDetails`、`hasVideo`、`externalLink`），无法渲染 `app.bsky.embed.gallery` 类型的多图帖子（5+ images）。修复方式：通过 `getPostView?.(focused.uri)` 获取 `PostView`，调用 `extractEmbeds()` 提取所有嵌入内容，优先渲染 gallery。

## 变更清单

- [x] `packages/pwa/src/components/ThreadView.tsx`：修改/添加逻辑

### 具体变更

1. **Imports** (line 2, 19-20)：
   - 添加 `extractEmbeds` 到 `@bsky/app` 导入
   - 添加 `GalleryCard` 组件导入
   - 添加 `ExternalLinkCard` 组件导入

2. **focusedEmbeds useMemo** (line 96-101)：
   - 在 `focusedListEmbed` 之后添加 `focusedEmbeds` useMemo
   - 使用与 `focusedListEmbed` 相同的 `getPostView?.(focused.uri)` 模式
   - 返回 `extractEmbeds(postView)` 的结果

3. **渲染逻辑** (line 388-430)：
   - Gallery 优先：`focusedEmbeds?.gallery` 存在时渲染 `<GalleryCard>`
   - 图片降级：仅在 `!focusedEmbeds?.gallery` 时使用 FlatLine 的 `focused.imageDetails`
   - Video 保持不变：`focused.hasVideo` + FlatLine 属性（视频嵌入不在 gallery 路径中）
   - 外部链接升级：优先使用 `focusedEmbeds?.external` 渲染 `<ExternalLinkCard>`（支持 rich metadata），FlatLine 的 `focused.externalLink` 作为降级

## 关键决策

1. **Gallery > Images 优先级**：`extractEmbeds()` 对 5+ images 返回 `gallery`，1-4 images 返回 `images`。但 ThreadView 中 gallery 渲染优先于 FlatLine 的 `imageDetails`，确保 5+ image gallery 不会被 imageDetails fallback 掩盖。

2. **ExternalLinkCard 统一处理**：`ExternalLinkCard` 组件内部已处理 `isBskyAppUrl` 判断并委托给 `BskyLinkCard`，因此 ThreadView 中 `focusedEmbeds?.external` 分支直接使用 `<ExternalLinkCard>`，无需再次判断 URL 类型。

3. **Video 不受影响**：视频嵌入使用 FlatLine 属性（`hasVideo`、`videoThumbnailUrl`、`videoPlaylistUrl`），因为视频嵌入不在 `app.bsky.embed.gallery` 类型中，且 FlatLine 的视频数据是可靠的。

4. **Moderation blur 完整保留**：Gallery 的 `<div>` 包裹器使用与 ImageGrid/VideoCard 相同的 `isFocusedMediaBlurred` blur class。

## 遇到的问题

无。TypeScript 编译通过，零错误。

## 下游依赖

- 无下游阻断。修改仅影响 ThreadView focused post 区域的渲染逻辑。
- 其他组件（PostPreviewCard 等）的 gallery 支持不在本次修复范围内。
