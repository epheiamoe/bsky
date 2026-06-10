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

**v0.14.0 — 基本开发完成 ✅**

v0.14.0 是一个大版本，包含多个阶段的功能开发。当前标记/审核系统（v0.14.1）已接近完成，进入收尾修复阶段。

### v0.14.0 核心功能 (已完成):
- **Python 沙箱**: 三平台统一架构 (PWA/TUI/MCP)，bsky_tools 库 (33 API 方法)
- **工作区文件管理**: 按 chat session 隔离的文件上传/下载/删除/预览
- **标记/审核系统 (v0.14.1)**: 第三方标签提供商支持，通用/提供商独立配置
- **标签服务失败检测**: 按提供商失败追踪，指数退避重试，用户通知 (banner/toast)
- **审核决策引擎**: 9 种 severity × blurs 组合，多提供商独立评估
- **批量审核集成**: `useModerationBatch` hook + 6 个 PWA 列表组件集成
- **举报功能**: `createModerationReport` API，帖子详情页举报 + TUI `!` 快捷键

### v0.14.0 新增功能 (2026-06-05):
- **bsky.app 链接处理**: 特殊卡片渲染 + 点击选择框（AI Bsky / Bluesky 打开）
- **`/i/` 重定向**: 客户端处理 `domain.com/i/bsky.app/...` 自动跳转到对应页面
- **通知标记已读**: PWA 顶部按钮 + TUI `M` 键快捷键，调用 `updateSeen` API

### 最近修复 (2026-06-04):
- ✅ `BUILTIN_LABEL_DEFINITIONS`: porn/sexual/graphic-media → `blurs='media'` (匹配官方文档)
- ✅ PostPreviewCard: `contentAction='warn'` 模糊整个内容区域，`mediaAction='blur'` 只模糊图片/视频
- ✅ 横幅始终可见: 点击"显示"后横幅不消失，按钮变为"隐藏"
- ✅ 横幅位置修正: media 级别在文字和图片之间，content 级别在标题栏和内容之间
- ✅ blur 溢出修复: 根容器添加 `overflow-hidden` 防止模糊扩散到圆角外

### v0.14.0 新增功能 (2026-06-05):
- **bsky.app 链接处理**: 特殊卡片渲染 + 点击选择框（AI Bsky / Bluesky 打开）
- **`/i/` 重定向**: 客户端处理 `domain.com/i/bsky.app/...` 自动跳转到对应页面
- **通知标记已读**: PWA 顶部按钮 + TUI `M` 键快捷键，调用 `updateSeen` API
- **列表嵌入渲染**: `ListEmbedCard` 组件，头像 + 名称 + 成员数 badge
- **列表订阅到时间线**: API 同步官方订阅状态，`getSubscribedLists`/`subscribeToList`/`unsubscribeFromList`
- **裸 URL 链接化**: `linkifyText` 支持 `bsky.app/...` 裸域名

### 最近修复 (2026-06-09):
- ✅ FeedCache 缓存修剪逻辑: 严格删除所有超出 limit 的帖子（原 TRIM_BATCH 限制导致缓存可无限增长）
- ✅ ComposePage blob URL 泄漏修复: 组件卸载时通过 ref 遍历并 `revokeObjectURL` 清理所有 `perPostImages` 和 `perPostVideos` 的 preview URL
- ✅ FeedTimeline IntersectionObserver 性能修复: 从 sentinel useEffect 依赖数组中移除 `posts.length`，避免每次 loadMore 重建 observer
- ✅ ContentWarningOverlay 无障碍: 被 blur 内容添加 `aria-hidden="true"` + `inert` 属性，reveal 按钮添加 `aria-expanded`

