# Context Compression Recovery Guide

> 当 AI 会话上下文被压缩后，阅读本文档快速恢复工作状态。

## 必读文件索引（前 10）

| 文件 | 说明 |
|------|------|
| `AGENTS.md` | 架构原则、安全红线、命令参考 |
| `docs/ARCHITECTURE.md` | 系统架构（含 v0.13.9 ApiAdapter 模式） |
| `docs/PACKAGES.md` | 各包职责与文件清单 |
| `docs/hooks/index.md` | 所有 hook 分类索引 |
| `docs/ai/index.md` | AI 集成架构（ApiAdapter + 7 providers） |
| `docs/SCROLL.md` | 虚拟滚动 + 滚动恢复规范（必须用像素值） |
| `docs/KEYBOARD.md` | TUI 快捷键冲突表 |
| `docs/MCP.md` | MCP 服务器实现记录 |
| `docs/DM.md` | DM 私信 API/鉴权/模型 |
| `docs/LABELING.md` | 标记/审核系统架构 (v0.15.0) |
| `CHANGELOG.md` | 完整版本历史 |

> 其余文档见 `docs/archive/`。详细教训见 `docs/LESSONS.md`（69 课分类索引 → `docs/lessons/*.md`）。
> Python 沙箱状态：`docs/PYTHON_SANDBOX_STATUS.md`。MCP 故障排查：`docs/MCP_TROUBLESHOOTING.md`。
> **下一阶段计划**：`docs/PHASE14_PLAN.md` — AI Batch AT Tool Calls（bluesky_tools Python 库）

## 当前版本

**v0.15.0 (in development)** — Labeling / Moderation System

### 已完成功能 (v0.15.0):
- **标记/审核系统**: 第三方标签提供商支持，通用/提供商独立配置
- **动态标签查询**: `com.atproto.label.queryLabels` 批量查询 + LabelCache (TTL 5min)
- **审核决策引擎**: 9 种 severity × blurs 组合，多提供商独立评估，最严格动作优先
- **PWA UI**: 设置页面(通用+官方+第三方), PostCard 集成, ThreadView 举报按钮, Welcome 第5步
- **Info 按钮**: 所有隐藏/警告/徽章元素旁显示标签来源信息
- **举报功能**: `createModerationReport` API，帖子详情页举报
- **自标记**: PostRecord.labels 类型 + AI create_post 工具支持 labels 参数
- **TUI 审核设置**: `,` 快速配置中新增「审核」Tab（通用设置+标签商管理）
- **TUI 举报快捷键**: ThreadView 中 `!` 键举报当前帖子
- **TUI 配置**: `TuiConfig.moderationConfig` 字段已添加
- **i18n**: zh/en/ja 完整翻译

### 进行中:
- TUI 审核 UI (设置 + 帖子渲染 + 举报快捷键)
- 自标记 (发帖时添加标签)

### 计划:
- WebSocket 实时标签订阅
- Bluesky 官方偏好同步 (`putPreferences`)
- AI 工具: `check_post_labels`

---

**v0.14.0** — 2026-05-22 Released ✅

Python 沙箱 + 工作区 + bsky_tools 库。完整项目记录见 `docs/archive/PHASE14_COMPLETE.md`。

**核心功能**:
- `execute_python` AI 工具（第 34 个），三平台统一架构
- bsky_tools Python 库：33 个 Bluesky API 方法可从 Python 批量调用
- **统一 handler 架构**：PWA Worker → Main Thread → `ToolDispatcher` → `tools.ts` → `BskyClient`
- 零重复实现：所有 handler 逻辑在 `@bsky/core` 中只写一次

**三平台实现**:
- **PWA**: PyodideSandbox (Web Worker + Pyodide WASM + SharedArrayBuffer)
- **TUI**: NodePythonSandbox (child_process + JSON-RPC)
- **MCP**: NodePythonSandbox (同上，通过 MCP stdio 协议暴露)

