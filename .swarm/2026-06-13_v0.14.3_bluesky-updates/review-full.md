---
step: review
agent: reviewer
task: Gallery embed full code review — 3 critical bugs investigation
upstream:
  - packages/app/src/utils/extractEmbeds.ts
  - packages/app/src/hooks/useCompose.ts
  - packages/app/src/hooks/useThread.ts
  - packages/pwa/src/components/ComposePage.tsx
  - packages/pwa/src/components/PostCard.tsx
  - packages/pwa/src/components/PostPreviewCard.tsx
  - packages/pwa/src/components/ThreadView.tsx
  - packages/pwa/src/components/GalleryCard.tsx
  - packages/core/src/moderation.ts
produced_at: 2026-06-13T12:00:00+08:00
status: completed
perspective: general
---

## 审查摘要

**不通过 (FAIL)** — 三个 Critical 级别的根因均已确认，均属于架构层面的遗漏而非简单的边界 bug。

---

## 问题清单

### 🔴 Critical（阻塞性问题）

#### C1: Bug 1 根因 — `PostPreviewCard` 完全缺失 Gallery 渲染逻辑

| # | 位置 | 问题 | 影响 | 建议修复 |
|---|------|------|------|---------|
| C1 | `PostPreviewCard.tsx` 全文 | `PostPreviewCard` 是 **PWA 中唯一实际被使用的帖子渲染组件**（FeedTimeline、ProfilePage、BookmarkPage、SearchPage、ListDetailPage、ThreadView 回复列表全部使用它），但其代码中：① 没有声明 `gallery` 变量；② `extractEmbeds(post)` 的返回值中 `embeds.gallery` 被完全忽略；③ 没有 `import GalleryCard`；④ 渲染区域没有任何 gallery 分支 | **Timeline / Profile / Bookmark / Search / List 中所有 gallery 帖子只显示文字，不显示图片**。这是 Bug 1 的直接根因。 | 在 `if (post)` 分支的 extractEmbeds 调用后添加 `gallery = embeds.gallery;`，在渲染区域（`{hasImages && ...}` 之后、`{video && ...}` 之后）添加 `<GalleryCard>` 渲染块，同 `PostCard.tsx` 的 246-253 行模式。**注意**：需要导入 `GalleryCard` 和 `ExtractGallery` 类型，还需要导入 `ImageLightboxDialog` 并添加 lightbox 状态管理。 |

**根因详细追踪**：

```
FeedTimeline.tsx → <PostPreviewCard post={post} ...> (line 283)
ProfilePage.tsx  → <PostPreviewCard post={post} ...> (line 514)
BookmarkPage.tsx → <PostPreviewCard post={post} ...> (line 109)
SearchPage.tsx   → <PostPreviewCard post={item} ...> (line 205)
ListDetailPage.tsx → <PostPreviewCard post={post} ...> (line 279)
ThreadView.tsx (replies) → <PostPreviewCard line={line} ...> (line 506)
```

**没有任何一个页面使用 `PostCard.tsx`**。`PostCard.tsx` 有完整的 gallery 支持（包括 GalleryCard + ImageLightboxDialog），但它是 **dead code** — 没有被任何页面组件 import 使用（只有 `truncateName` 的 re-export 被 SearchPage 使用）。

`PostPreviewCard.tsx` 的 `if (post)` 分支（line 156-163）：
```tsx
const embeds = extractEmbeds(post);
images = embeds.images;      // ✅ images 提取了
hasImages = images.length > 0; // ✅
externalLink = embeds.external; // ✅
listEmbed = embeds.list;        // ✅
quotedPost = extractQuotedPost(post); // ✅
video = embeds.video;           // ✅
hasVideo = video !== null;      // ✅
// ❌ gallery 被完全忽略 — 没有 gallery = embeds.gallery
```

渲染区域（line 286-312）只有：
- `{hasImages && <ImageGrid .../>}` — images 渲染 ✅
- `{video && <VideoCard .../>}` — video 渲染 ✅
- **没有任何 gallery 渲染** ❌

