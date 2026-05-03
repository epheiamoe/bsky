# Context Compression Recovery Guide

> 当 AI 会话上下文被压缩后，阅读本文档快速恢复工作状态。

## 必读文件（按优先级）

1. **`AGENTS.md`** — 架构原则、安全红线、命令参考
2. **`docs/CONTEXT.md`** — 本文（上下文恢复 + 关键结论 + 教训）
3. **`docs/ARCHITECTURE.md`** — 系统架构
4. **`docs/PACKAGES.md`** — 各包职责与文件清单
5. **`docs/HOOKS.md`** — 所有 hook 签名
6. **`docs/KEYBOARD.md`** — TUI 快捷键
7. **`CHANGELOG.md`** — 版本历史
8. **`packages/core/src/ai/prompts.ts`** — AI 提示词
9. **`packages/core/src/ai/tools.ts`** — 31 个 AI 工具定义

## 版本

**v0.3.0** — Git tag `v0.3.0`

## 项目状态

- **PWA 在线**: https://ai-bsky.pages.dev
- **GitHub**: https://github.com/epheiamoe/bsky
- **PWA 部署**: `cd packages/pwa && pnpm build && npx wrangler pages deploy dist --project-name ai-bsky --commit-dirty=true`
- **支持多 LLM 提供商**: DeepSeek, Mistral (设置 → Scenario 为不同场景分配不同模型)
- **默认 LLM**: `deepseek-v4-flash`，翻译默认 zh

## 🔴 关键教训

### 1. AI 自动发帖
**根因**：提示词有"生成一条回复"、"并与我互动"。
**修复**：`P_ASSISTANT_BASE` 3 条硬规则 + `PF_PROFILE_CONTEXT` 移除回复指令 + `PF_AUTO_ANALYSIS` 移除互动。
**教训**：提示词一个字都可能触发写行为。必须鲜明的否定性指令。确认门是最后防线。

### 2. `edit()` 不回滚对话
**修复前**：仅复制文本到输入框。
**修复后**：`edit()` = `assistant.loadMessages(keep)` 撤销 + 返回文本预填 = `editByIndex(lastUser)`. TUI 用序号选择编辑/复制。

### 3. Following feed 可被删除
**修复**：`removeFeed()` 检查 `uri === BUILTIN_FEEDS.following` 则 no-op。

### 4. @handle 链接 401
**根因**：`linkifyText` 中 `encodeURIComponent('@handle')` → `%40handle` → 用户未找到。
**修复**：先 `slice(1)` 去 @ 再编码。

### 5. 默认 feed 未生效
**根因**：PWA `App.tsx` 启动时不读 `getFeedConfig().defaultFeedUri`。
**修复**：`goTo({ type: 'feed' })` 裸调用 → `useActiveFeed` 解析到 lastActive → default → `BUILTIN_FEEDS.following`。PWA URL 始终含 `?feed=`。

### 6. 搜索只支持帖子
**修复**：`useSearch` 重构为 4 标签（热门/最新/用户/动态源），PWA+TUI 均已适配。

### 7. PWA feed 每次退出都刷新
**根因**：PWA `feedUri = undefined` 时 `useTimeline` 检测到 feed 变化 → 清空重载。
**修复**：`useTimeline` 内部 `lastGoodFeed` ref 缓存最后有效值，`undefined` 不触发重置。

### 8. 引用帖显示空卡片
**根因**：读取 `post.record.embed` 的存储格式（仅 `{uri,cid}`）→ 无 author/text。
**修复**：读取 `(post as any).embed` 的 API 解析格式（`#view` 后缀），含完整 `author`/`value.text`/`embeds`。
**画像格式**：`#view` 下用 `img.fullsize` 直链，兜底 `img.image.ref.$link`。

### 9. 点赞/转发计数不更新
**根因**：`usePostActions` 只追踪 boolean，不追踪 count。
**修复**：模块级 `_likeCountAdj`/`_repostCountAdj` Map，toggle 时 ±1。`getLikeCount(uri, staticCount)` 计算合并。

