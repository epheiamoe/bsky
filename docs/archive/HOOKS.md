# Hooks Reference

All hooks live in `packages/app/src/hooks/`. They are React hooks that consume pure stores or module-level state.

## Cross-Reference: Hooks by View

| Hook | PWA | TUI |
|------|:---:|:---:|
| `useAuth` | ✓ | ✓ |
| `useTimeline` | ✓ | ✓ |
| `usePostDetail` | ✓ | ✓ |
| `useNavigation` | ✓ | ✓ |
| `useThread` | ✓ | ✓ |
| `useCompose` | ✓ | ✓ |
| `useAIChat` | ✓ | ✓ |
| `useDrafts` | ✓ | ✓ |
| `useI18n` | ✓ | ✓ |
| `useChatHistory` | ✓ | ✓ |
| `useTranslation` | ✓ | — |
| `useProfile` | ✓ | ✓ |
| `useSearch` | ✓ | ✓ |
| `useNotifications` | ✓ | ✓ |
| `useBookmarks` | ✓ | ✓ |
| `useConvoList` | ✓ | ✓ |
| `useChatMessages` | ✓ | ✓ |
| `useSocialCircle` | ✓ | — |
| `useLists` | ✓ | ✓ |
| `useListDetail` | ✓ | ✓ |
| `useVirtualizedList` | ✓ | — |
| `useDmEmojiConfig` | ✓ | ✓ |
| `useActiveFeed` | ✓ | ✓ |
| `usePostActions` | ✓ | ✓ |
| `useScrollRestore` | ✓ | — |
| `useSearchHistory` | ✓ | — |
| `widgetRegistry` / `widgetStore` | ✓ | — |

## Hook → Store Mapping

