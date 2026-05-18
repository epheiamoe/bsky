# Hooks Reference

All hooks live in `packages/app/src/hooks/`. They are React hooks that consume pure stores or module-level state.

## Hooks by Category

| Hook | Category | File |
|------|----------|------|
| `useAuth` | [Auth](./auth.md) | `packages/app/src/hooks/useAuth.ts` |
| `useTimeline` | [Timeline](./timeline.md) | `packages/app/src/hooks/useTimeline.ts` |
| `usePostDetail` | [Timeline](./timeline.md) | `packages/app/src/hooks/usePostDetail.ts` |
| `useThread` | [Timeline](./timeline.md) | `packages/app/src/hooks/useThread.ts` |
| `useCompose` | [Compose](./compose.md) | `packages/app/src/hooks/useCompose.ts` |
| `useDrafts` | [Compose](./compose.md) | `packages/app/src/hooks/useDrafts.ts` |
| `useAIChat` | [AI Chat](./ai-chat.md) | `packages/app/src/hooks/useAIChat.ts` |
| `useChatHistory` | [AI Chat](./ai-chat.md) | `packages/app/src/hooks/useChatHistory.ts` |
| `useTranslation` | [Translation](./translation.md) | `packages/app/src/hooks/useTranslation.ts` |
| `useI18n` | [Translation](./translation.md) | `packages/app/src/i18n/useI18n.ts` |
| `useProfile` | [Social](./social.md) | `packages/app/src/hooks/useProfile.ts` |
| `useSearch` | [Social](./social.md) | `packages/app/src/hooks/useSearch.ts` |
| `useNotifications` | [Social](./social.md) | `packages/app/src/hooks/useNotifications.ts` |
| `useBookmarks` | [Social](./social.md) | `packages/app/src/hooks/useBookmarks.ts` |
| `useConvoList` | [Messaging](./messaging.md) | `packages/app/src/hooks/useConvoList.ts` |
| `useChatMessages` | [Messaging](./messaging.md) | `packages/app/src/hooks/useChatMessages.ts` |
| `useLists` | [Lists](./lists.md) | `packages/app/src/hooks/useLists.ts` |
| `useListDetail` | [Lists](./lists.md) | `packages/app/src/hooks/useListDetail.ts` |
| `useNavigation` | [UI](./ui.md) | `packages/app/src/hooks/useNavigation.ts` |
| `useVirtualizedList` | [UI](./ui.md) | `packages/app/src/hooks/useVirtualizedList.ts` |
| `useScrollRestore` | [UI](./ui.md) | `packages/app/src/hooks/useScrollRestore.ts` |
| `useSearchHistory` | [UI](./ui.md) | `packages/app/src/hooks/useSearchHistory.ts` |
| `useDmEmojiConfig` | [UI](./ui.md) | `packages/app/src/hooks/useDmEmojiConfig.ts` |
| `widgetRegistry` | [Widgets](./widgets.md) | `packages/app/src/hooks/widgetRegistry.ts` |
| `widgetStore` | [Widgets](./widgets.md) | `packages/app/src/hooks/widgetStore.ts` |
| `useActiveFeed` | [Widgets](./widgets.md) | `packages/app/src/hooks/useActiveFeed.ts` |
| `usePostActions` | [Widgets](./widgets.md) | `packages/app/src/hooks/usePostActions.ts` |
| `useSocialCircle` | [Widgets](./widgets.md) | `packages/app/src/hooks/useSocialCircle.ts` |

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
