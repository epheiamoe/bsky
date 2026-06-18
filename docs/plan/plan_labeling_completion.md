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

### ✅ Completed in This Session
1. **TUI Post Rendering with Moderation Overlays** — `UnifiedThreadView` supports `[HIDDEN]`/`[WARN]` overlays + Enter key reveal
2. **Self-label Selector in ComposePage** — Per-post labels with `ContentWarningModal`, integrated into `useCompose.ts`
3. **Wire up moderation batch** — 6 list components migrated from `usePostsWithModeration` to `useModerationBatch`
4. **`useLabelerHealth` hook** — Periodic health checks (30s interval) with recovery detection
5. **TUI Badge prefix** — Badge labels displayed before post text in all 3 view modes

### ⚠️ Remaining
- **Height cache invalidation on moderation changes** — Not yet implemented
- ~~**Full `useModerationPipeline` integration**~~ — **已废弃**：决定采用 `useModerationBatch` 作为标准方案，Pipeline 死代码已清理

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

### Priority 3: Wire up `useModerationPipeline`（已采用 `useModerationBatch` 替代）

**决策**：`useModerationBatch` 的"先显示再标记"策略已满足核心安全目标，因此废弃 `useModerationPipeline` 方案，改为清理相关死代码。

**替代方案**:
- 列表组件继续使用 `useModerationBatch`
- 失败通知由 `LabelerFailureBanner` / `LabelerFailureToast` 承担
- 不再实现 `LoadingSafetyBanner` / `BlockedLoadingScreen`

**历史目标（供参考）**: Replace `usePostsWithModeration` with `useModerationPipeline` in list views

**历史 Files**（已不再需要）:
- `packages/pwa/src/components/FeedTimeline.tsx` — 继续使用 `useModerationBatch`
- `packages/pwa/src/components/BookmarkPage.tsx` — 继续使用 `useModerationBatch`
- `packages/pwa/src/components/ProfilePage.tsx` — 继续使用 `useModerationBatch`
- `packages/pwa/src/components/SearchPage.tsx` — 继续使用 `useModerationBatch`
- `packages/pwa/src/components/ListDetailPage.tsx` — 继续使用 `useModerationBatch`

**Implementation**（历史记录，未执行）:
1. ~~Create `LoadingSafetyBanner` component~~ — 已废弃
2. ~~Create `BlockedLoadingScreen` component~~ — 已废弃
3. ~~Modify each list component to use `useModerationPipeline`~~ — 保留 `useModerationBatch`

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

### Pipeline Integration（已废弃）
- [x] 决定采用 `useModerationBatch` 替代 `useModerationPipeline`
- [x] `useModerationPipeline` 函数及相关类型已删除
- [x] `LoadingSafetyBanner` 和 `BlockedLoadingScreen` 组件已删除
- [x] 列表组件继续使用 `useModerationBatch`，失败通知通过 `LabelerFailureBanner` / `LabelerFailureToast`

---

## Files to Create/Modify

| File | Action | Priority |
|------|--------|----------|
| `packages/tui/src/components/UnifiedThreadView.tsx` | Add moderation rendering | P1 |
| `packages/tui/src/components/PostDetailView.tsx` | Add moderation overlays | P1 |
| `packages/pwa/src/components/ComposePage.tsx` | Add self-label selector | P2 |
| `packages/pwa/src/hooks/useCompose.ts` | Pass labels to createRecord | P2 |
| `packages/app/src/hooks/useLabelerHealth.ts` | NEW | P4 |
| `packages/app/src/hooks/useVirtualizedList.ts` | Add cache invalidation | P5 |
| `packages/app/src/i18n/locales/{en,zh,ja}.ts` | Add new i18n keys | All |
| `docs/LABELING.md` | Update with completion status | Final |

---

*Plan created: 2026-05-27*
