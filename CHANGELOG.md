# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.14.5] — 2026-06-25

### Added

- **PWA notification badge**: sidebar and mobile header hamburger button now show unread notification counts.
- **PWA auto mark-as-read**: notification page automatically marks all notifications as read on entry.
- **TUI notification polling**: `useNotifications` refreshes every 60 seconds in TUI.
- **TUI DM shortcuts**: `e` toggles reaction mode when input is not focused; `r` refreshes messages.
- **Shared DM unread overlay store**: `ConvoUnreadStore` with TTL lets all `useConvoList` instances reflect read status immediately.
- **Shared notification store**: module-level store with `useSyncExternalStore`, epoch race protection, and rollback on `markAllAsRead` failure.
- **Unit tests**: `useNotifications.store.test.ts` (12 tests) and `useConvoList.store.test.ts` (8 tests) covering shared state, rollback, TTL, race conditions, and client-switch guards.

### Changed

- `useChatMessages.loadConvo()` now accepts both member DID and conversation id, and returns the actual `convo.id`.
- `BskyClient` adds `getConvo(convoId)` for direct conversation lookup.
- TUI `keys.dmChat` hint updated to include `e:react` / `r:refresh` in EN/ZH/JA.

### Fixed

- Fixed PWA sidebar never showing notification red dot.
- Fixed PWA DM unread badge not clearing immediately after opening a chat.
- Fixed TUI DM unread badge not clearing after opening a chat.
- Fixed Profile → DM navigation when `conversationId` is a conversation id rather than member DID.
- Fixed notification `markAllAsRead` having no failure rollback and racing with refresh.
- Fixed cross-account data leak: in-flight responses from an old client are discarded after switching accounts.

## [0.14.4] — 2026-06-19

### Added

- **Help center system**: shared data layer (`help-content.ts`) with 22 entries across 7 categories, consumed by PWA, TUI, and MCP AI tool. Self-contained trilingual content (EN/ZH/JA) with markdown support.
- **PWA Help page**: glass-card UI with search, category sections, responsive modal/bottom-sheet, light mode + CVD support. Accessible via sidebar button and `#/help` hash URL.
- **TUI Help view**: list-based help with `j/k` navigation, `Enter` to expand, `/` to search, platform tags `[PWA]`/`[TUI]`. Markdown rendering in detail view.
- **`ai-bsky_help` AI tool**: 4 actions (search, get, listCategories, listByCategory) for help content retrieval. Dependency-injected `HelpProvider` pattern.
- **`normalizeBskyInput()`**: unified URL normalization — bare domains, `/i/https://...`, `/i/bsky/...`, `at://` URIs, `bluesky://` scheme.
- **Third-party client URL support**: deer.social, tokimeki.blue, useouranos.app, deck.blue URLs auto-rewritten to bsky.app.
- **Expanded URL types**: `/hashtag/{tag}`, `/intent/compose?text=`, `/messages`, `/notifications`.
- **`parseAtUri()`**: direct parsing of `at://` AT Protocol URIs.
- **Clipboard paste button**: FeedHeader button (PWA) + `Ctrl+V` shortcut (TUI) for clipboard URL navigation.
- **TUI `Ctrl+V` paste & go**: reads clipboard via `clipboardy`, normalizes with `normalizeBskyInput()`, navigates to parsed view.

### Changed

- `parseRedirectPath()` refactored to use `normalizeBskyInput()`.
- `RedirectPage.tsx` uses `normalizeBskyInput()` for path normalization.
- Help center content verified by 4 fact-checkers against actual code (not docs). All platform tags, feature descriptions, and tool counts corrected.
- `**bold**` markdown support added to TUI `renderMarkdown()` utility.
- Glass card hover effects moved to CSS `:hover` pseudo-class for reliability.
- AI tool count updated from 33/34 to 35 across all documentation (10 files, 17 references).

### Fixed

- Fixed glass card border highlight persisting after mouse leave.
- Fixed modal open/close causing page content shift (scrollbar width compensation).
- Fixed mobile modal content overflow (max-height + scroll).
- Fixed TUI HelpView global shortcuts interfering with search input.
- Fixed `/view` slash command description (injects context, not URI parameter).
- Fixed help entries with incorrect platform tags (keyboard-shortcuts, at-play, widgets, rich-embeds, etc.).

## [0.14.3] — 2026-06-13

### Added

- **Gallery embed (`app.bsky.embed.gallery`)**: full support for Bluesky's new photo carousel — 5-10 images per post, swipeable carousel with count badge, keyboard navigation, touch swipe, lightbox integration.
- **Gallery compose**: `buildGalleryEmbed()` with required `$type`, `alt`, `aspectRatio` per item; automatic image dimension detection via `createImageBitmap`.
- **Gallery dominant aspect ratio**: carousel container uses the most common aspect ratio among images; non-matching images are cropped (`object-fit: cover`).
- **`viewExternal` rich metadata**: `ExternalLinkCard` component renders publication source icon/theme, reading time, thumbnail, timestamps.
- **10-image compose**: `MAX_IMAGES` raised from 4 to 10; 5+ images route to gallery embed.
- **i18n**: 6 new keys (`gallery.*`, `external.*`).
- **TUI gallery**: text-based index navigator with ←/→/h/l navigation.
- **DM auto-read**: opening a chat conversation now automatically marks it as read.
- **BskyLinkCard portal**: the "open in" choice modal is now portaled to `document.body` for proper fixed positioning.

### Changed

- Gallery lightbox uses actual click position as animation source rect (instead of hardcoded center).
- `PostPreviewCard` (used by all page views) now renders gallery embeds with lightbox support.
- `ExternalLinkCard` replaces inline `<a>` tags for external link rendering.

### Fixed

- Fixed gallery posts failing silently: each gallery item now includes required `$type: 'app.bsky.embed.gallery#image'`.
- Fixed gallery `aspectRatio` being optional: now always included (required by lexicon), with `{width:1, height:1}` fallback.
- Fixed gallery arrows triggering form submission: added `type="button"` to prevent default `type="submit"`.
- Fixed gallery click bubbling to post navigation: `stopPropagation` on image click and container.
- Fixed lightbox close animation: removed immediate unmount guard, using phase-based state machine.
- Fixed ThreadView gallery rendering: added `extractEmbeds()` call and `GalleryCard` with lightbox.
- Fixed `extractGallery` to check view-side embed data for CDN URLs.

## [0.14.2] — 2026-06-12

### Added

- Delete confirmation modal in thread view, styled consistently with the reply-restriction modal.
- Vitest test setup for `@bsky/app` (`packages/app/vitest.config.ts`).
- Unit tests for `extractEmbeds` and `buildFirstPostEmbed` in `@bsky/app`.

### Changed

- Quoted post cards now render below media (images/video/external/list embeds) in thread view for consistent visual hierarchy.

### Fixed

- Fixed missing quote embeds in our client when a post uses `app.bsky.embed.recordWithMedia` (image + quote). The extraction code now correctly unwraps the `recordWithMedia#view` wrapper (`embed.record.record`).
- Fixed video + quote submissions so the quote is preserved in `recordWithMedia` instead of being dropped.
- Fixed `extractVideo` to recurse into `recordWithMedia.media`.
- Fixed reply-restriction (`ThreadgateEditor`) modal layout offset by making the inner container `w-full`.

## [0.14.1] — 2026-06-12

### Added

- **Video preprocessing reliability**: `BskyClient.uploadVideo()` now surfaces failures explicitly instead of silently falling back to raw `uploadBlob`.
- **Video error classification**: new `VideoServiceError` / `VideoServiceErrorCode` with recoverable vs non-recoverable semantics.
- **Video response normalization**: `normalizeJobStatus()` handles both lexicon-wrapped `{ jobStatus }` and flat `JobStatus` shapes returned by `video.bsky.app`.
- **Unique video upload names**: `{timestamp}-{random}-{safeFileName}` to reduce `already_exists` collisions.
- **PDS DID fallback**: `_resolvePdsDid()` uses `com.atproto.server.describeServer` for custom PDS hostname mismatches.
- **Compose video error modal**: on recoverable `VideoServiceError`, users can retry preprocessing, upload without preprocessing, or return to editing with the draft preserved.
- **Unprocessed video placeholder**: `VideoCard` shows an explicit "processing / unavailable" state instead of requesting a non-existent HLS playlist.
- **TUI video placeholder**: `PostItem` guards against missing `playlistUrl`.
- **Delete-post toast**: `Toast` component; after deleting a post, success shows a bottom-right auto-dismiss toast and navigates back; failure shows the error message.
- **Tests**: `packages/core/tests/video-upload.test.ts` with 26 tests covering normalization, error classification, polling, 409 handling, and fallback behavior.