**安全特性**:
- AST 预执行分析检测 write 操作
- 双层确认：AST 分析 + Worker enableWrite gate
- Fail-safe：分析失败时默认要求确认（而非允许执行）
- i18n 确认对话框：zh/en/ja

**关键修复**:
- Pyodide proxy 参数丢失（dict→Map→Object 转换）
- `import bsky_tools` 模块注册（sys.modules）
- COEP credentialless（修复 CDN 图片加载）
- 强制 keyword-only 参数（消除位置传参混乱）
- 可选参数 None 默认值

**测试**: 51 项测试，95.7% 通过率
**文档**: `docs/BSKY_TOOLS.md`, `docs/PYTHON_SANDBOX_STATUS.md`, `docs/MCP_TROUBLESHOOTING.md`

**v0.13.9** — API Adapter 模式：`ApiAdapter` 接口 + `ChatCompletionsAdapter` + `ResponsesApiAdapter`。新增 4 个提供商（OpenAI/xAI/Kimi/OpenRouter）。`fixedParams`/`supportsReasoningEffort` 元数据。`reasoningEffort` 支持。Welcome 设置 6 厂商展示卡。

> 更早版本详见 `CHANGELOG.md`。

## 项目状态

- **PWA 在线**: https://bsky.epheia.dev / https://ai-bsky.pages.dev
- **GitHub**: https://github.com/epheiamoe/bsky
- **PWA 部署**: `cd packages/pwa && pnpm build && npx wrangler pages deploy dist --project-name ai-bsky --commit-dirty=true`
- **TUI 运行**: `npx tsx packages/tui/src/cli.ts`
- **默认 LLM**: `deepseek-v4-flash`，翻译默认 zh
- **左侧导航栏**: Feed / 通知 / 搜索 / 书签 / 列表 / 资料 / AI 对话 / 发帖 / AT Play / 组件
- **右侧组件栏** (lg+ 390px): 6 widgets — SuggestedFollows, SuggestedFeeds, Trends, Polish, ProfilePreview, AIChat
- **组件页**: `#/components` ↑↓ 排序 + 启用/禁用
- **关于页面**: `#/about` — repo URL / commit hash / build time

> 详细功能状态见 `docs/TODO.md`。

## 关键架构模式

### SVG 图标系统（PWA only）
```tsx
import { Icon } from './Icon.js';
<Icon name="heart" size={18} filled={isLiked} />
```
- `packages/pwa/src/components/Icon.tsx` — `import.meta.glob` 自动加载 `../../icons/*.svg`
- `packages/pwa/src/icons/` — lucide 风格 SVG
- `filled` → `fill="currentColor"` + `stroke-width="0"`
- TUI 保持 emoji

### 模块级共享状态
| 模块 | 作用 | 导出 |
|------|------|------|
| `usePostActions.ts` | 赞/转状态+计数 | `likePost()`, `isPostLiked()`, `getLikeCount()` |
| `useActiveFeed.ts` | 上次活跃 feed URI | `getLastFeedUri()`, `setLastFeedUri()` |
| `useScrollRestore.ts` | 跨视图滚动位置缓存 | `useScrollRestore(key, ref, ready)` |
| `widgetStore.ts` | Widget 状态管理 | `initEnabledWidgets`, `getEnabledWidgetIds`, `toggleWidget` |

### AI 共享组件（`packages/pwa/src/components/ai/`）
```tsx
import { ThinkingCard, ToolCard, UserMessage, AssistantMessage, formatToolResult } from './ai/index.js';
```
- **ThinkingCard**: 可折叠推理卡片，brain SVG，紫色主题
- **ToolCard**: 可折叠工具结果卡片，wrench SVG，琥珀主题
- **UserMessage/AssistantMessage**: Markdown 渲染
- `compact` prop 控制大小，AIChatPage 和 AIChatWidget 共用

