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
- **AI Write Confirmation**: `requiresWrite` flag on tools (`create_post`, `like`, `repost`, `follow`, `upload_blob`) is now enforced. `AIAssistant` pauses with a Promise gate; TUI shows a confirmation banner, PWA shows a centered modal.
- **AI Undo / Retry**: `useAIChat` exposes `undoLastMessage()` (remove last user+assistant pair) and `retry()` (re-send last user input). TUI: `u`/`r` keys. PWA: ↻/↩ icon buttons on last user message.
- **TUI Thread Translation**: `f` key on cursor line translates the post text (dynamically imports `translateText` from `@bsky/core`).
- **TUI Quick Settings**: `,` (comma) key opens an interactive `.env` editor for `LLM_API_KEY`, `LLM_BASE_URL`, `LLM_MODEL`, `I18N_LOCALE`.
- **CHANGELOG.md**: This file.

### Changed

- **Image CDN**: `BskyClient.getCdnImageUrl()` now returns `cdn.bsky.app/img/feed_fullsize/plain/{did}/{cid}@{ext}` instead of the PDS blob endpoint (which required JWT auth and triggered browser downloads).
- **AI Chat header (PWA)**: Now sticky (`sticky top-0 z-10 flex-shrink-0`), stays visible below the Bluesky header.
- **Keyboard doc**: `docs/KEYBOARD.md` completely rewritten — full catalog of 5 `useInput` handlers + mouse tracking, per-view key maps, global reserve rules, conflict table, and mandatory 4-step process for adding new shortcuts (enforced by `AGENTS.md`).
- **Settings shortcut key**: Replaced `b` → `r` for bookmark refresh to avoid global `b` key conflict.

### Fixed

- **Thread reply display**: `flattenThreadTree` no longer leaks ancestor siblings into `flatLines` (`d >= 0` guard on `node.replies`). PWA `ThreadView` now caps replies to `depth === 1` (direct replies only).
- **Thread loading state**: TUI `UnifiedThreadView` now shows a loading spinner (`status.loading`) instead of the error text (`thread.loadFailed`) while the API call is in-flight.
- **Thread `c` key double-navigation**: Compose shortcut in thread no longer pushes two navigation states (global `goTo compose` + local `goTo compose` with replyTo).
- **Bookmarks `b` key**: Global `b` (navigate to bookmarks) no longer consumes the bookmarks refresh key. Changed bookmark refresh to `r`.
- **AI text repeat**: `streamingContent` is now reset to `''` on each `tool_call` event, preventing previous-round text from being prepended to the next assistant message.
- **Text overflow (4 sites)**: Added `overflow-wrap: break-word; word-break: break-word` to markdown inline code, markdown paragraphs, tool result containers, and post text elements.
- **"+ New Chat" button (PWA)**: Generates a new UUID via `crypto.randomUUID()` instead of passing `undefined`. `useAIChat` now has a `chatId`-keyed reset effect.
- **Image lightbox (PWA)**: Rendered via `createPortal(document.body)` to escape the virtual scroller's `transform` containing block. No longer scrolls with the feed. z-index bumped to `z-[9999]`.
- **Notification click navigation (PWA)**: `NotifItem` now renders `onClick` with `cursor-pointer` on posts with `reasonSubject`, navigating to the referenced thread.
- **PWA Feed scroll position loss**: `FeedTimeline` now restores scroll position on remount via `initialScrollIndex` + `onFirstVisibleIndexChange` callback.
- **Session expiry after sleep**: Auth store now clears `client`/`session` on restore failure (`isAuthenticated()` check in catch). PWA auto-redirects to login. TUI auto-re-logins with `.env` credentials.
- **AI error display**: `AIChatMessage.isError` flag renders errors in red (both TUI and PWA). `fetch` errors wrapped with URL/context info.
