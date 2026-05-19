# Timeline Hooks

Timeline hooks handle feed fetching, post detail views, and thread rendering.

## useTimeline

**File**: `packages/app/src/hooks/useTimeline.ts`

```typescript
function useTimeline(
  client: BskyClient | null,
  feedUri?: string
): {
  posts: PostView[];
  loading: boolean;
  cursor?: string;
  error: string | null;
  loadMore: (() => void) | undefined;
  refresh: (() => void) | undefined;
}
```

Tracks `lastGoodFeed` internally so `feedUri = undefined` does not reset posts.

## usePostDetail

**File**: `packages/app/src/hooks/usePostDetail.ts`

```typescript
function usePostDetail(
  client: BskyClient | null,
  uri: string | undefined,
  goTo: (v: AppView) => void,
  aiKey: string,
  aiBaseUrl: string,
  targetLang?: string   // default 'zh'
): {
  post: PostView | null;
  flatThread: string;
  loading: boolean;
  error: string | null;
  translations: Map<string, string>;
  translate: (text: string) => Promise<string>;
  actions: PostDetailActions;  // { like, repost, reply, translate, openAI, viewThread }
}
```

## useThread

**File**: `packages/app/src/hooks/useThread.ts`

```typescript
function useThread(
  client: BskyClient | null,
  uri: string | undefined
): {
  flatLines: FlatLine[];
  loading: boolean;
  error: string | null;
  focusedIndex: number;
  focused: FlatLine | undefined;
  themeUri: string | undefined;
  threadgate?: { rules: ThreadgateRule[]; listInfo?: Array<{ uri: string; name: string }> };
  expandReplies: () => void;
  likePost: (uri: string) => Promise<void>;
  repostPost: (uri: string) => Promise<boolean>;
  isLiked: (uri: string) => boolean;
  isReposted: (uri: string) => boolean;
  getPostView: (uri: string) => PostView | undefined;
}

interface FlatLine {
  depth: number;
  uri: string;
  cid: string;
  rkey: string;
  text: string;
  handle: string;
  displayName: string;
  authorAvatar?: string;
  hasReplies: boolean;
  imageDetails: Array<{ url: string; alt: string }>;
  externalLink: { uri: string; title: string; description: string } | null;
  hasVideo: boolean;
  videoThumbnailUrl?: string;
  videoPlaylistUrl?: string;
  videoAlt?: string;
  videoAspectRatio?: { width: number; height: number };
  quotedPost?: {
    uri: string; cid: string; text: string; handle: string; displayName: string;
    authorAvatar?: string; imageDetails: Array<{ url: string; alt: string }>;
    externalLink: { uri: string; title: string; description: string } | null;
  };
  isRoot: boolean;
  isTruncation: boolean;
  likeCount: number;
  repostCount: number;
  replyCount: number;
  indexedAt: string;
  threadgate?: { rules: ThreadgateRule[]; listInfo?: Array<{ uri: string; name: string }> };
}
```