### Widget 系统 (v0.5.3)
```
WidgetPanel 统一 header: [icon] [title] [↑] [↓] [×]
Widget 纯内容（无标题、无关闭按钮）
```
- 6 widgets: SuggestedFollows, SuggestedFeeds, Trends, Polish, ProfilePreview, AIChat
- 组件页 `#/components` 提供 ↑↓ 排序
- `toggleWidget()` → `_onWidgetToggle(id)` → `saveAppConfig()` 持久化
- AIChatPage 进入时自动 `disableWidget('aiChat')`

### /view 命令（注入上下文给 AI）
```
输入 /view → 自动检测当前页面 → 替换为 <currently_viewing> 标签
支持的页面：帖子(uri)、用户(@handle)、搜索(query)
私人页面(书签/草稿/DM)不支持
```

### 统一帖子操作栏
```tsx
import { PostActionsRow } from './PostActionsRow.js';
<PostCard post={post} goTo={goTo}>
  <PostActionsRow client={client} goTo={goTo} post={post} />
</PostCard>
```
覆盖：FeedTimeline、SearchPage、ProfilePage、BookmarkPage、ThreadView

### AI 对话 Session URL
- URL: `#/ai?session=uuid`
- Context 存储在 `ChatRecord.context?: { type, uri|handle }`
- 恢复时从存储读取 context → 重建 system prompt

### 引用帖提取规范
```typescript
// ✅ 正确 — 读顶层解析字段 (API-resolved #view)
const embed = (post as any).embed;
if (embed?.$type === 'app.bsky.embed.record#view') {
  const rec = embed.record; // 含 author/text/embeds
}
// ❌ 错误 — 读 record.embed（仅 {uri, cid}）
```

### 共享 Embed 提取（v0.13.2）
所有逻辑集中在 `packages/app/src/utils/extractEmbeds.ts`:
```
extractImages / extractVideo / extractExternalLink / extractQuotedPost / extractHasGif / extractEmbeds
```
4 个消费者全部调用共享函数，禁止内联提取。

### 导航 + 默认 feed
```typescript
goTo({ type: 'feed' }) → getLastFeedUri() → getFeedConfig().defaultFeedUri → BUILTIN_FEEDS.following
goHome() → getFeedConfig().defaultFeedUri → BUILTIN_FEEDS.following
```

## 快速命令

```bash
cd packages/tui && npx tsx src/cli.ts           # TUI
cd packages/pwa && pnpm dev                     # PWA dev
cd packages/pwa && pnpm build && npx wrangler pages deploy dist --project-name ai-bsky --commit-dirty=true
pnpm -r typecheck && pnpm -r build
cd packages/core && npx vitest run --config vitest.config.ts
```

## 开发规则

