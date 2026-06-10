# Package Reference

## `packages/core` — Zero UI Dependencies

**Exports** (`src/index.ts`):
- `BskyClient` — AT Protocol HTTP client (incl. `getTrends`, `getSuggestedFollows`, `createDraft`, `updateDraft`, `getDrafts`, `deleteDraft`, `listConvos`, `getConvoForMembers`, `getMessages`, `sendMessage`, `addReaction`, `removeReaction`, `updateRead`, `deleteMessageForSelf`, `muteConvo`, `unmuteConvo`, `putProfile`)
- `createTools(tools)` — 33 tool definitions + handlers
- `AIAssistant` — OpenAI-compatible chat with function calling (unlimited rounds, user-controlled via pause/stop)
- `sendMessageStreaming` — streaming variant with SSE parser + reasoning_content preservation
- `translateText` — dual-mode translation (simple/JSON) with retry logic
- `singleTurnAI`, `polishDraft`
- `ApiAdapter` — abstraction interface for LLM API implementations
- `ChatCompletionsAdapter` — Chat Completions API implementation
- `ResponsesApiAdapter` — Responses API implementation (OpenAI / xAI)
- `registerAdapter(name, adapter)` — register a custom API adapter
- `getAdapter(name)` — retrieve a registered adapter by name
- Types: `PostView`, `ProfileView`, `ThreadViewPost`, `AIConfig`, `ChatMessage`, `TrendingTopic`, `GetTrendsResponse`, `DraftInput`, `DraftView`, `DraftsResponse`, `CreateDraftResponse`, `ConvoView`, `MessageView`, `ReactionView`, `MessageInput`, etc.

**Key files**:

| File | Purpose |
|------|---------|
| `src/at/client.ts` | BskyClient class. Auth (createSession), all AT endpoints via `ky`. |
| `src/ai/tools.ts` | `createTools()` → 33 AI ToolDescriptor[]. Each has `definition` (JSON Schema) + `handler` (async function). |
| `src/ai/adapter.ts` | `ApiAdapter` interface + `ChatCompletionsAdapter` + `StreamProcessor`. |
| `src/ai/responses-adapter.ts` | `ResponsesApiAdapter` + `ResponsesApiStreamProcessor`. |
| `src/ai/providers.ts` | Provider registry with metadata (`fixedParams`, `supportsReasoningEffort`, `video` reserved). |
| `src/ai/providers.json` | Provider configuration file (7 providers: DeepSeek / Mistral / OpenAI / xAI Grok / Kimi-CN / Kimi-Overseas / OpenRouter). |
| `src/at/types.ts` | All AT Protocol TypeScript types. |
| `src/ai/assistant.ts` | AIAssistant class. Multi-turn tool-calling loop (unlimited rounds, user-controlled). `translateText()` with dual-mode + retry. `sendMessageStreaming()` for real-time token delivery. `polishDraft()` for draft refinement. |

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
| `useCompose(client, goBack, onSuccess?)` | `hooks/useCompose.ts` | `{ posts: ComposePostItem[], addPost, removePost, setPostText, submitting, submit, loadFromDraft, toDraftData }` |
| `useProfile(client, actor)` | `hooks/useProfile.ts` | `{ profile, follows, followers }` |
| `useSearch(client)` | `hooks/useSearch.ts` | `{ query, results, search }` |
| `useNotifications(client)` | `hooks/useNotifications.ts` | `{ notifications, unreadCount, refresh }` |
| `useLists(client)` | `hooks/useLists.ts` | `{ lists, loading, createList, deleteList, addMember, removeMember }` |
| `useListDetail(client, listUri)` | `hooks/useListDetail.ts` | `{ list, members, posts, loading, muteList, unmuteList }` |
| `useVirtualizedList(options)` | `hooks/useVirtualizedList.ts` | `{ virtualizer, scrollRef, restoreScroll }` |
| `useDmEmojiConfig()` | `hooks/useDmEmojiConfig.ts` | `{ emojis, toggleEmoji, resetEmojis }` |