### Changed

- `uploadVideo()` default `allowFallback` is now `false`; fallback only occurs when explicitly opted in and the error is recoverable.
- `ExtractVideo` type: `playlistUrl` is now optional; added `processing` flag.

### Fixed

- **Videos uploaded via AI bsky were unplayable**: raw MP4 blobs were being posted because Video Service responses were mis-parsed and silently fell back to `uploadBlob`.
- **409 `already_exists` now returns the processed blob** instead of throwing.
- **`JOB_STATE_FAILED` with a `blob` is treated as success** during polling.
- **Thread view "post not found" for raw videos**: placeholder rendering prevents broken HLS player errors.

## [0.14.0] — 2026-05-22

### Added

- **Python Sandbox (v0.14.0 core feature)**: AI can execute Python code in an isolated environment for data analysis, batch processing, statistics, and plotting. Three-platform implementation with unified architecture.
  - **PWA**: PyodideSandbox (Web Worker + Pyodide WASM) with 8 pre-installed third-party packages (pandas, numpy, matplotlib, beautifulsoup4, pyyaml, openpyxl, scipy, scikit-learn)
  - **TUI**: NodePythonSandbox (child_process) with workspace file management
  - **MCP**: NodePythonSandbox with external AI client support
- **Workspace File Management**: Per-chat-session file isolation with IndexedDB (PWA) and filesystem (TUI/MCP) storage. Upload, download, delete, preview files.
- **TUI AI Chat Cards**: ThinkingCard and ToolCard components for expandable thinking traces and tool call display (31 tool formatters)
- **TUI WidgetOverlay**: Full-screen modal widget system (`w` key) with AIChatWidget and PolishWidget
- **TUI WorkspaceModal**: File manager for Python output files with upload/download/delete/preview
- **MCP Troubleshooting Guide**: `docs/MCP_TROUBLESHOOTING.md` — comprehensive error diagnosis documentation
- **MCP Environment Variable Mapping**: Automatic `BLUESKY_HANDLE` → `BSKY_HANDLE` mapping in launcher script for backward compatibility
- **bsky_tools Python Library (Phase 14)**: AI can batch-call Bluesky API methods from Python sandbox for efficient data processing and bulk operations.
  - **33 API Methods**: All existing tool handlers exposed as Python functions with identical response format
  - **Fields Filtering**: `fields` parameter to filter JSON responses and reduce token usage
  - **PWA Bridge**: Synchronous XHR-based API client running in Web Worker (27 read operations)
  - **TUI/MCP Bridge**: JSON-RPC over stdin/stdout with pre-execution AST analysis
  - **Write Operation Confirmation**: AST analysis detects write calls, requires pre-execution user confirmation
  - **Dynamic Call Rejection**: `getattr(bsky_tools, ...)` patterns blocked for security
- **Core API Definitions**: `bsky-tools-api.ts` (TypeScript interfaces) + `bsky-tools-definitions.ts` (metadata + Python wrapper generation + AST analysis)
- **User Documentation**: `docs/BSKY_TOOLS.md` — complete API reference, examples, platform differences, security notes

### Changed

- **AI System Prompt**: Added comprehensive bsky_tools usage guide with method list, examples, and fields parameter explanation
- **execute_python Tool Description**: Added bsky_tools library documentation for AI context

### Fixed

- **MCP WorkspaceStorage initialization**: Added `setWorkspaceStorageFactory()` call in MCP server startup, fixing Python output file persistence
- **MCP getChatId + assistant context**: Fixed `execute_python` chat session isolation and `view_image`/`create_post` uploaded image resolution
- **Cross-platform path handling**: Updated `execute_python` tool description to use `os.environ['BSKY_WORKSPACE']` instead of hard-coded `/workspace/output/` paths
- **TUI FileWorkspaceStorage strict isolation**: Changed `listFiles(chatId)` to exclude global files when chatId is provided, matching PWA behavior
- **TUI cli.ts initialization**: Added `setWorkspaceStorageFactory()` calls (was missing, causing runtime errors)
- **`search_posts` fields parameter**: Smart array detection in `filterFields` — when fields aren't found at top level but object contains arrays, applies filtering to array items while preserving metadata keys (`cursor`, `total`)
- **`fetch_web_markdown` JSON parse error**: `syncRequest` now try/catches JSON.parse and falls back to raw string for non-JSON responses (e.g., markdown from `r.jina.ai`)
- **`get_feed_generator` response structure**: Both PWA and TUI handlers now unwrap `res.view` before returning, providing direct access to `uri`, `did`, `displayName`, etc.
- **`get_connections` normalization**: PWA bridge now returns `{direction, items, total, cursor}` structure matching TUI/MCP, and handles `actor="me"` resolution
- **Python parameter naming**: `generateNodeWrapper()` and `generatePyodideWrapper()` now convert camelCase to snake_case (e.g., `maxReplies` → `max_replies`) for Python conventions, while keeping camelCase kwargs for handler compatibility

### Fixed (2026-05-21 — Comprehensive Testing Round)

- **`fields` parameter DataCloneError**: Pyodide proxy objects (Python lists/dicts) cannot be serialized via `postMessage`. Added `toPlainJs()` helper in worker to recursively convert proxies before sending to main thread.
- **All tools returning `None`**: Worker read `result.data` but ToolDispatcher returns `result.result`. Fixed to read correct key (`result.result || result.data`).
- **`get_list_feed` parameter mismatch**: Worker bridge passed `listUri` but handler expected `list`. Fixed parameter name in worker bridge.
- **`list_records` HTTP 400**: `com.atproto.repo.listRecords` requires DID (not handle) for `repo` parameter. Added auto-resolution: if handle provided, resolve to DID via `client.resolveHandle()` before API call.
- **Test coverage**: 51 comprehensive tests executed covering all 33 methods, fields parameter, edge cases, batch calls, and response structure consistency. Pass rate: 95.7% (44/46, 4 expected exceptions).

### Changed

- **AI System Prompt**: Added comprehensive bsky_tools usage guide with method list, examples, and fields parameter explanation
- **execute_python Tool Description**: Added bsky_tools library documentation for AI context; clarified platform differences (PWA auto-installs packages vs MCP/TUI requires manual pip install)
- **BSKY_WORKSPACE semantics**: Points to `output/{chatId}` directory in MCP/TUI, not base temp directory
- **NodePythonSandbox BSKY_WORKSPACE**: Now set to `workspaceDir` (output/{chatId}) instead of `baseDir` for correct file access

## [0.13.9] — 2026-05-16

### Added

- **ApiAdapter pattern**: Extracted `ApiAdapter` interface + `ChatCompletionsAdapter` from `AIAssistant`. Request building, response parsing, and SSE streaming now delegate to adapter. Zero behavior change for existing providers.
- **ResponsesApiAdapter**: New adapter for OpenAI's `/v1/responses` endpoint. Supports `instructions`+`input` format, `function_call` output items, and streaming events (`response.output_text.delta`, `function_call_arguments.delta/.done`, `reasoning_summary_text.delta`).
- **New providers**: OpenAI (5 models via Responses API), xAI Grok (4 models via Responses API), Kimi Moonshot CN + Overseas (`api.moonshot.cn`/`api.moonshot.ai`, K2.6+K2.5 via Chat Completions), OpenRouter (custom model input via Chat Completions).
- **Provider metadata**: `ModelInfo.video`, `fixedParams` (immutable params per model), `supportsReasoningEffort` (for reasoning effort control via Responses API).
- **Reasoning effort**: `AIConfig.reasoningEffort` field (`none`/`low`/`medium`/`high`). Responses API models with `supportsReasoningEffort` default to `medium`.
- **Kimi thinking-aware temperature**: K2.6/K2.5 fixed temperature 1.0 (thinking enabled) / 0.6 (disabled). `fixedParams` strip `top_p`, `n`, `presence_penalty`, `frequency_penalty` automatically.
- **WelcomeCard step 4**: Provider cards for all 6 providers (DeepSeek, OpenAI, xAI Grok, Mistral, OpenRouter, Kimi) with i18n descriptions and setup steps in all 3 locales.
- **Scenario settings filtering**: Model dropdowns now only show providers with configured API keys.
- **Per-provider API key isolation**: Switching providers clears API key field if no saved key exists for that provider.

