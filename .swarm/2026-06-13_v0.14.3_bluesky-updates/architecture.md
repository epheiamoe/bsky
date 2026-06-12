---
step: 1
agent: architect
task: v0.14.3 architecture — Bluesky 2026 H1 feature alignment
upstream:
  - .swarm/2026-06-13_bluesky-updates/research.md
  - .swarm/2026-06-13_v0.14.3_bluesky-updates/plan.md
  - packages/app/src/utils/extractEmbeds.ts
  - docs/TODO.md
  - docs/ARCHITECTURE.md
produced_at: 2026-06-13T09:30:00Z
status: completed
---

## 执行摘要

为 v0.14.3 设计 Bluesky 2026 H1 新功能架构：新增 `app.bsky.embed.gallery` 轮播渲染与发帖支持（5+ 图片），增强 `viewExternal` 富元数据卡片渲染，更新 moderation 管线以覆盖新 embed 类型。全部业务逻辑集中在 `@bsky/app` / `@bsky/core`，PWA/TUI 仅写渲染层。

---

## 架构设计

### 整体数据流

```
Bluesky API Response (PostView)
    │
    ├── post.record.embed ──────────→ extractEmbeds() ──→ { images, video, external, gallery, ... }
    │   (record-level $type)              │
    │                                      ├── images:   ExtractImage[]      (1-4 images embed)
    │   (post as any).embed ──────────────├── gallery:  ExtractGallery | null (5+ images embed, NEW)
    │   (view-level resolved data)        ├── video:    ExtractVideo | null
    │                                      ├── external: ExtractExternalLink | null  (enhanced, NEW)
    │                                      ├── quoted:   ExtractQuotedPost | null
    │                                      └── ...
    │
    ▼
PostCard / ThreadView / ProfilePage
    │
    ├── images.length > 0    →  ImageGrid
    ├── gallery              →  GalleryCard  (NEW)
    ├── video                →  VideoCard
    ├── external             →  ExternalLinkCard (enhanced, NEW)
    └── quoted               →  embedded card
```

### 关键架构决策

| 决策 | 选择 | 理由 |
|------|------|------|
| Gallery 是独立 embed 类型 | 新 `extractGallery()`，不与 `extractImages` 合并 | Gallery 和 Images 是不同词表，渲染方式完全不同（轮播 vs 网格），合并会污染单一职责 |
| viewExternal 数据来源 | 读 `(post as any).embed`（view-side） | 富元数据只在 API-resolved `#view` 中存在，不在 `record.embed` 中。与 `extractQuotedPost` 模式一致 |
| Compose: 4 vs 5+ 阈值 | 1-4 → `images`，5+ → `gallery` | 匹配官方 v1.123.0 行为。软限 10 张（schema max 20） |
| ExternalLinkCard 组件 | 新建独立 `ExternalLinkCard.tsx` | 现有 PostCard 内联 `<a>` 标签太简陋，viewExternal 富数据（source icon/theme/readingTime）需要独立组件 |
| Gallery 与 recordWithMedia | gallery 可作为 `media` 子字段 | 支持 quote+5+images 引用帖场景 |
| i18n 命名空间 | 新 key 前缀 `gallery.` / `external.` | 与现有 `compose.` / `post.` 命名空间一致 |

---

## 模块划分

| 模块 | 包 | 职责 | 输入 | 输出 | 依赖 |
|------|-----|------|------|------|------|
| `extractGallery()` | `@bsky/app` | 从 PostView 提取 gallery embed | `PostView` | `ExtractGallery \| null` | 无 |
| `extractViewExternal()` | `@bsky/app` | 从 PostView view-side 提取富链接数据 | `PostView` | 增强的 `ExtractExternalLink` | 与现有 `extractExternalLink` 合并 |
| `buildGalleryEmbed()` | `@bsky/app` | 构建 gallery 记录用于发帖 | `ComposeMedia[]` | `Record<string, unknown>` | 无 |
| `GalleryCard` | `@bsky/pwa` | 轮播组件渲染 | `ExtractGalleryItem[]` | React 组件 | `@bsky/app` types, `Icon`, `Modal` |
| `ExternalLinkCard` | `@bsky/pwa` | 富链接卡片渲染 | `ExtractExternalLink` | React 组件 | `@bsky/app` types, `Icon` |
| `extractBlobReferences()` | `@bsky/core` | 提取 blob refs (含 gallery) | `postUri`, `embed` | `BlobReference[]` | 无 |
| `extractHasGif()` | `@bsky/app` | 检测 GIF (含 gallery) | `PostView` | `boolean` | 无 |
| TUI Gallery render | `@bsky/tui` | 终端轮播渲染 | `ExtractGallery` | Ink 组件 | `@bsky/app` types |