### AI Hooks
| Export | File | Returns |
|--------|------|---------|
| `useAIChat(client, aiConfig, contextUri?, options?)` | `hooks/useAIChat.ts` | `{ messages, loading, guidingQuestions, send, chatId }`. `aiConfig` now includes `apiType?: 'chatCompletions' \| 'responses'` and `reasoningEffort?: 'low' \| 'medium' \| 'high'`. |
| `useChatHistory(storage?)` | `hooks/useChatHistory.ts` | `{ conversations, loadConversation, saveConversation, deleteConversation }` |
| `useTranslation(aiKey, aiBaseUrl, aiModel?, targetLang?)` | `hooks/useTranslation.ts` | `{ translate, loading, cache, lang, setLang }` |

### Storage
| Export | File |
|--------|------|
| `FileChatStorage` (class) | `services/chatStorage.ts` |
| `ChatStorage` (interface) | `services/chatStorage.ts` |
| `ChatRecord`, `ChatSummary` (types) | `services/chatStorage.ts` |
| `DraftStorage` (interface) | `services/draftStorage.ts` |
| `FileDraftStorage` (class) | `services/draftStorage.ts` |
| `AppDraft` (type) | `services/draftStorage.ts` |
| `setDraftStorageFactory()`, `getDefaultDraftStorage()` | `services/draftStorage.ts` |

### Embed Utilities
| Export | File | Purpose |
|--------|------|---------|
| `extractImages(post)` | `utils/extractEmbeds.ts` | Extract images from `#view` + `recordWithMedia` embeds |
| `extractVideo(post)` | `utils/extractEmbeds.ts` | Extract video embed |
| `extractExternalLink(post)` | `utils/extractEmbeds.ts` | Extract external link card |
| `extractQuotedPost(post)` | `utils/extractEmbeds.ts` | Extract quoted post from API-resolved `#view` |
| `extractHasGif(post)` | `utils/extractEmbeds.ts` | Detect GIF embeds |
| `extractEmbeds(post)` | `utils/extractEmbeds.ts` | Aggregate all embed types |

### Widget System
| Export | File | Purpose |
|--------|------|---------|
| `registerWidget(def, render)` | `hooks/widgetRegistry.ts` | 注册组件定义 |
| `getWidgetsForView(viewType)` | `hooks/widgetRegistry.ts` | 获取视图可用组件 |
| `initEnabledWidgets / toggleWidget` | `hooks/widgetStore.ts` | 模块级组件启用/关闭状态 |
| `setComposeDraftForWidgets` | `hooks/widgetStore.ts` | 发帖草稿桥接 |
| `setFocusedProfileActor` | `hooks/widgetStore.ts` | 帖子作者桥接 |

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
| `DMListView.tsx` | DM conversation list with avatar, handle, last message, unread badge |
| `DMChatView.tsx` | DM chat view with message bubbles, emoji reactions, quote embeds, delete, mute, load older |
| `SetupWizard.tsx` | Post-login setup wizard for configuring AI providers step by step |

**Dependencies**: `@bsky/core`, `@bsky/app`, `ink`, `ink-text-input`, `ink-spinner`, `react`, `tsx` (dev).

---

## `packages/pwa` — Progressive Web App (React/DOM)

**Package name**: `@bsky/pwa`

**Dependencies**: `@bsky/app`, `@bsky/core`, `react`, `react-dom`, `react-markdown`, `remark-gfm`, `rehype-raw`, `rehype-sanitize`

### Key Components