| Hook | Store / State | Return Type |
|------|---------------|-------------|
| `useAuth` | `createAuthStore()` | `{ client, session, pdsUrl, profile, loading, error, errorLog, login, restoreSession }` |
| `useTimeline` | `createTimelineStore()` | `{ posts, loading, cursor, error, loadMore, refresh }` |
| `usePostDetail` | `createPostDetailStore()` | `{ post, flatThread, translate, actions, loading, error, translations }` |
| `useNavigation` | `createNavigation()` | `{ currentView, canGoBack, goTo, goBack, goHome }` |
| `useThread` | (inline state) | `{ flatLines, loading, error, focusedIndex, focused, themeUri, threadgate, likePost, repostPost, expandReplies, isLiked, isReposted, getPostView }` |
| `useCompose` | (inline state) | `{ posts, addPost, removePost, setPostText, submitting, error, replyTo, setReplyTo, quoteUri, setQuoteUri, threadgateRules, setThreadgateRules, submit, loadFromDraft, toDraftData }` |
| `useAIChat` | `AIAssistant` instance | `{ messages, loading, guidingQuestions, send, stop, addUserImage, chatId, pendingConfirmation, confirmAction, rejectAction, edit, editByIndex }` |
| `useDrafts` | `createDraftsStore(client)` | `{ drafts, loading, saving, saveDraft, deleteDraft, syncDraft, refreshDrafts, loadDraft }` |
| `useI18n` | Singleton store | `{ t, locale, setLocale, availableLocales, localeLabels }` |
| `useChatHistory` | `ChatStorage` | `{ conversations, loading, loadConversation, saveConversation, deleteConversation, refresh, storage }` |
| `useTranslation` | (inline cache) | `{ translate, loading, cache, lang, setLang, mode, setMode, LANG_LABELS }` |
| `useProfile` | (inline state) | `{ profile, loading, error, tab, setTab, posts, repostReasons, feedCursor, feedLoading, loadMoreFeed, refreshFeed, isFollowing, handleFollow, handleUnfollow, followList, followItems, followListCursor, followListLoading, openFollowList, closeFollowList, loadMoreFollowList }` |
| `useSearch` | (inline state) | `{ query, tab, posts, users, feeds, loading, search, setTab }` |
| `useNotifications` | (inline state) | `{ notifications, loading, unreadCount, error, refresh }` |
| `useBookmarks` | (inline state) | `{ bookmarks, loading, error, cursor, isBookmarked, addBookmark, removeBookmark, toggleBookmark, refresh }` |
| `useConvoList` | (inline state) | `{ convos, cursor, loading, error, load, refresh }` |
| `useChatMessages` | (inline state) | `{ messages, convo, loading, sending, error, cursor, loadConvo, loadOlder, sendMessage, toggleReaction, refresh, deleteMessage, markRead, muteConvo, unmuteConvo }` |
| `useSocialCircle` | (inline state) | `{ state: SocialCircleState, analyze, reset }` |
| `useLists` | (inline state + cache) | `{ lists, loading, error, createList, deleteList, updateListInfo, refresh }` |
| `useListDetail` | (inline state + cache) | `{ list, loading, error, members, membersCursor, loadMoreMembers, feed, feedCursor, loadMoreFeed, isMuted, toggleMute, addMember, removeMember, updateListInfo, deleteList, refresh }` |
| `useVirtualizedList` | `@tanstack/react-virtual` | `{ scrollRef, virtualizer, measureAndCache }` |
| `useDmEmojiConfig` | `localStorage` | `{ getDmEmojiConfig, saveDmEmojiConfig, fetchAllEmojis }` |
| `useActiveFeed` | Module-level ref | `{ resolveFeed, recordFeed, goHomeFeed }` |
| `usePostActions` | Module-level Sets/Maps | `{ isLiked, isReposted, likePost, repostPost, seedFromPosts, seedFromPost }` |
| `useScrollRestore` | Module-level Map | `{ saveScrollTop, getScrollTop }` + hook `useScrollRestore(key, ref, ready)` |
| `useSearchHistory` | `localStorage` | `{ history, add, remove, clear }` + module fns `addToHistory, removeFromHistory, clearHistory, getHistory` |
| `widgetRegistry` | Module-level Map | `registerWidget(def, render)`, `getWidget(id)`, `getWidgets()`, `getWidgetsForView(viewType)` |
| `widgetStore` | Module-level array/bridges | `initEnabledWidgets`, `getEnabledWidgetIds`, `isWidgetEnabled`, `enableWidget`, `disableWidget`, `toggleWidget`, `getEnabledWidgetsForView`, `initAIChatSession`, `getAIChatSessionId`, `setAIChatSessionId`, `resetAIChatSession`, `setWidgetToggleCallback`, `setComposeDraftForWidgets`, `getComposeDraftForWidgets`, `registerComposeDraftSetter`, `replaceComposeDraft`, `setFocusedProfileActor`, `getFocusedProfileActor` |

## Store Subscribe Pattern

```typescript
// Store (pure object, no React)
function createStore() {
  const store = {
    data: null,
    loading: false,
    listener: null as (() => void) | null,

    async load() {
      store.loading = true;
      store._notify();
      // ... async work ...
      store.loading = false;
      store._notify();
    },

    _notify() { if (store.listener) store.listener(); },
    subscribe(fn: () => void) {
      store.listener = fn;
      return () => { store.listener = null; };
    },
  };
  return store;
}

// React hook (wraps store)
function useStore() {
  const [store] = useState(() => createStore());
  const [, force] = useState(0);
  const tick = useCallback(() => force(n => n + 1), []);

  useEffect(() => store.subscribe(tick), [store, tick]);

  return { data: store.data, loading: store.loading };
}
```

**Note**: Single-listener model. Only one `useEffect(() => store.subscribe(tick))` per store instance. Multiple subscribers would overwrite each other.

---

## Key Hook Signatures

### useAuth

**File**: `packages/app/src/hooks/useAuth.ts`

```typescript
function useAuth(): {
  client: BskyClient | null;
  session: CreateSessionResponse | null;
  pdsUrl: string | null;
  profile: ProfileView | null;
  loading: boolean;
  error: string | null;
  errorLog: LoginErrorDetail | null;
  login: (handle: string, password: string, pdsUrl?: string) => Promise<void>;
  restoreSession: (session: CreateSessionResponse, pdsUrl: string) => void;
}
```

### useTimeline

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

### usePostDetail

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

### useNavigation

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