### Fixed

- **xAI Grok tool call arguments**: `ResponsesApiStreamProcessor` used `call_id` as map key for tool call accumulation, but xAI's `.delta`/`.done` events reference by `item_id`. Changed key to `item.id` — arguments now properly accumulate.
- **Search tool empty-arg crashes**: `search_web_ddg` `.trim()` on undefined → guarded with `((p.query as string) || '').trim()`. `search_posts` empty `q` → returns error JSON instead of 400 API call.
- **xAI reasoning event names**: Fixed from underscore-separated (`reasoning_summary_part_added`) to dot-separated (`reasoning_summary_text.delta`) matching actual xAI event format. Actual thinking content now displayed.
- **ResponsesApiAdapter strict param**: Removed `strict: false` (not supported by xAI).
- **Kimi reasoningStyle**: Corrected from `"none"` to `"reasoning_content"` (uses `reasoning_content` field like DeepSeek).
- **xAI model names**: Removed non-existent `grok-4.5`. Current models: `grok-4.3`, `grok-4.1-reasoning`, `grok-4-fast`, `grok-4-mini`.
- **WelcomeCard customTitle**: Removed "Kimi" from "Other providers" list (Kimi now has its own dedicated card). Fixed in all 3 locales.

## [0.13.8] — 2026-05-15

### Added

- **Onboarding overhaul**: WelcomeCard rebuilt as 5-step wizard with progress animation (spring + slide). Steps: Welcome+Auth (with expandable 33-tool list), Pronouns (skip/neutral/custom), Personalization (dark mode, CVD palette, AI ALT — live toggles), AI Setup (i18n provider cards), Done (BYOK privacy card).
- **Pronoun system**: `userPronouns` field in AppConfig/TuiConfig. Three states: skip (no injection), neutral ("use gender-neutral terms"), custom ("user's pronouns are X"). Settings→Account tab radio+custom input.
- **Authorization disclosure**: WelcomeCard Step 1 shows R/W/X permission tiers with "Show all tools (33)" expandable list. Settings→AI tab has authorization info card. AI Chat first-time consent banner (localStorage `bsky_ai_consent`).
- **AI consent**: PWA AIChatPage shows consent banner on first open. TUI AIChatView shows inline consent (Enter to accept). Both respect `bsky_ai_consent` / per-session state.
- **AIGuidance**: Login page footer enhanced with AI agent authorization note.
- **System dark mode detection**: First launch reads `prefers-color-scheme` for initial dark mode default.
- **Settings "Restart Welcome Setup"**: Button in Settings→Account clears welcome flag and re-shows the 5-step wizard (preserves all other settings).
- **`settings.restartWelcome`**: i18n key in all 3 locales.

### Fixed

- **Prompt injection defense**: `sanitizePronouns()` in prompts.ts strips control chars, limits 50 chars, rejects instruction keywords (ignore/override/system/prompt/reveal etc.) — fallback to `'neutral'`.
- **i18n gaps**: Added `setup.*` keys (16) to en.ts and ja.ts (were zh.ts only). Added `welcome.personalDesc`, `welcome.darkModeDesc`, `welcome.cvdModeDesc`, `welcome.aiAltDesc` in all 3 locales. Fixed hardcoded `"Continue →"` → `t('welcome.continue')`. Fixed `action.back` → `common.back`.
- **WelcomeCard provider cards**: Moved from static module-level array to component-internal `useMemo` so `t()` works correctly (was showing English descriptions for all locales).

## [0.13.7] — 2026-05-15

### Added

- **Settings page (`#/settings`)**: Replaced modal-based SettingsModal with a full route page. 5 categorized tabs: Account, AI, Scenario, Display, Post Preview.
- **Post preview line customization**: `line-clamp-6/3/4` replaced with configurable range sliders in Settings→Post Preview. Defaults: post 10 lines, quoted 8 lines, thread 8 lines. Threaded through all PostCard consumers (6 pages) + ThreadView.
- **Theme-color sync**: `theme-color` meta tag now dynamically updates on dark/light toggle via 3 entry points (Layout effect, SettingsModal save, App.tsx init). Colors: `#000000` dark, `#FFFFFF` light.
- **Safe-area padding**: `<main>` now has `pt-[env(safe-area-inset-top)]` for iOS notch/status bar avoidance.
- **Manifest colors**: `theme_color` and `background_color` → `#000000`.
- **Settings in sidebar**: Gear icon moved from all tab page headers + desktop header to sidebar (bottom section, above About). Settings uses `replaceState` navigation.
- **Mobile sidebar scroll fix**: Mobile sidebar overlay `<motion.div>` now has `flex flex-col` so `<Sidebar>` nav items scroll properly on small screens.

### Fixed

- **Theme-color mismatch on iOS PWA**: Status bar was blue (`#00A5E0`) regardless of theme. Now matches background in both modes.
- **Lazy post edit replyToText not showing**: `useEffect` triggers `loadReplyToText` only when `replyTo` prop changes, not on every render.

## [0.13.6] — 2026-05-15

### Added

- **Mobile-first UI v2**: mobile tab pages (feed, search, aiChat, profile) now have merged headers + bottom tab bar with spring-animated active indicator. Bottom tab navigation uses `replaceState` so back arrow only appears for deep links.
- **Pull-to-refresh**: Touch-based pull-down gesture with spring scale/rotation indicator (astroid icon) on feed, search, notifications, bookmarks, profile.
- **Hide-on-scroll**: FeedHeader + MobileTabBar hide/show based on scroll direction. Tab bar uses `translateY(100%)`; header uses `max-h-0` collapsible div. Height fixed at `h-dvh` + `pb-14` to avoid layout recalc jitter.
- **MobileHeaderCtx**: Context providing `onSidebarOpen`, `onSettingsOpen`, `tabBarHidden`, `setTabBarHidden`, `dmCount` across all tab pages.
- **Keyboard auto-hide**: Global `focusin`/`focusout` listener hides tab bar when input/textarea focused.
- **dmCount badge**: 8px red dot on hamburger ☰ buttons when `dmCount > 0`.
- **AIGuidance**: Login page footer with version + GitHub + llm.txt + README + CHANGELOG links. Uses `<div>` instead of `<footer>` to avoid AI tool filtering.
- **llm.txt**: Published at `/llm.txt` with full project context + hash route index. `<link rel="llms-txt">` in index.html.
- **copy-docs.mjs**: Build script copies README.md + CHANGELOG.md to dist/.
- **Custom domain**: `bsky.epheia.dev` (also `ai-bsky.pages.dev`).
- **Version**: bumped to 0.13.6

### Fixed

- **Search scroll restoration**: Added missing `initialScrollTop`/`onScrollTopChange` props — was a dead ref, causing scroll position loss on back navigation.
- **Search history X button**: Added `onMouseDown e.stopPropagation()` to prevent parent `onMouseDown` from triggering search.
- **useVirtualizedList scroll restoration**: Initial rAF report guarded (`scrollTop > 0` only) + scroll restoration `useEffect` with `didRestore ref`.
- **DMChatPage**: scroll fix (scrollTop = scrollHeight), layout CSS, new-message badge.

### Added

- **at:// link interception**: `linkifyText` in PostCard now matches `at://did:.../collection/rkey` URIs and renders them as clickable links. Routes: `post`→thread, `list`→list detail, `feed.generator`→feed, default→profile via `parseAtUri()`.
- **NotFoundCard component**: Reusable 404 page with `book-search` SVG icon, back button, and AT URI display. Used by ThreadView, ProfilePage, and ListDetailPage for consistent "not found" states.
- **i18n `common.notFound`**: `'Not found'` / `'未找到'` / `'見つかりません'` in all 3 locales.
- **loadMore retry**: `timeline.ts` `loadMore()` now retries once after 1.5s (matching `load()` behavior). Keeps loading spinner during retry — transient PDS 502 errors are silently recovered.

### Fixed

