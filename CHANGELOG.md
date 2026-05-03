# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