---

## 类型定义

### 1. Gallery Embed 类型 (`extractEmbeds.ts`)

```typescript
/**
 * A single image item within a gallery embed.
 * View-side: contains thumbnail + fullsize CDN URLs.
 * Record-side: contains image blob ref + alt + aspectRatio.
 */
export interface ExtractGalleryItem {
  /** CDN thumbnail URL (from view) */
  thumbnail: string;
  /** CDN fullsize URL (from view) */
  fullsize: string;
  /** ALT text (from record or view) */
  alt: string;
  /** Aspect ratio { width, height } (from view or record) */
  aspectRatio?: { width: number; height: number };
}

/**
 * Gallery embed — new app.bsky.embed.gallery type (2026 H1).
 * Schema maxLength: 20, client soft limit: 10.
 * Rendered as a swipeable carousel with count badge.
 */
export interface ExtractGallery {
  /** Gallery images (view-side resolved CDN URLs) */
  images: ExtractGalleryItem[];
}
```

### 2. Enhanced External Link 类型 (`extractEmbeds.ts`)

```typescript
/** 
 * RGB color definition, per app.bsky.embed.external#colorRGB.
 * All values are integers 0-255. Convert to CSS string with colorRGBToString().
 */
export interface ExternalSourceTheme {
  backgroundRGB?: { r: number; g: number; b: number };
  foregroundRGB?: { r: number; g: number; b: number };
  accentRGB?: { r: number; g: number; b: number };
  accentForegroundRGB?: { r: number; g: number; b: number };
}

/** Convert a {r,g,b} color object to CSS "rgb(r,g,b)" string */
export function colorRGBToString(c?: { r: number; g: number; b: number }): string | undefined {
  if (!c) return undefined;
  return `rgb(${c.r},${c.g},${c.b})`;
}

/** Publication source metadata from viewExternal */
export interface ExternalSource {
  uri: string;           // Source AT URI
  icon?: string;         // Publication icon CDN URL
  title: string;         // Publication name
  description?: string;  // Publication description
  theme?: ExternalSourceTheme;
}

/**
 * External link embed — enhanced with viewExternal rich metadata.
 * Fields marked [view] are only available from API-resolved #view data.
 * Fields without [view] come from record-level embed.external.
 */
export interface ExtractExternalLink {
  /** The external URI */
  uri: string;
  /** Link title (from record) */
  title: string;
  /** Link description (from record) */
  description: string;

  // ── viewExternal rich metadata (all optional) ──
  /** Thumbnail image CDN URL [view] */
  thumb?: string;
  /** Content creation timestamp [view] */
  createdAt?: string;
  /** Content update timestamp [view] */
  updatedAt?: string;
  /** Estimated reading time in minutes [view] */
  readingTime?: number;
  /** Labels attached to the external content [view] */
  labels?: Array<{ val: string }>;
  /** Publication source with icon + theme [view] */
  source?: ExternalSource;
}
```

### 3. Updated `extractEmbeds` 返回值

```typescript
export function extractEmbeds(post: PostView): {
  images: ExtractImage[];
  video: ExtractVideo | null;
  external: ExtractExternalLink | null;
  list: ExtractListEmbed | null;
  gallery: ExtractGallery | null;  // ← NEW
  hasGif: boolean;
}
```

---

## 任务分解清单