### 10. PWA 侧边栏/回家不跳默认 feed
**根因**：`goTo({ type: 'feed' })` 裸调不解析。
**修复**：`useActiveFeed` hook + `goTo` 解析链：lastActive → default → `BUILTIN_FEEDS.following`。

### 11. PWA SVG 图标显示为文字
**根因**：emoji 替换脚本对字符串做了 `split/join`，把 `<Icon>` JSX 变成了模板字符串字面量。
**修复**：逐个文件将 string template → JSX 元素。`SettingsModal` tabs 改用 `iconName` + `<Icon name={}>`。

### 12. 各帖子列表不统一
**根因**：FeedTimeline 有 `FeedCardActions`、ThreadView 有 `ActionButtons`、Search/Profile/Bookmark 无按钮。
**修复**：新建 `PostActionsRow` 共享组件（reply+repost/quote popup+like+bookmark），全局替换。

### 13. AI 工具搜索公开 API 返回 403
**根因**：`public.api.bsky.app/xrpc/app.bsky.feed.searchPosts` 需要认证。
**修复**：`searchPosts` 强制使用 authenticated endpoint (`this.ky`) — `client.ts`。

### 14. `view_image` 工具返回提示误导 AI
**根因**：`view_image` 工具返回硬编码了 "Text-only models: skip image analysis" — AI 读到后自我限制。
**修复**：工具返回动态化 — `visionEnabled ? "you will see this image" : "vision mode is OFF"`。

### 15. 浏览器 `TypeError: Failed to fetch`（大小写不匹配）
**根因**：catch 检查 `e.message === 'fetch failed'`（Node.js 格式），但浏览器抛出 `'Failed to fetch'`（大写 F）→ 漏过 → 给用户显示原始错误。
**修复**：改为 `e instanceof TypeError`（不检查 message）→ `client.ts`。

### 16. DNS 污染导致 API 不可达
**根因**：Mistral 在中国被 DNS 污染，VPN 规则模式下被错判为直连 → `Failed to fetch`。
**教训**：遇到网络错误先确认 API URL 可通过浏览器/curl 直接访问；不要修改代码来"修复"网络问题。

### 17. `useAIChat` 中 `useState(() => new AIAssistant(aiConfig))` 仅运行一次
**根因**：初始化器在第一次挂载时运行；`aiConfig` prop 变化后 assistant 仍保留旧 `baseUrl`/`apiKey`。
**修复**：`AIAssistant.updateConfig()` + `useEffect(() => assistant.updateConfig(aiConfig))`。

### 18. 场景模型只提取模型名，不切换提供商
**根因**：场景 "deepseek/deepseek-v4-flash" 只提取 <code>deepseek-v4-flash</code>，但 `baseUrl` 和 `apiKey` 仍用主配置 → 请求发到错误端点。
**修复**：`App.tsx` 中的 `resolveScenarioConfig()` 从场景模型字符串解析出完整 `AIConfig`（含 `baseUrl`、`apiKey`、`provider`）。

### 19. 查看图片后上下文不持久
**根因**：`_buildMessages()` 将图片注入到 messages 副本后立即清除 `_pendingImages`，但未写回 `this.messages`。
**修复**：注入图片后也更新 `this.messages[i].content = blocks` → 视觉上下文在对话轮次间持久。

---

## 🔑 关键架构模式

### SVG 图标系统（PWA only）
```tsx
import { Icon } from './Icon.js';
<Icon name="heart" size={18} filled={isLiked} />
```
- `packages/pwa/src/components/Icon.tsx` — 通过 `import.meta.glob` 自动加载所有 `../../icons/*.svg`
- SVG 文件在 `packages/pwa/src/icons/` — lucide 风格
- `filled` 属性 → `fill="currentColor"` + `stroke-width="0"`
- TUI 保持 emoji 图标

### 模块级共享状态
| 模块 | 作用 | 导出 |
|------|------|------|
| `usePostActions.ts` | 赞/转状态+计数，所有视图共享 | `likePost()`, `isPostLiked()`, `getLikeCount()`, `seedPostViewers()` |
| `useActiveFeed.ts` | 上次活跃 feed URI | `getLastFeedUri()`, `setLastFeedUri()` |
| `useScrollRestore.ts` | 跨视图滚动位置缓存 | `useScrollRestore(key, ref, ready)` |

