# Labeling / Moderation System

> Architecture documentation for v0.15.0 Bluesky labeling system.
> Last updated: 2026-05-27

## Overview

The bsky client implements a full **user-controlled** Bluesky content labeling/moderation system with support for:

1. **Multiple labelers** (official + third-party)
2. **Per-labeler independent configuration**
3. **User-configurable actions**: hide / warn / blur media / show badge / none
4. **No automatic AppView hydration** — labels are queried manually via `com.atproto.label.queryLabels`
5. **Info display** — every moderation action shows its source labeler(s)

## Architecture Principles

- **No AppView auto-hydration**: We do NOT send `atproto-accept-labelers` headers, keeping full user control over which labels are visible
- **Provider independence**: Each labeler is evaluated independently. Configurations do NOT override each other.
- **Most restrictive wins**: If multiple labelers label the same content with different actions, the strictest applies
- **Manual queries**: Labels are fetched on-demand via `queryLabels`, not injected into API responses

## Data Flow

```
Timeline/Search/Profile loads posts
  ↓
PostCard receives post + moderationDecision (optional)
  ↓
useModeration(subject, config, client) → ModerationDecision
  ├─ Check cache (LabelCache, TTL 5min)
  ├─ Batch query missing labels (com.atproto.label.queryLabels)
  ├─ Fetch labeler policies (app.bsky.labeler.getServices)
  └─ resolveModeration(labels, config, definitions) → Decision
  ↓
ModerationOverlay renders based on decision.action:
  ├─ hide → HiddenContent placeholder with "show anyway"
  ├─ warn → Warning banner + blurred preview, click to dismiss
  ├─ blurMedia → CSS blur on media, click to show
  ├─ showBadge → BadgeRow above content
  └─ none → Render normally
```

## Configuration Model

```typescript
interface ModerationConfig {
  adultContentEnabled: boolean;
  contentLabels: ContentLabelPref[];      // Global defaults (porn/sexual/nudity/graphic-media)
  labelers: LabelerConfig[];              // Per-labeler config
}

interface LabelerConfig {
  did: string;                            // e.g. did:plc:ar7c4by46qjdydhdevvrndac
  name: string;
  labels: LabelValueDefinition[];         // Fetched dynamically from labeler service record
  labelPrefs: Record<string, Visibility>; // Per-label override
  isActive: boolean;
}
```

### Decision Logic

For each label on a post:
1. Check the labeler's `labelPrefs[label.val]` → if set, use it
2. Fall back to global `contentLabels[label.val]` → if standard label
3. Fall back to label definition's `defaultSetting`
4. If `adultOnly=true` and `adultContentEnabled=false` → force `hide`

Then: take the **most restrictive** action across all labels.

## API Methods

| Method | Endpoint | Purpose |
|--------|----------|---------|
| `queryLabels` | `com.atproto.label.queryLabels` | Query labels for URIs (batch up to 250) |
| `getLabelerServices` | `app.bsky.labeler.getServices` | Get labeler metadata |
| `getPreferences` | `app.bsky.actor.getPreferences` | Read user's Bluesky moderation prefs |
| `putPreferences` | `app.bsky.actor.putPreferences` | Write user's Bluesky moderation prefs |
| `createModerationReport` | `com.atproto.moderation.createReport` | Submit content report |

## UI Components

### PWA

- **ModerationSettingsTab** (`packages/pwa/src/components/ModerationSettingsTab.tsx`)
  - General settings (adult toggle + 4 standard labels)
  - Official labeler section (dynamic label list)
  - Third-party labeler cards (expandable, per-label config)
  
- **ModerationOverlay** (`packages/pwa/src/components/ModerationOverlay.tsx`)
  - HiddenContent / WarningContent / BlurredMedia / BadgeRow / LabelSourceInfo
  - Info button on every moderation element shows label source

- **PostCard** — accepts `moderationDecision` prop, wraps content in `ModerationOverlay`

- **ReportButton** — only in ThreadView (post detail), Modal dialog with reason selection

- **WelcomeCard** — Step 5: Moderation preferences

### TUI

- **SettingsView** (`packages/tui/src/components/SettingsView.tsx`) — `,` quick config, Tab: `🛡 审核`
  - General subtab: adult toggle + 4 standard labels (hide/warn/ignore cycle)
  - Labelers subtab: enable/disable third-party labelers
- **UnifiedThreadView** — `!` key to report post (com.atproto.moderation.createReport)

## Self-Labeling

Posts can include self-labels via `com.atproto.label.defs#selfLabels`:

```typescript
interface SelfLabels {
  $type: 'com.atproto.label.defs#selfLabels';
  values: Array<{ $type: 'com.atproto.label.defs#selfLabel'; val: string }>;
}
```

### Supported Values

- `porn` — Adult sexual content
- `sexual` — Sexual content (less intense)
- `nudity` — Nudity (not 18+)
- `graphic-media` — Violence/gore
- `!no-unauthenticated` — Hide from logged-out users

