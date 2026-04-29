# Bluesky TUI — Architecture & Development Reference

> Last updated: 2026-04-29. Complete reference for PWA migration.

## Monorepo Structure

```
bsky/
├── packages/
│   ├── core/        Layer 0: Zero UI. BskyClient, AIAssistant, 31 tools.
│   ├── app/         Layer 1: React hooks + pure stores. PWA-ready.
│   ├── tui/         Layer 2: Ink/React terminal UI.
│   │   └── src/
│   │       ├── cli.ts           Entry point (env, raw mode, render)
│   │       ├── components/      Ink React components
│   │       │   ├── App.tsx       View router + keyboard dispatch + mouse
│   │       │   ├── PostItem.tsx  postToLines() + PostListItem (viewport)
│   │       │   ├── PostList.tsx  Viewport-based feed list
│   │       │   ├── UnifiedThreadView.tsx  Discussion thread (cursor/focused split)
│   │       │   ├── AIChatView.tsx  AI chat with history, scroll, viewport
│   │       │   ├── Sidebar.tsx    Navigation sidebar with breadcrumb
│   │       │   ├── NotifView.tsx  Notifications list
│   │       │   ├── ProfileView.tsx  User profile
│   │       │   └── SearchView.tsx  Search results
│   │       └── utils/
│   │           ├── text.ts       visualWidth(), wrapLines() — CJK-aware TUI wrapping
│   │           └── mouse.ts      enableMouseTracking(), parseMouseEvent()
│   └── pwa/         Layer 2: React DOM PWA web app.
│       └── src/
│           ├── main.tsx                  Entry point (ReactDOM.createRoot)
│           ├── App.tsx                   Hash router, session restore, view dispatch
│           ├── index.css                 Tailwind + PWA styles
│           ├── components/
│           │   ├── Layout.tsx            Header, sidebar, theme toggle, settings
│           │   ├── Sidebar.tsx           Navigation (feed, search, bookmarks, etc.)
│           │   ├── LoginPage.tsx         Login form
│           │   ├── FeedTimeline.tsx      Feed with virtual scrolling
│           │   ├── ThreadView.tsx         Discussion thread with translation
│           │   ├── PostCard.tsx          Single post display
│           │   ├── ComposePage.tsx       New post / reply composer
│           │   ├── AIChatPage.tsx        AI chat with streaming
│           │   ├── ProfilePage.tsx       User profile view
│           │   ├── SearchPage.tsx        Search posts / actors
│           │   ├── NotifsPage.tsx        Notifications list
│           │   ├── BookmarkPage.tsx      Bookmarked posts
│           │   └── SettingsModal.tsx     App config (AI, language, theme)
│           ├── hooks/
│           │   ├── useHashRouter.ts      Hash-based navigation (pushState + popstate)
│           │   ├── useAppConfig.ts       localStorage-persisted config
│           │   └── useSessionPersistence.ts  localStorage session save/restore
│           ├── services/
│           │   └── indexeddb-chat-storage.ts  ChatStorage via IndexedDB
│           ├── stubs/
│           │   ├── fs.ts                Browser stub for Node fs module
│           │   ├── path.ts              Browser stub for Node path module
│           │   └── os.ts                Browser stub for Node os module
│           └── utils/
│               └── format.ts            Date formatting, text helpers
├── contracts/       JSON Schemas, system prompts.
└── docs/            Documentation (this directory).
```

## Dependency Flow

```
┌──────────┐
│ @bsky/   │  纯 TS, 零 UI 依赖
│ core     │  BskyClient | AIAssistant | 31 tools | types
└────┬─────┘
     │
┌────▼─────┐
│ @bsky/   │  React hooks + 纯 stores (PWA 可直接复用)
│ app      │  useAuth | useNavigation | useTimeline | useThread
│          │  useAIChat | useChatHistory | useTranslation
│          │  useBookmarks | ChatStorage interface | FileChatStorage
└────┬─────┘
     │
     ├──────────────────────────┐
     │                          │
┌────▼─────┐             ┌──────▼──────┐
│ @bsky/   │  Ink/React  │ @bsky/      │  React DOM PWA
│ tui      │  terminal   │ pwa         │  hash routing | IndexedDB
│          │  UI         │             │  Tailwind CSS | PWA manifest
└──────────┘             │             │  streaming AI | service worker
                         └─────────────┘
```

## TUI-Specific Utilities (PWA Doesn't Need)

| Utility | File | Purpose | PWA Equivalent |
|---------|------|---------|---------------|
| `visualWidth(str)` | `tui/src/utils/text.ts` | CJK terminal column width calc | CSS `word-wrap` |
| `wrapLines(text, cols, indent)` | `tui/src/utils/text.ts` | Smart line wrapping | CSS `word-wrap` |
| `enableMouseTracking()` | `tui/src/utils/mouse.ts` | ANSI mouse tracking | Browser `scroll` event |
| `parseMouseEvent(buf)` | `tui/src/utils/mouse.ts` | Parse x1b[M... sequences | Browser `scroll` event |
| `postToLines(post, cols)` | `tui/src/components/PostItem.tsx` | Pre-compute post display lines | Virtual list |

## Key Architecture Decisions

1. **Core has zero UI dependencies** — can be used from any framework
2. **App layer hooks are PWA-ready** — PWA only needs to write render components
3. **Single keyboard handler** — Ink's useInput in App.tsx, no stdin conflicts
4. **ChatStorage interface** — TUI uses JSON files, PWA implements IndexedDB
5. **All tests use real API calls** — no mocks, 29 tests all pass
6. **Viewport-based rendering** — Pre-computed line lists render as flat Text elements (no Box nesting overlap)
7. **Cursor/Focused split** — Thread view: arrow keys move cursor, Enter changes focus
8. **Mouse scroll** — ANSI mouse tracking enabled; feed scrolls on scrollUp/scrollDown
9. **Translation supports 7 languages** — configured via TRANSLATE_TARGET_LANG
10. **Terminology**: 主题帖 (theme post), 回复 (reply), 讨论串 (discussion chain), 讨论源 (discussion source)
11. **Hash-based routing (useHashRouter)** — PWA uses `history.pushState` + `popstate` with `#/path` format for static hosting compatibility; `useHashRouter` hook encodes/decodes `AppView` to/from hash URLs
12. **Auto JWT refresh via ky afterResponse hook** — `BskyClient` registers an `afterResponse` hook on the ky instance that detects `ExpiredToken`/`InvalidToken` errors (HTTP 400), calls `refreshSession` with the refresh JWT, and retries the original request with the new access token
13. **Dual-mode translation (simple/json)** — `translateText()` supports `simple` mode (plain text output) and `json` mode (structured `{translated, source_lang}` output); includes retry with exponential backoff up to 3 attempts for empty content or parse failures
14. **Shared FlatLine now includes imageUrls, externalLink, authorAvatar** — `FlatLine` interface (used by both TUI and PWA thread views) includes `imageUrls: string[]`, `externalLink: {uri, title, description} | null`, and `authorAvatar?: string` for rich post rendering