| 序号 | 环节 | 子代理 | 任务描述 | 依赖 | 可并行 |
|-----|------|--------|---------|------|--------|
| 1 | 实现A | @implementer | **core**: 更新 `extractBlobReferences()` 处理 gallery | 无 | 是 |
| 2 | 实现B | @implementer | **app**: 新增 `extractGallery()` + `ExtractGallery` 类型 | 无 | 是 |
| 3 | 实现C | @implementer | **app**: 增强 `extractExternalLink()` 读取 viewExternal 富数据 | 无 | 是 |
| 4 | 实现D | @implementer | **app**: 更新 `extractHasGif()` 覆盖 gallery 类型 | #2 | 并行于 #5 |
| 5 | 实现E | @implementer | **app**: 更新 `extractEmbeds()` 聚合 + `buildGalleryEmbed()` compose | #2, #3 | 否 |
| 6 | 实现F | @implementer | **app**: 更新 `buildFirstPostEmbed()` 处理 5+ 图片 → gallery | #5 | 并行于 #7 |
| 7 | 实现G | @implementer | **pwa**: 新建 `GalleryCard.tsx` 轮播组件 (swipe+keyboard+lightbox) | #2 | 否 (需类型) |
| 8 | 实现H | @implementer | **pwa**: 新建 `ExternalLinkCard.tsx` 富链接组件 (source theme/icon) | #3 | 是 |
| 9 | 实现I | @implementer | **pwa**: 更新 `PostCard.tsx` 集成 GalleryCard + ExternalLinkCard | #7, #8 | 否 |
| 10 | 实现J | @implementer | **pwa**: 更新 `ComposePage.tsx` 支持 5+ 图片 gallery 预览 | #6 | 并行于 #9 |
| 11 | 实现K | @implementer | **i18n**: 新增 en/zh/ja 键值 | 无 | 是 (早期并行) |
| 12 | 实现L | @implementer | **tui**: TUI gallery 渲染 (thumbnail 索引导航) | #2 | 是 |
| 13 | 测试 | @tester | 单元测试 + 集成测试 | #1-#12 | 否 |
| 14 | 审查 | @reviewer | 整体代码审查 | #1-#13 | 否 |

## 并行组
- **组1（类型+提取）**: #1, #2, #3, #4, #11 — 无互相依赖，全部可并行
- **组2（compose 业务逻辑）**: #5, #6 — 依赖组1
- **组3（PWA 组件）**: #7, #8 — 可互相并行，依赖组1
- **组4（集成）**: #9, #10, #12 — 依赖组2+组3
- **组5（质量）**: #13, #14 — 依赖全部

## 关键路径
#2 → #5 → #6 → #9/#10 → #13 → #14

---

## 详细设计

### Task #1: `extractBlobReferences()` 更新 (`packages/core/src/moderation.ts`)

**位置**: `extractBlobReferences()` 函数，约第 379-396 行的 `extractImages` 内部函数。

**变更**: 在递归函数中新增 `app.bsky.embed.gallery` 类型处理：

```typescript
// 在 extractImages 内部函数的类型判断中新增:
} else if ((type === 'app.bsky.embed.gallery' || type === 'app.bsky.embed.gallery#view') && Array.isArray(e.items)) {
  for (const item of e.items as Array<Record<string, unknown>>) {
    const cid = ((item as any).image?.ref?.$link as string) || ((item as any).cid as string);
    if (cid) {
      refs.push({ cid, uri: `at://${did}/app.bsky.feed.post/${rkey}#/${cid}`, type: 'image' });
    }
  }
}
```

**注意**: `recordWithMedia` 递归已经存在，gallery 作为 `media` 子字段时会自然被递归处理。

---

### Task #2: `extractGallery()` 实现 (`packages/app/src/utils/extractEmbeds.ts`)

**插入位置**: 在 `extractImages()` 之后 (约第 71 行)。

**设计**: 遵循 `extractImages` 的递归模式（处理 `recordWithMedia`），但提取 `gallery#items` 数组。

```typescript
export function extractGallery(post: PostView): ExtractGallery | null {
  const embed = post.record.embed as Record<string, unknown> | undefined;
  if (!embed) return null;

  const resolve = (e: Record<string, unknown>): ExtractGallery | null => {
    const type = e.$type as string | undefined;
    if ((type === 'app.bsky.embed.gallery' || type === 'app.bsky.embed.gallery#view') && Array.isArray(e.items)) {
      // Try to get view-side resolved data from (post as any).embed
      const viewEmbed = (post as any).embed as Record<string, unknown> | undefined;
      const viewItems = (viewEmbed?.$type === 'app.bsky.embed.gallery#view')
        ? (viewEmbed.items as Array<Record<string, unknown>> | undefined)
        : undefined;

      const images: ExtractGalleryItem[] = [];
      const items = e.items as Array<Record<string, unknown>>;
      for (let idx = 0; idx < items.length; idx++) {
        const item = items[idx]!;
        // Prefer view-side resolved data (has CDN URLs)
        const viewItem = viewItems?.[idx];
        images.push({
          thumbnail: (viewItem?.thumbnail as string) || (item.thumbnail as string) || '',
          fullsize: (viewItem?.fullsize as string) || (item.fullsize as string) || '',
          alt: (item.alt as string) || (viewItem?.alt as string) || '',
          aspectRatio: (viewItem?.aspectRatio as { width: number; height: number })
            || (item.aspectRatio as { width: number; height: number })
            || undefined,
        });
      }
      return images.length > 0 ? { images } : null;
    }
    // Recurse into recordWithMedia (gallery + quote)
    if ((type === 'app.bsky.embed.recordWithMedia' || type === 'app.bsky.embed.recordWithMedia#view') && e.media) {
      return resolve(e.media as Record<string, unknown>);
    }
    return null;
  };

  return resolve(embed);
}
```

