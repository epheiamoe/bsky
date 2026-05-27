# Lesson: Moderation + Virtual List Integration Traps (2026-05-27)

## Problem Summary

Subagent exploration revealed 4 critical hidden issues in the moderation/labeling system's interaction with post loading and virtual scrolling:

## Issue 1: Wrong Hook Exported (CRITICAL)

**Symptom**: Blob-level labels (media-level labels on individual images) were silently ignored in ALL list components.

**Root Cause**: `packages/app/src/index.ts:51` exported `useModerationBatch` from `useModeration.ts` (no blob support) instead of `useModerationPipeline.ts` (has blob support via `extractBlobReferences`).

**Code**:
```typescript
// BEFORE (broken):
export { useModeration, useModerationBatch, resolveModerationBatch } from './hooks/useModeration.js';

// AFTER (fixed):
export { useModeration } from './hooks/useModeration.js';
export { useModerationPipeline, useModerationBatch, resolveModerationBatch } from './hooks/useModerationPipeline.js';
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

## Files Changed

- `packages/app/src/index.ts` — Fixed export source
- `packages/app/src/hooks/useModerationPipeline.ts` — Incremental resolution in useModerationBatch
- `packages/app/src/hooks/useVirtualizedList.ts` — Added `decisions` parameter + cache invalidation
- `packages/pwa/src/components/FeedTimeline.tsx` — Height cache invalidation on decision changes
- `packages/pwa/src/components/SearchPage.tsx` — Pass decisions to useVirtualizedList
- `packages/pwa/src/components/ProfilePage.tsx` — Pass decisions to useVirtualizedList
- `packages/pwa/src/components/BookmarkPage.tsx` — Pass decisions to useVirtualizedList
- `packages/pwa/src/components/ListDetailPage.tsx` — Pass decisions to useVirtualizedList
- `packages/tui/src/components/UnifiedThreadView.tsx` — Async moderation fetching
