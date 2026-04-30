# Hooks Reference

All hooks live in `packages/app/src/hooks/`. They are React hooks that consume pure stores.

## Hook → Store Mapping

| Hook | Store | Return Type |
|------|-------|-------------|
| `useAuth` | `createAuthStore()` | `{ client, session, profile, loading, login }` |
| `useTimeline` | `createTimelineStore()` | `{ posts, loading, cursor, loadMore, refresh }` |
| `usePostDetail` | `createPostDetailStore()` | `{ post, flatThread, translate, actions }` |
| `useNavigation` | `createNavigation()` | `{ currentView, canGoBack, goTo, goBack, goHome }` |
| `useThread` | (inline state) | `{ flatLines, loading, error, focusedIndex, focused, themeUri, likePost, repostPost, expandReplies }` |
| `useCompose` | (inline state) | `{ draft, setDraft, submitting, error, replyTo, setReplyTo, quoteUri, setQuoteUri, submit }` |
| `useAIChat` | `AIAssistant` instance | `{ messages, loading, guidingQuestions, send, chatId, pendingConfirmation, confirmAction, rejectAction, undoLastMessage, retry }` |
| `useDrafts` | `createDraftsStore()` | `{ drafts, saveDraft, deleteDraft, loadDraft }` |
| `useI18n` | Singleton store | `{ t, locale, setLocale, availableLocales, localeLabels }` |
| `useChatHistory` | `FileChatStorage` | `{ conversations, loadConversation, saveConversation, deleteConversation }` |
| `useTranslation` | (inline cache) | `{ translate, loading, cache, lang, setLang, mode, setMode, LANG_LABELS }` |
| `useProfile` | (inline state) | `{ profile, follows, followers, loading }` |
| `useSearch` | (inline state) | `{ query, results, loading, search }` |
| `useNotifications` | (inline state) | `{ notifications, loading, unreadCount, refresh }` |
| `useBookmarks` | (inline state) | `{ bookmarks, loading, isBookmarked, addBookmark, removeBookmark, toggleBookmark, refresh }` |

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

## Key Hook Signatures

### useAIChat (with storage + streaming)

```typescript
function useAIChat(
  client: BskyClient | null,
  aiConfig: AIConfig,
  contextUri?: string,
  options?: {
    chatId?: string;        // Load existing conversation
    storage?: ChatStorage;  // Auto-save after each send
    stream?: boolean;       // Enable per-token streaming (default: false for TUI)
  }
): {
  messages: AIChatMessage[];   // Includes tool_call, tool_result, and assistant roles
  loading: boolean;
  guidingQuestions: string[];
  send: (text: string) => Promise<void>;
  chatId: string;
}
```

When `stream: true`, the hook uses `assistant.sendMessageStreaming()` which yields `StreamEvent`
objects (`token | tool_call | tool_result | done`). Tokens are accumulated into the last assistant
message in real time. The non-streaming path (`stream: false`, default) uses `assistant.sendMessage()`
which returns intermediate steps + final content in one response.

### useThread

```typescript
function useThread(
  client: BskyClient | null,
  uri: string | undefined
): {
  flatLines: FlatLine[];    // All posts in thread as flat list with depth, uri, text, etc.
  loading: boolean;
  focusedIndex: number;     // Current cursor position (0-based)
  focused: FlatLine | undefined;
  themeUri: string | undefined;
  up: () => void;
  down: () => void;
  focus: (uri: string) => void;
  likePost: (uri: string) => Promise<void>;
  repostPost: (uri: string) => Promise<boolean>;
  isLiked: (uri: string) => boolean;
  isReposted: (uri: string) => boolean;
}

interface FlatLine {
  depth: number;        // -N for parents, 0 for root, +N for replies
  uri: string;
  cid: string;
  rkey: string;
  text: string;
  handle: string;
  displayName: string;
  authorAvatar?: string;  // CDN URL for author avatar
  hasReplies: boolean;
  mediaTags: string[];    // E.g. ['🖼 图片', '🔗 链接', '📌 引用']
  imageUrls: string[];    // CDN URLs for embedded images
  externalLink: { uri: string; title: string; description: string } | null;
  isRoot: boolean;
  likeCount: number;
  repostCount: number;
  replyCount: number;
  indexedAt: string;
}
```

### usePostDetail

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
  flatThread: string;   // Raw flat thread text (use formatThreadPreview to display)
  loading: boolean;
  translations: Map<string, string>;
  translate: (text: string) => Promise<string>;
  actions: PostDetailActions;  // { like, repost, reply, translate, openAI, viewThread }
}
```

### useTranslation

```typescript
type TargetLang = 'zh' | 'en' | 'ja' | 'ko' | 'fr' | 'de' | 'es';

export const LANG_LABELS: Record<TargetLang, string> = {
  zh: '中文', en: 'English', ja: '日本語', ko: '한국어', fr: 'Français', de: 'Deutsch', es: 'Español',
};

export interface TranslationResult {
  translated: string;
  sourceLang?: string;   // ISO 639-1 code (or 'und'); only populated in 'json' mode
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
  cache: Map<string, TranslationResult>;  // Keyed by "mode::lang::text"
  lang: TargetLang;
  setLang: (l: TargetLang) => void;
  mode: 'simple' | 'json';
  setMode: (m: 'simple' | 'json') => void;
  LANG_LABELS: Record<TargetLang, string>;
}
```

**Dual-mode behavior**: `simple` mode returns plain translated text. `json` mode uses
`response_format: "json_object"` and returns `{translated, source_lang}` with automatic
source language detection.

**Retry logic** (in `translateText()` at core level): Up to 3 retries with exponential
backoff (800ms base) on empty content, missing `translated` field, or JSON parse failures.

### useBookmarks

```typescript
function useBookmarks(
  client: BskyClient | null
): {
  bookmarks: PostView[];
  loading: boolean;
  isBookmarked: (uri: string) => boolean;
  addBookmark: (uri: string, cid: string) => Promise<void>;
  removeBookmark: (uri: string) => Promise<void>;
  toggleBookmark: (uri: string, cid: string) => Promise<void>;
  refresh: () => Promise<void>;
}
```

Bookmarks are loaded automatically on mount via `useEffect`. The `isBookmarked` check is
a synchronous `Set.has()` lookup (no network request). `toggleBookmark` adds or removes in
one call. Bookmarks are stored server-side via `com.atproto.repo.createRecord` /
`com.atproto.repo.deleteRecord` with collection `app.bsky.graph.bookmark`.
