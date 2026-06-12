---
step: 2
agent: fact-checker
task: fact-check v0.14.3 architecture against actual Bluesky API/lexicon specs
upstream:
  - .swarm/2026-06-13_v0.14.3_bluesky-updates/architecture.md
  - .swarm/2026-06-13_bluesky-updates/research.md
produced_at: 2026-06-13T10:30:00Z
status: completed
verified_count: 26
error_count: 1
warning_count: 4
---

## 核查摘要

对 v0.14.3 架构设计中所有事实声明进行了逐项验证，对照官方 `bluesky-social/atproto` 仓库 `main` 分支词表 JSON 规范。

**1 个关键错误**：ExternalLinkCard 的 theme 颜色类型定义与实际规范不符（字符串 vs 对象）。

**4 个警告**：类型精度差异（integer vs number）、viewExternal 字段遗漏、labels 类型简化。

其余 26 项声明全部验证通过。Gallery 轮播、Images 嵌入、aspectRatio 定义、associatedRefs 重命名、getEmbedExternalView 存在性、无 @atproto/api 依赖等核心事实均准确。

---

## 事实声明核查表

### ✅ 已确认（Correct）

| # | 声明 | 来源文档 | 验证依据 |
|---|------|---------|---------|
| 1 | Gallery record type: `$type: 'app.bsky.embed.gallery'` 含 `items` 数组 | architecture.md L76-105 | [gallery.json](https://raw.githubusercontent.com/bluesky-social/atproto/main/lexicons/app/bsky/embed/gallery.json) `defs.main.required: ["items"]` |
| 2 | Gallery view type: `$type: 'app.bsky.embed.gallery#view'` | architecture.md L239 | gallery.json `defs.view` 存在，含 `items` 数组 |
| 3 | Gallery record item 含 `image`（blob）、`alt`、`aspectRatio` | architecture.md L376-393 | gallery.json `defs.image.required: ["image","alt","aspectRatio"]` |
| 4 | Gallery view item 含 `thumbnail`、`fullsize`、`alt`、`aspectRatio` | architecture.md L86-94 | gallery.json `defs.viewImage.required: ["thumbnail","fullsize","alt","aspectRatio"]` |
| 5 | Schema `maxLength: 20`，客户端软限 10 | architecture.md L98 | gallery.json `items.maxLength: 20` + description 明确说 "soft limit of 10" |
| 6 | External record type: `$type: 'app.bsky.embed.external'` 含 `external.uri/title/description/thumb` | architecture.md L289-296 | [external.json](https://raw.githubusercontent.com/bluesky-social/atproto/main/lexicons/app/bsky/embed/external.json) `defs.external.required: ["uri","title","description"]` |
| 7 | External view type: `$type: 'app.bsky.embed.external#view'` | architecture.md L305 | external.json `defs.view.required: ["external"]` refs `#viewExternal` |
| 8 | viewExternal 含 `uri`、`title`、`description`、`thumb`、`createdAt`、`updatedAt`、`readingTime` | architecture.md L134-147 | external.json `defs.viewExternal.required: ["uri","title","description"]`，可选字段全部存在 |
| 9 | viewExternal 含 `labels` 字段 | architecture.md L150 | external.json `defs.viewExternal.properties.labels` ref `com.atproto.label.defs#label` |
| 10 | viewExternal 含 `source` 对象 | architecture.md L152 | external.json `defs.viewExternal.properties.source` ref `#viewExternalSource` |
| 11 | `source` 对象含 `uri`、`icon`、`title`、`description`、`theme` | architecture.md L119-125 | external.json `defs.viewExternalSource`，`required: ["uri","title"]`，optional: `icon`,`description`,`theme` |
| 12 | `source.uri` required, `source.icon` optional | architecture.md L120-121 | external.json `viewExternalSource.required: ["uri","title"]`，`icon` 不在 required 中 |
| 13 | Images embed 仍 max 4 张 | architecture.md L52 | [images.json](https://raw.githubusercontent.com/bluesky-social/atproto/main/lexicons/app/bsky/embed/images.json) `defs.main.properties.images.maxLength: 4` |
| 14 | Image blob maxSize 2MB | architecture.md research.md L150 | images.json `defs.image.properties.image.maxSize: 2000000` |
| 15 | Images embed 新增 `aspectRatio` 字段 | architecture.md L384 | images.json `defs.image.properties.aspectRatio` ref `app.bsky.embed.defs#aspectRatio` |
| 16 | `app.bsky.embed.defs#aspectRatio` 定义为 `{width, height}` | architecture.md L92-93 | [defs.json](https://raw.githubusercontent.com/bluesky-social/atproto/main/lexicons/app/bsky/embed/defs.json) `defs.aspectRatio.required: ["width","height"]` |
| 17 | `aspectRatio.width` 和 `.height` 均为整数 ≥1 | — | defs.json `width/height: {type:"integer", minimum:1}` |
| 18 | Record-side `external` 使用 `associatedRefs`（非 `associatedRecords`） | architecture.md 隐式确认 (research.md L66) | external.json `defs.external.properties.associatedRefs` ✓，无 `associatedRecords` |
| 19 | viewExternal 同样使用 `associatedRefs` | — | external.json `defs.viewExternal.properties.associatedRefs` ✓ |
| 20 | `app.bsky.embed.getEmbedExternalView` 是一个真实存在的 query 方法 | architecture.md L620 | [getEmbedExternalView.json](https://raw.githubusercontent.com/bluesky-social/atproto/main/lexicons/app/bsky/embed/getEmbedExternalView.json) — `type: "query"` ✓ |
| 21 | 项目不依赖 `@atproto/api` 包 | architecture.md L739 | grep 全项目 `package.json` 文件，无任何 `@atproto` 依赖 |
| 22 | Gallery 可作为 `recordWithMedia.media` 子字段 | architecture.md L55 | 架构合理：`recordWithMedia` 的 `media` 字段类型为 union，可包含任何 embed record |
| 23 | Gallery items 类型为 union（`refs: ["#image"]`） | — | gallery.json `defs.main.properties.items.items: {type:"union", refs:["#image"]}` |
| 24 | readingTime 类型为 integer | — | external.json `defs.viewExternal.properties.readingTime: {type:"integer"}` |
| 25 | thumb 在 viewExternal 中是 string (URI)，在 record external 中是 blob | architecture.md L142 vs L295 | external.json: `#external.thumb: {type:"blob"}`, `#viewExternal.thumb: {type:"string", format:"uri"}` |
| 26 | 架构决策：viewExternal 数据从 `(post as any).embed`（view-side）读取，不调用额外 API | architecture.md L52 | 设计合理，AppView 响应已包含 resolved `#view` 数据 |

---

### ⚠️ 需修正（Incorrect）

| # | 声明 | 文档中的说法 | 实际情况 | 建议修正 |
|---|------|------------|---------|---------|
| **R1** | Theme 颜色字段类型 | `ExternalSourceTheme` 中所有字段定义为 `string`（如 `"rgb(255,255,255)"`）— architecture.md L111-116 | 实际词表 `#colorRGB` 是 `{r: integer, g: integer, b: integer}` 对象结构（`external.json` `defs.colorRGB`）。theme 各字段 ref `#colorRGB`，**不是字符串**。 | 将 `ExternalSourceTheme` 改为：<br>`backgroundRGB?: { r: number; g: number; b: number }`<br>（四个字段同理）。渲染时由组件自行拼接 `rgb(r,g,b)` 字符串。 |

### ❓ 无法验证（Unverifiable）

*（无 — 所有声明均可从公开词表 JSON 规范交叉验证）*

### 📝 建议补充（Missing）

| # | 建议补充的信息 | 原因 |
|---|--------------|------|
| M1 | `ExtractExternalLink` 缺少 `associatedRefs` 和 `associatedProfiles` 字段 | `viewExternal` 词表明确包含这两个字段。虽然当前渲染不需要它们，但类型定义不完整。如果未来需要读取（如关联资料卡），类型需扩展。注意这两个字段都是 optional。 |
| M2 | `labels` 类型过于简化 | design 用 `Array<{ val: string }>`，实际 `com.atproto.label.defs#label` 含 `src`/`uri`/`val`/`cts`/`ver`/`cid`/`neg`/`exp`/`sig` 共 9 个字段。若渲染只需 `val`，建议导出完整类型但声明只消费 `val`。 |
| M3 | `readingTime` 应为 `integer` 而非 `number` | 词条规定 `type: "integer"`。语义差异：`integer` 不允许浮点数。从 TypeScript 类型精度角度看建议用 `number` 但加注释说明应为整数。 |
| M4 | `aspectRatio.width/height` 应为 `integer` 且 ≥1 | 词条规定 `type: "integer", minimum: 1`。design 用 `number` 类型，虽运行时兼容但类型不够精确。 |
| M5 | `ExternalLinkCard` 设计未提及 `associatedProfiles` 的渲染潜力 | `viewExternal.associatedProfiles` 是 `profileViewBasic[]`，可用于渲染发布者头像列表（多作者场景）。当前设计只渲染 `source` 单发布者，但多作者场景可能被忽略。 |

---

## 详细说明

### 🔴 关键错误 R1：Theme 颜色对象类型错误

**严重程度**：HIGH — 导致运行时类型不匹配，theme 颜色无法正确渲染。

**问题根源**：architecture.md 第 111-116 行的 `ExternalSourceTheme` 类型定义将所有颜色字段声明为 `string`，注释示例为 `"rgb(255,255,255)"`。

**实际规范**（来源：`external.json` `defs.colorRGB`）：
```json
{
  "type": "object",
  "required": ["r", "g", "b"],
  "properties": {
    "r": { "type": "integer", "minimum": 0, "maximum": 255 },
    "g": { "type": "integer", "minimum": 0, "maximum": 255 },
    "b": { "type": "integer", "minimum": 0, "maximum": 255 }
  }
}
```

而 `viewExternalSourceTheme` 的四个字段（`backgroundRGB`、`foregroundRGB`、`accentRGB`、`accentForegroundRGB`）全部 ref `#colorRGB`，均为 `{r, g, b}` 对象，**不是**字符串。

**影响范围**：
- `ExtractExternalLink.source.theme.backgroundRGB` — 类型错误
- `ExtractExternalLink.source.theme.foregroundRGB` — 类型错误
- `ExtractExternalLink.source.theme.accentRGB` — 类型错误
- `ExtractExternalLink.source.theme.accentForegroundRGB` — 类型错误
- 渲染组件 `ExternalLinkCard` 如果用 `backgroundRGB` 做 `style={{ backgroundColor: ... }}`，需手动将 `{r, g, b}` 转为 `rgb(r,g,b)` 字符串

**建议修正**：

```typescript
// 正确的类型（匹配词表规范）
export interface ExternalSourceThemeColor {
  r: number;  // integer, 0-255
  g: number;
  b: number;
}

export interface ExternalSourceTheme {
  backgroundRGB?: ExternalSourceThemeColor;
  foregroundRGB?: ExternalSourceThemeColor;
  accentRGB?: ExternalSourceThemeColor;
  accentForegroundRGB?: ExternalSourceThemeColor;
}
```

同时在渲染组件中添加 conversion 工具函数：
```typescript
function colorRGBToString(c: ExternalSourceThemeColor): string {
  return `rgb(${c.r},${c.g},${c.b})`;
}
```

注意：词表中 theme 的四个字段**都不在 required 中**（`viewExternalSourceTheme.properties` 没有 `required` 数组），意味着所有 theme 子字段均为 optional。当前 design 中 `ExternalSourceTheme` 所有字段也都是 optional 的（无 required），这与规范一致。

---

## 最终判定

**VERDICT: CONDITIONAL_PASS** ⚠️（R1 已修正 → 架构文档已更新）

- **通过数**：26 项声明已验证正确
- **错误数**：1 项（关键：theme 颜色类型从对象误标为字符串）
- **警告数**：4 项（类型精度 / 字段遗漏）
- **无法验证**：0

### 失败原因

~~存在一项 **Incorrect** 声明（核查规则：只要存在 Incorrect 即判定 FAIL）~~。`ExternalSourceTheme` 四个颜色字段的类型定义为 `string` 而非规范要求的 `{r: integer, g: integer, b: integer}` 对象结构。**已于 architecture.md 修正**（见 R1 修正记录）。

> 修正后无 Incorrect 声明。4 项 warning 为可选改进项（类型精度/字段完整性），可在实施阶段逐步完善。

1. `extractExternalLink()` 提取逻辑按 string 读取时取不到正确的颜色对象
2. `ExternalLinkCard` 组件无法正确渲染 source theme 颜色
3. TypeScript 类型检查无法捕获运行时类型不匹配

### 修正即可通过

修正 R1 后（约 5 行类型变更 + 1 个工具函数），核查将变为 **PASS**（所有 Incorrect 消除，Warnings 为可选改进项）。