### 最近修复 (2026-06-06):
- ✅ 空 `[@ ]` 卡片: `extractQuotedPost` 跳过 `listView` 记录
- ✅ `/i/` 重定向: `resolved` → `resolved.did` 修复 `[object Object]`
- ✅ `/i/` 资源加载: Vite `base: '/'` 绝对路径
- ✅ 列表订阅: 本地存储 (`feedConfig.subscribedLists`) + FeedHeader 下拉选择
- ✅ FeedHeader 现代化: 横向可滚动 tab bar + 点击 active tab 展开竖向选择器 + 图标按钮（刷新/设置）
- ✅ 列表作为时间线源: 订阅列表直接在 FeedTimeline 显示帖子流，保留进入列表详情入口
- ✅ 跨 Feed 滚动位置保留: 每个 feed/list 独立保存并恢复滚动位置（PWA 像素 + TUI 索引）
- ✅ 修复 feed 切换时滚动位置被 skeleton 高度 clamp 污染的问题
- ✅ URI 锚定恢复: 按顶部可见帖子的 URI + 偏移恢复，避免图片加载导致位置漂移
- ✅ 修复 timeline store 竞态条件: 添加 `_activeLoadUri` 守卫，丢弃旧 feed 的 stale 异步响应
- ✅ 修复 restoration effect 过度触发: 移除 `posts` 依赖，改用 ref 读取，避免每次 `loadMore` 后重复恢复
- ✅ Per-feed 内存缓存 (FeedCache): 已实现
  - 每个 feed 独立缓存帖子 + cursor + 滚动位置，滑动窗口 LRU 删除（默认上限 1000 条）
- 🔄 修复 feed 切换时滚动位置丢失: 已部分修复
  - 给 FeedTimeline 加 `key={feedUri}` 强制 remount，解决组件复用导致的竞态
  - 修复 `initialScrollTop > 0` 条件漏掉 scrollTop=0 的情况
  - 统一 App.tsx 中 feedUri prop 的定义
  - ⚠️ 仍有轻微偏移（可能来自虚拟滚动高度估算或图片加载后的高度变化），待后续优化
- ✅ 发帖页面支持粘贴图像: Ctrl+V 粘贴图像到当前 focus 的帖子
  - 复用现有的 drag & drop 处理逻辑 (`processFiles`)
  - 只拦截图像文件粘贴，不影响文本粘贴
- ✅ LabelerFailureBanner dismiss/retry: 所有 6 个使用组件已集成
  - `FeedTimeline`, `BookmarkPage`, `ProfilePage`, `SearchPage`, `ListDetailPage`, `ThreadView`
  - 支持单个 did 关闭和全部关闭，retry 调用 refresh
  - 当 labeler 恢复时自动重置 dismissed 状态
- ✅ useTimeline 订阅 cleanup: `store.subscribe(tick)` 返回值作为 effect cleanup
- ✅ useTimeline render-safe refs: `lastGoodFeed`/`lastFeed` 修改移入 `useLayoutEffect`
- ✅ useModerationBatch 增量解析: 使用 ref 维护 `LabelCache` 和 `processedUris`，只对新帖子查询标签
- ✅ useModerationBatch 降级处理: catch 块将所有 active labelers 标记为失败，避免"零过滤 + 零提示"
- ✅ useModerationPipeline 死代码: **已清理** (2026-06-09)
  - 原因: `useModerationBatch` 的"先显示再标记"策略已满足核心安全目标
  - 清理范围: `useModerationPipeline` 函数、Pipeline 相关类型、`LoadingSafetyBanner`、`BlockedLoadingScreen`
  - `packages/app/src/hooks/useModerationPipeline.ts` 已重命名为 `useModeration.ts`
  - 计划: `docs/plan/plan_v0.14.0_cleanup_pipeline.md`
  - Commit: `861df44`

### 最近部署 (2026-06-10):
- ✅ 生产环境部署完成: https://ai-bsky.pages.dev (Cloudflare Pages deployment `c8f81813`)
- ✅ 修复第三方标签定义加载失败: `fetchLabelerPolicies` 改用 `getRecord` 替代 `getLabelerServices`
- ✅ `ThirdPartyLabelerCard` 实时获取标签定义
- ✅ `syncFromPDS` 同步时获取新 labeler 的标签定义

