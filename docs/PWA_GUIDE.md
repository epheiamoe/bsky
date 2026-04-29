# PWA Migration Guide

## Quick Start

```bash
cd packages/pwa
pnpm dev        # dev server at http://localhost:5173
pnpm build      # production build → dist/
pnpm preview    # preview production build
```

## Deployment

**Live demo**: https://ai-bsky.pages.dev (Cloudflare Pages)

```bash
# Deploy to Cloudflare Pages
pnpm build
npx wrangler pages deploy dist --project-name ai-bsky --commit-dirty=true

# Manual (if network blocks API):
# 1. Cloudflare Dash → Workers & Pages → Pages → Direct Upload
# 2. Drag dist/ folder → set project name → deploy
```

**Static hosting**: Upload `dist/` to any static host (Cloudflare Pages, Netlify, Vercel). No backend required — all Bluesky API calls go directly from the browser. CORS is supported by Bluesky's public API and PDS endpoints.

**No `.env` needed** — credentials are entered via the login form and persisted in `localStorage`. AI API key is configured via the Settings (⚙️) page.

## Architecture

The PWA (`@bsky/pwa`) is now implemented. It shares 100% of business logic with the TUI via `@bsky/app` hooks.

```
packages/pwa/
├── package.json
├── vite.config.ts
├── tailwind.config.ts
├── index.html
├── public/manifest.json & sw.js
└── src/
    ├── main.tsx
    ├── App.tsx                  # View router + session restore
    ├── index.css                # CSS variables (light/dark)
    ├── components/
    │   ├── Layout.tsx           # Header + hamburger sidebar (mobile) + 3-col desktop
    │   ├── Sidebar.tsx          # Unified 7-tab nav (incl. 👤我)
    │   ├── LoginPage.tsx        # Handle + App Password form
    │   ├── PostCard.tsx         # Dual PostView/FlatLine + avatar + image grid + lightbox
    │   ├── FeedTimeline.tsx     # Virtual scroll + auto-load (IntersectionObserver)
    │   ├── ThreadView.tsx       # Thread + labels + reply tree + translate
    │   ├── ComposePage.tsx      # Post/reply + image upload (max 4)
    │   ├── AIChatPage.tsx       # AI chat + history + streaming + markdown
    │   ├── ProfilePage.tsx      # User profile + avatar
    │   ├── SearchPage.tsx       # Post search
    │   ├── NotifsPage.tsx       # Notifications list
    │   ├── BookmarkPage.tsx     # Bookmark list
    │   └── SettingsModal.tsx    # Bluesky/AI/General config
    ├── hooks/
    │   ├── useSessionPersistence.ts  # localStorage session store
    │   ├── useAppConfig.ts           # localStorage config (AI, lang, theme)
    │   └── useHashRouter.ts          # Hash-based router (pushState+popstate)
    ├── services/
    │   └── indexeddb-chat-storage.ts # ChatStorage IndexedDB impl
    ├── stubs/
    │   └── os.ts, fs.ts, path.ts     # Node module stubs (never called)
    └── utils/
        └── format.ts            # time formatting, URI helpers
```

```
import {
  // Navigation
  useNavigation, createNavigation, AppView,

  // Data hooks
  useAuth, useTimeline, usePostDetail, useThread, useCompose,
  useProfile, useSearch, useNotifications,

  // AI
  useAIChat, useChatHistory, useTranslation, getDefaultStorage,
  FileChatStorage, ChatStorage, ChatRecord, ChatSummary,

  // Types
  AIChatMessage, PostDetailActions, FlatLine, TargetLang,
} from '@bsky/app';
```

## What to Build New (Render Layer Only)

### 1. Navigation/Router

```tsx
// PWA App.tsx
import { useNavigation, useAuth } from '@bsky/app';

function App() {
  const { client } = useAuth();
  const { currentView, goTo, goBack } = useNavigation();

  switch (currentView.type) {
    case 'feed':    return <FeedPage client={client} goTo={goTo} />;
    case 'detail':  return <PostDetail  client={client} uri={currentView.uri} goTo={goTo} goBack={goBack} />;
    case 'thread':  return <ThreadView client={client} uri={currentView.uri} goTo={goTo} goBack={goBack} />;
    case 'compose': return <ComposePage client={client} replyTo={currentView.replyTo} goBack={goBack} />;
    case 'aiChat':  return <AIChatPage  client={client} contextUri={currentView.contextUri} goBack={goBack} />;
    case 'profile': return <ProfilePage client={client} actor={currentView.actor} goBack={goBack} />;
    // ...
  }
}
```

