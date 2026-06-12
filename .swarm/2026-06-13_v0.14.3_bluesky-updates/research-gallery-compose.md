---
step: 1
agent: researcher
task: How Bluesky official app creates gallery embeds for 5+ images
upstream: []
produced_at: 2026-06-13T12:00:00Z
status: completed
confidence: high
---

## 调研摘要

Bluesky 官方 social-app 使用两个不同的 embed 类型来处理图片：≤4 张图片使用传统的 `app.bsky.embed.images`，>4 张图片则升级到 `app.bsky.embed.gallery`。Gallery embed 的 `aspectRatio` 字段是 **必需的**（lexicon 级别强制），social-app 总是从压缩后的图片尺寸中获取宽高。提交时使用 `com.atproto.repo.applyWrites` 而非直接调用 `createRecord`。

## 详细发现

### 1. 阈值逻辑：何时使用 gallery

**来源**: `src/view/com/composer/state/composer.ts` ([GitHub](https://github.com/bluesky-social/social-app/blob/main/src/view/com/composer/state/composer.ts))

```typescript
export const LEGACY_IMAGES_EMBED_MAX = 4
export const MAX_GALLERY_IMAGES = 10

function imagesToMediaVariant(
  images: ComposerImage[],
): ImagesMedia | GalleryMedia {
  return images.length <= LEGACY_IMAGES_EMBED_MAX
    ? {type: 'images', images: images.slice(0, LEGACY_IMAGES_EMBED_MAX)}
    : {type: 'gallery', images: images.slice(0, MAX_GALLERY_IMAGES)}
}
```

- **≤4 张图片**: 使用 `app.bsky.embed.images`（传统类型）
- **5-10 张图片**: 使用 `app.bsky.embed.gallery`（新类型）
- **Lexicon 硬上限**: 20（但 social-app UI 限制为 10）

### 2. EXACT 记录结构（发送到 API 的）

**来源**: `src/lib/api/index.ts` ([GitHub](https://github.com/bluesky-social/social-app/blob/main/src/lib/api/index.ts))

#### Gallery embed（5+ 图片）

```javascript
{
  $type: 'app.bsky.embed.gallery',
  items: [
    {
      $type: 'app.bsky.embed.gallery#image',
      image: res.data.blob,    // BlobRef 来自 uploadBlob()
      alt: "描述文本",          // string, 必需
      aspectRatio: {           // 必需!
        width: 1920,           // integer >= 1
        height: 1080           // integer >= 1
      }
    },
    // ... 更多 items
  ]
}
```

#### 传统 images embed（≤4 图片）

```javascript
{
  $type: 'app.bsky.embed.images',
  images: [
    {
      image: res.data.blob,    // BlobRef
      alt: "描述文本",          // string, 必需
      aspectRatio: {           // 可选!
        width: 1920,
        height: 1080
      }
    },
    // ... 最多 4 个
  ]
}
```

### 3. aspectRatio 是否必需？

| Embed 类型 | aspectRatio | Lexicon 要求 |
|-----------|-------------|-------------|
| `app.bsky.embed.images#image` | **可选** | 不在 `required` 数组中 |
| `app.bsky.embed.gallery#image` | **必需** | 在 `required` 数组中 |

**Lexicon 定义**（`app/bsky/embed/gallery.json`）:
```json
"image": {
  "type": "object",
  "required": ["image", "alt", "aspectRatio"],  // ← aspectRatio 是必需的
  "properties": {
    "image": { "type": "blob", "accept": ["image/*"], "maxSize": 2000000 },
    "alt": { "type": "string" },
    "aspectRatio": { "type": "ref", "ref": "app.bsky.embed.defs#aspectRatio" }
  }
}
```

**aspectRatio 结构**（`app/bsky/embed/defs.json`）:
```json
"aspectRatio": {
  "type": "object",
  "required": ["width", "height"],
  "properties": {
    "width": { "type": "integer", "minimum": 1 },
    "height": { "type": "integer", "minimum": 1 }
  }
}
```

### 4. 图片上传流程

**来源**: `src/lib/api/index.ts` ([GitHub](https://github.com/bluesky-social/social-app/blob/main/src/lib/api/index.ts))

```typescript
// Gallery 图片上传流程
if (embedDraft.media?.type === 'gallery') {
  const items: $Typed<AppBskyEmbedGallery.Image>[] = await Promise.all(
    imagesDraft.map(async (image, i) => {
      // 1. 压缩图片
      const {path, width, height, mime} = await compressImage(
        image,
        IMAGE_SIZE_CONFIG_POSTS,  // { maxDimension: 4000, maxSize: 2000000 }
      )
      // 2. 上传 blob
      const res = await uploadBlob(agent, path, mime)
      // 3. 构建 item
      return {
        $type: 'app.bsky.embed.gallery#image' as const,
        image: res.data.blob,      // BlobRef
        alt: image.alt,            // 用户输入的 alt 文本
        aspectRatio: {width, height},  // 从压缩后的图片获取
      }
    }),
  )
  return {
    $type: 'app.bsky.embed.gallery',
    items,
  }
}
```

**图片压缩配置**（`src/lib/constants.ts`）:
```typescript
export const IMAGE_SIZE_CONFIG_POSTS = {
  maxDimension: 4000,  // 最大维度（px）
  maxSize: 2000000,    // 最大文件大小（bytes, 2MB）
}
```

### 5. 图片尺寸检测

**来源**: `src/state/gallery.ts` ([GitHub](https://github.com/bluesky-social/social-app/blob/main/src/state/gallery.ts))

- 图片尺寸在选择/粘贴时通过 `getImageDim()` 获取
- 压缩后通过 `manipulateAsync()` 返回的 `result.width` 和 `result.height` 获取最终尺寸
- 社交应用始终在压缩后提供 `aspectRatio`，确保其准确性

```typescript
export type ImageMeta = {
  path: string
  width: number   // 原始宽度
  height: number  // 原始高度
  mime: string
}
```

### 6. Record vs View 结构差异

#### Record（写入时，发送到 API）

```javascript
// app.bsky.embed.gallery
{
  $type: 'app.bsky.embed.gallery',
  items: [
    {
      $type: 'app.bsky.embed.gallery#image',
      image: BlobRef,          // ← blob 引用
      alt: string,
      aspectRatio: {width, height}
    }
  ]
}
```

#### View（读取时，从 API 返回）

```javascript
// app.bsky.embed.gallery#view
{
  $type: 'app.bsky.embed.gallery#view',
  items: [
    {
      $type: 'app.bsky.embed.gallery#viewImage',
      thumbnail: "https://cdn.bsky.app/...",  // ← URL
      fullsize: "https://cdn.bsky.app/...",   // ← URL
      alt: string,
      aspectRatio: {width, height}
    }
  ]
}
```

**关键差异**:
- Record 使用 `image`（BlobRef），View 使用 `thumbnail` + `fullsize`（URLs）
- Record 使用 `#image` 类型，View 使用 `#viewImage` 类型
- `aspectRatio` 在两者中都存在

### 7. API 调用方式

social-app 使用 `com.atproto.repo.applyWrites` 而非直接 `com.atproto.repo.createRecord`：

```typescript
await agent.com.atproto.repo.applyWrites({
  repo: agent.assertDid,
  writes: [
    {
      $type: 'com.atproto.repo.applyWrites#create',
      collection: 'app.bsky.feed.post',
      rkey: rkey,
      value: record,  // 包含 embed 字段的完整 post record
    }
  ],
  validate: true,
})
```

## 技术选型对比

| 方案 | 适用场景 | 优点 | 缺点 |
|------|---------|------|------|
| `app.bsky.embed.images` | ≤4 张图片 | 传统兼容，aspectRatio 可选 | 最多 4 张 |
| `app.bsky.embed.gallery` | 5-10 张图片 | 支持更多图片，未来可扩展 | aspectRatio 必需 |

## 风险与注意事项

1. **aspectRatio 必需性**: Gallery embed 的 `aspectRatio` 是 lexicon 级别的必需字段。如果缺失，API 会返回验证错误。这与 `app.bsky.embed.images` 不同（后者可选）。

2. **Blob 引用**: `image` 字段必须是通过 `uploadBlob` 获取的 `BlobRef`，不能是原始文件或 URL。

3. **类型区分**: Gallery items 使用 `$type: 'app.bsky.embed.gallery#image'`，这是 union 类型的一部分，允许未来添加其他媒体类型。

4. **软限制 vs 硬限制**: Lexicon 允许最多 20 个 items，但 social-app UI 限制为 10 个。

5. **批量上传**: 使用 `Promise.all` 并行上传所有图片，可能导致同时发起多个网络请求。

## 推荐结论

### 实现 gallery embed 的正确方式

1. **判断阈值**: 图片数量 ≤ 4 使用 `app.bsky.embed.images`，> 4 使用 `app.bsky.embed.gallery`

2. **构建记录**:
```javascript
const embed = {
  $type: 'app.bsky.embed.gallery',
  items: await Promise.all(images.map(async (img) => {
    const blob = await uploadBlob(agent, img.path, img.mime)
    return {
      $type: 'app.bsky.embed.gallery#image',
      image: blob.data.blob,
      alt: img.alt,
      aspectRatio: { width: img.width, height: img.height }
    }
  }))
}
```

3. **包含在 post record 中**:
```javascript
const record = {
  $type: 'app.bsky.feed.post',
  text: '...',
  createdAt: new Date().toISOString(),
  embed: embed,  // ← gallery embed 在这里
  // ... 其他字段
}
```

4. **提交**: 使用 `com.atproto.repo.createRecord` 或 `com.atproto.repo.applyWrites`

### 关键来源

- Lexicon 定义: `lexicons/app/bsky/embed/gallery.json` ([GitHub](https://github.com/bluesky-social/atproto/blob/main/lexicons/app/bsky/embed/gallery.json))
- 社交应用实现: `src/lib/api/index.ts` ([GitHub](https://github.com/bluesky-social/social-app/blob/main/src/lib/api/index.ts))
- 状态管理: `src/view/com/composer/state/composer.ts` ([GitHub](https://github.com/bluesky-social/social-app/blob/main/src/view/com/composer/state/composer.ts))
- 图片处理: `src/state/gallery.ts` ([GitHub](https://github.com/bluesky-social/social-app/blob/main/src/state/gallery.ts))
- 常量定义: `src/lib/constants.ts` ([GitHub](https://github.com/bluesky-social/social-app/blob/main/src/lib/constants.ts))