### 最近部署 (2026-06-09):
- ✅ 生产环境部署完成: https://ai-bsky.pages.dev (Cloudflare Pages deployment `a79873d2`)
- ✅ v0.14.0 收官: 所有 Critical + High 问题已修复，Pipeline 死代码已清理

### 待完成:
- Playwright 登录后验证（需要 fresh session）

---

**历史版本:**

**v0.15.0 (已合并到 v0.14.0)** — Moderation UI Redesign & Unified Pipeline
- 原计划作为独立版本，实际作为 v0.14.0 的标记系统增强部分开发

**v0.14.0** — 2026-05-22 Released ✅ — Python 沙箱 + 工作区 + bsky_tools 库

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

## v0.15.0 标记系统 (Labeling System) — 2026-05-28 ✅ COMPLETE

### 核心组件
- **决策引擎**: `packages/core/src/moderation.ts` — `resolveModeration()`, 3-value system (show/warn/hide), blurs mapping (content/media/none)
- **标签缓存**: `packages/core/src/moderation-cache.ts` — `LabelCache` batch queries (up to 250 URIs), TTL=5min, per-labeler failure tracking
- **批量 Hook**: `packages/app/src/hooks/useModeration.ts` — `useModerationBatch()` with blob support + incremental resolution
- **配置存储**: `packages/pwa/src/hooks/useModerationConfig.ts` — localStorage persistence

### PWA UI — 三种渲染模式 (v0.15.0)

| 模式 | 触发条件 | 组件 | 效果 |
|------|---------|------|------|
| **Hide** | `contentAction='hide'` | `HiddenBanner` | 替换整个帖子为横幅 |
| **Content Warning** | `contentAction='warn'` + blurs='content' | `ContentWarningOverlay` | 模糊覆盖文字+媒体+引用，保留作者+互动 |
| **Media Blur** | `mediaAction='blur'` + blurs='media' | `ModerationLabelBar` | 文字可见，媒体 CSS blur + show/hide 切换 |
| **Badge** | `blurs='none'` | `BadgeRow` | 作者下方小蓝徽章 |

- **ModerationSettingsTab** — Adult toggle, per-label config, per-labeler failureBehavior
- **ModerationLabelBar** — Compact bar: info icon + label name + show/hide toggle + expandable details
- **ContentWarningOverlay** — Official bsky.app style: blurred background + centered overlay
- **HiddenBanner** — Full-post replacement
- **LabelDetailModal** — Full label source details
- **ReportButton** — Modal dialog in ThreadView
- **WelcomeCard Step 5** — Moderation preferences onboarding
- **LabelerFailureBanner/Toast** — Per-provider failure notifications

### TUI UI (已完成)
- **SettingsView** — `,` quick config, Tab: `🛡 审核`
  - General subtab: adult toggle + 4 standard labels (hide/warn/show cycle)
  - Labelers subtab: enable/disable third-party labelers
- **UnifiedThreadView** — `!` key to report post, async moderation fetching, `[HIDDEN]`/`[WARN]` overlays

### 已修复问题 (2026-05-24 ~ 2026-05-28)
- ✅ `useModerationBatch` blob-aware 导出修复（之前导出了无 blob 支持的旧版本）
- ✅ 增量解析（分页时只解析新帖子）
- ✅ 虚拟列表高度缓存失效（decisions 变化时自动清除）
- ✅ TUI 异步 moderation 获取
- ✅ `nudity` blurs 改为 'media'（匹配官方，只模糊媒体）
- ✅ `ContentWarningOverlay` 用于 blurs='content' 标签（sexual/graphic-media）
- ✅ blur 溢出修复（overflow-hidden rounded-lg）
- ✅ ThreadView 重复 ModerationLabelBar 删除

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
