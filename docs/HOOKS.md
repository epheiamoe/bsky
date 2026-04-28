# Hooks Reference

All hooks live in `packages/app/src/hooks/`. They are React hooks that consume pure stores.

## Hook → Store Mapping

| Hook | Store | Return Type |
|------|-------|-------------|
| `useAuth` | `createAuthStore()` | `{ client, session, profile, loading, login }` |
| `useTimeline` | `createTimelineStore()` | `{ posts, loading, cursor, loadMore, refresh }` |
| `usePostDetail` | `createPostDetailStore()` | `{ post, flatThread, translate, actions }` |
| `useNavigation` | `createNavigation()` | `{ currentView, canGoBack, goTo, goBack, goHome }` |
| `useThread` | (inline state) | `{ flatLines, focusedIndex, up, down, focus, replyToFocused }` |
| `useCompose` | (inline state) | `{ draft, setDraft, submitting, submit }` |
| `useAIChat` | `AIAssistant` instance | `{ messages, loading, guidingQuestions, send, chatId }` |
| `useChatHistory` | `FileChatStorage` | `{ conversations, loadConversation, saveConversation, deleteConversation }` |
| `useTranslation` | (inline cache) | `{ translate, loading, cache, lang, setLang }` |
| `useProfile` | (inline state) | `{ profile, follows, followers, loading }` |
| `useSearch` | (inline state) | `{ query, results, loading, search }` |
| `useNotifications` | (inline state) | `{ notifications, loading, unreadCount, refresh }` |

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

### useAIChat (with storage)

```typescript
function useAIChat(
  client: BskyClient | null,
  aiConfig: AIConfig,
  contextUri?: string,
  options?: {
    chatId?: string;        // Load existing conversation
    storage?: ChatStorage;  // Auto-save after each send
  }
): {
  messages: AIChatMessage[];   // Includes tool_call and tool_result roles
  loading: boolean;
  guidingQuestions: string[];
  send: (text: string) => Promise<void>;
  chatId: string;
}
```

### useThread

```typescript
function useThread(
  client: BskyClient | null,
  uri: string | undefined,
  goTo: (v: AppView) => void
): {
  flatLines: FlatLine[];    // All posts in thread as flat list with depth, uri, text, etc.
  loading: boolean;
  focusedIndex: number;     // Current cursor position (0-based)
  up: () => void;
  down: () => void;
  focus: (uri: string) => void;          // goTo detail with new uri
  replyToFocused: () => void;            // goTo compose with focused uri
}

interface FlatLine {
  depth: number;        // -N for parents, 0 for root, +N for replies
  uri: string;
  rkey: string;
  text: string;
  handle: string;
  displayName: string;
  hasReplies: boolean;
  mediaTags: string[];
  isRoot: boolean;
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
function useTranslation(
  aiKey: string,
  aiBaseUrl: string,
  aiModel?: string,        // default 'deepseek-chat'
  targetLang?: TargetLang   // default 'zh'
): {
  translate: (text: string, overrideLang?: TargetLang) => Promise<string>;
  loading: boolean;
  cache: Map<string, string>;  // Keyed by "lang::text"
  lang: TargetLang;
  setLang: (l: TargetLang) => void;
  LANG_LABELS: Record<TargetLang, string>;  // { zh: '中文', en: 'English', ... }
}

type TargetLang = 'zh' | 'en' | 'ja' | 'ko' | 'fr' | 'de' | 'es';
```