**Confidence: HIGH** — 代码追踪确认，PostPreviewCard 是唯一被使用的组件，且完全没有 gallery 处理。

---

#### C2: Bug 2 根因 — ThreadView focused post 的 GalleryCard 缺少 `onImageClick`

| # | 位置 | 问题 | 影响 | 建议修复 |
|---|------|------|------|---------|
| C2 | `ThreadView.tsx:390` | `<GalleryCard images={focusedEmbeds.gallery.images} />` 没有传递 `onImageClick` prop，且 ThreadView 没有 `ImageLightboxDialog` 的状态管理和渲染 | Thread focused post 中的 gallery 图片无法点击放大，没有 lightbox 功能 | ① 添加 `galleryLightbox` state（`useState<number \| null>(null)`）；② 给 GalleryCard 添加 `onImageClick={setGalleryLightbox}`；③ 添加 `ImageLightboxDialog` 渲染（参照 `PostCard.tsx:313-328` 的模式）；④ 导入 `ImageLightboxDialog` 和 `ExtractGalleryItem` |

**对比 PostCard.tsx 的正确实现**（line 246-328）：
```tsx
// PostCard.tsx — 有完整的 lightbox 支持
const [galleryLightbox, setGalleryLightbox] = useState<number | null>(null);
// ...
<GalleryCard images={gallery.images} onImageClick={handleGalleryClick} />
// ...
{gallery && galleryLightbox !== null && (
  <ImageLightboxDialog
    open={galleryLightbox !== null}
    images={gallery.images.map(img => ({ url: img.fullsize, alt: img.alt }))}
    initial={galleryLightbox}
    onClose={() => setGalleryLightbox(null)}
  />
)}
```

**ThreadView.tsx 缺失**（line 388-392）：
```tsx
// ThreadView.tsx — 无 lightbox
{focusedEmbeds?.gallery && focusedEmbeds.gallery.images.length > 0 && (
  <div className={...}>
    <GalleryCard images={focusedEmbeds.gallery.images} />
    {/* ❌ 没有 onImageClick */}
    {/* ❌ 没有 ImageLightboxDialog */}
  </div>
)}
```

**Confidence: HIGH** — 直接对比两个组件的实现确认。

---

#### C3: Bug 3 根因 — `buildGalleryEmbed()` 缺少 lexicon 必需的 `aspectRatio` 字段

| # | 位置 | 问题 | 影响 | 建议修复 |
|---|------|------|------|---------|
| C3a | `useCompose.ts:68-90` | `buildGalleryEmbed()` 中 `aspectRatio` 是条件性添加的（`if (img.aspectRatio)`），但 **Bluesky lexicon `app.bsky.embed.gallery#image` 将 `aspectRatio` 标记为 `required`**。由于 `ComposeMedia.aspectRatio` 对图片是可选的，且 `ComposePage.tsx` 上传图片时不设置 aspectRatio（line 740-745），所以发送 gallery 帖子时每个 item 都缺少 `aspectRatio`。 | `createRecord` API 会因 schema validation 失败而拒绝请求，或者服务端静默忽略无效 embed。帖子发送失败但用户可能看不到明确的 gallery-specific 错误信息。 | 方案 1（推荐）：在 `CompressPage.tsx` 图片上传时检测 aspectRatio（像 video 一样用 `createImageBitmap` 或 `new Image()` 获取 naturalWidth/Height），并设置到 `ComposeMedia.aspectRatio`。方案 2（兜底）：在 `buildGalleryEmbed()` 中，当 `aspectRatio` 缺失时使用默认值 `{ width: 1, height: 1 }`。 |
| C3b | `ComposePage.tsx:740-745` | 图片上传成功后创建 `ComposeMedia` 对象时不设置 `aspectRatio`：`uploaded.push({ type: 'image', blobRef: ..., alt: img.altText })` — 缺少 `aspectRatio` 字段 | 同 C3a | 在 `processFiles()` 时异步检测每张图片的宽高比（类似 line 410-424 中 video 的 `onloadedmetadata` 检测），存入 `LocalImage.aspectRatio`，上传后传入 `ComposeMedia`。 |

