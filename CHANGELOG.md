# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- **i18n**: Shared locale module (`@bsky/app/src/i18n`) with zh/en/ja translations (160+ keys). Singleton store so `setLocale()` propagates instantly across all components.
- **PWA i18n**: 14 components use `t()`. Language selector in Settings → General, persisted to `localStorage`.
- **TUI i18n**: 11 components use `t()`. `.env`-based locale via `I18N_LOCALE` or `TRANSLATE_TARGET_LANG`.
- **TUI Setup Wizard**: First-run interactive `.env` configurator (6 fields: handle, password, API key, base URL, model, locale).
- **TUI Quick Settings**: `,` (comma) key opens an interactive `.env` editor for `LLM_API_KEY`, `LLM_BASE_URL`, `LLM_MODEL`, `I18N_LOCALE`.
- **TUI Thread Translation**: `f` key on cursor line translates the post text (dynamically imports `translateText` from `@bsky/core`).
- **AI Write Confirmation**: `requiresWrite` flag on tools (`create_post`, `like`, `repost`, `follow`, `upload_blob`) is now enforced. `AIAssistant` pauses with a Promise gate; TUI shows a confirmation banner, PWA shows a centered modal.
- **AI Undo / Retry**: `useAIChat` exposes `undoLastMessage()` (remove last user+assistant pair) and `retry()` (re-send last user input). TUI: `u`/`r` keys. PWA: retry/undo icon buttons on last user message.
- **Repost / Quote choice**: TUI `r` key now shows repost/quote/cancel dialog. PWA repost button shows dropdown with Repost/Quote options.
- **Quote post support**: `FlatLine.quotedPost` extracts quoted post content from embed. Rendered as sub-card in both TUI (magenta border) and PWA (author + text + thumbnails). `useCompose` supports `quoteUri` for creating quote posts.
- **Reply load-more**: `useThread.expandReplies()` increases visible sibling count by 10. TUI: Enter on truncation line. PWA: click "Show N more replies" button.
- **Draft support**: `useDrafts` hook with in-memory store. TUI: `D` key draft list, exit prompt (y/n save). PWA: Drafts panel in compose header, count badge on sidebar.
- **CHANGELOG.md**: This file.

### Changed

- **Image CDN**: `getCdnImageUrl()` now returns `cdn.bsky.app/img/feed_fullsize/plain/{did}/{cid}@{ext}` instead of the PDS blob endpoint (which required JWT auth and triggered browser downloads).
- **AI Chat header (PWA)**: Now sticky (`sticky top-0 z-10 flex-shrink-0`), stays visible below the Bluesky header.
- **Keyboard doc**: `docs/KEYBOARD.md` completely rewritten — full catalog of 5 `useInput` handlers + mouse tracking, per-view key maps, global reserve rules, conflict table, and mandatory 4-step process for adding new shortcuts (enforced by `AGENTS.md`).
- **Settings shortcut key**: Replaced `b` → `r` for bookmark refresh to avoid global `b` key conflict.
- **PWA ThreadView replies**: Depth filter changed from `depth === 1` to `depth > 0` — shows nested replies with indentation.

### Fixed

- **Thread reply display**: `flattenThreadTree` no longer leaks ancestor siblings into `flatLines` (`d >= 0` guard on `node.replies`). Added `visitedUris` Set to prevent duplicate entries from recursive parent-chain traversal.
- **Thread loading state**: TUI `UnifiedThreadView` shows a loading spinner while the API call is in-flight, not the error text.
- **Thread `c` key double-navigation**: Compose shortcut in thread no longer pushes two navigation states.
- **Thread j/k navigation**: Replaced `flatLines.length` with a `useRef`-synced `flatLen` in the `useInput` handler to avoid stale-zero-length closure. Added cursor indicator to discussion source (theme lines).
- **Bookmarks `b` key**: Global `b` (navigate to bookmarks) no longer consumes the bookmarks refresh key. Changed bookmark refresh to `r`.
- **AI text repeat**: `streamingContent` is now reset to `''` on each `tool_call` event, preventing previous-round text from being prepended to the next assistant message.
- **Text overflow (4 sites)**: Added `overflow-wrap: break-word; word-break: break-word` to markdown inline code, markdown paragraphs, tool result containers, and post text elements.
- **"+ New Chat" button (PWA)**: Generates a new UUID instead of passing `undefined`. `useAIChat` now has a `chatId`-keyed reset effect.
- **Image lightbox (PWA)**: Rendered via `createPortal(document.body)` to escape the virtual scroller's `transform` containing block. z-index bumped.
- **Notification click navigation (PWA)**: `NotifItem` now renders `onClick` with `cursor-pointer` on posts with `reasonSubject`, navigating to the referenced thread.
- **PWA Feed scroll position loss**: `FeedTimeline` restores scroll position on remount via `initialScrollIndex` + `onFirstVisibleIndexChange`.
- **Session expiry after sleep**: Auth store clears `client`/`session` on restore failure. PWA auto-redirects to login. TUI auto-re-logins with `.env` credentials.
- **AI error display**: `AIChatMessage.isError` flag renders errors in red (both TUI and PWA). `fetch` errors wrapped with URL/context info.
- **Timeline error banner**: `store.error` is now cleared on successful `load`/`loadMore`, preventing expired-token errors from persisting after successful refresh.
- **Quote extraction (PWA)**: `extractQuotedPost` now handles `recordWithMedia`'s double-nested record structure (`embed.record.record`).
