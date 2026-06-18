---
step: 1
agent: implementer
task: Update extractBlobReferences() for app.bsky.embed.gallery
upstream: [.swarm/2026-06-13_v0.14.3_bluesky-updates/architecture.md]
produced_at: 2026-06-13T10:00:00Z
status: completed
estimated_time: < 15 min
---

## 实现摘要

在 `packages/core/src/moderation.ts` 的 `extractBlobReferences()` 内部递归函数中新增 `app.bsky.embed.gallery` / `app.bsky.embed.gallery#view` 分支处理，使 gallery 轮播图片能够被 moderation 管线正确识别（blur labels、content warnings）。

## 变更清单

- [x] `packages/core/src/moderation.ts` — 在 `extractImages` 内部函数的 if/else-if 链中新增 gallery 分支（第 392-402 行）

## 关键决策

1. **Gallery 分支插入位置**：放在 `app.bsky.embed.images` 和 `app.bsky.embed.recordWithMedia` 之间。这是逻辑分组的最佳位置——先处理直接 embed 类型（images、gallery），再处理复合类型（recordWithMedia 递归）。

2. **CID 提取策略**：遵循 images 分支的既有模式，用 `||` 回退处理两种数据形态：
   - **Record-side**：`item.image?.ref?.$link`（blob ref 中的 CID）
   - **View-side**：`item.cid`（API-resolved 直接字段）

3. **recordWithMedia 递归覆盖**：无需额外处理 gallery-as-media 场景。现有 `extractImages(e.media)` 递归已天然覆盖——当 gallery 作为 `recordWithMedia.media` 子字段时，递归调用会重新进入 `extractImages`，此时 `$type` 匹配 gallery 分支。

4. **类型标记**：gallery 图片的 `type` 标记为 `'image'`，与 images embed 一致。两者同为静态图片，不需要独立的 `'gallery'` blob 类型。

## 变更代码

**修改前** (if/else-if 链，382-394 行):
```typescript
    if ((type === 'app.bsky.embed.images' || type === 'app.bsky.embed.images#view') && Array.isArray(e.images)) {
      for (const img of e.images as Array<Record<string, unknown>>) {
        ...
      }
    } else if ((type === 'app.bsky.embed.recordWithMedia' || type === 'app.bsky.embed.recordWithMedia#view') && e.media) {
      extractImages(e.media as Record<string, unknown>);
    }
```

**修改后** (新增 gallery 分支):
```typescript
    if ((type === 'app.bsky.embed.images' || type === 'app.bsky.embed.images#view') && Array.isArray(e.images)) {
      for (const img of e.images as Array<Record<string, unknown>>) {
        ...
      }
    } else if ((type === 'app.bsky.embed.gallery' || type === 'app.bsky.embed.gallery#view') && Array.isArray(e.items)) {
      for (const item of e.items as Array<Record<string, unknown>>) {
        const cid = ((item as any).image?.ref?.$link as string) || ((item as any).cid as string);
        if (cid) {
          refs.push({
            cid,
            uri: `at://${did}/app.bsky.feed.post/${rkey}#/${cid}`,
            type: 'image',
          });
        }
      }
    } else if ((type === 'app.bsky.embed.recordWithMedia' || type === 'app.bsky.embed.recordWithMedia#view') && e.media) {
      extractImages(e.media as Record<string, unknown>);
    }
```

## 边界条件覆盖

| 场景 | 处理 |
|------|------|
| Gallery 为直接 embed | 初始 `extractImages(embed)` 调用命中 gallery 分支 → 提取所有 items 的 blob refs |
| Gallery 在 recordWithMedia.media 中 | `recordWithMedia` 分支递归 `extractImages(e.media)` → 二次进入命中 gallery 分支 |
| Gallery items 为空数组 | `Array.isArray(e.items)` 为 true，for 循环不执行 → 无 refs 添加 |
| Record-side item（有 image blob ref） | `item.image?.ref?.$link` 命中 |
| View-side item（有 cid 字段） | `item.cid` 回退命中 |
| 非 gallery embed 的 post | 不匹配 gallery 分支 → 无影响 |

## 遇到的问题

无。实现直接遵循架构设计中的伪代码，与现有 patterns 完全一致。

## 下游依赖

- 下游任务 #2（`extractGallery()`）和 #4（`extractHasGif()`）可能需要参考此分支的 gallery item 结构（`.items` 数组、`item.image.ref.$link` / `item.cid` 双路径）
- 下游任务 #13（测试）应验证 gallery blob refs 被正确提取并传递给 `com.atproto.label.queryLabels`
