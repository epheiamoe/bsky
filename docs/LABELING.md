# Labeling / Moderation System

> Architecture documentation for v0.15.0 Bluesky labeling system.
> Last updated: 2026-05-24

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

[TODO: v0.15.0] TUI moderation settings in `,` quick config, post rendering with text-based badges/warnings, report shortcut in thread view.

## Key Files

| File | Purpose |
|------|---------|
| `packages/core/src/moderation.ts` | Decision engine, DEFAULT_MODERATION_CONFIG |
| `packages/core/src/moderation-cache.ts` | LabelCache with batching + TTL |
| `packages/core/src/at/client.ts` | BskyClient API methods |
| `packages/core/src/at/types.ts` | Label, LabelerView, etc. types |
| `packages/app/src/hooks/useModeration.ts` | React hook for moderation decisions |
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

## Future Work

- [ ] TUI moderation UI implementation
- [ ] Self-labeling in compose (PWA + TUI)
- [ ] AI tool: `check_post_labels`
- [ ] WebSocket subscription (`subscribeLabels`) for real-time updates
- [ ] Sync with Bluesky official preferences (`putPreferences`)