- **Prompt `{{/if}}` residual**: `replaceConditionalBlock` depth tracking now uses `'{{#if '` instead of `openTag` — correctly counts nested conditionals with different variable names. No more orphaned `{{/if}}` in system prompt.
- **User handle injection**: Template now has `{{userHandle}}` / `{{userDisplayName}}` placeholders in rule 5 ("当前用户: @handle").
- **Tool call 400 error**: `_buildMessages` filter changed from `m.tool_call_id` to `typeof m.tool_call_id === 'string' && m.tool_call_id.length > 0` — empty string no longer causes orphaned tool_call_id.
- **AI textarea collapse**: `onChange` resets `el.style.height = 'auto'` when input is cleared after sending.
- **`replaceConditionalBlock` scan position**: When an inner `{{#if}}` is found, scan advances past its `}}` instead of using `openTag.length` (different variable names have different lengths).

### Removed

- `P_ASSISTANT_BASE`, `PF_CURRENT_USER`, `PF_PROFILE_CONTEXT`, `PF_POST_CONTEXT`, `PF_ENVIRONMENT`, `PF_LOCALE_HINT`, `P_CONCISE`, `PF_CURRENT_TIME`, `PF_VISION_HINT` — all replaced by `buildSystemPrompt()` + `MAIN_TEMPLATE`.

## [0.13.4] — 2026-05-14

### Added

- **Template-based prompt rendering**: `buildSystemPrompt()` replaces 10 individual `PF_*` function calls. Single `MAIN_TEMPLATE` string contains all fixed content; simple `String.replace` injects all dynamic values in one pass. No external template library. Conditional blocks via `{{#if var}}...{{/if}}` regex.
- **Project introduction in system prompt**: AI now knows it's "在 AI Bluesky 项目中的 AI 助手，项目地址 github.com/epheiamoe/bsky"，guides users to file issues for software feedback, and uses tools to answer project questions.
- **Locale-aware default reply language**: `locale` parameter now directly embedded as `{{locale}}` — AI uses UI language as default reply language, "除非用户有额外要求" (unless user requests otherwise).

### Removed

- `P_ASSISTANT_BASE`, `PF_CURRENT_USER`, `PF_PROFILE_CONTEXT`, `PF_POST_CONTEXT`, `PF_ENVIRONMENT`, `PF_LOCALE_HINT`, `P_CONCISE`, `PF_CURRENT_TIME`, `PF_VISION_HINT` — all replaced by `buildSystemPrompt()` + `MAIN_TEMPLATE`.

### Changed

- `prompts.ts` reduced from 241 lines to ~270 lines; structure now: template string → `buildSystemPrompt()` → conditional replace → custom prompt replace
- `useAIChat.ts` imports `buildSystemPrompt` directly instead of 9 individual prompt functions

## [0.13.3] — 2026-05-14

### Added

- **Image lightbox zoom/pan**: Pinch-to-zoom, double-tap zoom-to-point (2.5x), finger pan/drag, desktop Ctrl+scroll zoom, mouse drag pan. `touch-action: none` prevents browser gesture conflicts. Back button closes lightbox via `history.pushState`/`popstate`. Smooth spring animation via framer-motion `motion.div`. Close resets zoom before exit animation for seamless transition.

### Fixed

- **About page "Check for updates"**: `sw.js` now embeds commit hash via Vite `closeBundle` plugin. Browser detects byte change on `reg.update()`, fires `updatefound`, dispatches `pwa-update-available` event.

## [0.13.2] — 2026-05-14

### Added

- **Compose page redesign (8 features)**:
  - **Auto-growing textarea**: `scrollHeight`-based resize, no fixed height. `min-height: 56px`.
  - **300+ char red overlay marking**: Transparent textarea + background mirror div. First 300 chars normal, overflow in `<span class="text-red-500">`. No hard truncation — `maxLength={300}` and `text.slice(0, 300)` removed from `useCompose.ts`.
  - **Subtle X-style input**: `bg-transparent focus:outline-none` — no border, no background, no focus ring. Parent card provides structural boundary.
  - **Per-post quote in threads (`postQuoteUris: Map<postId, uri>`)**: Each thread post can independently quote a different AT URI via inline input field. Submit passes `quoteMap` to `useCompose.submit()`.
  - **Reply shows parent post (discussion source)**: Fetches full parent chain via `getPostThread(replyTo, 3, 0)`. Displays `replyToPost` + ancestors using ThreadView discussion source style (`opacity-60 bg-surface/20 rounded-xl`).
  - **Quote card PostCard style**: `rounded-xl p-3 bg-surface`, `w-4 h-4` avatar, `w-16 h-16` thumbs, hover effects, click-to-navigate.
  - **Animations**: `animate-slideUp` on new thread posts, `animate-fadeIn` on quote/reply previews, `transition-all` on cards and banners.
  - **Upload progress modal**: Step-level progress bar with phase transitions (media/posting/error), spinner/checkmark/cross icons.
- **Session persistence fix**: `AuthStore.restoreSession()` now updates `store.session = c.session` after JWT refresh completes. `App.tsx` save effect gated on `profile` + reads from `client.session` (canonical source). Prevents stale token overwrite on browser reopen.
- **Single image aspect-ratio mode**: New `singleImageFill` setting (default true = fixed-height crop). When disabled, single images render at natural aspect ratio, capped at max 1:2 (portrait) / 2:1 (landscape) with left-aligned layout. Container width computed from JS to shrink-wrap content.
- **ImageGrid extracted to own component**: Removed from `PostCard.tsx` (was ~210 lines inlined). Now `packages/pwa/src/components/ImageGrid.tsx` — standalone component with lightbox, ALT popup, single-image mode, grid mode.
- **Shared extractEmbeds utils**: `packages/app/src/utils/extractEmbeds.ts` — 6 pure functions (`extractImages`, `extractVideo`, `extractExternalLink`, `extractQuotedPost`, `extractHasGif`, `extractEmbeds`). Handles both `post.record.embed` (stored) and `(post as any).embed` (resolved `#view`) formats.

### Removed (~260 lines of duplicated code)

| Location | Removed | Lines |
|----------|---------|-------|
| `PostCard.tsx` | `extractEmbeds()` + `extractQuotedPost()` | 55 |
| `useThread.ts` | `getImageDetails()` + `getQuotedPost()` + `getVideoInfo()` + `getExternalLink()` | 120 |
| `PostItem.tsx` (TUI) | inline `extract()` + video/quote parsing | 35 |
| `ComposePage.tsx` | `extractQuotePreviews()` | 28 |

### i18n

- **`settings.singleImageFill`** in en/zh/ja — "Fill single images (higher density)"
- **10 compose keys** in en/zh/ja: `compose.overLimit`, `compose.uploadProgress`, `compose.postProgress`, `compose.posted`, `compose.viewPost`, `compose.addQuote`, `compose.quotePlaceholder`, `compose.quoteInvalid`, `compose.quoteRemove`

## [0.13.1] — 2026-05-13

### Added

- **AI ALT — AI image description generation**: Configurable in Settings → Scenario → AI ALT. Uses a vision-capable model to generate ALT text for images. Only vision-capable models are eligible in the dropdown. Language follows the Translation & AI ALT Language setting.
  - **ImageGrid**: ALT badge now visible on all images when configured (ALT or ALT?). Tooltip-style popup replaced with proper Modal. Module-level cache by CDN URL for cross-view dedup.
  - **describeImage()** in `@bsky/core`: accepts a `downloadFn` callback (caller provides BskyClient.downloadBlob) — same PDS download path as `view_image`, with `withRefresh` JWT auto-refresh. Supports `targetLang` parameter for locale-aware descriptions.
  - **6 scenario i18n keys**: `settings.scenarioDesc`, `settings.scenario.{aiChat,translate,polish,imageDescription}`, `settings.scenario.{sameAsDefault,noVisionModels,imageAltDesc,imageAltOff}`.
- **CVD-friendly color palette**: Settings → General toggle remaps red→magenta, green→teal, yellow→amber for color vision deficiency (deuteranopia, protanopia, tritanopia). `.cvd` class on `<html>`, 32 CSS override rules, `.dark.cvd` combinator for dark mode.
- **`--color-background` CSS variable**: 24 `bg-white dark:bg-[#0A0A0A]` → `bg-background` across 16 component files. Enables future themes without touching components.
- **33 a11y i18n keys**: screen reader + AI agent support — landmark labels, button names, error messages, loading states, page announcements.
- **10 scenario i18n keys**: full localization of the previously hardcoded Scenario tab.
- **Diagnostic page** (`#/diagnostic`): tests CDN fetch, PDS getBlob, bsky.social getBlob, and LLM API error CORS.

