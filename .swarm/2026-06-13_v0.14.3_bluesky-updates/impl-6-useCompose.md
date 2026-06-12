---
step: 6
agent: implementer
task: Add buildGalleryEmbed() and update buildFirstPostEmbed() + submit() for gallery routing
upstream:
  - .swarm/2026-06-13_v0.14.3_bluesky-updates/architecture.md#task-#5
  - .swarm/2026-06-13_v0.14.3_bluesky-updates/architecture.md#task-#6
produced_at: 2026-06-13T10:00:00Z
status: completed
estimated_time: <5min
---

## 实现摘要

在 `packages/app/src/hooks/useCompose.ts` 中：
1. 新增 `buildGalleryEmbed()` 函数，构建 `app.bsky.embed.gallery` 记录
2. 更新 `buildFirstPostEmbed()` 在两个路径按图片数量分流（>4 → gallery，≤4 → images）
3. 更新 `submit()` 中后续帖子的 embed 构建，同样按数量分流

## 变更清单

- [x] `packages/app/src/hooks/useCompose.ts`：新增 `buildGalleryEmbed()`（第63-90行）
- [x] `packages/app/src/hooks/useCompose.ts`：更新 `buildFirstPostEmbed()` quote+images 路径（第139行）
- [x] `packages/app/src/hooks/useCompose.ts`：更新 `buildFirstPostEmbed()` images-only 路径（第146行）
- [x] `packages/app/src/hooks/useCompose.ts`：更新 `submit()` 后续帖子 embed（第290行）

## 关键决策

- **阈值判定 `images.length > 4`**：1-4张用 `app.bsky.embed.images`，5+张用 `app.bsky.embed.gallery`，与官方应用行为一致
- **gallery 的 aspectRatio 字段**：仅在 `ComposeMedia.aspectRatio` 存在时嵌入（optional），与 `buildVideoEmbed()` 模式一致
- **不修改 `ComposeMedia` 类型**：现有类型已有 `blobRef.$link`、`alt`、`aspectRatio`，无需变更
- **不修改 `MAX_IMAGES`**：这是 Task #10 的工作

## 遇到的问题

无。TypeScript 类型检查通过。

## 下游依赖

- Task #10 (ComposePage.tsx)：需要 `buildGalleryEmbed` 的导出（或直接使用 `buildFirstPostEmbed`），需要更新图片上限从4到10
- `buildGalleryEmbed` 当前为模块私有函数（未 export），如需在 ComposePage 中使用需添加 export