### useThread

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

### useCompose

**File**: `packages/app/src/hooks/useCompose.ts`

```typescript
function useCompose(
  client: BskyClient | null,
  goBack: () => void,
  onSuccess?: (uris?: string[]) => void
): {
  posts: ComposePostItem[];
  addPost: () => void;
  removePost: (id: string) => void;
  setPostText: (id: string, text: string) => void;
  submitting: boolean;
  error: string | null;
  replyTo: string | undefined;
  setReplyTo: (uri: string | undefined) => void;
  quoteUri: string | undefined;
  setQuoteUri: (uri: string | undefined) => void;
  threadgateRules: ThreadgateRule[] | null | undefined;
  setThreadgateRules: (rules: ThreadgateRule[] | null | undefined) => void;
  submit: (mediaMap?: Map<string, ComposeMedia[]>, quoteMap?: Map<string, string>) => Promise<void>;
  loadFromDraft: (draftPosts: { text: string }[], draftReplyTo?: string, draftQuoteUri?: string) => void;
  toDraftData: () => { posts: { text: string }[]; replyTo?: string; quoteUri?: string };
}

interface ComposePostItem { id: string; text: string; }
interface ComposeMedia {
  type: 'image' | 'video';
  blobRef: { $link: string; mimeType: string; size: number };
  alt: string;
}
```

### useAIChat

**File**: `packages/app/src/hooks/useAIChat.ts`

```typescript
function useAIChat(
  client: BskyClient | null,
  aiConfig: AIConfig,
  contextUri?: string,
  options?: {
    chatId?: string;
    storage?: ChatStorage;
    stream?: boolean;
    userHandle?: string;
    userDisplayName?: string;
    environment?: 'tui' | 'pwa';
    locale?: string;
    contextPost?: string;
    contextProfile?: string;
    onChatSaved?: () => void;
  }
): {
  messages: AIChatMessage[];
  loading: boolean;
  guidingQuestions: string[];
  send: (text: string) => Promise<void>;
  stop: () => void;
  addUserImage: (data: Uint8Array, mimeType: string, alt: string) => number;
  chatId: string;
  pendingConfirmation: { toolName: string; description: string } | null;
  confirmAction: () => void;
  rejectAction: () => void;
  edit: () => string | null;
  editByIndex: (n: number) => string | null;
}
```

### useDrafts

**File**: `packages/app/src/hooks/useDrafts.ts`

```typescript
function useDrafts(client: BskyClient | null): {
  drafts: AppDraft[];
  loading: boolean;
  saving: boolean;
  saveDraft: (data: { posts: { text: string }[]; replyTo?: string; quoteUri?: string }, draftId?: string) => Promise<string>;
  deleteDraft: (id: string) => Promise<void>;
  syncDraft: (id: string) => Promise<void>;
  refreshDrafts: () => Promise<void>;
  loadDraft: (id: string) => AppDraft | undefined;
}

interface AppDraft {
  id: string;
  serverId?: string;
  posts: { text: string }[];
  replyTo?: string;
  quoteUri?: string;
  createdAt: string;
  updatedAt: string;
  syncStatus: 'local' | 'synced';
}
```

Uses module-level `_clientRef` to avoid stale closures. PDS-first sync with local fallback.

### useI18n

**File**: `packages/app/src/i18n/useI18n.ts`

```typescript
function useI18n(initialLocale?: Locale): {
  t: (key: string, params?: Record<string, string | number>) => string;
  locale: Locale;
  setLocale: (l: Locale) => void;
  availableLocales: Locale[];
  localeLabels: Record<Locale, string>;
}
```

### useChatHistory

**File**: `packages/app/src/hooks/useChatHistory.ts`

```typescript
function useChatHistory(storage?: ChatStorage): {
  conversations: ChatSummary[];
  loading: boolean;
  loadConversation: (id: string) => Promise<ChatRecord | null>;
  saveConversation: (chat: ChatRecord) => Promise<void>;
  deleteConversation: (id: string) => Promise<void>;
  refresh: () => Promise<void>;
  storage: ChatStorage;
}
```

### useTranslation