1. 绝不硬编码凭证到提交文件
2. 新增快捷键必须查 `docs/KEYBOARD.md` 冲突表
3. Ink 中多个 `useInput` 同时触发 → 每个需 view-specific guard
4. React Portal 合成事件沿 React 树冒泡
5. 改 AI 行为：编辑 `prompts.ts` → rebuild
6. 帖子操作栏统一用 `PostActionsRow`，不要手写
7. 引用帖从 `post.embed`（顶层）读，不用 `post.record.embed`
8. PWA 图标用 `<Icon name="...">`，按钮用纯文字不用 emoji — TUI 保持 emoji
9. 图片上传不在 AI 对话中自动发到 Bluesky — 只在 create_post 时上传
10. AI 搜索工具强制使用 authenticated endpoint — public API 返回 403
11. FlatLine 图片数据用 `imageDetails: Array<{url, alt}>` — 所有消费方同步
12. DraftStore 使用模块级 `_clientRef`，不可闭包捕获 client
13. 滚动位置恢复必须用像素值（`scrollTop`），不能用索引（`scrollToIndex`）
14. chat API 直连 `api.bsky.chat` + session JWT，不走 PDS 代理（返回 501）
15. Widget 排序索引用完整 `enabledIds.indexOf(w.id)`，不用过滤后的视觉索引
16. SVG 图标在共享组件（`ai/` 目录）中必须硬编码为 inline SVG 常量
17. WidgetPanel 统一提供 header，widget 只负责内容区域
18. 所有 `toggleWidget()` 调用通过 `_onWidgetToggle` 回调自动 `saveAppConfig()`
19. AI 卡片动画不可条件渲染，必须用 CSS `max-h` + `opacity` transition
20. 流式输出 scroll：用 `requestAnimationFrame(() => container.scrollTop = container.scrollHeight)`
21. 移动键盘避免空白：用 `window.visualViewport.height` 而非 `100dvh`
22. ky retry：显式 `retry: { limit: 1, statusCodes: [408,413,429,500,502,503,504] }`
23. i18n 插值必须使用单大括号 `{n}`，`{{n}}` 会渲染为 `{1}`
24. 涉及重复数据时用 PDS 层 API（`listRecords`）而非 AppView（`getList`）
25. 构建时注入的元数据必须在 commit 之后 build，否则 About 页面显示旧 hash
26. 新增 `requiresWrite` AI 工具时必须同步添加 `buildToolDescription` case
27. 所有 embed 提取使用 `@bsky/app` 共享函数，禁止任何消费者内联实现
28. 单图宽高比容器用 JS 计算尺寸（`useEffect`）而非 CSS `fit-content`/`aspect-ratio`

## 关键文件速查

| 文件 | 职责 |
|------|------|
| `packages/app/src/hooks/usePostActions.ts` | 模块级赞/转状态+计数 |
| `packages/app/src/hooks/useActiveFeed.ts` | 模块级活跃 feed 跟踪 |
| `packages/app/src/hooks/useScrollRestore.ts` | 跨视图滚动保存/恢复 |
| `packages/app/src/hooks/useCompose.ts` | 发帖 hook v2（posts[] 数组 + 帖子串 submit） |
| `packages/app/src/hooks/useDrafts.ts` | 草稿存储 v2（PDS + 本地回退 + _clientRef） |
| `packages/app/src/hooks/widgetStore.ts` | Widget 状态：启用/关闭 + ComposePage 草稿桥接 |
| `packages/core/src/at/client.ts` | BskyClient + XRPC 方法 |
| `packages/pwa/src/components/PostActionsRow.tsx` | 统一帖子行为栏 |
| `packages/pwa/src/components/Icon.tsx` | SVG 图标组件（`import.meta.glob`） |
| `packages/pwa/src/components/ComposePage.tsx` | 发帖页 v2（多帖卡片 + per-post media + ALT） |
| `packages/pwa/src/components/WidgetPanel.tsx` | 右侧组件栏渲染 |
| `packages/pwa/src/components/VideoCard.tsx` | HLS 视频播放器 |
| `packages/pwa/src/components/ConvoListPage.tsx` | DM 会话列表 |
| `packages/pwa/src/components/DMChatPage.tsx` | DM 对话视图（气泡 + 反应 + 引用 + 删除 + 静音） |
| `packages/pwa/src/components/ai/` | AI 共享组件（ThinkingCard, ToolCard, formatToolResult） |
| `packages/core/src/ai/tools.ts` | 33 个 AI 工具定义（单一真相源） |
| `packages/core/src/ai/tool-dispatcher.ts` | 统一工具调度器（PWA/TUI/MCP 共用） |
| `packages/core/src/ai/bsky-tools-api.ts` | bsky_tools API 类型定义 + filterFields |
| `packages/core/src/ai/bsky-tools-definitions.ts` | 工具元数据 + Python wrapper 生成 |
| `packages/pwa/src/services/pyodide.worker.ts` | Pyodide Web Worker（transport-only） |
| `packages/pwa/src/services/pyodide-sandbox.ts` | PWA 主线程：ToolDispatcher + SAB 通信 |
| `packages/app/src/services/node-python-sandbox.ts` | TUI/MCP Python 沙箱（JSON-RPC） |
| `packages/core/src/ai/prompts.ts` | AI 系统提示词 |
| `packages/core/src/ai/assistant.ts` | AI 对话引擎 |
| `packages/core/src/ai/adapter.ts` | ApiAdapter 接口 + ChatCompletionsAdapter |
| `packages/core/src/ai/responses-adapter.ts` | ResponsesApiAdapter |
| `packages/core/src/ai/providers.json` | 7 个提供商配置 |
| `packages/app/src/utils/extractEmbeds.ts` | 共享 embed 提取（images/video/external/quoted） |
| `packages/app/src/stores/cache.ts` | 模块级数据缓存层 |
| `packages/app/src/hooks/useVirtualizedList.ts` | 统一虚拟滚动 + 高度缓存 + 位置恢复 |

