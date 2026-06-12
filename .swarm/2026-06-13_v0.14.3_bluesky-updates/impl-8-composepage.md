---
step: 8
agent: implementer
task: ComposePage gallery support — raise max images to 10, GalleryCard preview for 5+ images
upstream: [.swarm/2026-06-13_v0.14.3_bluesky-updates/architecture.md]
produced_at: 2026-06-13T12:00:00+08:00
status: completed
estimated_time: 30min
commit: e20935b
---

## 实现摘要
Updated `packages/pwa/src/components/ComposePage.tsx` to support Bluesky's gallery embeds (up to 10 images per post):
- Raised `MAX_IMAGES` from 4 → 10
- 1-4 images continue using existing 2-column grid with inline ALT/remove/edit controls
- 5+ images render a `GalleryCard` carousel with swipe/keyboard navigation + click-to-edit-ALT
- Added thumbnail strip below carousel for per-image removal (hover → red X)
- Added `canAddMedia` derived state to control bottom toolbar camera button
- All existing ALT collection (`altMap`/`ComposeMedia.alt`) works unchanged

## 变更清单
- [x] `packages/pwa/src/components/ComposePage.tsx` — 6 logical edits, +50/-3 lines net:
  1. Import `GalleryCard` component
  2. `MAX_IMAGES = 10` (was 4)
  3. Derived `canAddMedia` variable (checks image count, video, submitting)
  4. Bifurcated image preview: `<=4` → existing grid; `>4` → GalleryCard + thumbnail strip
  5. Count display: `{imgs.length}/{MAX_IMAGES}` in gallery mode
  6. Bottom toolbar camera button disabled when `!canAddMedia` with `title` tooltip

## 关键决策
- **GalleryCard for 5+ only**: kept existing grid for 1-4 to avoid regression — users with 1-4 images see zero behavior change
- **Thumbnail strip for removal**: since `GalleryCard` doesn't expose per-image remove buttons, added a horizontally-scrollable thumbnail strip below the carousel. Each thumbnail has a hover-reveal X button and click-to-edit-ALT.
- **Camera button disabled, not hidden**: the `disabled` state with `title` tooltip communicates *why* the button is inactive ("Max 10 media"), better UX than silently hiding it
- **No new i18n keys**: reused existing `compose.addImage` and `compose.maxImages` keys; count uses bare `{n}/{MAX_IMAGES}` format

## 遇到的问题
- None. All changes compiled without errors on the first attempt.
- Pre-existing type errors in `PostCard.tsx` (from Task #9, not this task) — no ComposePage errors.

## 下游依赖
- `GalleryCard` component at `packages/pwa/src/components/GalleryCard.tsx` — already existed, no changes needed
- i18n: `compose.maxImages` uses `{n}` template — `t('compose.maxImages', { n: MAX_IMAGES })` resolves to "Max 10 media" in en/zh/ja
- `compose.addImage` → "Add Media" — used for the + button label in gallery mode
