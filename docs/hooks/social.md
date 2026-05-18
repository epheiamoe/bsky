# Social Hooks

Social hooks handle user profiles, search, notifications, and bookmarks.

## useProfile

**File**: `packages/app/src/hooks/useProfile.ts`

```typescript
function useProfile(
  client: BskyClient | null,
  actor: string | undefined,
  initialTab?: 'posts' | 'replies'
): {
  profile: ProfileView | null;
  loading: boolean;
  error: string | null;
  tab: 'posts' | 'replies';
  setTab: (t: 'posts' | 'replies') => void;
  posts: PostView[];
  repostReasons: Record<string, string>;
  feedCursor?: string;
  feedLoading: boolean;
  loadMoreFeed: () => void;
  refreshFeed: () => Promise<void>;
  isFollowing: boolean;
  handleFollow: () => Promise<void>;
  handleUnfollow: () => Promise<void>;
  followList: 'follows' | 'followers' | null;
  followItems: FollowListItem[];
  followListCursor?: string;
  followListLoading: boolean;
  openFollowList: (type: 'follows' | 'followers') => Promise<void>;
  closeFollowList: () => void;
  loadMoreFollowList: () => Promise<void>;
}

interface FollowListItem {
  did: string;
  handle: string;
  displayName?: string;
  avatar?: string;
}
```

## useSearch

**File**: `packages/app/src/hooks/useSearch.ts`

```typescript
export type SearchTab = 'top' | 'latest' | 'users' | 'feeds';

function useSearch(
  client: BskyClient | null,
  initialTab?: SearchTab,
  initialQuery?: string
): {
  query: string;
  tab: SearchTab;
  posts: PostView[];
  users: ProfileViewBasic[];
  feeds: FeedGeneratorView[];
  loading: boolean;
  search: (q: string, tab: SearchTab) => Promise<void>;
  setTab: (t: SearchTab) => void;
}
```

## useNotifications

**File**: `packages/app/src/hooks/useNotifications.ts`

```typescript
function useNotifications(client: BskyClient | null): {
  notifications: Notification[];
  loading: boolean;
  unreadCount: number;
  error: string | null;
  refresh: () => Promise<void>;
}
```

## useBookmarks

**File**: `packages/app/src/hooks/useBookmarks.ts`

```typescript
function useBookmarks(client: BskyClient | null): {
  bookmarks: PostView[];
  loading: boolean;
  error: string | null;
  cursor?: string;
  isBookmarked: (uri: string) => boolean;
  addBookmark: (uri: string, cid: string) => Promise<void>;
  removeBookmark: (uri: string) => Promise<void>;
  toggleBookmark: (uri: string, cid: string) => Promise<void>;
  refresh: () => Promise<void>;
}
```

Bookmarks are loaded automatically on mount. `isBookmarked` is a synchronous `Set.has()` lookup. Stored server-side via `com.atproto.repo.createRecord` / `deleteRecord` with collection `app.bsky.graph.bookmark`.
