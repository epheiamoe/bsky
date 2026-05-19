# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- **Python Sandbox**: AI can execute Python code in an isolated environment for data analysis, batch processing, statistics, and plotting. Three-platform implementation with unified architecture.
  - **PWA**: PyodideSandbox (Web Worker + Pyodide WASM) with 8 pre-installed third-party packages (pandas, numpy, matplotlib, beautifulsoup4, pyyaml, openpyxl, scipy, scikit-learn)
  - **TUI**: NodePythonSandbox (child_process) with workspace file management
  - **MCP**: NodePythonSandbox with external AI client support
- **Workspace File Management**: Per-chat-session file isolation with IndexedDB (PWA) and filesystem (TUI/MCP) storage. Upload, download, delete, preview files.
- **bsky_tools Python Library (Phase 14)**: AI can batch-call Bluesky API methods from Python sandbox for efficient data processing and bulk operations.
  - **33 API Methods**: All existing tool handlers exposed as Python functions with identical response format
  - **Fields Filtering**: `fields` parameter to filter JSON responses and reduce token usage
  - **PWA Bridge**: Synchronous XHR-based API client running in Web Worker (27 read operations)
  - **TUI/MCP Bridge**: JSON-RPC over stdin/stdout with pre-execution AST analysis
  - **Write Operation Confirmation**: AST analysis detects write calls, requires pre-execution user confirmation
  - **Dynamic Call Rejection**: `getattr(bsky_tools, ...)` patterns blocked for security
- **Core API Definitions**: `bsky-tools-api.ts` (TypeScript interfaces) + `bsky-tools-definitions.ts` (metadata + Python wrapper generation + AST analysis)
- **User Documentation**: `docs/BSKY_TOOLS.md` — complete API reference, examples, platform differences, security notes
- **TUI AI Chat Cards**: ThinkingCard and ToolCard components for expandable thinking traces and tool call display (31 tool formatters)
- **TUI WidgetOverlay**: Full-screen modal widget system (`w` key) with AIChatWidget and PolishWidget
- **TUI WorkspaceModal**: File manager for Python output files with upload/download/delete/preview
- **MCP Troubleshooting Guide**: `docs/MCP_TROUBLESHOOTING.md` — comprehensive error diagnosis documentation
- **MCP Environment Variable Mapping**: Automatic `BLUESKY_HANDLE` → `BSKY_HANDLE` mapping in launcher script for backward compatibility

### Fixed

- **`search_posts` fields parameter**: Smart array detection in `filterFields` — when fields aren't found at top level but object contains arrays, applies filtering to array items while preserving metadata keys (`cursor`, `total`)
- **`fetch_web_markdown` JSON parse error**: `syncRequest` now try/catches JSON.parse and falls back to raw string for non-JSON responses (e.g., markdown from `r.jina.ai`)
- **`get_feed_generator` response structure**: Both PWA and TUI handlers now unwrap `res.view` before returning, providing direct access to `uri`, `did`, `displayName`, etc.
- **`get_connections` normalization**: PWA bridge now returns `{direction, items, total, cursor}` structure matching TUI/MCP, and handles `actor="me"` resolution
- **Python parameter naming**: `generateNodeWrapper()` and `generatePyodideWrapper()` now convert camelCase to snake_case (e.g., `maxReplies` → `max_replies`) for Python conventions, while keeping camelCase kwargs for handler compatibility
- **MCP WorkspaceStorage initialization**: Added `setWorkspaceStorageFactory()` call in MCP server startup, fixing Python output file persistence
- **MCP getChatId + assistant context**: Fixed `execute_python` chat session isolation and `view_image`/`create_post` uploaded image resolution
- **Cross-platform path handling**: Updated `execute_python` tool description to use `os.environ['BSKY_WORKSPACE']` instead of hard-coded `/workspace/output/` paths
- **TUI FileWorkspaceStorage strict isolation**: Changed `listFiles(chatId)` to exclude global files when chatId is provided, matching PWA behavior
- **TUI cli.ts initialization**: Added `setWorkspaceStorageFactory()` calls (was missing, causing runtime errors)

### Changed

- **AI System Prompt**: Added comprehensive bsky_tools usage guide with method list, examples, and fields parameter explanation
- **execute_python Tool Description**: Added bsky_tools library documentation for AI context
- **execute_python tool description**: Clarified platform differences (PWA auto-installs packages vs MCP/TUI requires manual pip install)
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

- **Prompt `{{/if}}` residual**: `replaceConditionalBlock` depth tracking now uses `'{{#if '}` instead of `openTag` — correctly counts nested conditionals with different variable names. No more orphaned `{{/if}}` in system prompt.
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

### Removed

