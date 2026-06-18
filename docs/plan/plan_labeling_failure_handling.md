# Plan: Labeling System Failure Handling & Safety Architecture

> **Status**: Phase 1 in progress
> **Current Version**: v0.14.1 (labeling update, not yet on production)
> **Target**: Phase 1 → test → production, then Phase 2

---

## 1. Problem Statement

### Current Critical Issue
When label services fail (network error, timeout, service down), the system **silently returns empty labels**, causing:
- Posts display **without any moderation filters applied**
- Users are in an **unsafe environment without knowing it**
- No retry, no warning, no indication of protection loss

### Evidence
```typescript
// LabelCache.fetchLabels() — current behavior
try {
  const res = await client.queryLabels({...});
} catch {
  return [];  // ← SILENT FAILURE
}
```

### User Impact
- Hate speech, spam, NSFW content may be displayed unfiltered
- LGBTQ+ users unprotected when anti-transphobia labelers fail
- Users have **no way to know** their safety shield is down

---

## 2. Phase 1: Failure Detection & Status Notifications (v0.14.1)

### Goal
Solve the "silent unsafe" problem immediately. Detect label service failures, retry, and inform users through appropriate UI channels.

### Scope
- ✅ Label service failure detection per-provider
- ✅ Exponential backoff retry (3 attempts)
- ✅ Failure state tracking in LabelCache
- ✅ Per-provider `failureBehavior` configuration
- ✅ UI notifications: banner (block/banner level), toast (silent level)
- ⏸️ Does NOT change loading flow (posts still load immediately, tags applied async)

### Architecture

```
┌────────────────────────────────────────────────────────────┐
│  LabelCache (enhanced)                                     │
│  ├─ per-provider failure tracking: Map<did, FailureState>  │
│  ├─ retry with exponential backoff                         │
│  ├─ failure state: { failed, retries, lastError, since }   │
│  └─ getFailedLabelers(): Filter config by active+failed    │
├────────────────────────────────────────────────────────────┤
│  resolveModerationBatch() (enhanced)                       │
│  ├─ returns { decisions, failedLabelers }                  │
│  └─ failedLabelers: Array<{did, name, behavior, error}>    │
├────────────────────────────────────────────────────────────┤
│  useModerationBatch() (enhanced)                           │
│  ├─ returns { decisions, failedLabelers, isLoading }       │
│  └─ exposes failure info to components                     │
├────────────────────────────────────────────────────────────┤
│  List Components (enhanced)                                │
│  ├─ read failedLabelers from useModerationBatch            │
│  ├─ aggregate by failureBehavior level                     │
│  ├─ render:                                                │
│  │   block level  → Top banner (red)                       │
│  │   banner level → Top banner (amber)                     │
│  │   silent level → Bottom-right toast                     │
│  └─ allow dismissing banners                               │
└────────────────────────────────────────────────────────────┤
```

### Data Model Changes (v0.14.1)

#### `LabelerConfig` Extension
```typescript
// [v0.14.1] New field — controls failure notification behavior
interface LabelerConfig {
  did: string;
  name: string;
  description?: string;
  avatar?: string;
  labels: LabelValueDefinition[];
  labelPrefs: Record<string, 'hide' | 'warn' | 'ignore'>;
  isActive: boolean;
  
  // [NEW v0.14.1] How to handle service failures
  failureBehavior: 'silent' | 'banner' | 'block';
}
```

#### `ModerationConfig` Extension
```typescript
interface ModerationConfig {
  adultContentEnabled: boolean;
  contentLabels: ContentLabelPref[];
  labelers: LabelerConfig[];
  
  // [NEW v0.14.1] Global retry configuration
  labelerRetryCount: number;      // default: 3
  labelerRetryBaseDelay: number;  // default: 1000 (ms)
}
```

#### Failure State Tracking
```typescript
// Internal — not persisted
interface LabelerFailureState {
  did: string;
  failed: boolean;
  retries: number;
  lastError: string;
  since: number;  // timestamp
}
```

### Default Failure Behavior Assignment

Based on service criticality for user safety:

| Labeler | Default Behavior | Rationale |
|---------|-----------------|-----------|
| `moderation.bsky.app` | `banner` | Foundation safety (spam/NSFW/hate speech) |
| `asukafield.xyz` | `block` | Protects LGBTQ+ users from transphobia |
| `skywatch.blue` | `banner` | Filters extremist content |
| `perisai.bsky.social` | `banner` | Community protection |
| `moderation.blacksky.app` | `banner` | Cross-group safety net |
| `arttheft.bsky.social` | `banner` | Anti-plagiarism protection |
| `xblock.aendra.dev` | `silent` | Twitter/X screenshot marker — informational |
| `sonasky.app` | `silent` | Fursona labels — community cultural |
| `bskyttrpg.bsky.social` | `silent` | TTRPG class labels — entertainment |
| `creatorlabeler.bsky.social` | `silent` | Creator identity — informational |

**Principle**: Safety-critical → `block` or `banner`. Community/enrichment → `silent`.

### UI Components (v0.14.1)

#### `LabelerFailureBanner` (new)
- Position: Top of feed, `sticky`, `z-50`
- Colors: `block` = red theme, `banner` = amber theme
- Content: "⚠️ {n} label services unavailable: {names}. Content safety filtering may be incomplete."
- Action: Dismiss button (×), "Retry now" button

#### `LabelerFailureToast` (new)
- Position: Bottom-right corner
- Auto-dismiss: 5 seconds
- Content: "Label service {name} unavailable"

### Retry Mechanism

```typescript
const DEFAULT_RETRY_CONFIG = {
  maxRetries: 3,
  baseDelay: 1000,     // 1s
  maxDelay: 8000,      // 8s cap
  backoffMultiplier: 2,
};

function calculateDelay(attempt: number): number {
  return Math.min(
    baseDelay * Math.pow(backoffMultiplier, attempt - 1),
    maxDelay
  );
}
// Attempt 1: immediate
// Attempt 2: 1s delay
// Attempt 3: 2s delay
// Attempt 4: 4s delay (if maxRetries=3, this doesn't happen)
```

### Files to Modify (Phase 1)

| File | Change |
|------|--------|
| `packages/core/src/moderation.ts` | Add `failureBehavior` to `LabelerConfig`, update `DEFAULT_MODERATION_CONFIG` |
| `packages/core/src/moderation-cache.ts` | Add per-provider failure tracking, retry logic |
| `packages/app/src/hooks/useModeration.ts` | Return `failedLabelers` from `resolveModerationBatch`, expose in `useModerationBatch` |
| `packages/app/src/index.ts` | Export new types |
| `packages/pwa/src/components/LabelerFailureBanner.tsx` | [NEW] Top banner component |
| `packages/pwa/src/components/LabelerFailureToast.tsx` | [NEW] Bottom-right toast |
| `packages/pwa/src/components/FeedTimeline.tsx` | Integrate failure banner |
| `packages/pwa/src/components/BookmarkPage.tsx` | Integrate failure banner |
| `packages/pwa/src/components/ProfilePage.tsx` | Integrate failure banner |
| `packages/pwa/src/components/SearchPage.tsx` | Integrate failure banner |
| `packages/pwa/src/components/ListDetailPage.tsx` | Integrate failure banner |
| `packages/pwa/src/components/ThreadView.tsx` | Integrate failure banner |
| `packages/pwa/src/components/ModerationSettingsTab.tsx` | Add failure behavior selector per labeler |
| `packages/pwa/src/hooks/useModerationConfig.ts` | Handle new `failureBehavior` field |
| `packages/app/src/i18n/locales/*.ts` | Add failure-related strings |

---

## 3. Phase 2: Mixed Sync/Async Loading Pipeline (v0.15.0)

> **历史状态**：该 Phase 2 方案已被废弃。`useModerationPipeline` 及相关组件（`LoadingSafetyBanner`、`BlockedLoadingScreen`）虽已实现，但从未被任何列表组件使用，最终于 2026-06-09 作为死代码清理。列表视图继续使用 `useModerationBatch`，失败通知由 `LabelerFailureBanner` / `LabelerFailureToast` 承担。

### Goal
Implement the complete architecture: loading strategy determined by highest active failure level.

### Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│  ModerationPipeline (NEW v0.15.0)                               │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  Pipeline State Machine                                  │   │
│  │  ┌─────────┐    ┌──────────┐    ┌──────────────┐       │   │
│  │  │ idle    │───→│ loading  │───→│ tagsApplied  │       │   │
│  │  └─────────┘    └──────────┘    └──────────────┘       │   │
│  │       ↑                              │                   │   │
│  │       └──────────────────────────────┘ (refresh)        │   │
│  └──────────────────────────────────────────────────────────┘   │
│  ├─ Input: posts[], config, client                             │
│  ├─ Determine strategy from max(active failureBehavior)        │
│  ├─ Execute strategy:                                          │
│  │   silent  → show posts immediately, apply tags async        │
│  │   banner  → show posts + "loading safety..." banner         │
│  │   block   → wait for all block-level services, then show    │
│  ├─ Track: per-labeler health, retry queue                     │
│  ├─ Output: { posts, decisions, state, failedLabelers }       │
│  └─ Events: onStateChange, onLabelerFail, onLabelerRecover    │
└─────────────────────────────────────────────────────────────────┘
```

### Loading Strategies by Highest Active Level

```
Active Labelers: [block: asukafield, banner: moderation.bsky.app, silent: xblock]
                        ↓
              Highest = block
                        ↓
   ┌─────────────────────────────────────────────────────┐
   │ BLOCK STRATEGY                                      │
   │ 1. Show loading skeleton                            │
   │ 2. Concurrently fetch:                              │
   │    • Posts from timeline API                        │
   │    • Tags from ALL active labelers                  │
   │ 3. Wait for block-level labelers to respond         │
   │ 4. If block-level succeeds: show posts with tags    │
   │ 5. If block-level fails after retries:              │
   │    • Show blocking screen: "Safety verification      │
   │      unavailable. Cannot load content securely."     │
   │    • Offer: "Load anyway (unsafe)", "Retry",         │
   │      "Check settings"                                │
   │ 6. Banner/silent level failures: show warnings      │
   │    but don't block                                  │
   └─────────────────────────────────────────────────────┘
```

```
Active Labelers: [banner: moderation.bsky.app, silent: xblock, silent: sonasky]
                        ↓
              Highest = banner
                        ↓
   ┌─────────────────────────────────────────────────────┐
   │ BANNER STRATEGY                                     │
   │ 1. Show posts immediately (with placeholder tags)   │
   │ 2. Show top banner: "Loading content safety..."     │
   │ 3. Concurrently fetch tags                          │
   │ 4. When tags arrive: apply moderation overlays      │
   │ 5. Remove "loading" banner                          │
   │ 6. If banner-level fails: switch banner to warning  │
   └─────────────────────────────────────────────────────┘
```

```
Active Labelers: [silent: xblock, silent: sonasky]
                        ↓
              Highest = silent
                        ↓
   ┌─────────────────────────────────────────────────────┐
   │ SILENT STRATEGY                                     │
   │ 1. Show posts immediately (no moderation yet)       │
   │ 2. Fetch tags in background                         │
   │ 3. When tags arrive: smoothly apply overlays        │
   │    • Use CSS transitions to avoid layout shift      │
   │    • Maintain scroll position                       │
   │ 4. If silent-level fails: show toast notification   │
   └─────────────────────────────────────────────────────┘