**Lexicon 对比**（`app.bsky.embed.gallery.json`）：
```json
"image": {
  "type": "object",
  "required": ["image", "alt", "aspectRatio"],  // ← aspectRatio 是 REQUIRED
  "properties": {
    "image": { "type": "blob" },
    "alt": { "type": "string" },
    "aspectRatio": { "type": "ref", "ref": "app.bsky.embed.defs#aspectRatio" }
  }
}
```

**当前代码**（`buildGalleryEmbed` line 71-88）：
```tsx
const item: Record<string, unknown> = {
  image: { ... },
  alt: img.alt,
  // ❌ aspectRatio 只在 img.aspectRatio 存在时才添加
  // 而 ComposeMedia.aspectRatio 对图片永远是 undefined
};
if (img.aspectRatio) {
  item.aspectRatio = { ... };  // 永远不会执行
}
```

**Confidence: HIGH** — lexicon 明确要求 `aspectRatio`，代码路径追踪确认图片的 `aspectRatio` 永远为 undefined。

---

### 🟠 Major（重要问题）

#### M1: `PostCard.tsx` 成为 dead code（仅 `truncateName` 被使用）

| # | 位置 | 问题 | 影响 | 建议修复 |
|---|------|------|------|---------|
| M1 | `PostCard.tsx` 全文 | `PostCard` 组件实现了完整的 gallery 支持（GalleryCard + ImageLightboxDialog），但**没有任何页面组件 import 使用它**。所有 feed/timeline/profile/bookmark/search/list 视图都使用 `PostPreviewCard`。只有 `truncateName` 被 SearchPage re-export 使用。 | ① PostCard 中精心实现的 gallery + lightbox 代码完全浪费；② 维护两套相似的帖子渲染组件增加技术债；③ 容易导致未来修改只改一处漏另一处。 | 决策：要么将 PostPreviewCard 合并进 PostCard（删除 PostPreviewCard），要么将 PostCard 的 gallery + lightbox 逻辑迁移到 PostPreviewCard（删除 PostCard）。推荐后者，因为 PostPreviewCard 有更多实际功能（moderation overlay、HiddenBanner 等）。 |

#### M2: `FlatLine` 接口缺失 gallery 字段

| # | 位置 | 问题 | 影响 | 建议修复 |
|---|------|------|------|---------|
| M2 | `useThread.ts:7-47` | `FlatLine` 接口没有 gallery 相关字段。`flattenThreadTree`（line 189-214）提取了 `imageDetails`、`video*`、`externalLink`、`quotedPost`，但完全没有提取 gallery。当 ThreadView 回复使用 `line` prop 渲染 PostPreviewCard 时，gallery 数据完全丢失。 | ThreadView 回复列表中如果回复有 gallery embed，将完全不显示。 | 在 `FlatLine` 中添加 `gallery?: ExtractGallery \| null` 字段；在 `flattenThreadTree` 中调用 `extractGallery(post)` 并赋值；在 `PostPreviewCard` 的 `line` 分支中处理 gallery。 |

#### M3: `extractQuotedPost()` 不处理 quoted post 中的 gallery embed

| # | 位置 | 问题 | 影响 | 建议修复 |
|---|------|------|------|---------|
| M3 | `extractEmbeds.ts:259-311` | `extractQuotedPost()` 的 `recEmbeds` 处理（line 282-295）只处理了 `app.bsky.embed.images#view` 和 `app.bsky.embed.external#view`，没有处理 `app.bsky.embed.gallery#view`。 | 如果一个被引用的帖子使用 gallery embed（5+ 张图片），引用预览中不会显示任何图片。 | 在 `recEmbeds` 处理中添加 gallery 分支。 |

---

### 🟡 Minor（建议改进）