### 2. Keyboard → Mouse Mapping

TUI keyboard shortcuts map to PWA elements:

| TUI Key | PWA Equivalent |
|---------|---------------|
| Enter on post | `onClick` on post card |
| ↑↓/jk | Scroll wheel / touch |
| Esc | ← Back button / browser back |
| R: reply | Reply button |
| T: translate | Translate button |
| H: expand thread | "View Thread" button |
| A: AI analysis | AI button → opens AI panel sidebar |
| Tab | Click to focus input |

### 3. Component Mapping

| TUI (Ink) | PWA (React DOM) |
|-----------|-----------------|
| `<Box>` | `<div>` |
| `<Text>` | `<span>` / `<p>` |
| `useInput` | `onClick` / `onKeyDown` |
| `ink-text-input` | `<input>` / `<textarea>` |
| `borderStyle="single"` | `border: 1px solid` CSS |
| `color="cyan"` | `color: #00FFFF` CSS |
| `backgroundColor="#1a56db"` | `background-color: #1a56db` CSS |

### 4. Storage

```typescript
// PWA chat storage implementation
class IndexedDBChatStorage implements ChatStorage {
  private db: IDBDatabase;

  async init() {
    this.db = await openDB('bsky-chats', 1, {
      upgrade(db) {
        db.createObjectStore('chats', { keyPath: 'id' });
      },
    });
  }

  async saveChat(chat: ChatRecord) {
    await this.db.put('chats', { ...chat, updatedAt: new Date().toISOString() });
  }

  async loadChat(id: string) {
    return await this.db.get('chats', id) ?? null;
  }

  async listChats() {
    const all = await this.db.getAll('chats');
    return all.map(c => ({
      id: c.id, title: c.title,
      messageCount: c.messages.filter(m => m.role === 'user' || m.role === 'assistant').length,
      updatedAt: c.updatedAt,
    })).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  async deleteChat(id: string) {
    await this.db.delete('chats', id);
  }
}
```

### 5. Authentication

PWA needs a login page (TUI uses `.env` file):
```tsx
// LoginPage.tsx
import { useAuth } from '@bsky/app';

function LoginPage() {
  const { client, loading, error, login } = useAuth();
  const [handle, setHandle] = useState('');
  const [password, setPassword] = useState('');

  return (
    <form onSubmit={e => { e.preventDefault(); login(handle, password); }}>
      <input value={handle} onChange={e => setHandle(e.target.value)} placeholder="handle.bsky.social" />
      <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="App Password" />
      <button type="submit">Login</button>
    </form>
  );
}
```

### 6. Environment Config

TUI reads from `.env`. PWA reads from a config object or localStorage:

```typescript
const config: { aiConfig: AIConfig; targetLang: string } = {
  aiConfig: {
    apiKey: localStorage.getItem('ai_api_key') ?? '',
    baseUrl: 'https://api.deepseek.com',
    model: 'deepseek-v4-flash',
  },
  targetLang: localStorage.getItem('target_lang') ?? 'zh',
};
```

## File Template for PWA Package

```
packages/pwa/
├── package.json
├── tsconfig.json
├── index.html
├── src/
│   ├── main.tsx              # React entry + router
│   ├── App.tsx               # View router (same structure as TUI's App.tsx)
│   ├── components/
│   │   ├── FeedPage.tsx      # useTimeline → render posts
│   │   ├── PostDetail.tsx    # usePostDetail → render detail
│   │   ├── ThreadView.tsx    # useThread → render tree
│   │   ├── AIChatPage.tsx    # useAIChat + useChatHistory → render chat
│   │   ├── ComposePage.tsx   # useCompose → render composer
│   │   ├── ProfilePage.tsx   # useProfile → render profile
│   │   ├── LoginPage.tsx     # useAuth → render login
│   │   └── Sidebar.tsx       # Navigation + breadcrumb
│   └── services/
│       └── IndexedDBChatStorage.ts
```

**Estimated new code**: ~500 lines of render components. All logic from `@bsky/app`.
