# Widget Hooks

Widget hooks manage the right sidebar widget system, module-level shared state, and social circle analysis.

## widgetRegistry

**File**: `packages/app/src/hooks/widgetRegistry.ts`

```typescript
export interface WidgetDefinition {
  id: string;
  titleKey: string;
  icon: string;
  views: string[];       // empty = all views
  defaultOpen: boolean;
  headerButtons?: React.ComponentType<{ goTo: (v: unknown) => void; onClose: () => void }>;
}

export interface WidgetProps {
  onClose: () => void;
  context?: WidgetContext;
}

export function registerWidget(
  def: WidgetDefinition,
  render: (props: WidgetProps) => ReactNode
): void;

export function getWidget(id: string): WidgetEntry | undefined;
export function getWidgets(): WidgetEntry[];
export function getWidgetsForView(viewType: string): WidgetEntry[];
```

## widgetStore

**File**: `packages/app/src/hooks/widgetStore.ts`

```typescript
export function initEnabledWidgets(ids: string[]): void;
export function getEnabledWidgetIds(): string[];
export function isWidgetEnabled(id: string): boolean;
export function enableWidget(id: string): void;
export function disableWidget(id: string): void;
export function toggleWidget(id: string): boolean;
export function getEnabledWidgetsForView(viewType: string): (WidgetDefinition & { enabled: boolean })[];

// AI Chat widget session bridge
export function initAIChatSession(): string;
export function getAIChatSessionId(): string;
export function setAIChatSessionId(id: string): void;
export function resetAIChatSession(): string;

// Widget toggle persistence callback
export function setWidgetToggleCallback(fn: ((id: string) => void) | null): void;

// Compose draft bridge (right sidebar widgets ↔ ComposePage)
export function setComposeDraftForWidgets(text: string): void;
export function getComposeDraftForWidgets(): string;
export function registerComposeDraftSetter(fn: ((text: string) => void) | null): void;
export function replaceComposeDraft(text: string): void;

// Focused profile bridge (ThreadView → ProfilePreviewWidget)
export function setFocusedProfileActor(actor: string | null): void;
export function getFocusedProfileActor(): string | null;
```

All `toggleWidget()` calls persist via `_onWidgetToggle` → `saveAppConfig()` (set up in PWA `Layout.tsx`).

## useActiveFeed

**File**: `packages/app/src/hooks/useActiveFeed.ts`

```typescript
export function getLastFeedUri(): string | null;
export function setLastFeedUri(uri: string | null): void;

function useActiveFeed(): {
  resolveFeed: (feedUri?: string | null) => string | undefined;
  recordFeed: (uri: string | undefined) => void;
  goHomeFeed: () => string | undefined;
}
```

Module-level ref (`_lastFeedUri`) survives component mounts. Resolution chain: explicit `feedUri` → `_lastFeedUri` → `getFeedConfig().defaultFeedUri` → `BUILTIN_FEEDS.following`.

## usePostActions

**File**: `packages/app/src/hooks/usePostActions.ts`

```typescript
// Module-level functions (no React needed)
export function isPostLiked(uri: string): boolean;
export function isPostReposted(uri: string): boolean;
export function getLikeCount(uri: string, staticCount: number): number;
export function getRepostCount(uri: string, staticCount: number): number;
export function seedPostViewer(post: any): void;
export function seedPostViewers(posts: any[]): void;
export async function likePost(client: BskyClient | null, postUri: string, cid?: string): Promise<void>;
export async function repostPost(client: BskyClient | null, postUri: string, cid?: string): Promise<void>;

// React hook for re-render on state change
function usePostActions(client: BskyClient | null): {
  isLiked: (uri: string) => boolean;
  isReposted: (uri: string) => boolean;
  likePost: (uri: string, cid?: string) => Promise<void>;
  repostPost: (uri: string, cid?: string) => Promise<void>;
  seedFromPosts: (posts: any[]) => void;
  seedFromPost: (post: any) => void;
}
```

Module-level Sets/Maps track like/repost state + optimistic count adjustments (`_likeCountAdj`, `_repostCountAdj`). `seedPostViewers` seeds initial state from API `viewer.like` / `viewer.repost` fields.

## useSocialCircle

**File**: `packages/app/src/hooks/useSocialCircle.ts`

```typescript
function useSocialCircle(client: BskyClient | null): {
  state: SocialCircleState;
  analyze: (options: SocialCircleOptions) => Promise<void>;
  reset: () => void;
}

export interface SocialCircleOptions {
  handle: string;
  maxPosts?: number;  // default 50
}

export interface SocialCircleState {
  status: 'idle' | 'loading' | 'done' | 'error';
  progress: { phase: 'identity' | 'posts' | 'interactions' | 'outgoing' | 'graph' | 'done'; current: number; total: number };
  result: SocialCircleResult | null;
  error: string | null;
}

export interface SocialCircleResult {
  summary: {
    totalInteractions: number;
    uniqueInteractors: number;
    mutualFollows: number;
    coreCircleCount: number;
    extendedCircleCount: number;
    postsAnalyzed: number;
  };
  core: InteractorInfo[];
  extended: InteractorInfo[];
  potential: InteractorInfo[];
  mermaidCode: string;
}

/** Pure function — reusable by AI tools */
export function generateSocialGraphMermaid(
  userHandle: string,
  core: InteractorInfo[],
  extended: InteractorInfo[],
  potential: InteractorInfo[]
): string;

/** Pure function — reusable by UI and AI tools */
export function buildSocialCircleShareText(result: SocialCircleResult, locale: string): string;

export const INTERACTION_WEIGHTS = { like: 1.5, repost: 2.0, reply: 3.0 } as const;
```

Analyzes Bluesky social interactions from public data, builds weighted interaction graph, classifies layers (core/extended/potential), generates Mermaid diagram. PWA only.
