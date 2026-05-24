# Labeling System — v0.15.0 Implementation Notes

> **Context**: Post-implementation fix for empty UI pages.
> **Date**: 2026-05-24
> **Status**: In progress

## Root Cause of Empty Pages

### Settings Page (审核 tab) and Welcome Step 5 show blank

**Problem**: `SettingsPage` and `WelcomeCard` both use conditional rendering:
```tsx
{moderationConfig && onModerationConfigChange && (
  <ModerationSettingsTab ... />
)}
```

But `App.tsx` **never passes these props**:
- `App.tsx:296` — `WelcomeCard` only receives `config`, `onConfigChange`, `onGoToSettings`, `onSkip`
- `App.tsx:SettingsPage` — likely same issue (need to verify)

**Secondary problem**: `DEFAULT_MODERATION_CONFIG.labelers = []`
Even if props were passed, the built-in official labeler (@moderation.bsky.app) was not included in the default config.

## Design Decisions (User-Confirmed)

### 1. Built-in Labeler Policy
- **Official** (@moderation.bsky.app) — **auto-subscribed** on first load (DID known: `did:plc:ar7c4by46qjdydhdevvrndac`)
- **Third-party** — listed in "Recommended" section; user clicks "Add" to subscribe
- Third-party configs stored in **data file** (`packages/app/src/data/default-labelers.ts`), not hardcoded in logic

### 2. Display Format
- Show **handle** as primary identifier (e.g., `@moderation.bsky.app`)
- Show **description** below handle for built-in providers
- For custom-added providers, show DID if display name unavailable

### 3. API Failure Handling
- Display error message: "无法获取标签列表"
- Provide **Reload** button to retry fetching label definitions
- Do not block the entire settings page — show what we have

### 4. Label Definitions
- **Never hardcode** label values (porn/sexual/nudity/graphic-media)
- Always fetch dynamically via `app.bsky.labeler.getServices` + `app.bsky.labeler.service/self`
- Cache for 30 minutes (`useLabelerInfo` hook)

## Files to Modify

| File | Change |
|------|--------|
| `packages/app/src/data/default-labelers.ts` | **New** — Built-in provider config data |
| `packages/core/src/moderation.ts` | Add official labeler to DEFAULT_MODERATION_CONFIG |
| `packages/pwa/src/hooks/useModerationConfig.ts` | loadConfig() merges built-in labelers |
| `packages/pwa/src/components/ModerationSettingsTab.tsx` | Fix blank state, add error UI, show handle, add recommended section |
| `packages/pwa/src/App.tsx` | Import useModerationConfig, pass props to SettingsPage/WelcomeCard |
| `packages/pwa/src/components/SettingsPage.tsx` | Verify props are forwarded correctly |

## Built-in Labeler List

| Handle | Name | Auto-subscribe | DID Known |
|--------|------|----------------|-----------|
| @moderation.bsky.app | Bluesky Moderation Service | ✅ Yes | ✅ did:plc:ar7c4by46qjdydhdevvrndac |
| @skywatch.blue | Skywatch Blue | ⬜ No | ⬜ Unknown |
| @xblock.aendra.dev | XBlock | ⬜ No | ⬜ Unknown |
| @aegis.blue | Aegis | ⬜ No | ⬜ Unknown |

## Key Implementation Points

1. **Config merging order**: User saved config > Built-in auto-subscribed > Defaults
2. **Handle → DID resolution**: Only needed when adding third-party; use `client.resolveHandle()`
3. **Official labeler is immutable**: User can disable (`isActive=false`) but cannot remove
4. **Error boundary**: If `getLabelerServices` fails for official provider, show error + reload button, but still show the 4 standard labels (porn/sexual/nudity/graphic-media) since they are protocol-standard

## Post-Fix Verification

- [ ] Settings → 审核 tab shows content (not blank)
- [ ] Welcome Step 5 shows moderation preferences
- [ ] Official labeler (@moderation.bsky.app) appears by default
- [ ] Third-party labelers appear in "Recommended" section
- [ ] API error shows "无法获取标签列表" + reload button
- [ ] PWA deploys to staging successfully