**边界条件**:
- `items` 为空 → 返回 `null`
- Gallery 在 `recordWithMedia.media` 中 → 递归找到
- View-side 缺失时回退到 record-side 数据
- 软限 10 不在此函数中强制（由 UI 组件控制显示数量）

---

### Task #3: `extractExternalLink()` 增强 (`packages/app/src/utils/extractEmbeds.ts`)

**位置**: 替换现有 `extractExternalLink()` 函数（约第 100-111 行）。

**设计**: 先读 record-side 基础字段，再从 view-side 合并富元数据。

```typescript
export function extractExternalLink(post: PostView): ExtractExternalLink | null {
  const recordEmbed = post.record.embed as Record<string, unknown> | undefined;
  if (!recordEmbed) return null;
  if ((recordEmbed.$type as string) !== 'app.bsky.embed.external') return null;

  const ext = recordEmbed.external as Record<string, string> | undefined;
  if (!ext) return null;

  const result: ExtractExternalLink = {
    uri: ext.uri || '',
    title: ext.title || '',
    description: ext.description || '',
  };

  // ── Merge view-side rich metadata ──
  const viewEmbed = (post as any).embed as Record<string, unknown> | undefined;
  if (viewEmbed?.$type === 'app.bsky.embed.external#view') {
    const viewExt = viewEmbed.external as Record<string, unknown> | undefined;
    if (viewExt) {
      if (viewExt.thumb) result.thumb = viewExt.thumb as string;
      if (viewExt.createdAt) result.createdAt = viewExt.createdAt as string;
      if (viewExt.updatedAt) result.updatedAt = viewExt.updatedAt as string;
      if (typeof viewExt.readingTime === 'number') result.readingTime = viewExt.readingTime;
      if (Array.isArray(viewExt.labels)) result.labels = viewExt.labels as Array<{ val: string }>;

      // source: publication metadata (Standard.site, Ghost, Substack, etc.)
      const src = viewExt.source as Record<string, unknown> | undefined;
      if (src) {
        const theme = src.theme as Record<string, unknown> | undefined;
        result.source = {
          uri: (src.uri as string) || '',
          icon: src.icon as string | undefined,
          title: (src.title as string) || '',
          description: src.description as string | undefined,
          theme: theme ? {
            backgroundRGB: theme.backgroundRGB as ExternalSourceTheme['backgroundRGB'],
            foregroundRGB: theme.foregroundRGB as ExternalSourceTheme['foregroundRGB'],
            accentRGB: theme.accentRGB as ExternalSourceTheme['accentRGB'],
            accentForegroundRGB: theme.accentForegroundRGB as ExternalSourceTheme['accentForegroundRGB'],
          } : undefined,
        };
      }
    }
  }

  return result;
}
```

**向后兼容**: 所有新增字段均为 optional。现有 `externalLink.title` / `.uri` / `.description` 消费者无需修改。

---

### Task #4: `extractHasGif()` 更新 (`packages/app/src/utils/extractEmbeds.ts`)

**变更**: 在 `checkGif` 内部函数中新增 gallery 分支：

```typescript
// 在 checkGif 函数的类型判断链中新增:
if ((type === 'app.bsky.embed.gallery' || type === 'app.bsky.embed.gallery#view') && Array.isArray(e.items)) {
  return (e.items as Array<Record<string, unknown>>).some(item => {
    // Record-side: check image blob mimeType
    const mime = ((item as any).image?.mimeType as string) || '';
    // View-side fallback: check URL extension
    if (!mime) {
      const url = ((item as any).fullsize as string) || ((item as any).thumbnail as string) || '';
      return url.toLowerCase().endsWith('.gif');
    }
    return mime.includes('gif');
  });
}
```

---

### Task #5: `extractEmbeds()` 聚合 + `buildGalleryEmbed()` (`packages/app/src/utils/extractEmbeds.ts` + `hooks/useCompose.ts`)

**`extractEmbeds()` 更新**: 在返回值中添加 `gallery` 字段。

**`buildGalleryEmbed()` 新增** (在 `useCompose.ts` 中，约第 60 行后):