### Usage

**AI tool** (`create_post`): Pass `labels: ['porn', 'sexual']` in parameters.

**PWA UI** (planned): ComposePage will show a label selector (checkboxes for each supported value).

**TUI** (planned): ComposeView will allow toggling labels before posting.

## Key Files

| File | Purpose |
|------|---------|
| `packages/core/src/moderation.ts` | Decision engine, DEFAULT_MODERATION_CONFIG |
| `packages/core/src/moderation-cache.ts` | LabelCache with batching + TTL |
| `packages/core/src/at/client.ts` | BskyClient API methods |
| `packages/core/src/at/types.ts` | Label, LabelerView, etc. types |
| `packages/app/src/hooks/useModeration.ts` | React hook for single-post moderation |
| `packages/app/src/hooks/useModerationPipeline.ts` | Batch moderation + pipeline (blob-aware) |
| `packages/app/src/hooks/usePostsWithModeration.ts` | Posts augmented with moderation decisions |
| `packages/app/src/hooks/useVirtualizedList.ts` | Virtual scroll with moderation cache invalidation |
| `packages/app/src/hooks/useLabelerInfo.ts` | Labeler metadata fetching |
| `packages/pwa/src/hooks/useModerationConfig.ts` | PWA localStorage config |
| `packages/pwa/src/components/ModerationSettingsTab.tsx` | Settings UI |
| `packages/pwa/src/components/ModerationOverlay.tsx` | Overlay components |
| `packages/pwa/src/components/ReportButton.tsx` | Report dialog |
| `packages/pwa/src/components/PostCard.tsx` | Integrated PostCard |
| `packages/pwa/src/components/ThreadView.tsx` | Report button placement |
| `packages/pwa/src/components/WelcomeCard.tsx` | Step 5 moderation |
| `packages/tui/src/config/configStore.ts` | TuiConfig with moderationConfig |

## i18n Keys

All moderation strings in `packages/app/src/i18n/locales/{zh,en,ja}.ts`:

- `settings.tabModeration`
- `moderation.generalTitle`, `moderation.adultContent`
- `moderation.label`, `moderation.hide`, `moderation.warn`, `moderation.ignore`
- `moderation.officialLabeler`, `moderation.thirdPartyLabelers`
- `moderation.hidden`, `moderation.warning.content`, `moderation.warning.media`
- `moderation.showContent`, `moderation.showMedia`
- `moderation.infoTitle`, `moderation.report*`
- `moderation.welcomeTitle`, `moderation.welcomeDesc`

## Interface Changes

### v0.14.1 (Phase 1 — In Progress)

#### `LabelerConfig` Extension
```typescript
interface LabelerConfig {
  // ... existing fields ...
  
  /** [v0.14.1] Failure notification behavior */
  failureBehavior: 'silent' | 'banner' | 'block';
}
```

#### `resolveModerationBatch()` Return Type [CHANGED]
```typescript
// [v0.14.1] Now returns failed labelers info
export interface ModerationBatchResult {
  decisions: Map<string, ModerationDecision>;
  failedLabelers: Array<{
    did: string;
    name: string;
    behavior: 'silent' | 'banner' | 'block';
    error: string;
  }>;
}
```

#### `useModerationBatch()` Return Type [CHANGED]
```typescript
// [v0.14.1] Now returns object with decisions + failures
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
```

### v0.15.0 (Phase 2 — In Progress)

#### `useModerationBatch()` [FIXED — Blob Support + Incremental Resolution]
```typescript
// [v0.15.0] Now exported from useModerationPipeline.ts with blob-level label support
// Previously exported from useModeration.ts (no blob support — CRITICAL BUG)
export function useModerationBatch(
  posts: Array<{ uri: string; labels?: Label[] }>,
  config: ModerationConfig,
  client: BskyClient | null
): { decisions: Map<string, ModerationDecision>; failedLabelers: FailedLabelerInfo[]; isLoading: boolean };
```

**Fixes**:
1. **Blob-level labels**: Now extracts blob URIs from embeds and queries labels for individual images/videos
2. **Incremental resolution**: Only resolves moderation for newly added posts on pagination (not O(n) full re-computation)
3. **Full re-computation** still occurs when `config` or `client` changes

#### `useVirtualizedList()` [ENHANCED — Moderation-Aware Cache]
```typescript
// [v0.15.0] New optional 'decisions' parameter for automatic height cache invalidation
useVirtualizedList(
  items,
  cacheKey,
  estimateHeight,
  getItemKey,
  { 
    overscan?: number;
    initialScrollTop?: number;
    onScrollTopChange?: (top: number) => void;
    decisions?: Map<string, ModerationDecision>; // ← NEW
  }
);
```