### Fixed

- **WCAG Semantics (Phase 1)**: Removed nested `<main>` from 5 pages (invalid HTML). Added `aria-label` to Layout header, both `<aside>` elements, Sidebar `<nav>`. Added `role="list"/"listitem"` to 6 virtual-scroll components. Dynamic `<html lang>` on locale change. `aria-label` on 5 textareas. Skip-to-content link in index.html. Modal `role="dialog"` with focus trap, Tab cycling, and focus save/restore. Dynamic `document.title` per view. `h2`→`h1` for ProfilePage display name.
- **WCAG 1.4.1 (Phase 2)**: `aria-pressed` on PostActionsRow like/repost/bookmark buttons. Repost count `font-bold` when active (repost has no filled icon variant). `aria-label` on 28 icon-only buttons (back, close, translate, copy, info, threadgate, delete, refresh). 11 hardcoded English `aria-label`/`title` strings i18n-ized. `aria-current="page"` on active sidebar navigation. `aria-live="polite"` region for view announcements. Connectivity dot → dot + visible text label. `role="alert"` on 11 error + 4 warning banners; `role="status"` on 2 success toasts across 15+ component files.
- **WCAG 4.1.2 (Phase 3)**: 14 `htmlFor`/`id` label-input associations (SettingsModal 9, LoginPage 3, EditProfileModal 2). `aria-expanded` on ThinkingCard, ToolCard, repost popup, threadgate, WelcomeCard. `aria-describedby` linking login errors to inputs. `aria-invalid` on login fields. `role="progressbar"` on AtPlay analysis. `aria-label` on 5 hidden file inputs.
- **downloadBlob**: Switched from raw `ky.get()` (no `withRefresh`) to `this.ky.get()` — eliminates expired JWT errors on blob downloads. Same path as all other authenticated API calls.
- **downloadBlob**: Added `bsky.social` proxy fallback for cross-shard blobs (RepoNotFound on `jellybaby` PDS shards). Proxy tried first, PDS as fallback.
- **`_authHook` — `beforeRequest` auto-auth**: New hook on all `this.ky` and `this.chatKy` instances auto-injects `Authorization` header when session exists. No more manual `headers: this.getAuthHeaders()` needed on individual methods. Registered on all 4 `ky.create` calls.
- **`_withRefresh`**: Extended from `400` only to `400 || 401` — some PDS instances return 401 for expired tokens.
- **`getAuthHeaders()`**: Returns `{}` instead of throwing when session is null — eliminates race condition crash after re-login.
- **429 rate-limit retry**: Exponential backoff (1s→2s→4s→8s, max 4 retries) with progress indicator in ALT popup.
- **Modal**: Uses `createPortal(document.body)` to escape virtual scroll `transform` containers. Backdrop/outer-wrapper clicks call `e.stopPropagation()` to prevent React fiber tree propagation to parent `onClick` handlers.
- **view_image**: Added CDN fallback when PDS `downloadBlob` fails (cross-shard blob 400).

### Changed

- `describeImage` signature: `(config, downloadFn, existingAlt?, targetLang?)` — caller handles download (same pattern as `view_image`), targetLang from AppConfig controls output language.
- `P_ALT_DESCRIPTION_SYSTEM` changed from `const` to function — accepts `targetLang` for locale-aware prompt.
- **ALT popup** → `Modal` component — proper focus trap, Escape key, stable viewport positioning, no scroll-following.
- **Settings→Scenario tab** fully i18n-ized — was entirely hardcoded English.
- `settings.targetLang` renamed to `Translation & AI ALT Language`.
- Image ALT dropdown first option shows "Off" instead of "Same as default" for clarity.

### i18n

- **28 missing settings/theme/common keys** restored to `en.ts` + `ja.ts`.
- **New CVD keys**: `settings.cvdMode`, `theme.cvdOn`, `theme.cvdOff`.
- **New a11y keys**: 33 screen-reader + AI agent support keys (`a11y.*`).
- **New scenario keys**: 10 scenario tab i18n keys.
- **New AI ALT keys**: 7 ALT generation keys (`a11y.alt*`) + 4 error-specific keys.
- **`post.imageAlt` + `post.imageCount`** added to `en.ts` + `ja.ts` (were missing).
- **`settings.targetLang`** renamed across all 3 locales.

## [0.13.0] — 2026-05-13

### Added

- **MCP Server (`@epheiamoe/bsky-mcp`)**: New package `packages/mcp` — exposes all 33 Bluesky AI tools to external MCP clients (OpenCode, Claude Desktop, VS Code, Cursor, Windsurf) via the Model Context Protocol.
  - **33 tools**: 27 read (timeline, search, profiles, lists, threads, notifications, web search, Wikipedia) + 6 write (create post, like, repost, follow, lists) gated by `BSKY_ENABLE_WRITE=true`.
  - **Zero UI, zero React** — depends on `@bsky/core` at dev time only (bundled via esbuild).
  - **Self-contained**: esbuild bundles `@bsky/core` + `@bsky/ddg-search` into a single 96 KB `dist/index.js`. Only 3 runtime npm deps (`@modelcontextprotocol/sdk`, `dotenv`, `ky`).
  - **Published to npm**: `npm install -g @epheiamoe/bsky-mcp` → `bsky-mcp` command available globally.
  - **OpenCode integration**: `opencode.jsonc` + `scripts/start-mcp.mjs` launcher auto-loads `.env` credentials. Tested with 8 tools across 7 categories.
- **OpenCode project config**: `opencode.jsonc` at repo root with bsky MCP server definition. Uses launcher script `scripts/start-mcp.mjs` to load `.env` before starting the MCP subprocess.

### Changed

- **Architecture diagram** updated: `@epheiamoe/bsky-mcp` branches directly from `@bsky/core` (bypasses `@bsky/app` — no UI layer needed).
- **README** now highlights AI web search tools (search_web_ddg, search_wikipedia, fetch_web_markdown) — all zero API key, zero configuration.

### Docs

- **`docs/MCP.md`**: Full implementation record — architecture, build pipeline, handler adapter, write gating, OpenCode integration, test results, 6 lessons, future work.
- **`docs/archive/MCP_PLAN.md`**: Original planning document (archived after implementation).
- **`docs/PACKAGES.md`**: Added `@epheiamoe/bsky-mcp` section.
- **`docs/ARCHITECTURE.md`**: Updated dependency flow diagram with MCP branch.
- **`docs/CONTEXT.md`**: v0.13.0 version entry + MCP docs link.

## [0.12.2] — 2026-05-12

### Fixed

- **AI chat tool_call display corruption after edit/undo**: `mapMessages()` in `useAIChat` pushed tool_calls BEFORE assistant text instead of after, causing `messageGroups` to split tool_call+tool_result pairs. Fix:
  - Reordered `mapMessages` output: assistant text → tool_calls → tool_results (was tool_calls → text).
  - Empty-content assistant messages (artifact of broken load reconstruction) are now skipped.
  - `editByIndex`/`undoLastMessage` now sync `messagesRef.current` after `setMessages` to prevent stale refs from being auto-saved.
- **Auto-repair of previously corrupted conversations**: New `repairCorruptedMessages()` function runs on load — removes empty assistant messages, detects the `tool_call → assistant → tool_result` corruption pattern, reorders to `assistant → tool_call → tool_result`, and writes the fixed data back to IndexedDB. Pre-v0.12.2 conversations heal automatically on first load.
- **PWA check-for-updates broken on About page**: `checkForPwaUpdate()` set `_ignoreNextUpdate=true` (designed to prevent duplicate `visibilitychange` events), but About page's manual check hit the same flag → `pwa-update-available` event never dispatched → always showed "Up to date". New `checkForPwaUpdateManual()` skips the ignore flag.

### Changed

