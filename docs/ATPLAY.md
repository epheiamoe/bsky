# AT Play — Experimental Features Playground

> AT Play is the experimental features lab within the Bluesky client. It follows the same architecture as the rest of the app: core → app → PWA, with TUI support planned for future.

## Architecture

```
packages/
  core/src/at/client.ts     — 2 new API methods (getActorLikes, getRelationships)
  core/src/at/types.ts      — Response types
  app/src/hooks/useSocialCircle.ts — Pure functions + React hook
  app/src/i18n/locales/*.ts — 36+ i18n keys
  pwa/src/components/AtPlayPage.tsx — Experiment list page (#/atplay)
  pwa/src/components/AtPlaySocialCircle.tsx — Social Circle analysis UI (#/atplay/social-circle)
  pwa/src/icons/flask-conical.svg — Sidebar icon
```

### Entry Points

| Route | Page | Purpose |
|-------|------|---------|
| `#/atplay` | `AtPlayPage` | Landing page listing all experiments |
| `#/atplay/social-circle` | `AtPlaySocialCircle` | Social Circle analysis detail |

### Navigation Flow

```
Sidebar (🧪 AT Play)  →  #/atplay (experiment list)  →  #/atplay/social-circle (analysis)
```

The landing page (`AtPlayPage`) shows a subtitle "基于 AT Protocol 的实验性功能" and a card list of experiments. Each card has an icon, name, description, and click-to-navigate.

## Adding a New Experiment

1. Add a route in `packages/pwa/src/hooks/useHashRouter.ts` (parseHash + encodeView)
2. Add AppView type in `packages/app/src/state/navigation.ts`
3. Add case in `packages/pwa/src/App.tsx` renderView switch
4. Create page component in `packages/pwa/src/components/`
5. Add i18n keys to all 3 locales
6. Register the experiment in `AtPlayPage.tsx` EXPERIMENTS array
7. Add API methods to `packages/core/src/at/client.ts` if needed

## Social Circle Analysis (v0.7.0)

### Data Pipeline

```
User enters handle
  ↓
resolveHandle → DID
  ↓
getFollows + getFollowers (build mutual set)
  ↓
getAuthorFeed(DID, N=30~100, filter=posts_no_replies)
  ↓
Filter out reposts (reason.$type !== reasonRepost)
  ↓
Filter to posts with likeCount>0 || repostCount>0
  ↓
For each: getLikes + getRepostedBy (limit 100)
  ↓
Aggregate actors → weighted graph (like=1.5, repost=2.0, reply=3.0)
  ↓
getRelationships(DID, [top 30 interactor DIDs]) → mutual detection
  ↓
Layer classification: core(top 5) / extended(next 10) / potential(mutual+low)
  ↓
generateSocialGraphMermaid() → Mermaid graph code
  ↓
Render: summary cards + layer tables + Mermaid diagram
```

### API Methods Used

| Method | Endpoint | Purpose |
|--------|----------|---------|
| `resolveHandle` | `com.atproto.identity.resolveHandle` | Handle → DID |
| `getProfile` | `app.bsky.actor.getProfile` | User info for display |
| `getAuthorFeed` | `app.bsky.feed.getAuthorFeed` | User's recent posts |
| `getFollows` | `app.bsky.graph.getFollows` | Who user follows |
| `getFollowers` | `app.bsky.graph.getFollowers` | Who follows user |
| `getLikes` | `app.bsky.feed.getLikes` | Who liked each post |
| `getRepostedBy` | `app.bsky.feed.getRepostedBy` | Who reposted each post |
| `getRelationships` | `app.bsky.graph.getRelationships` | Batch mutual check |
| `getActorLikes` | `app.bsky.feed.getActorLikes` | (Future) outgoing likes |

### hooks/useSocialCircle.ts

#### Pure Functions (no React)

These are exported for future AI tool use:

```typescript
export function generateSocialGraphMermaid(
  userHandle: string,
  core: InteractorInfo[],
  extended: InteractorInfo[],
  potential: InteractorInfo[],
): string
```
Returns a `graph TD` Mermaid code string with node styling.

```typescript
export function buildSocialCircleShareText(
  result: SocialCircleResult,
  locale: string,
): string
```
Returns a locale-aware share text (3 languages: zh/en/ja) with summary stats.

```typescript
export const INTERACTION_WEIGHTS = { like: 1.5, repost: 2.0, reply: 3.0 }
```
Weight constants for computing interaction strength.

#### Types