| # | 位置 | 问题 | 建议 |
|---|------|------|------|
| m1 | `extractImages.ts:119-141` | `extractImages()` 只检查 `app.bsky.embed.images` 和 `app.bsky.embed.images#view`，不检查 gallery。如果 gallery 帖子的 view-side embed 由于某种原因返回为 images 格式，图片也不会被 images 函数提取。 | 添加 gallery fallback — 如果 extractGallery 返回 null 但 embed 有 gallery type，可以尝试从 gallery items 提取 images。 |
| m2 | `useCompose.ts:68-90` | `buildGalleryEmbed` 的 `$type` 硬编码为 `'app.bsky.embed.gallery'`，与 lexicon 一致，但缺少 JSDoc 说明与 `buildImageEmbed` 的切换阈值（`images.length > 4`）。 | 在 `buildFirstPostEmbed` 的 `images.length > 4` 判断处添加注释说明 Bluesky 官方客户端的 gallery 阈值。 |
| m3 | `PostPreviewCard.tsx:34` | `LINK_REGEX` 没有包含 `bsky.app/` 前缀的 URL 模式（与 `PostCard.tsx:34` 的正则不同）。PostCard 的正则有 `bsky\.app\/[^\s<>"']+` 但 PostPreviewCard 没有。 | 统一两个组件的 LINK_REGEX。 |

---

### 🔵 Info（正面发现）

1. **`extractGallery()` 实现正确** — 正确处理了 record-side 和 view-side 数据的合并，正确递归 `recordWithMedia`，正确处理 `post.embed`（view-side）的 CDN URL 优先策略。
2. **`extractHasGif()` 正确处理 gallery** — 355-366 行正确检查 gallery items 的 mimeType 和 URL 扩展名。
3. **`extractBlobReferences()` 正确处理 gallery** — moderation.ts 392-402 行正确从 gallery items 提取 blob 引用。
4. **`GalleryCard` 组件质量高** — 完整的 a11y 支持（carousel role、aria-roledescription、键盘导航、触控滑动），代码清晰。
5. **i18n 完整** — gallery 相关的 i18n keys 在 en/zh/ja 三个 locale 中都有。
6. **`buildFirstPostEmbed` 正确路由 gallery** — `images.length > 4` 判断正确，quote+gallery 的 `recordWithMedia` 组合也正确处理。

---

## 与设计文档的一致性

- `extractEmbeds()` 返回类型包含 `gallery` 字段 — **设计意图是支持 gallery** ✅
- `PostCard.tsx` 有完整的 gallery + lightbox 实现 — **设计意图是 gallery 有 lightbox** ✅
- 但 `PostPreviewCard.tsx`（实际使用的组件）完全没有 gallery — **实现与设计不一致** ❌
- `FlatLine` 缺失 gallery 字段 — **线程扁平化时丢失 gallery 数据** ❌

---

## 最终判定

**VERDICT: FAIL**

判定理由：3 个 Critical 级别问题阻塞全部 gallery 功能 — 渲染层缺失（PostPreviewCard 无 gallery）、交互层缺失（ThreadView 无 lightbox）、发送层缺失（aspectRatio required 但未提供）。这三个问题共同导致 gallery embed 既无法显示也无法发送。

---

## 修复优先级建议

| 优先级 | 修复 | 影响范围 |
|--------|------|---------|
| **P0** | C1: 给 PostPreviewCard 添加 gallery 渲染 + lightbox | 解决 Bug 1：Timeline/Profile/所有列表中的 gallery 显示 |
| **P0** | C2: 给 ThreadView 添加 gallery lightbox | 解决 Bug 2：Thread focused post 的 gallery 点击放大 |
| **P0** | C3: 在 ComposePage 检测图片 aspectRatio + buildGalleryEmbed 确保必填字段 | 解决 Bug 3：gallery 帖子发送失败 |
| **P1** | M2: FlatLine 添加 gallery 字段 | Thread 回复列表中的 gallery 显示 |
| **P2** | M1: 合并 PostCard 和 PostPreviewCard | 减少技术债 |
| **P2** | M3: extractQuotedPost 处理 gallery | 引用帖子中的 gallery 预览 |