- **AI chat export**: Now uses **OpenAI standard format** (`bsky-chat-v2`). Tools are nested inside assistant messages as `tool_calls[]`, thinking blocks use `reasoning_content`, and tool results are separate `role: "tool"` messages with `tool_call_id`. Old export format removed from JSON export (HTML/MD unchanged).
- **AI chat import**: Now auto-detects and supports **both** v1 (old custom format) and v2 (OpenAI standard format). Detection logic: explicit `format` field → message role heuristics (`tool_calls`/`role: "tool"` vs `role: "tool_call"`/`role: "tool_result"`).
- **PWA mobile user message width**: User messages now `max-w-[85%]` on mobile (was `75%`), matching assistant message width for better readability on narrow screens.

## [0.12.1] — 2026-05-12

### Fixed

- **About page "Check for updates" always showed "Up to date"**: Root cause: `checkForPwaUpdate()` in `services/pwa.ts` set `_ignoreNextUpdate=true` before calling SW `update()`. The flag is designed to prevent `visibilitychange` auto-detection from double-firing `pwa-update-available`, but the About page's manual check also hit it → the event was suppressed → 5-second timeout → "Up to date". Fix: added `checkForPwaUpdateManual()` that skips the ignore flag.

## [0.12.0] — 2026-05-12

### Added

- **Threadgate (reply restriction) support**: Full reply-gating via `app.bsky.feed.threadgate` record.
  - `@bsky/core`: `ThreadgateRule` union type (`mentionRule`/`followerRule`/`followingRule`/`listRule`), `ThreadgateRecord`, `ThreadgateView`; `putThreadgate(uri, rules)` and `deleteThreadgate(uri)` client methods.
  - `@bsky/app`: `useCompose.threadgateRules` state + auto threadgate creation after posting; `useThread.threadgate` parsed from API response; `formatThreadgateSummary`, `buildThreadgateRules`, `rulesToThreadgateType`, `getThreadgateDisplayKey` utilities.
  - **PWA ComposePage**: Collapsible "Who can reply?" section with radio options (everyone/nobody/mentioned/followers/following/lists). List picker expands to fetch user's lists via `client.getLists()`. Hidden when replying. SVG icons throughout.
  - **PWA ThreadView**: Yellow restriction badge shown above action bar when threadgate exists (all posts, not just own). "Change reply restriction" button (`message-square-off` SVG icon) next to delete button on own posts. `ThreadgateEditor` modal with same radio options + list picker.
  - **TUI**: `g` key cycles restriction modes in compose; `R` key opens threadgate dialog in thread view; restriction text shown on focused posts.
  - **AI tools**: `create_post` accepts optional `threadgate` parameter. Before replying, checks target post's threadgate and returns graceful error if restricted. After original/quote posting, creates threadgate record.
  - **AI thread view**: `get_post_thread` flat format now appends `[reply restriction: ...]` line to root post.
  - **i18n**: 6 display keys (`nobody`/`followers`/`following`/`mentioned`/`list`/`multiple`) in en/zh/ja with proper full sentences.
- **Post-publish navigation**: `useCompose.onSuccess` now passes created URI array → `ComposePage`/TUI `App.tsx` navigate to the new post's thread page.
- **SVG icon**: `message-square-off.svg` (Lucide) for "change reply restriction" button.

### Changed

- **Post text wrapping**: `break-all` → `break-words` on all post text elements (ThreadView, PostCard). Words no longer broken mid-syllable; long links only break when they overflow the container. Code/URI technical content retains `break-all`.
- **Threadgate badge**: No longer restricted to own posts — shows for any post with restrictions.
- **Threadgate display**: Replaced `'Replies: {rule}'` template with 6 unique i18n keys yielding full sentences like "此帖子仅限关注者可回复" / "Only followers can reply".
- **Radio alignment**: `flex items-start` + `mt-0.5` on radio inputs + `leading-5` on labels across ThreadgateEditor and ComposePage threadgate selectors.

### Fixed

- **Threadgate badge not showing on other users' posts**: Removed `focused.handle === client.getHandle()` gate.
- **Confusing display text**: `getThreadgateDisplayKey()` returns structured i18n key instead of raw summary text.
- **No navigation after posting**: `onSuccess` callback now receives `createdUris` → auto-navigate to new thread.

## [0.11.0] — 2026-05-12

### Added

- **`@bsky/ddg-search` package**: Pure-function DuckDuckGo Lite HTML parser (`parseDDGLite`, `extractRealUrl`, `formatResultsAsMarkdown`). Zero external dependencies.
- **`fetchViaJina()` shared utility**: `packages/core/src/ai/fetchViaJina.ts` — shared jina.ai Reader fetch, used by `fetch_web_markdown` and `search_web_ddg`.
- **`search_web_ddg` tool**: Replaces `instant_answer`. Three-tier fallback: jina.ai Reader (DDG search → Markdown) → DDG Lite direct fetch + `parseDDGLite` (TUI) or `/api/search` proxy (PWA) → graceful empty. No API key needed.
- **Multi-platform DDG Lite search proxy**: `functions/api/search.js` (Cloudflare), `api/search.php` (PHP), `api/search.js` (Vercel), `netlify/functions/search.js` (Netlify), `scripts/search-server.mjs` (Node.js dev).
- **Cursor pagination for all tools**: 11 paginated tools now expose optional `cursor` parameter (AI can paginate).
- **`actor="me"` support**: Extended to `get_author_feed`, `get_connections`, `get_suggested_follows`, `get_lists` (was only `get_profile`).

### Changed

- **Tool count reduced: 38 → 33**. 4 merges:
  - `get_post_thread` + `get_post_thread_flat` + `get_post_subtree` → `get_post_thread(format)`
  - `get_likes` + `get_reposted_by` → `get_post_interactions(type)`
  - `get_follows` + `get_followers` → `get_connections(direction)`
  - `add_to_list` + `remove_from_list` → `edit_list_members(action)`
- **All 33 tool descriptions rewritten**: "when/what/how" style — use cases, handle/DID conventions, return structure, cursor pagination.
- **`buildToolDescription` updated**: `edit_list_members` uses `action`-based confirmation text.
- **FormatToolResult updated**: Feed parsers match simplified output format; tool name branches updated for merges.

### Fixed

- **ThinkingCard/ToolCard scroll**: `overflow-y-auto` with `max-h-[600px]` now properly scrollable. Scroll pass-through at boundary — when content reaches bottom, wheel scroll propagates to chat container.
- **Feed tool UI display**: `formatToolResult` parsers for `get_timeline`/`get_author_feed`/`get_feed` now use flat `{author, text}` format instead of nested `{post: {author: {handle}, record: {text}}}`.
- **`get_author_feed` missing `author` field**: Handler now includes `author` in output.

### Removed

- **`instant_answer` tool**: Redundant with `search_wikipedia` + new `search_web_ddg`.
- **DDG Instant Answer proxy**: All proxy files (`functions/api/proxy.js`, `api/proxy.php`, `api/proxy.js`, `netlify/functions/proxy.js`, `scripts/proxy-server.mjs`) replaced with DDG Lite search proxies.
- **`docs/PAGES_FUNCTION.md`**: Replaced by DEPlOY.md multi-platform section.
- **`docs/DDG_INSTANT_ANSWER_DEBUG.md`**: No longer relevant.
- **UI body truncation**: Removed 2000-char truncation on search/wiki/thread/fetch tool card bodies (scrollable now).

## [0.10.5] — 2026-05-11

### Changed

- **ChatService 存储重构**: AI 对话持久化从 `useAIChat` 解耦为独立模块级单例 `ChatService`。
  - **根因 1**: `App.tsx` 中 `setChatStorageFactory()` 在渲染顶层执行，每 render 重置 `_defaultChatStorage = null` → PWA 端 `storage` 引用每 render 变化 → load effect 反复触发 → `setMessages(record.messages)` 在流式响应期间覆盖累积的对话 → autoSave 保存残缺数据。
    - **修复**: `initChatService()` 仅在组件 mount 时通过 `useEffect` 执行一次，idempotent guard 确保 `_storage` 引用稳定。新增 `chatService.ts` 模块级单例。
  - **根因 2**: `autoSave` 的 `saveVersionRef` 版本跳过机制：若先调用 autoSave(完整数据) 再调用 autoSave(残缺数据)，版本检查跳过"旧"版本（完整）而保留"新"版本（残缺）。
    - **修复**: 移除 `saveVersionRef`/`saveQueueRef`。改用 debounce 300ms + `_latestSnapshot` Map 覆盖式存储。多次 autoSave 调用自动合并为一次写入，始终以最后调用的数据为准。
  - **根因 3**: 无空消息保护措施，autoSave 可能将 `messages: []` 写入 IndexedDB 覆盖完整数据。
    - **修复**: 双重 `messages.length === 0` guard：入口处直接 `return`，写入前二次校验。
  - **根因 4**: load effect 依赖 `[options?.chatId, storage]`，`storage` 引用变化触发 reload。
    - **修复**: load effect 现在只依赖 `[options?.chatId]`。