```typescript
function buildGalleryEmbed(images: ComposeMedia[]): Record<string, unknown> {
  return {
    $type: 'app.bsky.embed.gallery',
    items: images.map(img => {
      const item: Record<string, unknown> = {
        image: {
          $type: 'blob',
          ref: { $link: img.blobRef.$link },
          mimeType: img.blobRef.mimeType,
          size: img.blobRef.size,
        },
        alt: img.alt,
      };
      if (img.aspectRatio) {
        item.aspectRatio = {
          width: img.aspectRatio.width,
          height: img.aspectRatio.height,
        };
      }
      return item;
    }),
  };
}
```

---

### Task #6: `buildFirstPostEmbed()` 更新 (`packages/app/src/hooks/useCompose.ts`)

**变更位置**: `buildFirstPostEmbed()` 函数（约第 83-121 行）。

**当前逻辑**:
```typescript
if (images && images.length > 0) {
  return buildImageEmbed(images);  // always uses images embed
}
```

**新逻辑**: 根据图片数量分流：
```typescript
if (images && images.length > 0) {
  if (images.length > 4) {
    return buildGalleryEmbed(images);
  }
  return buildImageEmbed(images);
}
```

**quote + 5+ images 场景**: `recordWithMedia` 的 `media` 字段也需要同样分流。修改第 106-114 行：
```typescript
if (images && images.length > 0) {
  return {
    $type: 'app.bsky.embed.recordWithMedia',
    record: quoteEmbed,
    media: images.length > 4 ? buildGalleryEmbed(images) : buildImageEmbed(images),
  };
}
```

**`submit()` 中的后续帖子**: 第 259-261 行同样分流：
```typescript
} else if (images && images.length > 0) {
  record.embed = images.length > 4 ? buildGalleryEmbed(images) : buildImageEmbed(images);
}
```

---

### Task #7: `GalleryCard.tsx` 组件 (`packages/pwa/src/components/GalleryCard.tsx`)

**新文件**: `packages/pwa/src/components/GalleryCard.tsx`（约 200 行）

**组件接口**:
```typescript
interface GalleryCardProps {
  images: ExtractGalleryItem[];
  /** Open lightbox at index */
  onImageClick?: (index: number) => void;
}
```

**设计要点**:

1. **轮播状态**: `useState<number>(0)` 跟踪当前索引
2. **计数徽章**: `<div>` 显示 `"{current + 1}/{images.length}"` 在右上角
3. **导航按钮**: 左右箭头，边界时禁用（`aria-disabled`）
4. **触摸滑动**: `onTouchStart`/`onTouchEnd` 检测 swipe 方向（滑动距离 > 50px 触发切换）
5. **键盘导航**: `onKeyDown` — ArrowLeft/ArrowRight 切换，Home/End 跳转首尾
6. **缩略图渲染**: 使用 `images[current].thumbnail`，按 `aspectRatio` 约束尺寸
7. **点击行为**: 点击当前图片 → `onImageClick(current)` → 父组件打开 `ImageLightboxDialog`
8. **ALT 徽章**: 复用 `ImageGrid` 的 ALT SVG badge 模式
9. **无障碍**:
   - 容器 `role="region"` + `aria-roledescription="carousel"` + `aria-label={t('gallery.carouselLabel')}`
   - 每张图片 `role="group"` + `aria-roledescription="slide"` + `aria-label={t('gallery.slideN', { current, total })}`
   - 箭头按钮 `aria-label={t('gallery.prevSlide')}` / `t('gallery.nextSlide')}`
   - 非当前图片 `aria-hidden="true"`（用 CSS 隐藏但保留 DOM）

**CSS 结构**:
```html
<div role="region" aria-roledescription="carousel" aria-label="...">
  <div class="relative overflow-hidden rounded-xl border border-border">
    <!-- carousel track -->
    <div class="flex transition-transform duration-300"
         style="transform: translateX(-{current * 100}%)">
      {images.map(img => (
        <div class="w-full shrink-0" role="group" aria-roledescription="slide">
          <img src={img.thumbnail} alt={img.alt} />
          {/* ALT badge */}
        </div>
      ))}
    </div>
    <!-- count badge: absolute top-right -->
    <div class="absolute top-2 right-2 bg-black/70 text-white text-xs px-2 py-1 rounded-full">
      {current + 1}/{images.length}
    </div>
    <!-- prev/next buttons: absolute left/right centered -->
  </div>
</div>
```

**样式参考**: `VideoCard.tsx` 的边框/圆角模式，`ImageGrid.tsx` 的 ALT badge 模式。

---

