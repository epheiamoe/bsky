# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
- **`AGENTS.md`**: 新增 Pages Function 文档规范；Build & Deploy 改为两步流程（`--branch=staging` → `--branch=master`）
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