**File**: `packages/app/src/hooks/useTranslation.ts`

```typescript
type TargetLang = 'zh' | 'en' | 'ja' | 'ko' | 'fr' | 'de' | 'es';

export const LANG_LABELS: Record<TargetLang, string> = {
  zh: '中文', en: 'English', ja: '日本語', ko: '한국어', fr: 'Français', de: 'Deutsch', es: 'Español',
};

export interface TranslationResult {
  translated: string;
  sourceLang?: string;
}

function useTranslation(
  aiKey: string,
  aiBaseUrl: string,
  aiModel?: string,           // default 'deepseek-v4-flash'
  targetLang?: TargetLang,    // default 'zh'
  initialMode?: 'simple' | 'json'  // default 'simple'
): {
  translate: (text: string, overrideLang?: TargetLang) => Promise<TranslationResult>;
  loading: boolean;
  cache: Map<string, TranslationResult>;
  lang: TargetLang;
  setLang: (l: TargetLang) => void;
  mode: 'simple' | 'json';
  setMode: (m: 'simple' | 'json') => void;
  LANG_LABELS: Record<TargetLang, string>;
}
```

**Dual-mode behavior**: `simple` mode returns plain translated text. `json` mode uses `response_format: "json_object"` and returns `{translated, source_lang}` with automatic source language detection.

**Retry logic** (in `translateText()` at core level): Up to 3 retries with exponential backoff (800ms base) on empty content, missing `translated` field, or JSON parse failures.

### useProfile

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

### useSearch

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

### useNotifications

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

### useBookmarks

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

### useConvoList

**File**: `packages/app/src/hooks/useConvoList.ts`

```typescript
function useConvoList(client: BskyClient | null): {
  convos: ConvoView[];
  cursor?: string;
  loading: boolean;
  error: string | null;
  load: (reset?: boolean) => Promise<void>;
  refresh: () => Promise<void>;
}

/** Optimistically clear unread badge after markRead */
export function markConvoRead(convoId: string): void;
```

Calls `client.listConvos()` via `chatKy` (→ `api.bsky.chat/xrpc`). Supports cursor-based pagination. 30s silent polling interval.

### useChatMessages

**File**: `packages/app/src/hooks/useChatMessages.ts`

```typescript
function useChatMessages(client: BskyClient | null): {
  messages: AnyChatMessage[];
  convo: ConvoView | null;
  loading: boolean;
  sending: boolean;
  error: string | null;
  cursor?: string;
  loadConvo: (conversationId: string, reset?: boolean) => Promise<void>;
  loadOlder: () => Promise<void>;
  sendMessage: (text: string, embed?: MessageInput['embed']) => Promise<void>;
  toggleReaction: (messageId: string, value: string, isPresent: boolean) => Promise<void>;
  refresh: () => Promise<void>;
  deleteMessage: (messageId: string) => Promise<void>;
  markRead: () => Promise<void>;
  muteConvo: () => Promise<void>;
  unmuteConvo: () => Promise<void>;
}

export function parsePostUri(text: string): {
  uri: string; did?: string; rkey?: string; handle?: string;
} | null
```

`loadConvo` calls `getConvoForMembers([did])` + `getMessages(convoId)`. `loadOlder` paginates via cursor. 10s silent polling for new messages.

`parsePostUri` detects three formats:
- `at://did:plc:xxx/app.bsky.feed.post/rkey`
- `at://handle/app.bsky.feed.post/rkey`
- `https://bsky.app/profile/handle/post/rkey`

### useSocialCircle

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

### useLists

**File**: `packages/app/src/hooks/useLists.ts`

```typescript
function useLists(
  client: BskyClient | null,
  actor?: string  // undefined = self
): {
  lists: ListView[];
  loading: boolean;
  error: string | null;
  createList: (name: string, purpose: ListPurpose, description?: string) => Promise<ListView | null>;
  deleteList: (uri: string) => Promise<void>;
  updateListInfo: (uri: string, params: { name?: string; description?: string }) => Promise<void>;
  refresh: () => Promise<void>;
}
```

Uses `readCache`/`writeCache` for local persistence. Auto-retry once on failure.

