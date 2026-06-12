---
step: 5
agent: implementer
task: v0.14.3 extractEmbeds — gallery types, extractGallery, enhanced extractExternalLink, updated extractHasGif, updated extractEmbeds
upstream:
  - .swarm/2026-06-13_v0.14.3_bluesky-updates/architecture.md
  - packages/app/src/utils/extractEmbeds.ts
produced_at: 2026-06-13T10:15:00Z
status: completed
estimated_time: 20min
---

## 实现摘要

在 `packages/app/src/utils/extractEmbeds.ts` 中完成 v0.14.3 全部 extractEmbeds 层变更：新增 gallery 类型与提取函数，增强外部链接提取以支持 viewExternal 富元数据，更新 GIF 检测以覆盖 gallery，并更新聚合函数。TypeScript 全包通过类型检查，现有消费者无破坏。

## 变更清单

- [x] `packages/app/src/utils/extractEmbeds.ts`：6 处精确编辑，单一文件变更

## 变更明细

### 1. 新增类型（6 个 export）

| 类型 | 行号 | 说明 |
|------|------|------|
| `ExternalSourceTheme` | 10-15 | RGB 颜色定义，per `app.bsky.embed.external#colorRGB` |
| `colorRGBToString()` | 17-21 | 将 `{r,g,b}` 转为 CSS `rgb(r,g,b)` 字符串 |
| `ExternalSource` | 24-30 | 发布来源元数据（icon, title, description, theme） |
| `ExtractExternalLink` | 37-58 | **增强**：新增 `thumb?`, `createdAt?`, `updatedAt?`, `readingTime?`, `labels?`, `source?`（全部 optional） |
| `ExtractGalleryItem` | 98-107 | 单张 gallery 图片（thumbnail, fullsize, alt, aspectRatio） |
| `ExtractGallery` | 114-117 | Gallery embed 容器（images 数组） |

### 2. `extractGallery()` — 新增 (lines 143-181)

- **数据来源**：`post.record.embed`（record-side，类型检查）+ `(post as any).embed`（view-side，CDN URLs）
- **递归模式**：遵循 `extractImages` 的 `recordWithMedia` 递归模式
- **类型检查**：同时检查 `app.bsky.embed.gallery` 和 `app.bsky.embed.gallery#view`
- **view-side 回退**：view-side 不可用时回退到 record-side 数据
- **边界条件**：`items` 为空 → 返回 `null`；gallery 嵌套在 `recordWithMedia.media` 中 → 递归查找

### 3. `extractExternalLink()` — 增强 (lines 211-257)

- **保持不变**：record-side 基础字段读取（`uri`, `title`, `description`）
- **新增**：从 `(post as any).embed`（view-side `app.bsky.embed.external#view`）合并富元数据
- **富元数据字段**：`thumb`, `createdAt`, `updatedAt`, `readingTime`, `labels`, `source`（含 theme 颜色）
- **向后兼容**：所有新字段 optional；现有消费者（`PostCard`, `PostPreviewCard`）无需修改

### 4. `extractHasGif()` — 更新 (lines 355-366)

- 在 `checkGif` 内部函数新增 `app.bsky.embed.gallery` / `gallery#view` 分支
- 检测逻辑：优先检查 record-side `image.mimeType` 含 'gif'，回退检查 view-side URL 扩展名 `.gif`

### 5. `extractEmbeds()` — 更新 (lines 375-384)

- 返回类型新增 `gallery: ExtractGallery | null`
- 返回对象新增 `gallery: extractGallery(post)`

## 关键决策

1. **Gallery 独立类型，不合并到 `extractImages`**：Gallery 和 Images 是不同的 Lexicon 类型（`app.bsky.embed.gallery` vs `app.bsky.embed.images`），渲染方式完全不同（轮播 vs 网格），合并会污染单一职责。
2. **viewExternal 数据从 view-side 读取**：富元数据（source, theme, readingTime）仅存在于 API-resolved `#view` 数据中，不在 `record.embed` 中。遵循 `extractQuotedPost` 等现有模式。
3. **theme 颜色保持 `{r,g,b}` 对象**：不转换为字符串，由 UI 层通过 `colorRGBToString()` 按需转换。保持数据层纯净。
4. **不强制软限 10**：Gallery 的 `maxLength: 20` 由 AT Protocol schema 定义，客户端软限 10 由 UI 组件控制，extract 层不截断。

## 遇到的问题

无。所有 6 处编辑精确匹配架构设计。TypeScript 全包通过类型检查。

## 边界条件验证

| 条件 | extractGallery 行为 | 状态 |
|------|-------------------|------|
| `post.record.embed` 为 undefined | 返回 `null` | ✅ line 145 |
| `$type` 不是 gallery | 尝试 recordWithMedia 递归，最终返回 `null` | ✅ lines 174-177 |
| `items` 数组为空 | 返回 `null`（images.length === 0） | ✅ line 171 |
| view-side 数据不可用 | 回退到 record-side 数据（thumbnail/fullsize 可能为空字符串） | ✅ lines 163-164 |
| gallery 嵌套在 recordWithMedia.media 中 | 递归 resolve 找到 | ✅ lines 174-176 |
| 外部链接无 viewExternal | 仅返回 record-side {uri, title, description} | ✅ lines 219-223 |

## 下游依赖

- **Task #5 的 `buildGalleryEmbed()`**（`useCompose.ts`）：需要 `ExtractGallery` / `ExtractGalleryItem` 类型
- **Task #6 `buildFirstPostEmbed()`**（`useCompose.ts`）：需要根据图片数量分流 images/gallery
- **Task #7 `GalleryCard.tsx`**：需要 `ExtractGalleryItem[]` 作为 props
- **Task #8 `ExternalLinkCard.tsx`**：需要增强的 `ExtractExternalLink`（含 `source`, `thumb` 等）
- **Task #9 `PostCard.tsx`**：需要从 `extractEmbeds()` 解构 `gallery` 字段
- **Task #1 的 `extractBlobReferences()`**（`moderation.ts`）：需要同样覆盖 gallery 类型（独立任务）
- **导出索引**：确认 `packages/app/src/index.ts` 是否需导出新类型（建议添加 `ExtractGallery`, `ExtractGalleryItem`, `ExternalSourceTheme`, `ExternalSource`, `colorRGBToString`）
