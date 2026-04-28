# Package Reference

## `packages/core` — Zero UI Dependencies

**Exports** (`src/index.ts`):
- `BskyClient` — AT Protocol HTTP client
- `createTools(tools)` — 31 tool definitions + handlers
- `AIAssistant` — OpenAI-compatible chat with function calling
- `singleTurnAI`, `translateToChinese`, `polishDraft`
- Types: `PostView`, `ProfileView`, `ThreadViewPost`, `AIConfig`, `ChatMessage`, etc.

**Key files**:

| File | Purpose |
|------|---------|
| `src/at/client.ts` | BskyClient class. Auth (createSession), all AT endpoints via `ky`. |
| `src/at/tools.ts` | `createTools()` → 31 ToolDescriptor[]. Each has `definition` (JSON Schema) + `handler` (async function). |
| `src/at/types.ts` | All AT Protocol TypeScript types. |
| `src/ai/assistant.ts` | AIAssistant class. Multi-turn tool-calling loop (up to 10 rounds). `singleTurnAI()` for translation/polish. |

**Dependencies**: `ky`, `dotenv` (dev), `@types/node` (dev).
**Zero UI deps**: No React, no Ink, no DOM.

---

## `packages/app` — State Management (PWA-Ready React Hooks)

**Exports** (`src/index.ts`):

### State/Navigation
| Export | File |
|--------|------|
| `createNavigation()` | `state/navigation.ts` |
| `useNavigation()` | `hooks/useNavigation.ts` |
| `AppView` (type) | `state/navigation.ts` |

### Data Hooks
| Export | File | Returns |
|--------|------|---------|
| `useAuth()` | `hooks/useAuth.ts` | `{ client, profile, loading, login }` |
| `useTimeline(client)` | `hooks/useTimeline.ts` | `{ posts, loading, cursor, loadMore, refresh }` |
| `usePostDetail(client, uri, goTo, aiKey, aiBaseUrl, targetLang)` | `hooks/usePostDetail.ts` | `{ post, flatThread, translate, actions }` |
| `useThread(client, uri, goTo)` | `hooks/useThread.ts` | `{ flatLines, focusedIndex, up, down, focus, replyToFocused }` |
| `useCompose(client, goBack, onSuccess?)` | `hooks/useCompose.ts` | `{ draft, setDraft, submitting, submit }` |
| `useProfile(client, actor)` | `hooks/useProfile.ts` | `{ profile, follows, followers }` |
| `useSearch(client)` | `hooks/useSearch.ts` | `{ query, results, search }` |
| `useNotifications(client)` | `hooks/useNotifications.ts` | `{ notifications, unreadCount, refresh }` |

### AI Hooks
| Export | File | Returns |
|--------|------|---------|
| `useAIChat(client, aiConfig, contextUri?, options?)` | `hooks/useAIChat.ts` | `{ messages, loading, guidingQuestions, send, chatId }` |
| `useChatHistory(storage?)` | `hooks/useChatHistory.ts` | `{ conversations, loadConversation, saveConversation, deleteConversation }` |
| `useTranslation(aiKey, aiBaseUrl, aiModel?, targetLang?)` | `hooks/useTranslation.ts` | `{ translate, loading, cache, lang, setLang }` |

### Storage
| Export | File |
|--------|------|
| `FileChatStorage` (class) | `services/chatStorage.ts` |
| `ChatStorage` (interface) | `services/chatStorage.ts` |
| `ChatRecord`, `ChatSummary` (types) | `services/chatStorage.ts` |

### Stores (internal, not exported)
| Store | File | Pattern |
|-------|------|---------|
| `createAuthStore()` | `stores/auth.ts` | `login()` → set client + session + profile |
| `createTimelineStore()` | `stores/timeline.ts` | `load()` / `loadMore()` / `refresh()` |
| `createPostDetailStore()` | `stores/postDetail.ts` | `load()` + `translate()` + cache |

**Store pattern**: Plain object with `_notify()` + `subscribe(fn) => unsubscribe`. React hooks call `useEffect(() => store.subscribe(tick))` to re-render on state change. Single-listener model.

**Dependencies**: `@bsky/core`, `react` (peer), `@types/react` (dev).

---

## `packages/tui` — Terminal UI (Ink/React)

**Entry**: `src/cli.ts` → `tsx src/cli.ts`

**Core component**: `src/components/App.tsx`
- ~400 lines, single file with centralized keyboard handling
- Uses `useInput` from Ink (only one instance)
- Tab/Esc always processed; AI-focused mode passes other keys to TextInput
- Dynamic layout: `sidebarW = cols * 0.14`, center fills remaining

**View components** (all in `src/components/`):

| File | Purpose |
|------|---------|
| `App.tsx` | View router + keyboard dispatch + layout. Inlines: `PostDetailView`, `ThreadViewRender`, `ComposeViewRender` |
| `Sidebar.tsx` | Navigation menu with breadcrumb, notification badge |
| `PostList.tsx` | Scrollable post feed with scrollbar |
| `PostItem.tsx` | Single post card with CJK-aware truncation, gutter lines |
| `AIChatView.tsx` | AI chat with history list, tool call display, auto-save |
| `AIPanel.tsx` | Legacy (kept for reference, not used in current router) |
| `NotifView.tsx` | Notification list with read/unread markers |
| `ProfileView.tsx` | User profile with follows/followers count |
| `SearchView.tsx` | Search results display |

**Dependencies**: `@bsky/core`, `@bsky/app`, `ink`, `ink-text-input`, `ink-spinner`, `react`, `tsx` (dev).

---

## `contracts/` — Shared Definitions

| File | Content |
|------|---------|
| `tools.json` | JSON Schema for all 31 tools (name, description, inputSchema, endpoint, readonly) |
| `system_prompts.md` | System prompts used by AI assistant, translator, and Polish functions |
| `package.json` | Package metadata only |