### useListDetail

**File**: `packages/app/src/hooks/useListDetail.ts`

```typescript
function useListDetail(
  client: BskyClient | null,
  listUri: string
): {
  list: ListView | null;
  loading: boolean;
  error: string | null;
  members: ListItemView[];
  membersCursor?: string;
  loadMoreMembers: () => Promise<void>;
  feed: PostView[];
  feedCursor?: string;
  loadMoreFeed: () => Promise<void>;
  isMuted: boolean;
  toggleMute: () => Promise<void>;
  addMember: (subjectDid: string) => Promise<void>;
  removeMember: (itemUri: string) => Promise<void>;
  updateListInfo: (params: { name?: string; description?: string }) => Promise<void>;
  deleteList: () => Promise<void>;
  refresh: () => Promise<void>;
}
```

Parallel loads list info + feed on mount. Posts/Members tabs in PWA both consume this hook.

### useVirtualizedList

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

### useDmEmojiConfig

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

### useActiveFeed

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

### usePostActions

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

### useScrollRestore

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

### useSearchHistory

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

---

## Widget System

### widgetRegistry

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

### widgetStore

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

---

## Module-Level Utilities

Non-hook utilities exported from files in `packages/app/src/hooks/` and `packages/app/src/utils/`.

### Embed Extraction

**File**: `packages/app/src/utils/extractEmbeds.ts`

```typescript
export interface ExtractImage { url: string; alt: string; }
export interface ExtractExternalLink { uri: string; title: string; description: string; }
export interface ExtractVideo { thumbnailUrl: string; playlistUrl: string; alt: string; aspectRatio?: { width: number; height: number }; }
export interface ExtractQuotedPost { uri: string; cid: string; text: string; handle: string; displayName: string; authorAvatar?: string; imageDetails: ExtractImage[]; externalLink: ExtractExternalLink | null; }

export function extractImages(post: PostView): ExtractImage[];
export function extractVideo(post: PostView): ExtractVideo | null;
export function extractExternalLink(post: PostView): ExtractExternalLink | null;
export function extractQuotedPost(post: PostView): ExtractQuotedPost | null;
export function extractHasGif(post: PostView): boolean;
export function extractEmbeds(post: PostView): { images: ExtractImage[]; video: ExtractVideo | null; external: ExtractExternalLink | null; hasGif: boolean };
```

**Critical**: `extractQuotedPost` reads from `(post as any).embed` (API-resolved `#view`), NEVER `post.record.embed`. All consumers must call these shared functions — no inline extraction.

### AI Tool Result Formatting

**File**: `packages/pwa/src/components/ai/formatToolResult.ts`

```typescript
export interface ToolResultDisplay {
  summary: string;
  body: string;
}

export function formatToolResult(toolName: string, content: string): ToolResultDisplay;
```

Human-readable formatting for 33 AI tools. Returns `{ summary, body }` used by `ToolCard`. Handles `create_post`, `like`, `repost`, `follow`, `resolve_handle`, `get_profile`, `get_record`, `search_posts`, `search_actors`, `get_timeline`, `get_author_feed`, `get_feed`, `get_lists`, `get_list_feed`, `edit_list_members`, `get_post_thread`, `get_post_context`, `get_connections`, `list_records`, `view_image`, `download_image`, `extract_images_from_post`, `extract_external_link`, `search_wikipedia`, `search_web_ddg`, `fetch_web_markdown`, and fallback.

### Post Actions (Module-Level)

**File**: `packages/app/src/hooks/usePostActions.ts`

```typescript
export function isPostLiked(uri: string): boolean;
export function isPostReposted(uri: string): boolean;
export function getLikeCount(uri: string, staticCount: number): number;
export function getRepostCount(uri: string, staticCount: number): number;
export function seedPostViewer(post: any): void;
export function seedPostViewers(posts: any[]): void;
export async function likePost(client: BskyClient | null, postUri: string, cid?: string): Promise<void>;
export async function repostPost(client: BskyClient | null, postUri: string, cid?: string): Promise<void>;
```

These functions are plain JS (no React) and can be imported anywhere for imperative use.