| Component | File | Purpose |
|-----------|------|---------|
| `Layout` | `components/Layout.tsx` | Shell: sidebar + header + content area |
| `Sidebar` | `components/Sidebar.tsx` | Persistent nav with route links, unread badge |
| `PostCard` | `components/PostCard.tsx` | Single post card with media, links, markdown rendering |
| `FeedTimeline` | `components/FeedTimeline.tsx` | Infinite-scroll feed with PostCard list + cursor pagination |
| `ThreadView` | `components/ThreadView.tsx` | Nested thread display with depth indentation |
| `ComposePage` | `components/ComposePage.tsx` | Post/reply/thread composer with image/video upload, ALT text, draft save modal, and polish button |
| `AIChatPage` | `components/AIChatPage.tsx` | AI assistant chat with markdown rendering, tool call cards |
| `ProfilePage` | `components/ProfilePage.tsx` | User profile, follows/followers, author feed |
| `SearchPage` | `components/SearchPage.tsx` | Search actors + posts |
| `NotifsPage` | `components/NotifsPage.tsx` | Notification feed with read/unread grouping |
| `BookmarkPage` | `components/BookmarkPage.tsx` | Bookmarks list (virtual scroll) |
| `LoginPage` | `components/LoginPage.tsx` | Bluesky handle + app-password auth form |
| `SettingsModal` | `components/SettingsModal.tsx` | AI key, base URL, model, language preferences |
| `ConvoListPage` | `components/ConvoListPage.tsx` | DM conversation list (avatar + handle + last message + unread badge) |
| `DMChatPage` | `components/DMChatPage.tsx` | DM chat view (message bubbles + emoji reactions + quote embed + delete + mute + load older) |
| `EditProfileModal` | `components/EditProfileModal.tsx` | Edit profile bottom-sheet (avatar/banner upload + name/description) |
| `ComponentsPage` | `components/ComponentsPage.tsx` | Widget management page with persistence |
| `ListsPage` | `components/ListsPage.tsx` | Lists index: browse, create, delete, add members to lists |
| `ListDetailPage` | `components/ListDetailPage.tsx` | List detail with Posts / Members tabs + inline editing |
| `AtPlayPage` | `components/AtPlayPage.tsx` | AT Play experiments landing page |
| `AtPlaySocialCircle` | `components/AtPlaySocialCircle.tsx` | Social circle analysis UI (form, progress, results, share to Bluesky) |
| `SettingsPage` | `components/SettingsPage.tsx` | Welcome setup page with 6-provider showcase cards |
| `WelcomeCard` | `components/WelcomeCard.tsx` | One-time onboarding card for new users (AI setup guide) |
| `PostInfoModal` | `components/PostInfoModal.tsx` | Post metadata modal: AT URI, CID, stats, viewer state (ⓘ button in ThreadView) |

### Hooks

| Hook | File | Purpose |
|------|------|---------|
| `useHashRouter` | `hooks/useHashRouter.ts` | URL hash-based routing (`#/profile/alice.bsky.social`) with back/forward navigation |
| `useSessionPersistence` | `hooks/useSessionPersistence.ts` | Session restore from `localStorage` on page load |
| `useAppConfig` | `hooks/useAppConfig.ts` | Read/write app settings (AI config, target language) to `localStorage` |

### Services

| Service | File | Purpose |
|---------|------|---------|
| `IndexedDBChatStorage` | `services/IndexedDBChatStorage.ts` | Implements `ChatStorage` interface using IndexedDB for persisting chat conversations with full message history |

### Icons

New SVG icons in `packages/pwa/src/icons/`:

| Icon | File | Used For |
|------|------|----------|
| `list` | `list.svg` | Lists sidebar entry |
| `user-plus` | `user-plus.svg` | Add member to list |
| `users` | `users.svg` | Members tab |
| `flask-conical` | `flask-conical.svg` | AT Play sidebar entry |
| `message-square` | `message-square.svg` | DM sidebar entry |
| `info` | `info.svg` | Post info modal |
| `brain` | `brain.svg` | AI thinking card |
| `wrench` | `wrench.svg` | AI tool call card |
| `heart` | `heart.svg` | Like action |
| `bookmark` | `bookmark.svg` | Bookmark action |

### Routing

Hash-based SPA routing (`useHashRouter.ts`):

```
#/feed                      → FeedTimeline (home timeline)
#/feed?feed=at://...        → FeedTimeline (specific feed URI)
#/thread?uri=at://...       → ThreadView
#/compose / ?replyTo=... / ?draftId=...
#/profile?actor=...         → ProfilePage
#/search / ?q=... / ?tab=...
#/notifications             → NotifsPage
#/bookmarks                 → BookmarkPage
#/drafts                    → DraftsPage
#/ai?session=...            → AIChatPage
#/dm                        → ConvoListPage (DM 会话列表)
#/dm?conv=id                → DMChatPage (DM 对话)
#/lists                     → ListsPage
#/list?uri=...              → ListDetailPage
#/atplay                    → AtPlayPage
#/atplay/social-circle      → AtPlaySocialCircle
#/components                → ComponentsPage
```

---

## `packages/mcp` — MCP Server (npm: `@epheiamoe/bsky-mcp`)

**Not part of the monorepo build chain** — this package is a standalone npm distribution. Depends on `@bsky/core` at dev time only (bundled via esbuild at build time).

