# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