- `P_ASSISTANT_BASE`, `PF_CURRENT_USER`, `PF_PROFILE_CONTEXT`, `PF_POST_CONTEXT`, `PF_ENVIRONMENT`, `PF_LOCALE_HINT`, `P_CONCISE`, `PF_CURRENT_TIME`, `PF_VISION_HINT` — all replaced by `buildSystemPrompt()` + `MAIN_TEMPLATE`.

## [0.13.2] — 2026-05-14

### Added

- **Share embed extraction**: `extractEmbeds` utility in `@bsky/app` centralizes image/video/external/quote extraction. 4 consumers (PostCard, ThreadView, ComposePage, AITools) now share one implementation. Deleted 260 lines of duplicated inline extraction code.
- **Thread reply expansion**: ThreadView shows "N replies folded" for collapsed reply subtrees. Click to expand via `get_post_thread` with `format: "subtree"`.
- **Session persistence fix**: `auth.ts` now captures refreshed tokens after JWT refresh. `App.tsx` guards profile fetch with session check.
- **Single image mode**: When a post has exactly 1 image, PostCard renders at original aspect ratio (computed via `useEffect` + `Image.prototype.onload`).

### Fixed

- **MCP launch script**: Fixed Windows PowerShell compatibility for npm prefix resolution.
- **AI tool descriptions**: 28 descriptions now use `buildToolDescription` for consistent formatting.
- **Threadgate types**: Added `app.bsky.feed.threadgate` types to client.

## [0.13.1] — 2026-05-13

### Added

- **AI ALT image description**: Settings→Scenario can select a vision model for AI-generated ALT text. `describeImage()` downloads image, sends to vision model with retry + bsky.social fallback. ALT badge on images shows "AI" indicator; click opens modal with generated description + copy button. Cached per image.
- **WCAG 4.1.2 compliance**: 14 `htmlFor`/`id` label associations, 6 `aria-expanded` attributes, `aria-describedby` for character count, `aria-invalid` for validation errors, `role="progressbar"` for upload progress.
- **Hidden input aria-labels**: 5 hidden inputs now have `aria-label` for screen reader context.

### Fixed

- **AI reasoning display**: Removed "Thinking..." placeholder when reasoning is disabled. Thinking content now shown in ThinkingCard with brain SVG icon.
- **Markdown link rendering**: `react-markdown` now uses `linkifyText` for `at://` URI interception inside markdown.

## [0.13.0] — 2026-05-13

### Added

- **MCP Server**: `@epheiamoe/bsky-mcp` npm package. Stdio transport, 33 tools, environment variable auth.
- **TUI AI Chat**: Full AI chat interface in terminal with streaming SSE, tool calls, and markdown rendering.
- **Widget system**: 6 widgets (SuggestedFollows, SuggestedFeeds, Trends, Polish, ProfilePreview, AIChat) with toggle persistence.
- **AT Play experimental**: Social circle analysis with Mermaid visualization.

### Fixed

- **JWT refresh race condition**: `withRefresh` now uses async lock to prevent concurrent refresh attempts.
- **PDS discovery**: Third-party PDS discovery with CORS proxy fallback.

## [0.12.0] — 2026-05-12

### Added

- **DM私信 (Direct Messages)**: Phase 1 + 2 implementation. Send/get/list/delete/mute/read + emoji reactions (8常用) + quote posts + animations + load earlier messages.
- **Threadgate**: Reply restrictions (nobody/mentioned/followers/following/lists) with list selector.
- **List/Feed browsing**: ListsPage, ListDetailPage with Posts/Members tabs + virtual scrolling.

### Fixed

- **Compose redesign**: Multi-post cards with per-post media + ALT text.
- **Draft storage**: AT Protocol drafts + local fallback (IndexedDB/JSON).

## [0.11.0] — 2026-05-11

### Added

- **Bookmarks**: AT built-in API with virtual scrolling.
- **Search**: Posts + users + feeds + trends with Lucene syntax.
- **Profile**: Display info + stats + avatar with letter fallback.

## [0.10.0] — 2026-05-10

### Added

- **Feed timeline**: Virtual scrolling + IntersectionObserver auto-load.
- **Post/Reply**: Auto-growing textarea + 300-char warning + threadgate.
- **Like/Repost**: Unified PostActionsRow component.
- **Notifications**: Interactive with click-to-view.

## [0.9.0] — 2026-05-09

### Added

- **i18n**: zh/en/ja with singleton store instant switch.
- **Theme**: Dark/light with CSS variables + localStorage.
- **PWA**: manifest.json + Service Worker.

## [0.8.0] — 2026-05-08

### Added

- **Auth**: TUI (.env + config) + PWA (localStorage + JWT refresh).

## [0.7.0] — 2026-05-07

### Added

- **Project setup**: Monorepo with @bsky/core, @bsky/app, @bsky/tui, @bsky/pwa.
