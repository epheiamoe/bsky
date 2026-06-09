# Lesson: Moderation + Virtual List Integration Traps (2026-05-27)

## Problem Summary

Subagent exploration revealed 4 critical hidden issues in the moderation/labeling system's interaction with post loading and virtual scrolling:

## Issue 1: Wrong Hook Exported (CRITICAL)

**Symptom**: Blob-level labels (media-level labels on individual images) were silently ignored in ALL list components.

**Root Cause**: `packages/app/src/index.ts:51` exported `useModerationBatch` from an older `useModeration.ts` (no blob support) instead of the blob-aware implementation that then lived in `useModerationPipeline.ts` (now renamed to `useModeration.ts`).

**Code**:
```typescript
// BEFORE (broken):
export { useModeration, useModerationBatch, resolveModerationBatch } from './hooks/useModeration.js';

// AFTER (fixed, later cleaned up):
export { useModeration } from './hooks/useModeration.js';
export { useModerationBatch, resolveModerationBatch } from './hooks/useModeration.js';
```

**Lesson**: When you have multiple implementations of the same function, ALWAYS verify which one is actually exported. Dead code with "better" implementation is worse than no code.

## Issue 2: Virtual List Height Cache Drift (CRITICAL)

**Symptom**: When user clicks "Show" on a hidden post, content overlaps or leaves gaps. Scroll position drifts.

**Root Cause**: `useVirtualizedList` caches measured heights in `_globalHeightCaches` but never invalidates when moderation state changes. A hidden post renders as ~60px banner; when revealed, it needs ~300px but virtualizer still allocates 60px.

**Fix**: Added optional `decisions` parameter to `useVirtualizedList`. Hook compares `contentAction`/`mediaAction` between renders and clears cache + calls `virtualizer.measure()` when they differ.

**Lesson**: Any dynamic UI state that affects element height MUST be connected to the virtualizer's measurement system. Height caches are not "set and forget".

## Issue 3: O(n) Full Re-computation on Pagination (HIGH)

**Symptom**: Every `loadMore` triggers full moderation resolution for ALL loaded posts, causing noticeable lag with 500+ posts.

**Root Cause**: `useModerationBatch` had `[posts, config, client]` in dependency array. Timeline store replaces the entire `posts` array reference on append, triggering full re-resolution.

**Fix**: Incremental resolution — track previously seen URIs, only resolve new ones. Full re-computation only when `config` or `client` changes.

```typescript
// Pseudo-code for incremental logic
const prevUris = prevPostsRef.current;
const newPosts = posts.filter(p => !prevUris.has(p.uri));

if (newPosts.length === 0) {
  // Just update for removed posts
} else {
  // Only resolve newPosts, merge with existing decisions
}
```

**Lesson**: When a hook processes arrays, ask: "Does it need to re-process existing items?" If not, implement diffing.

## Issue 4: TUI Decoupled from API (HIGH)

**Symptom**: TUI shows different moderation results than PWA for the same posts.

**Root Cause**: `UnifiedThreadView` called `resolveModeration()` synchronously with only embedded labels, passing empty Maps for policies and labeler names.

**Fix**: Added `useEffect` to fetch decisions asynchronously via `resolveModerationBatch` API.

**Lesson**: TUI and PWA must use the SAME data sources. Divergence in data fetching = divergent user experience.

## Issue 5: Wrong blurs Value for nudity Label (HIGH)

**Symptom**: `nudity` labels were hiding text content (treating them like `sexual`/`graphic-media`), but official Bluesky behavior is to only blur media for nudity.

**Root Cause**: `BUILTIN_LABEL_DEFINITIONS` in `packages/core/src/moderation.ts` had `nudity.blurs = 'content'`, but official behavior is `blurs = 'media'`.

**Fix**: Changed `nudity` from `blurs: 'content'` to `blurs: 'media'`. This makes nudity labels render as `ModerationLabelBar` (compact bar) with media blur, keeping text fully visible.

**Lesson**: When implementing features that match official behavior, verify the official defaults. Don't assume all adult labels have the same `blurs` value.

## Issue 6: Content-Level Labels Lost Visual Warning (CRITICAL)

**Symptom**: `sexual` and `graphic-media` labels (which correctly have `blurs='content'`) showed only badge rows at bottom after `ContentHiddenCard` was removed. No visual warning for the text content itself.