```

### Key Challenges (Phase 2)

1. **Scroll Position Preservation**
   - When moderation overlays appear, post heights may change
   - Virtual scroll must maintain user's visual position
   - Solution: Pre-calculate overlay heights, use `min-height` constraints

2. **Height Cache Invalidation**
   - Current: `_heightCache.set(post.uri, measuredHeight)`
   - Phase 2: Must re-measure after tags applied
   - Solution: Clear height cache for posts when decisions change

3. **Loading State Transitions**
   - skeleton → posts+banner → posts+tags → posts (final)
   - Each transition must be smooth, no flicker
   - Solution: Use React `startTransition` + CSS opacity transitions

4. **AI Tool Exemption**
   - AI tools (`search_posts`, `get_author_feed`) bypass this pipeline
   - AI controls what to show users via custom prompts
   - Solution: Pipeline only applies to user-facing timeline/list views

### Files to Create/Modify (Phase 2)

| File | Action | Description |
|------|--------|-------------|
| `packages/app/src/hooks/useModerationPipeline.ts` | [废弃 — 已删除] | Pipeline hook 已实现但未被采用，相关代码已清理 |
| `packages/app/src/hooks/useLabelerHealth.ts` | [已实现] | Periodic health checks, recovery detection |
| `packages/pwa/src/components/LoadingSafetyBanner.tsx` | [废弃 — 已删除] | 已创建但未被 import，作为死代码清理 |
| `packages/pwa/src/components/BlockedLoadingScreen.tsx` | [废弃 — 已删除] | 已创建但未被 import，作为死代码清理 |
| `packages/pwa/src/components/FeedTimeline.tsx` | 无需修改 | 继续使用 `useModerationBatch` |
| `packages/pwa/src/components/BookmarkPage.tsx` | 无需修改 | 继续使用 `useModerationBatch` |
| `packages/pwa/src/components/ProfilePage.tsx` | 无需修改 | 继续使用 `useModerationBatch` |
| `packages/pwa/src/components/SearchPage.tsx` | 无需修改 | 继续使用 `useModerationBatch` |
| `packages/pwa/src/components/ListDetailPage.tsx` | 无需修改 | 继续使用 `useModerationBatch` |
| `packages/pwa/src/components/ThreadView.tsx` | 无需修改 | 继续使用 `useModerationBatch` |
| `packages/pwa/src/components/PostCard.tsx` | 无需修改 | — |
| `packages/pwa/src/components/ModerationOverlay.tsx` | 无需修改 | — |

---

## 4. Interface Changes Summary

### v0.14.1 (Phase 1 — Current)

#### `LabelerConfig` [MODIFIED]
```typescript
interface LabelerConfig {
  // ... existing fields ...
  
  /** [v0.14.1] How to notify users when this labeler fails */
  failureBehavior: 'silent' | 'banner' | 'block';
}
```

#### `resolveModerationBatch()` [MODIFIED — return type]
```typescript
// BEFORE v0.14.1:
export async function resolveModerationBatch(
  subjects: Array<{ uri: string; labels?: Label[] }>,
  config: ModerationConfig,
  client: BskyClient
): Promise<Map<string, ModerationDecision>>;

// AFTER v0.14.1:
export interface ModerationBatchResult {
  decisions: Map<string, ModerationDecision>;
  failedLabelers: Array<{
    did: string;
    name: string;
    behavior: 'silent' | 'banner' | 'block';
    error: string;
  }>;
}

export async function resolveModerationBatch(
  subjects: Array<{ uri: string; labels?: Label[] }>,
  config: ModerationConfig,
  client: BskyClient
): Promise<ModerationBatchResult>;
```

#### `useModerationBatch()` [MODIFIED — return type]
```typescript
// BEFORE v0.14.1:
export function useModerationBatch(
  posts: Array<{ uri: string; labels?: Label[] }>,
  config: ModerationConfig,
  client: BskyClient | null
): Map<string, ModerationDecision>;

// AFTER v0.14.1:
export interface UseModerationBatchResult {
  decisions: Map<string, ModerationDecision>;
  failedLabelers: Array<{
    did: string;
    name: string;
    behavior: 'silent' | 'banner' | 'block';
    error: string;
  }>;
  isLoading: boolean;
}

export function useModerationBatch(
  posts: Array<{ uri: string; labels?: Label[] }>,
  config: ModerationConfig,
  client: BskyClient | null
): UseModerationBatchResult;
```

### v0.15.0 (Phase 2 — 已废弃)

#### `useModerationPipeline()` [已废弃 — 未投入使用]
```typescript
// [v0.15.0] NEW — replaces useModerationBatch in list views
export interface PipelineState {
  phase: 'idle' | 'loadingPosts' | 'loadingTags' | 'tagsApplied' | 'blocked';
  strategy: 'silent' | 'banner' | 'block';
  posts: PostView[];
  decisions: Map<string, ModerationDecision>;
  failedLabelers: FailedLabelerInfo[];
  error?: string;
}

> 该接口虽已编码实现，但从未被列表组件调用，最终作为死代码删除。`useModerationBatch` 继续作为标准方案。

