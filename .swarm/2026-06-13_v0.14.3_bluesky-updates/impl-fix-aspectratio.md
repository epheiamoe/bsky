---
step: 1
agent: implementer
task: Fix Bug 3 — gallery posts fail because aspectRatio is required but missing
upstream: []
produced_at: 2026-06-13T12:00:00+08:00
status: completed
estimated_time: 10min
commit: b4125ed
---

## 实现摘要

Fixed gallery post submission failures caused by the `app.bsky.embed.gallery#image` lexicon requiring `aspectRatio` while `buildGalleryEmbed()` only included it conditionally, and ComposePage never detected image dimensions.

## 变更清单

- [x] `packages/app/src/hooks/useCompose.ts` — `buildGalleryEmbed()` now always includes `aspectRatio` with fallback `{width:1, height:1}` when not provided
- [x] `packages/pwa/src/components/ComposePage.tsx` — `LocalImage` interface: added optional `aspectRatio` field
- [x] `packages/pwa/src/components/ComposePage.tsx` — `processFiles` image loop: added `createImageBitmap()` dimension detection before pushing to `newImages`
- [x] `packages/pwa/src/components/ComposePage.tsx` — `executeSubmit` image upload: passes `img.aspectRatio` to `ComposeMedia` when building upload array

## 关键决策

1. **Fallback `{width:1, height:1}`** — The gallery lexicon requires `aspectRatio`. Using a 1:1 fallback is the safest default since it's a valid aspect ratio and won't cause API rejection. The alternative (skipping the field) would continue to cause gallery post failures.

2. **`createImageBitmap` over `new Image()`** — `createImageBitmap` is preferred because:
   - It's a modern API available in all target browsers
   - It doesn't require appending to DOM
   - It returns dimensions synchronously after await
   - The `bmp.close()` call properly releases the bitmap memory

3. **Non-fatal dimension detection** — Wrapped in try/catch because dimension detection failure shouldn't block image upload. The fallback in `buildGalleryEmbed()` handles the case where `aspectRatio` is undefined.

## 遇到的问题

Pre-existing TypeScript errors in `PostPreviewCard.tsx` (unrelated fragment/token issues) cause `packages/pwa` typecheck to fail, but `packages/app` compiles cleanly. The errors are not introduced by this change.

## 下游依赖

- `buildImageEmbed()` (for ≤4 images) does NOT need `aspectRatio` — the `app.bsky.embed.images` lexicon treats it as optional. Confirmed correct as-is.
- The `ComposeMedia` interface in `useCompose.ts` already had `aspectRatio` as optional — no schema change needed.
