# UI Hooks

UI hooks provide navigation, virtualized scrolling, scroll restoration, search history, and DM emoji configuration.

## useNavigation

**File**: `packages/app/src/hooks/useNavigation.ts`

```typescript
function useNavigation(): {
  currentView: AppView;
  canGoBack: boolean;
  goTo: (v: AppView) => void;
  goBack: () => void;
  goHome: () => void;
}
```

## useVirtualizedList

**File**: `packages/app/src/hooks/useVirtualizedList.ts`

```typescript
function useVirtualizedList<T>(
  items: T[],
  cacheKey: string,
  estimateHeight: number,
  getItemKey: (item: T) => string,
  options?: {
    overscan?: number;
    initialScrollTop?: number;
    onScrollTopChange?: (top: number) => void;
  }
): {
  scrollRef: React.RefObject<HTMLDivElement>;
  virtualizer: Virtualizer<HTMLDivElement, Element>;
  measureAndCache: (el: HTMLDivElement | null, item: T) => void;
}
```

Wraps `@tanstack/react-virtual`. Global `_globalHeightCaches` persists measured heights across remounts. Scroll restoration uses **pixel values** (`scrollToOffset`) not indices. Used by FeedTimeline, BookmarkPage, NotifsPage, ProfilePage, ListsPage, ListDetailPage.

## useScrollRestore

**File**: `packages/app/src/hooks/useScrollRestore.ts`

```typescript
export function saveScrollTop(key: string, value: number): void;
export function getScrollTop(key: string): number | undefined;

function useScrollRestore(
  key: string | undefined,
  scrollRef: React.RefObject<HTMLDivElement> | any,
  ready: boolean
): void;
```

Module-level `_scrollTops` Map caches scroll positions. Restores on mount when `ready=true`, saves on unmount. Supports both container ref scroll and global `window.scrollY`.

## useSearchHistory

**File**: `packages/app/src/hooks/useSearchHistory.ts`

```typescript
export type SearchTab = 'top' | 'latest' | 'users' | 'feeds';

export function addToHistory(tab: SearchTab, query: string): void;
export function removeFromHistory(tab: SearchTab, query: string): void;
export function clearHistory(tab?: SearchTab): void;
export function getHistory(tab: SearchTab): string[];

function useSearchHistory(tab: SearchTab): {
  history: string[];
  add: (query: string) => void;
  remove: (query: string) => void;
  clear: () => void;
}
```

Per-tab search history persisted in `localStorage` (`bsky_search_history`). Max 10 items per tab. Module-level `_listeners` Set enables cross-component sync.

## useDmEmojiConfig

**File**: `packages/app/src/hooks/useDmEmojiConfig.ts`

```typescript
export interface EmojiItem {
  key: string;
  emoji: string;
  hasVariants: boolean;
  variants: string[];
}

export function getDmEmojiConfig(): string[];
export function saveDmEmojiConfig(emojis: string[]): void;
export async function fetchAllEmojis(): Promise<EmojiItem[]>;
```

Persistent emoji configuration for DM reactions. Reads/writes `localStorage` key `bsky_dm_emoji`. `fetchAllEmojis` fetches `/emoji.txt`, groups by skin tone variants.