### Task #8: `ExternalLinkCard.tsx` 富链接组件 (`packages/pwa/src/components/ExternalLinkCard.tsx`)

**新文件**: `packages/pwa/src/components/ExternalLinkCard.tsx`（约 120 行）

**组件接口**:
```typescript
interface ExternalLinkCardProps {
  link: ExtractExternalLink;
  /** Handler for bsky.app URLs (opens choice modal) */
  onOpenInternal?: (view: AppView) => void;
}
```

**设计要点**:

1. **bsky.app URL 检测**: 使用现有 `isBskyAppUrl(link.uri)` → 委托给 `BskyLinkCard`
2. **source 发布者信息**: 如果 `link.source` 存在，渲染发布者图标 + 名称
3. **source theme 颜色**: 使用 `colorRGBToString(link.source.theme.backgroundRGB)` / `accentRGB` 等生成 CSS 颜色字符串作为卡片背景/强调色
4. **readingTime**: 显示 "X min read"（使用 i18n）
5. **时间戳**: `createdAt` 显示为相对时间
6. **thumbnail**: 如果 `link.thumb` 存在，在卡片左侧显示缩略图
7. **title/description**: 截断显示（line-clamp-2）

**布局变体**:
- **有 thumb**: 左右布局（缩略图 80px 宽 + 内容）
- **有 source theme**: 使用 `backgroundRGB` 作为卡片背景
- **默认**: 现有纯文本卡片样式

**无障碍**: 卡片为 `<a>` 链接（外部链接 `target="_blank"`），`aria-label` 包含 title + reading time。

**现有 PostCard 消费迁移**: `PostCard.tsx` 第 234-248 行的内联 `<a>` 标签替换为 `<ExternalLinkCard>`。

---

### Task #9: `PostCard.tsx` 集成 (`packages/pwa/src/components/PostCard.tsx`)

**变更范围**:

1. **导入**: 新增 `import { GalleryCard } from './GalleryCard.js'` 和 `import { ExternalLinkCard } from './ExternalLinkCard.js'`
2. **embed 解析**: 从 `extractEmbeds()` 解构新增 `gallery` 字段（第 148 行附近）
3. **渲染逻辑**: 在第 233 行（video 之后、external 之前）插入 gallery 渲染：
   ```tsx
   {gallery && <GalleryCard
     images={gallery.images}
     onImageClick={(index) => { /* open lightbox */ }}
   />}
   ```
4. **external link 替换**: 第 234-248 行替换为 `<ExternalLinkCard link={externalLink} onOpenInternal={(view) => goTo?.(view)} />`
5. **lightbox 集成**: gallery 点击 → 传所有 gallery URLs 到 `ImageLightboxDialog`

**类型补充**: `PostCard` 需要新增 `gallery` 状态用于 lightbox。

---

### Task #10: `ComposePage.tsx` 发帖更新 (`packages/pwa/src/components/ComposePage.tsx`)

**变更**:
1. **图片上限**: 从 4 提升到 10（软限）。`compose.maxImages` i18n 值更新
2. **预览区分**: 1-4 图片 → 现有网格预览；5+ 图片 → GalleryCard 预览
3. **"添加更多"按钮**: 图片数 < 10 时显示 + 按钮
4. **进度提示**: "5/10 images" 实时计数
5. **ALT 收集**: gallery 每张图片的 ALT 通过现有 `altMap` / `ComposeMedia.alt` 收集

**ComposePage 文件定位**: 图片上传逻辑在 `perPostImages` Map 中管理，需要确认 5+ 张图片的 `Map<string, ComposeMedia[]>` 行为已有支持（Map 值已是数组）。

---

### Task #11: i18n 键值 (`en.ts` / `zh.ts` / `ja.ts`)

新键（按字母顺序）：

```typescript
// Gallery
'gallery.carouselLabel': 'Image gallery',       // zh: 图片轮播   ja: 画像ギャラリー
'gallery.prevSlide': 'Previous image',           // zh: 上一张     ja: 前の画像
'gallery.nextSlide': 'Next image',               // zh: 下一张     ja: 次の画像
'gallery.slideN': 'Image {current} of {total}',  // zh: 第{current}张，共{total}张  ja: {total}枚中{current}枚目

// External link rich card
'external.readingTime': '{minutes} min read',    // zh: 阅读{minutes}分钟   ja: 読了{minutes}分
'external.bySource': 'By {source}',              // zh: 来自{source}       ja: {source}より

// Compose gallery
'compose.maxImages': 'Max {n} images',           // (updated to 10)
```