```typescript
// [已废弃] 原 Planned interface — 未实际投入使用
export function useModerationPipeline(
  fetchPosts: () => Promise<PostView[]>,
  config: ModerationConfig,
  client: BskyClient | null
): PipelineState & { refresh: () => void };
```
```

#### `LabelCache` [MODIFIED — health tracking]
```typescript
// [v0.15.0] Extended health monitoring
interface LabelerHealth {
  did: string;
  status: 'healthy' | 'degraded' | 'down';
  lastSuccess: number;
  lastFailure: number;
  consecutiveFailures: number;
  averageResponseTime: number;
}

class LabelCache {
  // [v0.15.0] NEW methods
  getHealth(did: string): LabelerHealth;
  getAllHealth(): LabelerHealth[];
  markRecovered(did: string): void;
}
```

---

## 5. Implementation Order

### Phase 1 Steps (v0.14.1)

1. **Data Model** — Add `failureBehavior` to `LabelerConfig`
2. **Core Cache** — Extend `LabelCache` with failure tracking + retry
3. **Batch Resolution** — Return `failedLabelers` from `resolveModerationBatch`
4. **Hook Update** — `useModerationBatch` returns `{decisions, failedLabelers, isLoading}`
5. **UI Components** — Create `LabelerFailureBanner` and `LabelerFailureToast`
6. **List Integration** — Wire failure info into 6 list components
7. **Settings UI** — Add failure behavior selector in `ModerationSettingsTab`
8. **i18n** — Add all failure-related strings
9. **Testing** — Verify typecheck, test failure scenarios
10. **Documentation** — Update all docs

### Phase 2 Steps (v0.15.0)

1. ~~**Pipeline Hook** — Create `useModerationPipeline`~~ — **已废弃**：决定采用 `useModerationBatch`，Pipeline 死代码已清理
2. **Health Monitoring** — Create `useLabelerHealth` with periodic pings
3. **Strategy Router** — Implement silent/banner/block loading strategies
4. **Scroll Preservation** — Enhance virtual scroll for height changes
5. **Loading UI** — Create strategy-specific loading components
6. **Transition Animation** — Smooth placeholder → active transitions
7. **Integration** — Replace `useModerationBatch` with pipeline in lists
8. **AI Exemption** — Ensure AI tools bypass pipeline
9. **Testing** — Comprehensive testing across all strategies
10. **Documentation** — Update architecture docs

---

## 6. Risk Assessment

| Risk | Phase | Likelihood | Impact | Mitigation |
|------|-------|-----------|--------|-----------|
| Breaking existing moderation | 1 | Low | High | Comprehensive typecheck + manual testing |
| User confusion from banners | 1 | Medium | Medium | Clear messaging, dismissible, default to conservative |
| Performance degradation from retries | 1 | Low | Medium | Exponential cap, max 3 retries, background fetching |
| Complex state management | 2 | High | Medium | Well-documented state machine, extensive testing |
| Scroll jitter in Phase 2 | 2 | High | High | Pre-calculate heights, use min-height, virtual scroll cache |
| AI tool regression | 2 | Low | High | Explicit exemption, separate test suite |

---

## 7. Success Criteria

### Phase 1 Success
- [ ] Label service failures are detected and not silent
- [ ] 3 retry attempts with exponential backoff
- [ ] User sees appropriate notification for failure level
- [ ] Settings allow customizing failure behavior per labeler
- [ ] TypeScript compilation passes
- [ ] No regression in existing moderation functionality

### Phase 2 Success
- [ ] Loading strategy matches highest active failure level
- [ ] Block level: content loading blocked until safety verified
- [ ] Banner level: content loads with "loading safety" banner
- [ ] Silent level: content loads immediately, tags applied async
- [ ] Scroll position preserved during tag application
- [ ] AI tools bypass pipeline correctly
- [ ] Health monitoring detects service recovery

---

## 8. Related Documents

- `docs/LABELING.md` — Labeling system architecture
- `docs/CONTEXT.md` — Project context and current status
- `docs/lessons/2026-05-24-labeling-batch-integration.md` — Previous labeling lessons
- `packages/core/src/moderation.ts` — Decision engine
- `packages/core/src/moderation-cache.ts` — Label cache
- `packages/app/src/hooks/useModeration.ts` — Moderation hooks
- `packages/pwa/src/components/ModerationSettingsTab.tsx` — Settings UI

---

*Document created: 2026-05-24*
*Phase 1 target: v0.14.1*
*Phase 2 target: v0.15.0*