### 统一帖子操作栏（PWA）
```tsx
import { PostActionsRow } from './PostActionsRow.js';
// 在任何 PostCard 中使用
<PostCard post={post} goTo={goTo}>
  <PostActionsRow client={client} goTo={goTo} post={post} />
</PostCard>
```
已覆盖：FeedTimeline、SearchPage、ProfilePage、BookmarkPage、ThreadView（focused + replies）

### AI 对话 Session URL
- URL 格式：`#/ai?session=uuid`（不再是 `?contextUri=...`）
- Context 存储在 `ChatRecord.context?: { type: 'post'|'profile', uri|handle }`
- 恢复时从存储读取 context → 重建 system prompt

### 引用帖提取规范
```typescript
// ✅ 正确 — 读顶层解析字段
const embed = (post as any).embed;
if (embed?.$type === 'app.bsky.embed.record#view') {
  const rec = embed.record; // 单层
  const text = rec.value?.text;
  const author = rec.author?.handle;
}

// ❌ 错误 — 读 record.embed 的存储字段
const embed = post.record.embed; // 只有 {uri, cid}
```

### 导航 + 默认 feed
```typescript
// PWA useHashRouter.ts
goTo({ type: 'feed' })  →  getLastFeedUri()  →  getFeedConfig().defaultFeedUri  →  BUILTIN_FEEDS.following
goHome()                →  getFeedConfig().defaultFeedUri                        →  BUILTIN_FEEDS.following
```

---

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
2. 新增快捷键必须查 KEYBOARD.md 冲突表
3. Ink 中 5 个 `useInput` 同时触发 → 每个需 guard
4. React Portal 合成事件沿 React 树冒泡
5. 改 AI 行为：编辑 `prompts.ts` → rebuild
6. 帖子操作栏统一用 `PostActionsRow`，不要手写
7. 引用帖从 `post.embed`（顶层）读，不用 `post.record.embed`
8. PWA 图标用 `<Icon name="...">`，按钮用纯文字不用 emoji — TUI 保持 emoji
9. 图片上传不在 AI 对话中自动发到 Bluesky — 只在 create_post 时上传
10. AI 搜索工具（search_posts）强制使用 authenticated endpoint — public API 返回 403

## 关键文件速查

| 文件 | 职责 |
|------|------|
| `packages/app/src/hooks/usePostActions.ts` | 模块级赞/转状态+计数 |
| `packages/app/src/hooks/useActiveFeed.ts` | 模块级活跃 feed 跟踪 |
| `packages/app/src/hooks/useScrollRestore.ts` | 跨视图滚动保存/恢复 |
| `packages/pwa/src/components/PostActionsRow.tsx` | 统一帖子行为栏 |
| `packages/pwa/src/components/Icon.tsx` | SVG 图标组件 |
| `packages/pwa/src/components/VideoCard.tsx` | HLS 视频播放器 |
| `packages/pwa/src/icons/` | 50+ SVG 文件 |
| `packages/pwa/src/utils/compressImage.ts` | PWA 图片自动压缩 |
| `packages/pwa/src/hooks/useHashRouter.ts` | 哈希路由 |
| `packages/app/src/hooks/useThread.ts` | 讨论串处理 |
| `packages/app/src/hooks/useTimeline.ts` | 时间线 |
| `packages/app/src/hooks/useAIChat.ts` | AI 对话（stop/addUserImage/editByIndex） |
| `packages/core/src/ai/tools.ts` | 31 个 AI 工具定义 |
| `packages/core/src/ai/prompts.ts` | AI 系统提示词 |
| `packages/core/src/ai/assistant.ts` | AI 对话引擎（addUserUpload/AbortSignal 支持） |
| `packages/core/src/ai/providers.ts` | 多提供商注册表（DeepSeek + Mistral） |
| `packages/core/src/ai/providers.json` | 提供商配置文件 |
| `packages/app/src/services/chatStorage.ts` | ChatRecord.context 字段 |