**Exports**: None (it's a CLI tool, not a library).

**Key files**:

| File | Purpose |
|------|---------|
| `src/server.ts` | MCP stdio server: `Server` + `StdioServerTransport` + request handlers (`ListToolsRequestSchema`, `CallToolRequestSchema`) |
| `src/tools.ts` | Tool mapping: `createTools(client)` → MCP schema + handler wrapper + write gating |
| `src/config.ts` | Env var loading: `BSKY_HANDLE`, `BSKY_APP_PASSWORD`, `BSKY_PDS`, `BSKY_ENABLE_WRITE` |
| `src/index.ts` | CLI entry point |
| `esbuild.config.mjs` | Bundle config: bundles `@bsky/core` + `@bsky/ddg-search`, externalizes `@modelcontextprotocol/sdk`/`dotenv`/`ky` |

**Dependencies** (runtime): `@modelcontextprotocol/sdk`, `dotenv`, `ky`.
**Dependencies** (dev): `@bsky/core` (workspace:*, bundled at build), `esbuild`, `typescript`.

**Architecture**:
```
@bsky/core (BskyClient + 33 tools)  ←  bundled at build (esbuild)
    └── @epheiamoe/bsky-mcp (MCP stdio server)
            └── External MCP clients (OpenCode, Claude Desktop, VS Code, etc.)
```

**Scripts**:
```bash
cd packages/mcp
pnpm build         # esbuild → dist/index.js (96 KB, self-contained)
npm publish        # publish to npm registry
```

See `docs/MCP.md` for full implementation record, lessons, and test results.

---

## `packages/ddg-search` — DuckDuckGo HTML Parser

**Exports** (`src/index.ts`):
- `parseDDGLite(html)` — Parse DDG Lite HTML search results page into `SearchResult[]`
- `extractRealUrl(url)` — Extract real URL from DDG redirect (`//duckduckgo.com/l/?uddg=...`)
- `formatResultsAsMarkdown(query, results)` — Format `SearchResult[]` as `{heading, content}` JSON
- `SearchResult` — `{ title, url, description }` interface

**Zero dependencies.** Pure functions only. Used by `@bsky/core`'s `search_web_ddg` AI tool as fallback when jina.ai is unavailable.

---

## `contracts/` — Shared Definitions

| File | Content |
|------|---------|
| `tools.json` | JSON Schema for all 33 tools (name, description, inputSchema, endpoint, readonly) |
| `system_prompts.md` | System prompts used by AI assistant, translator, and Polish functions |
| `package.json` | Package metadata only |

---

## New in v0.13.9

> **API Adapter Pattern** — The AI system has been refactored from a monolithic `AIAssistant` class into a provider-agnostic `ApiAdapter` architecture.
>
> **What changed**:
> - Extracted `ApiAdapter` interface (`packages/core/src/ai/adapter.ts`) defining `sendMessage()` and `streamMessage()` contracts
> - Implemented `ChatCompletionsAdapter` for standard OpenAI-style chat completions
> - Implemented `ResponsesApiAdapter` for OpenAI / xAI Responses API (streaming tool calls + reasoning)
> - Added `registerAdapter()` / `getAdapter()` for runtime adapter registration
> - Provider metadata system in `providers.json`: `fixedParams` (immutable params), `supportsReasoningEffort`, `video` (reserved)
> - `reasoningEffort` support across providers (`low` / `medium` / `high`)
>
> **New Providers** (7 total):
> 1. DeepSeek (Chat Completions)
> 2. Mistral (Chat Completions)
> 3. OpenAI (Responses API + Chat Completions)
> 4. xAI Grok (Responses API)
> 5. Kimi Moonshot CN (Chat Completions)
> 6. Kimi Moonshot Overseas (Chat Completions)
> 7. OpenRouter (custom model routing)
>
> **PWA Changes**:
> - Welcome setup page (`SettingsPage`) with 6-provider showcase cards
> - Scenario settings now filter by API key availability
> - Fixed xAI streaming tool call parameter loss
> - Fixed xAI reasoning event name mismatch
> - Added search tool empty parameter guards
> - Fixed Kimi `reasoningStyle` parameter handling
>
> **TUI Changes**:
> - Added `SetupWizard` component for post-login AI configuration
> - Added `DMListView` and `DMChatView` for DM support
>
> **See Also**: `docs/AI_SYSTEM.md` for full adapter architecture, `docs/ARCHITECTURE.md` for provider metadata system details.