#### `useModerationPipeline()` [NEW]
```typescript
// [v0.15.0] Replaces useModerationBatch in list views
export function useModerationPipeline(
  fetchPosts: () => Promise<PostView[]>,
  config: ModerationConfig,
  client: BskyClient | null
): PipelineState & { refresh: () => void };
```

Full details in `docs/plan/plan_labeling_failure_handling.md`

---

## Default Failure Behaviors (v0.14.1+)

| Labeler | Default | Rationale |
|---------|---------|-----------|
| `moderation.bsky.app` | `banner` | Foundation safety (spam/NSFW/hate) |
| `asukafield.xyz` | `block` | Protects LGBTQ+ users |
| `skywatch.blue` | `banner` | Extremist content filtering |
| `perisai.bsky.social` | `banner` | Community protection |
| `moderation.blacksky.app` | `banner` | Cross-group safety |
| `arttheft.bsky.social` | `banner` | Anti-plagiarism |
| `xblock.aendra.dev` | `silent` | Informational (Twitter screenshots) |
| `sonasky.app` | `silent` | Community cultural (furry) |
| `bskyttrpg.bsky.social` | `silent` | Entertainment (TTRPG) |
| `creatorlabeler.bsky.social` | `silent` | Informational (creator identity) |

---

## Known Issues (v0.14.1)

### ✅ Fixed: moderationDecision Applied to Posts (2026-05-24)

**Problem**: `PostCard` accepts a `moderationDecision` prop, but zero callers passed it.

**Solution**: Created `useModerationBatch` React hook and integrated into all PWA list components:

| Component | Status |
|-----------|--------|
| `FeedTimeline.tsx` | ✅ Integrated |
| `BookmarkPage.tsx` | ✅ Integrated |
| `ProfilePage.tsx` | ✅ Integrated |
| `SearchPage.tsx` | ✅ Integrated |
| `ListDetailPage.tsx` | ✅ Integrated |
| `ThreadView.tsx` | ✅ Integrated (replyLines only) |

**Implementation**:
```typescript
const { config } = useModerationConfig();
const { decisions } = useModerationBatch(posts, config, client);

// In render:
<PostCard
  post={post}
  moderationDecision={decisions.get(post.uri) ?? null}
/>
```

**Note**: ThreadView's `focused` post (root/current) uses inline rendering, not `PostCard`. Moderation overlay for the focused post is not yet applied.

### ✅ Fixed: Blob-Level Labels Ignored (2026-05-27)

**Problem**: `useModerationBatch` was exported from `useModeration.ts` (no blob support) instead of `useModerationPipeline.ts` (has blob support). All list components silently ignored media-level labels.

**Solution**: Changed export in `packages/app/src/index.ts` to use the blob-aware implementation from `useModerationPipeline.ts`.

**Impact**: Media blur now works correctly for blob-level labels (e.g., on individual images).

### ✅ Fixed: O(n) Full Re-computation on Pagination (2026-05-27)

**Problem**: `useModerationBatch` re-ran full resolution for all posts on every `loadMore`, causing O(n) computation where n = total posts loaded.

**Solution**: Added incremental resolution — only new posts are resolved, existing decisions are preserved. Full re-computation only occurs when `config` or `client` changes.

### ✅ Fixed: Virtual List Height Cache Drift (2026-05-27)

**Problem**: When a hidden post (rendered as compact banner) was revealed, the virtual list still allocated the old small height, causing content overlap and scroll drift.

**Solution**: `useVirtualizedList` now accepts optional `decisions` parameter. When moderation decisions change (contentAction/mediaAction), the hook clears cached heights for affected URIs and triggers re-measurement.

### ✅ Fixed: TUI Moderation Lacked API Integration (2026-05-27)

**Problem**: `UnifiedThreadView` only used labels already embedded in posts, passing empty Maps for labeler policies and names.

**Solution**: TUI now fetches moderation decisions asynchronously via `resolveModerationBatch` API, matching PWA behavior.

### Fixed Issues

- **SettingsPage scroll**: `min-h-0` → `h-dvh md:h-[calc(100dvh-3rem)]` + `overflow-y-auto`
- **Labeler add silent success**: Added `feedback` state (success/error banner, auto-clear 3s)
- **Recommended filter**: Changed from displayName to handle matching via `subscribedHandles` Set
- **Table scroll interception**: `overflow-hidden` → `overflow-clip` on all moderation tables
- **Defunct labeler**: Removed `aegis.blue`, added 10 verified active labelers with real DIDs

## Future Work

- [x] TUI moderation UI implementation (SettingsView + report shortcut)
- [x] **List-level batch moderation application** (Fixed 2026-05-27 — blob-aware + incremental + cache invalidation)
- [x] Self-labeling in compose (PWA + TUI) ✅ v0.15.0
- [ ] AI tool: `check_post_labels`
- [ ] WebSocket subscription (`subscribeLabels`) for real-time updates
- [ ] Sync with Bluesky official preferences (`putPreferences`)