**修改的现有 key**:
- `compose.maxImages` 默认值从 4 改为 10（en/zh/ja）
- `compose.imageCount` 保持不变（用于 images embed 的 +N 计数）

---

### Task #12: TUI Gallery 渲染 (`packages/tui`)

**方案**: 终端不支持图片，使用索引导航。
- 显示：`[Gallery: 3/10] ← → arrow keys to navigate`
- 快捷键：j/k 或 ←/→ 切换图片
- 每张图片详情：ALT text + aspect ratio
- 实现为 TUI `useInput` handler

**注意**: 这是低优先级实现。TUI 的 gallery 体验天然受限。

---

### Task #13-14: 测试与审查

详见「测试策略」和「验收标准」章节。

---

## 技术选型

### Gallery 渲染实现方式

| 方案 | 优点 | 缺点 | 推荐度 |
|------|------|------|--------|
| **CSS transform translateX** | 零依赖，GPU 加速，与虚拟滚动兼容 | 需手写 touch/mouse 手势 | ★★★ |
| swiper.js | 开箱即用的轮播 | 额外依赖 (~40KB)，过度设计 | ★★☆ |
| CSS scroll-snap | 极简实现 | 键盘导航和计数徽章需额外代码 | ★★☆ |

**选型**: **CSS transform translateX** — 与项目现有零外部组件依赖策略一致，足够简单。

### viewExternal 数据获取方式

| 方案 | 优点 | 缺点 | 推荐度 |
|------|------|------|--------|
| **从 `post.embed`（view-side）直接读** | 零额外 API 调用，与现有 AppView 响应一起返回 | 依赖 AppView 返回格式 | ★★★ |
| 调用 `app.bsky.embed.getEmbedExternalView` | 权威数据源 | 每个链接额外一次 API 调用，N+1 问题 | ★☆☆ |

**选型**: **从 view-side 直接读** — AppView 的 `getPostThread` / `getTimeline` 已经在响应中包含 `viewExternal` 数据。无需额外调用。

### Thumbnail vs Fullsize in Gallery Carousel

| 方案 | 优点 | 缺点 | 推荐度 |
|------|------|------|--------|
| **轮播用 thumbnail，点击打开 fullsize** | 加载快，带宽友好 | 预览画质一般 | ★★★ |
| 轮播直接用 fullsize | 高清显示 | 加载慢，消耗带宽 | ★☆☆ |

**选型**: **thumbnail 显示，点击灯箱用 fullsize** — 匹配官方应用行为。

---

## 风险识别

| 风险 | 影响 | 缓解措施 |
|------|------|---------|
| **Gallery view-side 数据不可用**（某些 PDS/AppView 尚未升级） | gallery 帖子无图片显示 | `extractGallery` 回退到 record-side blob ref + `getCdnImageUrl()` 构造 URL |
| **viewExternal 字段不完整**（部分 AppView 未提供 source/theme） | 链接卡片降级为现有纯文本样式 | 所有新字段 optional，`ExternalLinkCard` 优雅降级 |
| **Gallery + recordWithMedia 递归复杂度** | 深层嵌套丢失 gallery | 复用 `extractImages` 已验证的递归模式 |
| **5+ 张图片上传超时**（2MB × 10 = 20MB） | 发帖失败 | 使用 `calculateUploadTimeout()` 计算超时；分批上传 + 进度提示 |
| **Gallery lightbox 与现有 ImageGrid lightbox 冲突** | 两套 lightbox 状态管理混乱 | GalleryCard 的 `onImageClick` 回调由 PostCard 统一管理，复用同一 `ImageLightboxDialog` |
| **TUI 图片渲染** | 终端无法显示图片 | TUI 只显示 ALT 文本 + 索引导航，无需图片渲染 |

---

## 验收标准

1. **Gallery 渲染**:
   - [ ] 时间线/讨论串/资料页/引用帖中 gallery 帖子显示轮播卡片
   - [ ] 左右箭头切换图片，计数徽章显示正确
   - [ ] 触摸滑动切换（移动端）
   - [ ] 键盘 ←/→/Home/End 导航
   - [ ] 点击打开 lightbox，从当前索引开始
   - [ ] ALT badge 显示正确
   - [ ] WCAG: `role="region" aria-roledescription="carousel"` 等属性存在
   - [ ] 1-4 张图片的帖子仍使用现有 ImageGrid（不受影响）

