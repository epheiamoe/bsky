# Plan: Labeling System Completion — v0.15.0

> **Date**: 2026-05-27
> **Branch**: feature/moderation-ui-redesign-v15
> **Scope**: Complete remaining items from `plan_labeling_system.md` + `plan_labeling_failure_handling.md`

---

## Current Status Summary

### ✅ Already Complete (Phase 1)
- Core types, BskyClient APIs, `moderation.ts`, `LabelCache`
- `useLabelerInfo`, `useModeration`, `useModerationConfig`
- PWA Settings tab, PostCard overlays, Report button, Welcome step, Info buttons
- Failure detection, retry (3x), `LabelerFailureBanner`, `LabelerFailureToast`
- All 6 list components integrated with failure notifications
- `docs/LABELING.md`, all i18n strings

### ⚠️ Partially Complete
- `useModerationPipeline` hook exists but **orphaned** (no consumers)
- TUI Settings tab exists but posts render **without moderation**

### ❌ Missing (This Plan)
1. **TUI Post Rendering with Moderation Overlays** (Critical)
2. **Self-label Selector in ComposePage** (Critical)
3. **Wire up `useModerationPipeline`** (Enhancement)
4. **`LoadingSafetyBanner` + `BlockedLoadingScreen`** (Enhancement)
5. **`useLabelerHealth` hook** (Enhancement)
6. **Height cache invalidation on moderation changes** (Enhancement)

---

## Implementation Order

### Priority 1: TUI Post Rendering (Critical)

**Goal**: Posts in TUI ThreadView render with moderation overlays (hide/warn/badge/blur)

**Files**:
- `packages/tui/src/components/UnifiedThreadView.tsx` — Add moderation decision rendering
- `packages/tui/src/components/PostDetailView.tsx` — Add moderation overlays
- `packages/app/src/hooks/useModeration.ts` — Ensure TUI can import (already exported)

**Design**:
```
[HIDDEN] Content hidden by @moderation.bsky.app
Press Enter to show anyway

or

[WARN: Adult Content] from @mod.bsky.app
This post may contain adult content.
Press Enter to show

or

[Badge: Bot] from @mod.bsky.app
Post content here...
```

**Implementation**:
1. Import `resolveModeration` + config from `@bsky/core`
2. For each post in thread, compute moderation decision
3. Render based on `decision.contentAction`:
   - `hide` → `[HIDDEN]` header + labeler info + "Press Enter to show"
   - `warn` → `[WARN: {labelName}]` + description + "Press Enter to show"
   - `none` + badges → `[Badge: {name}]` prefix on post
   - `none` → normal render
4. Handle Enter key to reveal hidden/warned content
5. Use TUI config store's `moderationConfig`

### Priority 2: Self-label Selector (Critical)

**Goal**: Allow users to add self-labels when composing posts

**Files**:
- `packages/pwa/src/components/ComposePage.tsx` — Add self-label selector UI
- `packages/pwa/src/hooks/useCompose.ts` — Include labels in post record
- `packages/core/src/at/client.ts` — Ensure `createRecord` supports labels field

**Design**:
- Collapsible section below text input: "内容标记 (可选)"
- Checkboxes for: Adult Content, Sexual, Nudity, Graphic Media
- Help text: "适当标记内容有助于维护社区安全"
- Labels stored as `com.atproto.label.defs#selfLabels`

**Implementation**:
1. Add `selectedLabels` state to ComposePage
2. Render checkbox group with 4 standard labels
3. When submitting, include `labels` field in post record:
   ```json
   {
     "$type": "com.atproto.label.defs#selfLabels",
     "values": [{"val": "sexual"}]
   }
   ```
4. Update `useCompose.ts` `submitPost()` to pass labels

### Priority 3: Wire up `useModerationPipeline`

**Goal**: Replace `usePostsWithModeration` with `useModerationPipeline` in list views

**Files**:
- `packages/pwa/src/components/FeedTimeline.tsx` — Use pipeline
- `packages/pwa/src/components/BookmarkPage.tsx` — Use pipeline
- `packages/pwa/src/components/ProfilePage.tsx` — Use pipeline
- `packages/pwa/src/components/SearchPage.tsx` — Use pipeline
- `packages/pwa/src/components/ListDetailPage.tsx` — Use pipeline

**Implementation**:
1. Create `LoadingSafetyBanner` component
2. Create `BlockedLoadingScreen` component
3. Modify each list component:
   - Replace `usePostsWithModeration` with `useModerationPipeline`
   - Render `LoadingSafetyBanner` when `state.phase === 'loadingTags'`
   - Render `BlockedLoadingScreen` when `state.phase === 'blocked'`
   - Pass pipeline's posts + decisions to child components

### Priority 4: `useLabelerHealth` Hook

**Goal**: Periodic health checks and recovery detection

**Files**:
- `packages/app/src/hooks/useLabelerHealth.ts` — NEW

**Implementation**:
1. Poll active labelers every 30s
2. Track response time, success/failure counts
3. Detect recovery (consecutive successes after failure)
4. Expose `health` map to consumers

### Priority 5: Height Cache Invalidation

**Goal**: Clear virtual scroll height cache when moderation decisions change

**Files**:
- `packages/app/src/hooks/useVirtualizedList.ts` — Add invalidation API
- `packages/pwa/src/components/FeedTimeline.tsx` — Call invalidation

**Implementation**:
1. Add `clearHeightCache(uri?: string)` method to useVirtualizedList
2. In FeedTimeline, when moderation decisions change, call clearHeightCache
3. Force re-measure of affected posts

---

## Acceptance Criteria

### TUI Moderation
- [ ] Hidden posts show `[HIDDEN]` with labeler name
- [ ] Warned posts show `[WARN]` with label name and description
- [ ] Badge posts show `[Badge: X]` prefix
- [ ] Enter key reveals hidden/warned content
- [ ] Config changes take effect immediately

### Self-labeling
- [ ] ComposePage has collapsible self-label section
- [ ] 4 checkboxes for standard labels
- [ ] Submitting post includes labels in record
- [ ] Labels visible on posted content

### Pipeline Integration
- [ ] FeedTimeline uses `useModerationPipeline`
- [ ] Loading banner appears when tags loading
- [ ] Block screen appears when block-level labelers fail
- [ ] Silent failures show toast only

---

## Files to Create/Modify

| File | Action | Priority |
|------|--------|----------|
| `packages/tui/src/components/UnifiedThreadView.tsx` | Add moderation rendering | P1 |
| `packages/tui/src/components/PostDetailView.tsx` | Add moderation overlays | P1 |
| `packages/pwa/src/components/ComposePage.tsx` | Add self-label selector | P2 |
| `packages/pwa/src/hooks/useCompose.ts` | Pass labels to createRecord | P2 |
| `packages/pwa/src/components/LoadingSafetyBanner.tsx` | NEW | P3 |
| `packages/pwa/src/components/BlockedLoadingScreen.tsx` | NEW | P3 |
| `packages/app/src/hooks/useLabelerHealth.ts` | NEW | P4 |
| `packages/app/src/hooks/useVirtualizedList.ts` | Add cache invalidation | P5 |
| `packages/app/src/i18n/locales/{en,zh,ja}.ts` | Add new i18n keys | All |
| `docs/LABELING.md` | Update with completion status | Final |

---

*Plan created: 2026-05-27*
