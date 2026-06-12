---
step: 2
agent: implementer
task: i18n keys for v0.14.3 gallery carousel + external link rich card + compose limit
upstream:
  - .swarm/2026-06-13_v0.14.3_bluesky-updates/architecture.md (Task #11)
  - packages/app/src/i18n/locales/en.ts
  - packages/app/src/i18n/locales/zh.ts
  - packages/app/src/i18n/locales/ja.ts
produced_at: 2026-06-13T10:00:00Z
status: completed
estimated_time: 15m
---

## 实现摘要

Added 6 new i18n keys across all three locale files (`en.ts`, `zh.ts`, `ja.ts`) for v0.14.3 features:
- 4 gallery carousel keys (`gallery.*`)
- 2 external link rich card keys (`external.*`)

The `compose.maxImages` key was **not modified** in locale files because it already uses `{n}` as a template variable. The actual number change from 4→10 needs to happen in consuming code:

| File | Line | Current | Who handles |
|------|------|---------|-------------|
| `packages/tui/src/components/App.tsx` | 505 | `n: 4` (hardcoded) | Task #12 @implementer |
| `packages/pwa/src/components/ComposePage.tsx` | 439 | `MAX_IMAGES` constant | Task #10 @implementer |

## 变更清单

- [x] `packages/app/src/i18n/locales/en.ts` — added 6 new keys (lines 751-759)
- [x] `packages/app/src/i18n/locales/zh.ts` — added 6 new keys (lines 902-910)
- [x] `packages/app/src/i18n/locales/ja.ts` — added 6 new keys (lines 761-769)

### New keys added

| Key | en | zh | ja |
|-----|----|----|-----|
| `gallery.carouselLabel` | `Image gallery` | `图片轮播` | `画像ギャラリー` |
| `gallery.prevSlide` | `Previous image` | `上一张` | `前の画像` |
| `gallery.nextSlide` | `Next image` | `下一张` | `次の画像` |
| `gallery.slideN` | `Image {current} of {total}` | `第{current}张，共{total}张` | `{total}枚中{current}枚目` |
| `external.readingTime` | `{minutes} min read` | `阅读{minutes}分钟` | `読了{minutes}分` |
| `external.bySource` | `By {source}` | `来自{source}` | `{source}より` |

## 关键决策

1. **插入位置**：在所有三个文件中，新 key 插入在文件尾部 `};` 之前，跟随项目现有的 `// [v0.14.x]` 版本注释模式。不插入在功能相关区域（如 `post.*` 附近），因为项目 key 排序并非严格功能分组，尾部增量更安全、更易审计。

2. **`compose.maxImages` 不改**：locale 值使用 `{n}` 模板参数（如 `'Max {n} media'`），数字由调用方传入。将 4→10 的变更留给消费代码的 implementer（Task #10/12）。在输出文档中明确注明关联文件和行号。

3. **模板变量命名**：遵循项目现有约定使用单大括号 `{var}`（如 `{current}`/`{total}`/`{minutes}`/`{source}`），与 `compose.charCount: '{current}/{max}'` 等现有 key 一致。

## 遇到的问题

无。

## 下游依赖

- Task #7 (@implementer: GalleryCard.tsx): 使用 `gallery.carouselLabel`、`gallery.prevSlide`、`gallery.nextSlide`、`gallery.slideN`
- Task #8 (@implementer: ExternalLinkCard.tsx): 使用 `external.readingTime`、`external.bySource`
- Task #10 (@implementer: ComposePage.tsx): 将 `MAX_IMAGES` 常量从 4 更新到 10（影响 `compose.maxImages` 的 `{n}` 参数值）
- Task #12 (@implementer: TUI): 将 `App.tsx:505` 的 `n: 4` 更新到 `n: 10`

## 验证

- ✅ TypeScript typecheck 全部通过（7/8 packages, `packages/app` clean）
- ✅ `LocaleMessages = Record<string, string>` 兼容所有新增 key
- ✅ 所有模板变量使用单大括号 `{var}` 语法，与项目现有 i18n 模式一致