## v0.15.0 标记系统 (Labeling System) — 2026-05-24

### 核心组件
- **决策引擎**: `packages/core/src/moderation.ts` — `resolveModeration()`, `DEFAULT_MODERATION_CONFIG`, `STANDARD_LABELS`
- **标签缓存**: `packages/core/src/moderation-cache.ts` — `LabelCache` batch queries (up to 250 URIs), TTL=5min
- **React Hook**: `packages/app/src/hooks/useModeration.ts` — `useModeration()` + `resolveModerationBatch()`
- **配置存储**: `packages/pwa/src/hooks/useModerationConfig.ts` — localStorage persistence

### PWA UI (已完成)
- **ModerationSettingsTab** — Adult toggle switch (bsky.app style), per-label cards with descriptions, segmented buttons (show/warn/hide), feedback banners
- **ModerationOverlay** — HiddenContent / WarningContent / BlurredMedia / BadgeRow / LabelSourceInfo
- **ReportButton** — Modal dialog in ThreadView
- **WelcomeCard Step 5** — Moderation preferences onboarding
- **#/settings route** — Full page (not modal), fixed height `h-dvh md:h-[calc(100dvh-3rem)]`, `overflow-y-auto` content area

### TUI UI (已完成)
- **SettingsView** — `,` quick config, Tab: `🛡 审核`
  - General subtab: adult toggle + 4 standard labels (hide/warn/ignore cycle)
  - Labelers subtab: enable/disable third-party labelers
- **UnifiedThreadView** — `!` key to report post

### 已知问题 (Critical)
- **moderationDecision not applied to posts**: `PostCard` accepts `moderationDecision` prop, but zero callers pass it. Decision engine works but UI never uses it.
- **List-level batch moderation missing**: Need to call `resolveModerationBatch()` in list components and pass per-post decisions to `PostCard`

### 内置标签服务 (10 verified active)
1. `moderation.bsky.app` — Bluesky官方
2. `skywatch.blue` — Skywatch
3. `perisai.bsky.social` — Perisai
4. `moderation.blacksky.app` — Blacksky
5. `asukafield.xyz` — Asuka
6. `xblock.aendra.dev` — XBlock
7. `bskyttrpg.bsky.social` — TTRPG
8. `sonasky.app` — SonaSky
9. `creatorlabeler.bsky.social` — CreatorLabeler
10. `arttheft.bsky.social` — ArtTheft

> 验证方式: `com.atproto.identity.resolveHandle` + `app.bsky.labeler.getServices`
> 已移除: `aegis.blue` (defunct ~2024 mid)

### 开发规则补充
29. `overflow-hidden` → `overflow-clip` for rounded containers that should not intercept wheel events
30. SettingsPage height pattern: `h-dvh md:h-[calc(100dvh-3rem)]` with `overflow-y-auto` content area
31. Built-in labelers MUST have real DIDs verified via API; no placeholder handles without DIDs
32. Adult content toggle: master switch controls visibility of per-label controls; "show" replaces "ignore" in UI
33. `nudity` defaults to `ignore` (show), others to `warn`

(End of file)