- **TUI 启动初始化**: `cli.ts` 新增 `initChatService(new FileChatStorage())` 显式初始化。
- **版本**: v0.10.4 → v0.10.5

### Removed

- **`setChatStorageFactory`/`getDefaultChatStorage`**: 废弃的工厂模式 API，由 `ChatService` 替代。

## [0.10.4] — 2026-05-10

### Fixed

- **PWA 时间线滚动位置丢失 + 帖子列表意外重置** (Issue #7):
  - **根因 1** — `useTimeline` 内 `lastFeed.current` 初始值来自 `feedUri` prop，首次渲染时 `feedUri=undefined`（auth 未就绪）。之后 `feedUri` 变为有效值时，effect 检测到 `effFeedUri !== lastFeed.current` 为 `true`，误判为 "feed 切换"，触发 `store.posts=[]` + `store.load()`，帖子列表从 40+ 条重置到 20 条。
    - **修复**: render body 中初始化 `lastFeed.current = effFeedUri` 当两者都非 `undefined`。
  - **根因 2** — `useVirtualizer` 每次 mount 重建时测量缓存丢失，`estimateSize` 回退到 120px 估计值，而实测高度 ~170px，按 scrollTop 恢复时产生 ~2000px 累积偏移。
    - **修复**: 模块级 `_heightCache`（`post.uri → 实测高度`）跨 mount 持久；`estimateSize` 优先读缓存。
  - **根因 3** — mount 时 virtualizer 首次渲染 `scrollOffset=0`，即使设了 `el.scrollTop` virtualizer 也不认（只从 scroll 事件读）。
    - **修复**: `useVirtualizer` 的 `initialOffset` 选项，利用内部 `_willUpdate` → `_scrollToOffset` + `flushSync` 机制同步对齐 scroll 位置。

## [0.10.3] — 2026-05-10

### Added

- **回复深度标签**: `PostCard` 从 `post.record.reply` 推断回复深度。直接回复楼主显示 `↩`，嵌套回复显示 `↩ 2+`。圆角矩形 badge，位于 PostCard avatar 列（头像正下方）。仅 feed/search/profile 页面显示，ThreadView 不显示。
- **PostInfoModal**: ThreadView 聚焦帖 action row（复制按钮右侧）新增 ⓘ 按钮 → `createPortal` 到 `document.body` 弹窗。显示 AT URI、CID（各自独立圆角矩形+复制按钮）、时间、统计（SVG 图标: heart/repeat/message-square）、Viewer 状态。
- **`badge-info.svg`**: Lucide 风格 info 图标。
- **i18n**: `post.info`、`post.replyDepth`、`common.copy`、`common.copied` 及模态框字段标签（en/zh/ja）。
- **`docs/USER_ISSUSES.md`**: 新增时间线滚动丢失问题记录。

### Fixed

- **PostInfoModal 重叠/跟随滚动**: 改在 ThreadView 通过 `createPortal` 挂到 `document.body`，非 PostCard 内嵌。emoji（♥♺💬✓）替换为 `<Icon>` SVG。`useThread` 新增 `getPostView(uri)` 导出供 modal 获取完整 PostView。
- **回复标签位置纠正**: 从内容区移到 avatar 列（头像下方），仅在 `post` 路径显示。

### Removed

- **emoji 媒体标签**: 移除 PWA+TUI 帖子卡片左下角的 `图片/视频/链接/引用` emoji 标签。`getMediaTags()` 函数及 `FlatLine.mediaTags`/`quotedPost.mediaTags` 字段全部删除。
- **ThreadView 旧 emoji badge 渲染**: 同步移除。

### Changed

- **版本**: v0.10.2 → v0.10.3

## [0.10.2] — 2026-05-10

### Fixed

- **autoSave IndexedDB 写队列**: `useAIChat.ts` `autoSave` 中引入 `saveQueueRef`（Promise 链），将对 `IndexedDBChatStorage.saveChat()` 的异步调用串行化。消除两个 `autoSave` 并发时 IndexedDB 事务乱序覆盖完整数据的竞态条件。TUI (`FileChatStorage` 同步 I/O) 不受影响。
- **chatId 快照守卫**: 每次 `autoSave` 在调用时捕获 `chatIdRef.current` 快照，写入前对比当前值，防止 `chatId` 变化后错误覆盖其他会话。

### Changed

- **版本**: v0.10.1 → v0.10.2

## [0.10.1] — 2026-05-10

### Fixed

- **Login 401 错误详情提取**: `client.ts` `login()` 捕获 `HTTPError`，解析 Bluesky API 响应体（如 `"Invalid identifier or password"`）替代 ky 默认的 `"Request failed with status code 401"`。auth store 追加 App Password 提示。
- **Handle 输入净化**: `LoginPage.tsx` 自动去除 handle 中的 `@` 前缀和 `http://`/`https://` 前缀，减少用户输入错误。
- **i18n 补全**: 三语言文件新增 `'login.invalidCredentials'`；en/ja 补充缺失的 `'login.error'` 键。

### Changed

- **版本**: v0.10.0 → v0.10.1 (AboutPage, README, README.zh)

## [0.10.0] — 2026-05-09

### Added

- **DuckDuckGo Instant Answer 工具** (`instant_answer`): 第 37 个 AI 工具，零 API 密钥。通过 DuckDuckGo Instant Answer API 获取 Wikipedia 摘要、Infobox、直接答案和相关链接。浏览器环境下通过 Pages Function `/api/proxy` 代理调用以绕过 `Sec-Fetch-*` 检测（DDG 反爬机制会向浏览器请求返回空字段）。Node.js 环境下直接 `fetch()`。read-only，无需用户确认。
- **Wikipedia 知识摘要工具** (`search_wikipedia`): 第 38 个 AI 工具，零 API 密钥。基于 Wikipedia REST API `page/summary`（原生 CORS），直接获取文章摘要、描述和链接。支持 `lang` 参数（默认 `en`），Wikipedia 自动处理重定向和模糊匹配。一步到位，无需搜索步骤。
- **`/api/proxy` Pages Function**: `packages/pwa/functions/api/proxy.js` — Cloudflare Pages 服务端代理。浏览器 `instant_answer` 通过此代理调用 DDG API，在 Cloudflare 边缘节点执行 server-side fetch（无 `Sec-Fetch-*` 头），返回完整 JSON + CORS 头给浏览器。
- **`docs/PAGES_FUNCTION.md`**: Pages Function 架构文档（规范、代码、本地测试命令）
- **`DEPLOY.md`**: 面向部署者的多平台部署指南（Cloudflare/PHP/Vercel/Netlify/VPS/Node）
- **多平台 DDG 代理文件**: PHP (`api/proxy.php`)、Vercel (`api/proxy.js`)、Netlify (`netlify/functions/proxy.js`)、Node (`scripts/proxy-server.mjs`)
- **`docs/DDG_INSTANT_ANSWER_DEBUG.md`**: DuckDuckGo API `Sec-Fetch-*` 检测完整分析文档
- **ChatStorage 工厂模式**: `setChatStorageFactory()` + `getDefaultChatStorage()` — 与 DraftStorage 一致的工厂模式，替代硬编码 `FileChatStorage`（Lesson 49）
- **`get_profile` 支持 `actor="me"`**: AI 可直接 `get_profile actor="me"` 获取当前用户资料

### Changed

- **系统提示词**: `P_ASSISTANT_BASE` 新增规则 5（AI 应使用提示词中的 handle 调工具）；`PF_CURRENT_USER` 新增 handle 使用提示 + 界面语言
- **AI 工具总数**: 36 → 38
- **`contracts/tools.json`**: 新增 `instant_answer` + `search_wikipedia` + `get_profile` 描述更新
- **`AGENTS.md`**: 新增 Pages Function 文档规范；Build & Deploy 改为两步流程（`--branch=staging` → `--branch=production`）
- **`AGENTS.local.md`**: 部署流程同步更新
- **`docs/CONTEXT.md`**: 更新至 v0.10.0，新增文件引用，工具数更新
- **`docs/PAGES_FUNCTION.md`**: 增加多平台部署章节和本地开发说明
- **`docs/LESSONS.md`**: 新增 Lesson 46-50（Sec-Fetch-* 检测、Wikipedia 端点、CORS 要求、ChatStorage 工厂、autoSave 竞态）
- **`vite.config.ts`**: 添加 `server.proxy` 开发代理（`/api` → `localhost:8788`）
- **版本**: v0.9.0 → v0.10.0 (AboutPage, README, docs)

### Fixed

- **autoSave 竞态条件**: 删除 `send()` 中过早的 `void autoSave()` 调用（仅用户消息），只保留流结束后的保存，防止不完整数据覆盖完整对话历史（Lesson 50）
- **`upload_blob` 死代码**: 移除 `assistant.ts` 中的死分支和 `contracts/tools.json` 条目
- **`get_profile` 描述更新**: 明确告知 AI 可用 `actor="me"` 获取自身资料
- **CORS 域名白名单**: `/api/proxy` 添加 `url` 前缀校验，仅允许 `api.duckduckgo.com`

## [0.3.0] — 2026-05-03

### Added

- **视频 + GIF 支持**：`VideoEmbed` 类型、`VideoCard`（PWA HLS 播放器）、TUI OSC 8 Ctrl+Click
- **发帖媒体上传**：同一按钮自动检测图片/视频，`ComposeMedia`（`type: 'image' | 'video'`）
- **自动图片压缩**（>2MB）：PWA Canvas API、TUI `sharp`，通知用户压缩结果
- **#tag 链接**：PWA `linkifyText` 支持 `#tag` → 搜索跳转、TUI OSC 8 可点击
- **AI 上下文注入修复**：Effect 3 `changed` 正确追踪所有上下文，URL 编码 `contextPost`/`contextProfile`
- **PostActionsRow AI 按钮**：所有视图（feed/search/bookmark/thread）均有紫色 AI 按钮
- **多提供商支持**：提供商注册表、DeepSeek + Mistral、PWA Settings 提供商/模型下拉
- **多场景模型配置**：AI 对话/翻译/润色独立模型选择、按提供商分离 API 密钥
- **AI 对话图片上传**：`+` 按钮（PWA）/ `i` 键（TUI）、`_userUploads` 本地安全存储
- **暂停/停止**：`AbortController`、PWA 文字暂停按钮、TUI `p` 键
- **导出按钮**：JSON / HTML / Markdown（PWA 下拉 / TUI `e` 键）
- **黑夜滚动条**：PWA CSS 暗色主题
- **图像永久上下文**：查看的图片在对话中跨轮次持久存在
- **`docs/AI_CONTEXT.md`**：AI 上下文注入文档

### Fixed

- **AI `search_posts`**：公开 API 403 → 强制认证端点
- **Icon 纯文本 bug**：`ComposePage.tsx` 标题、`NotifsPage.tsx` 回退
- **编辑按钮跨会话失效**：Effect 2 恢复时同步 `assistant.loadMessages()`
- **会话列表不刷新**：`onChatSaved` 回调触发 `useChatHistory.refresh`
- **图片限制 1MB → 2MB**：Bluesky 现在支持 2MB/4K
- **`view_image` 提示误导**：根据 `visionEnabled` 动态生成
- **Mistral 422 `extra_forbidden`**：推理内容合并到 content 并清理 `reasoning_content` 字段
- **浏览器 `Failed to fetch`**：同时处理两种大小写错误消息
- **`makeRequest()` URL 不一致**：统一使用 `cleanBaseUrl`
- **切换提供商后请求仍发往旧端点**：`AIAssistant.updateConfig()` + `useEffect` 同步
- **场景模型不切换提供商**：`resolveScenarioConfig()` 解析完整 `AIConfig`
- **Buffer 在 PWA 中未定义**：`toBase64()` 跨平台工具
- **网络错误提示**：VPN/代理/DNS 污染建议
- **DNS 污染（Mistral 在中国）**：`AGENTS.local.md` 网络排查指南

### Changed

- **`tools.ts` 从 `at/` 移到 `ai/`**：澄清这是 AI 模块，不是 AT 协议工具
- **i18n**：图片 → 媒体、"同一默认"场景模型标签
- **提供商配置解耦到 `providers.json`**：方便编辑
- **`CONTEXT.md`**：v0.3.0 教训（7 条新教训）、当前文件表

## [0.2.0] — 2026-05-01

### Added

- **Custom Feed support**: Switch between Following / Discover / custom feeds
  - Core: `BUILTIN_FEEDS` (discover, following), `getFeedLabel()`, `resolveFeedId()`
  - PWA: `FeedHeader` dropdown, `FeedConfigModal` with add/remove/set-default
  - TUI: `f` key feed config overlay, suggested feeds via `getSuggestedFeeds`
  - Hash URL: `#/feed?feed=at://...` for PWA route persistence
  - Default feed config persisted (PWA: localStorage, TUI: `.env`)
- **Vision mode toggle**: `LLM_VISION_ENABLED` (no heuristic, user-controlled)
  - TUI: `.env` / SetupWizard / SettingsView
  - PWA: SettingsModal AI tab checkbox
  - `_buildMessages()` guards: no multi-modal embed when disabled
  - Dynamic prompt: vision enabled/disabled hints for AI
- **view_image tool**: For vision-capable models (GPT-4V, Claude Vision, etc.)
  - Downloads image, returns base64 for multi-modal promotion
  - `ContentBlock` type for multi-modal message support
- **`create_post` images parameter**: `[{did, cid, alt}]` via `extract_images_from_post`
- **`edit` replaces `retry`**: Pre-fill last user input instead of re-send
  - TUI: `r` key fills TextInput
  - PWA: `✏️` button pre-fills textarea
- **Delete own post**: `BskyClient.deletePost(uri)`
  - TUI: `d` key with Y/N confirmation
  - PWA: `🗑 删除` button with inline confirm
- **Link/handle auto-coloring** in PWA (blue links) + TUI (blue Text)
- **`flattenThread` maxReplies param**: AI can request up to 20 replies per level
- **`download_image`**: Now saves to `~/Downloads/` instead of returning base64

### Changed

- **AI truncation overhaul**:
  - Post text in tools: removed 200-char truncation (Bluesky limits to 300)
  - Actor description: removed 100-char truncation
  - `fetch_web_markdown`: 4000 → 10000 chars
  - UI tool result truncation: removed 500/300 layers
  - `tryJsonSummary`: raised limits (800/300/500)
- **Thinking mode default**: Now configurable via `LLM_THINKING_ENABLED`
  - TUI: SetupWizard step 6, SettingsView
  - PWA: SettingsModal AI tab checkbox
- **AI prompts centralized**: `packages/core/src/ai/prompts.ts`
- **PWA icons**: Replaced 16×16 favicon copies with proper 64/192/512 PNGs
- **Service Worker caching expanded**: CDN images, Google Fonts, Vue-built assets
- **Feed title format**: `📋 时间线 - Discover` / `📋 时间线 - Following`
- **Username truncation**: Max 15 chars in PostCard/ThreadView (full on ProfilePage)
- **TUI AI chat**: Streaming enabled (`stream: true`), thinking display `| Thinking:` format

### Fixed

- **Following feed 400 error**: `following` generator doesn't exist → `shouldUseTimeline()` routes to `getTimeline()`
- **Tool call JSON parse error**: `formatPostLine` double-quote wrapping removed
- **Thread ancestors leaking**: `d >= 0` guard + `visitedUris` Set
- **TUI keyboard conflict**: `showFeedConfig` guard prevents Enter → thread navigation
- **PWA feed dropdown**: Portaled to `document.body` for proper stacking
- **`messages.length` in deps**: Removed from tools init effect (broke API protocol)
- **Image lightbox**: Portaled to escape virtual scroll `transform` containing block

### Removed

- **`upload_blob` tool**: Dead code, never integratable into post creation
- **UI tool result 300-char truncation**: Redundant layering

## [0.1.0] — 2026-04-30

Initial implementation of dual-UI Bluesky client with AI integration.