2. **Gallery 发帖**:
   - [ ] 添加 5-10 张图片时生成 `app.bsky.embed.gallery` 记录
   - [ ] 1-4 张图片仍生成 `app.bsky.embed.images`（无回归）
   - [ ] quote + 5+ 图片生成正确的 `recordWithMedia` + `gallery`
   - [ ] ALT 文本正确嵌入每张图片
   - [ ] aspectRatio 正确传递

3. **viewExternal 渲染**:
   - [ ] 富链接卡片显示 source 图标 + 名称（如 Standard.site）
   - [ ] source.theme 颜色正确应用到卡片背景
   - [ ] readingTime 显示 "X min read"
   - [ ] thumb 缩略图渲染
   - [ ] 无 viewExternal 数据的旧链接正常降级
   - [ ] bsky.app URL 仍走 BskyLinkCard（不受影响）

4. **Moderation**:
   - [ ] gallery 图片被 moderation blurs 正确模糊
   - [ ] `extractBlobReferences` 提取 gallery blob 用于标签查询
   - [ ] `extractHasGif` 检测 gallery 中的 GIF

5. **i18n**:
   - [ ] 所有新 UI 字符串在 en/zh/ja 三语言中定义
   - [ ] 无硬编码字符串

6. **无回归**:
   - [ ] 现有 images embed 帖子显示不变
   - [ ] 现有 external link 卡片显示不变
   - [ ] 现有 compose 流程不变（1-4 图片）
   - [ ] TypeScript 类型检查通过

---

## 文件传递规划

| 环节 | 输入文件 | 输出文件 |
|-----|---------|---------|
| #1: moderation | `packages/core/src/moderation.ts` | 修改 `extractBlobReferences()` |
| #2: extractGallery | `packages/app/src/utils/extractEmbeds.ts` | 新增 `extractGallery()` + 类型 |
| #3: extractExternalLink | `packages/app/src/utils/extractEmbeds.ts` | 替换 `extractExternalLink()` |
| #4: extractHasGif | `packages/app/src/utils/extractEmbeds.ts` | 修改 `extractHasGif()` |
| #5: extractEmbeds+build | `extractEmbeds.ts`, `hooks/useCompose.ts` | 修改聚合 + 新增 `buildGalleryEmbed()` |
| #6: buildFirstPostEmbed | `packages/app/src/hooks/useCompose.ts` | 修改 `buildFirstPostEmbed()` + `submit()` |
| #7: GalleryCard | 类型定义 | `packages/pwa/src/components/GalleryCard.tsx` (新) |
| #8: ExternalLinkCard | 类型定义 | `packages/pwa/src/components/ExternalLinkCard.tsx` (新) |
| #9: PostCard | `PostCard.tsx` | 修改 embed 渲染块 |
| #10: ComposePage | `ComposePage.tsx` | 修改 media 预览 + 上限 |
| #11: i18n | `locales/{en,zh,ja}.ts` | 新 key + 修改 `compose.maxImages` |
| #12: TUI | `packages/tui/src/components/` | TUI gallery 显示 |
| 导出 | `packages/app/src/index.ts` | 导出新类型/函数 |

---

## 附加: 次要功能概要设计

### 帖子翻译按钮（低优先级）

**方案**: 在 `PostActionsRow` 溢出菜单中添加 "Translate" 选项，使用现有 `translateText()` 函数 + Google Translate 风格。

**文件**: `PostActionsRow.tsx` / `PostCard.tsx`

### 长文内容渲染（低优先级）

**方案**: `ExternalLinkCard` 已支持 `source.title` / `source.icon`。对 Standard.site/Ghost/Substack 等已知 source，渲染平台特定样式（如 Standard.site 的蓝白主题）。

### Chat Group 支持（低优先级）

**方案**: 如果选择实现，需在 `packages/core/src/at/client.ts` 中新增 group chat XRPC 方法，并在 `DMChatPage.tsx` 中支持多人聊天气泡。

### QR Code 分享（低优先级）

**方案**: 使用 `qrcode` npm 包生成 SVG QR，在 ProfilePage 分享按钮中展示。纯前端实现，无需协议支持。

---

## 版本影响

- **TypeScript**: 无变更
- **Node.js**: 无需升级（我们不用 `@atproto/api`）
- **依赖**: 无新增 npm 包
- **破坏性变更**: 无。`ExtractExternalLink` 新字段 optional，`extractEmbeds` 返回值新增字段向后兼容
- **i18n**: 新增约 8 个 key，修改 1 个现有 key

---

*本架构设计基于 2026-06-13 的调研报告和现有代码库分析。所有类型定义和函数签名已与现有模式对齐。*
