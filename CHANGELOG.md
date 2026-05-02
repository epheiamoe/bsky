# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.3.0] — 2026-05-02

### Added

- **Video support** (PWA + TUI):
  - Core: `VideoEmbed` type, `getVideoThumbnailUrl()`/`getVideoPlaylistUrl()` CDN helpers
  - PWA: `VideoCard` component with `hls.js` lazy-loading, thumbnail + play button
  - TUI: `🎬 视频` indicator with OSC 8 clickable link (Ctrl+Click → browser playback)
- **GIF support**: `getCdnImageUrl` detects `image/gif` → `@gif` extension preserves animation; PWA `<img>` native, TUI OSC 8 link
- **Compose video upload** (PWA + TUI):
  - Same "Media" button (`i` key / `📷` icon), auto-detects image vs video
  - Video ≤ 100MB, 1 video per post; mutually exclusive with images (Bluesky limit)
  - `ComposeImage` → `ComposeMedia` (adds `type: 'image' | 'video'`, backward compat)
- **Auto image compression** (>1MB):
  - PWA: Canvas API (`toBlob` JPEG/WebP), resize to 2048px, quality 82→65→40 fallback
  - TUI: `sharp` native library, same resize/quality strategy
  - Both show explicit notification: "filename: 2.3MB → 0.8MB"
- **#tag rendering** (PWA + TUI):
  - PWA: `linkifyText` regex `#[\p{L}\p{N}_]+`, click → `#/search?q=tag&tab=top`
  - TUI: `#tag` and `@handle` shown as OSC 8 clickable links (Ctrl+Click → browser)
- **AI button in all views**: `PostActionsRow` now includes `astroid-as-AI-Button` (FeedTimeline, Search, Bookmarks, Thread replies)
- **State preservation across navigation**:
  - PWA: search tab (`&tab=`), profile tab (`&tab=`) encoded in URL
  - TUI: search tab, profile tab saved/restored via `viewStateStore`
- **`docs/AI_CONTEXT.md`**: Complete documentation of AI context injection mechanism, effect delegation, extension guide

### Fixed

- **AI `search_posts` tool**: `public.api.bsky.app` returns 403 for search → now always uses authenticated endpoint (`this.ky`)
- **AI context injection**: Effect 3 `changed` check now tracks `contextUri`, `contextPost`, `contextProfile` independently (was only `contextUri`); guiding questions restored on page refresh from storage
- **AI session URL persistence**: `encodeView`/`parseHash` now include `&post=`/`&profile=` in URL for refresh survival
- **Icon plain text bugs**: `ComposePage.tsx` header and `NotifsPage.tsx` fallback both had `<Icon>` as string literals → rendered as text
- **ThreadView dead code**: Removed unused `ActionButtons` component (395 lines), duplicate AI button

### Changed

- **`tools.ts` moved**: `packages/core/src/at/tools.ts` → `packages/core/src/ai/tools.ts` (AI module, not AT Protocol utility)
- **i18n labels**: "图片/Image/画像" → "媒体/Media/メディア" in compose context
- **Profile tab**: `useProfile` now accepts optional `initialTab` parameter
- **TUI compose footer**: Updated key hints to reflect media mode (`i:媒体`/`i:Media`/`i:メディア`)

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