```typescript
interface SocialCircleOptions {
  handle: string;
  maxPosts?: number;  // default 50, range 30-100
}

interface SocialCircleResult {
  summary: { totalInteractions, uniqueInteractors, mutualFollows, coreCircleCount, extendedCircleCount, postsAnalyzed };
  core: InteractorInfo[];
  extended: InteractorInfo[];
  potential: InteractorInfo[];
  mermaidCode: string;
}

interface InteractorInfo {
  did: string; handle: string; displayName?: string; avatar?: string;
  totalWeight: number; likeCount: number; repostCount: number; replyCount: number;
  isMutual: boolean;
}

type SocialCircleProgress = { phase: 'identity'|'posts'|'interactions'|'graph'|'done'; current: number; total: number };
```

#### Hook

```typescript
function useSocialCircle(client: BskyClient | null): {
  state: SocialCircleState;   // { status, progress, result, error }
  analyze: (options: SocialCircleOptions) => Promise<void>;
  reset: () => void;
}
```

### PWA UI Components

#### AtPlaySocialCircle

**Layout**:
1. **Header**: Back button + "社交圈" title
2. **Input form**: Bluesky Handle input (pre-filled with logged-in user), Analyze button
3. **Options panel**: Collapsible with post count range slider (30-100)
4. **Progress bar**: Animated during analysis phases
5. **Results**:
   - Summary grid (6 stat cards in 3×2)
   - Core Circle (top 5 interactors with weight bars + mutual badges)
   - Extended Circle (next 10)
   - Potential Connections (mutual follows with low interaction)
   - Social Graph (Mermaid-rendered interactive diagram)
   - Data Source limitations note
   - Share to Bluesky button

**Key Implementation Details**:
- Mermaid rendering via `import('mermaid')` dynamic import (not bundled in main chunk)
- Unique render ID via `useRef` + module-level counter
- Three separate JSX branches for error / loading / rendered states
- Share to Bluesky uses `goTo({ type: 'compose', initialText: '...' })` — see Compose Pre-fill below

### Compose Pre-fill API (Reusable)

Any page can pre-fill the compose text box:

```typescript
goTo({ type: 'compose', initialText: 'Your pre-filled text here' })
```

Works by:
1. `AppView` compose type accepts `initialText?: string`
2. `ComposePage` detects `initialText` prop and calls `loadFromDraft()` on mount
3. Applied once (guarded by `initialTextAppliedRef`)
4. Does not affect `draftId` loading (skip if `draftId` is set)

**Future enhancements**: Add optional image/video pre-fill alongside text.

### Current Limitations

- **Only incoming interactions analyzed**: likes/reposts ON the user's posts. Outgoing (user's likes/resposts/replies) is NOT included.
- **Reply authors not resolved**: replyCount is counted but individual reply actors are not identified. See `[Debt: AtPlay]` in code.
- **30-post default window**: Set to 50 now, adjustable via slider (30-100). Higher values take longer but find more interactors.
- **No AI tools yet**: Pure computation only. `generateSocialGraphMermaid()` and `INTERACTION_WEIGHTS` are exported for future AI tool use.
- **PWA only**: No TUI implementation yet. AtPlay is a PWA-only feature.
- **Rendered Mermaid graph not included in share**: Currently text-only share. SVG image sharing pending.

### Mermaid Rendering (PWA)

- Library: `mermaid` (dynamic import, separate chunk)
- Config: `{ startOnLoad: false, theme: 'base', securityLevel: 'loose' }`
- Render ID: unique per mount (`sg-{counter}`) to avoid duplicate ID errors
- Output: inline SVG via `dangerouslySetInnerHTML`
- Error fallback: show raw mermaid code in `<pre>` block

### Share to Bluesky

The share button at the bottom of results generates locale-aware text:

```
我在 ai-bsky.pages.dev 分析了我的社交圈

📊 分析了 50 篇帖文
👥 发现 12 位互动者，5 位互关
💜 核心圈 5 人

ai-bsky.pages.dev
```

Clicking navigates to `{ type: 'compose', initialText: shareText }`.

## Future Plans

### v0.8.x — AI Integration
- Add `social_circle` AI tool using exported pure functions
- AI generates natural language insights from graph data
- `/atplay` context injection into AI Chat

### v0.9.x — Trending Inspiration
- Global Bluesky trends (`getTrends`)
- User's historical top posts (by engagement)
- AI content strategy analysis

### v1.x — Enhanced Analysis
- Outgoing interaction tracking (`getActorLikes`)
- Reply author resolution (`getPostThread`)
- Interactive graph (clickable nodes → profile)
- Export social circle as image/PDF
- TUI support