**Root Cause**: In the migration from `ContentHiddenCard` to `ModerationLabelBar`, we assumed ALL labels should use the compact bar pattern. But `blurs='content'` means the ENTIRE content area should be covered, not just media.

**Fix**: Added `ContentWarningOverlay` component that wraps the entire content area (text + media + quotes + external links) with a blurred background + overlay. Author info and interaction buttons remain visible.

**Lesson**: Different `blurs` values require different UI treatments:
- `blurs='content'` → Full content overlay (text + media)
- `blurs='media'` → Compact bar + media-only blur
- `blurs='none'` → Badge only

## Issue 7: Blur Overflowing Boundaries (MEDIUM)

**Symptom**: CSS `blur-xl` on images created a halo effect bleeding into the black background outside image boundaries.

**Root Cause**: Gaussian blur extends beyond element boundaries by default. No `overflow-hidden` was applied to contain the blur.

**Fix**: Added `overflow-hidden rounded-lg` wrapper around all blur containers in `PostPreviewCard` and `ThreadView`.

**Lesson**: CSS `filter: blur()` ALWAYS extends beyond element boundaries. Any blur effect MUST be wrapped in `overflow-hidden`.

## Issue 8: Duplicate ModerationLabelBar in ThreadView (MEDIUM)

**Symptom**: ThreadView showed two identical `ModerationLabelBar` components stacked on top of each other.

**Root Cause**: `ThreadView` rendered `ModerationLabelBar` in two separate places — once before quotedPost/translation content, and once before media content. Both used the same condition (`focusedModeration.mediaAction === 'blur'`), so they both appeared when media labels were present.

**Fix**: Removed the duplicate bar, consolidated into single render before media content.

**Lesson**: When refactoring components, use `grep` to find ALL occurrences of a component name. Don't assume there's only one render site.

## Architecture Pattern: Hook Export Verification

When a project has multiple implementations:

1. **Search for all definitions**: `grep -r "export function useModerationBatch" packages/`
2. **Check the barrel export**: Look at `packages/app/src/index.ts`
3. **Verify which one consumers import**: `grep -r "useModerationBatch" packages/pwa/ packages/tui/`
4. **Compare feature sets**: Does the exported version have all capabilities?

## Prevention Checklist

- [ ] When creating a "v2" implementation, delete or deprecate the old one
- [ ] Add unit tests that verify the EXPORTED function, not just internal helpers
- [ ] Document which file is the "source of truth" for each public API
- [ ] Run integration tests that verify blob-level labels work end-to-end

## Related Commits

- `d6363fa`: fix(moderation): Correct useModerationBatch export + incremental resolution + virtual list cache invalidation
- `a9e39d0`: fix(moderation): Integrate moderation decisions into virtual list components
- `64dfd04`: feat(moderation): Implement official Bluesky-style moderation label bar
- `6324419`: fix(moderation): ContentWarningOverlay + fix duplicate bars + blur overflow

## Files Changed

- `packages/app/src/index.ts` — Fixed export source
- `packages/app/src/hooks/useModeration.ts` — Incremental resolution in useModerationBatch (file renamed from `useModerationPipeline.ts`)
- `packages/app/src/hooks/useVirtualizedList.ts` — Added `decisions` parameter + cache invalidation
- `packages/core/src/moderation.ts` — Fixed nudity blurs from 'content' to 'media'
- `packages/pwa/src/components/ContentWarningOverlay.tsx` — NEW: Content-level warning overlay
- `packages/pwa/src/components/ModerationLabelBar.tsx` — NEW: Compact bar for media-level labels
- `packages/pwa/src/components/PostPreviewCard.tsx` — 3-mode moderation rendering
- `packages/pwa/src/components/ThreadView.tsx` — Removed duplicate bars, added overflow-hidden
- `packages/pwa/src/components/FeedTimeline.tsx` — Height cache invalidation on decision changes
- `packages/pwa/src/components/SearchPage.tsx` — Pass decisions to useVirtualizedList
- `packages/pwa/src/components/ProfilePage.tsx` — Pass decisions to useVirtualizedList
- `packages/pwa/src/components/BookmarkPage.tsx` — Pass decisions to useVirtualizedList
- `packages/pwa/src/components/ListDetailPage.tsx` — Pass decisions to useVirtualizedList
- `packages/tui/src/components/UnifiedThreadView.tsx` — Async moderation fetching
