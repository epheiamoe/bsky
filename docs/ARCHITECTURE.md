# Bluesky TUI — Architecture & Development Reference

> Last updated: 2026-04-29. Complete reference for PWA migration.

## Monorepo Structure

```
bsky/
├── packages/
│   ├── core/        Layer 0: Zero UI. BskyClient, AIAssistant, 31 tools.
│   ├── app/         Layer 1: React hooks + pure stores. PWA-ready.
│   └── tui/         Layer 2: Ink/React terminal UI.
│       └── src/
│           ├── cli.ts           Entry point (env, raw mode, render)
│           ├── components/      Ink React components
│           │   ├── App.tsx       View router + keyboard dispatch + mouse
│           │   ├── PostItem.tsx  postToLines() + PostListItem (viewport)
│           │   ├── PostList.tsx  Viewport-based feed list
│           │   ├── UnifiedThreadView.tsx  Discussion thread (cursor/focused split)
│           │   ├── AIChatView.tsx  AI chat with history, scroll, viewport
│           │   ├── Sidebar.tsx    Navigation sidebar with breadcrumb
│           │   ├── NotifView.tsx  Notifications list
│           │   ├── ProfileView.tsx  User profile
│           │   └── SearchView.tsx  Search results
│           └── utils/
│               ├── text.ts       visualWidth(), wrapLines() — CJK-aware TUI wrapping
│               └── mouse.ts      enableMouseTracking(), parseMouseEvent()
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
│          │  ChatStorage interface | FileChatStorage
└────┬─────┘
     │
┌────▼─────┐
│ @bsky/   │  Ink/React 终端渲染 (PWA 不需要)
│ tui      │  PostItem.postToLines() | wrapLines | mouse tracking
│          │  Viewport-based rendering for feed/AI chat
└──────────┘
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
