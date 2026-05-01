# Context Compression Recovery Guide

> 当 AI 会话上下文被压缩后，阅读本文档快速恢复工作状态。

## 必读文件（按优先级）

1. **`AGENTS.md`** — 架构原则、安全红线、命令参考、新增快捷键规则、zread wiki
2. **`docs/CONTEXT.md`** — 本文（上下文恢复 + 关键结论）
3. **`docs/ARCHITECTURE.md`** — 系统架构、依赖关系、关键决策
4. **`docs/PACKAGES.md`** — 各包职责与文件清单
5. **`docs/HOOKS.md`** — 所有 hook 签名与返回类型（含 useProfile/useDrafts/useAIChat 最新签名）
6. **`docs/KEYBOARD.md`** — TUI 完整快捷键目录（5 处理器 + 冲突表 + 全局保留规则）
7. **`docs/AI_SYSTEM.md`** — AI 集成架构：工具系统、流式、翻译、确认流
8. **`docs/DESIGN.md`** — PWA 设计系统
9. **`docs/PWA_GUIDE.md`** — PWA 部署与架构
10. **`docs/TODO.md`** — 功能状态（TUI/PWA 进度）
11. **`docs/USER_ISSUSES.md`** — 已修复的用户问题记录
12. **`CHANGELOG.md`** — 按时间线所有变更
13. **`.zread/wiki/`** — zread-cli 自动生成的项目文档（可作参考）

## 项目当前状态

### 部署
- **GitHub**: https://github.com/epheiamoe/bsky (`master` 分支)
- **PWA 在线**: https://ai-bsky.pages.dev（Cloudflare Pages）
- **PWA 部署命令**: `cd packages/pwa && pnpm build && npx wrangler pages deploy dist --project-name ai-bsky --commit-dirty=true`
- **PWA 安装**: 完整 PWA 支持（manifest.json + Service Worker + 图标），可添加到桌面

### 环境
- `.env` (gitignored): BLUESKY_HANDLE, BLUESKY_APP_PASSWORD, LLM_API_KEY, LLM_BASE_URL, LLM_MODEL, I18N_LOCALE
- PWA: 无 `.env`，凭证通过登录表单 + localStorage
- TUI 首次运行: SetupWizard 交互式配置所有字段

### 模型
- **默认 LLM**: `deepseek-v4-flash`（完成 deepseek-chat 迁移）
- **翻译默认目标**: zh（中文）

---

## 架构原则

```
@bsky/core → @bsky/app → @bsky/tui | @bsky/pwa
```

- **业务逻辑只写一次**在 core+app 层
- TUI 和 PWA 只写渲染层
- 新增功能：core API → app hook/utility → tui 界面 + pwa 界面
- **所有 hook 均在 `@bsky/app`**，UI 层仅 import 使用
- **i18n**: 模块级单例 store，locale 切换即时全局生效
- **j/k/↑↓ 在 Ink 中**：5 个 `useInput` 同时触发，每个需 guard 防止冲突

---

## 关键实现细节

### 1. BskyClient (`packages/core/src/at/client.ts`)
- **双端点**: `this.ky` (bsky.social PDS, 写操作) + `this.publicKy` (public.api.bsky.app, 公开读)
- **JWT 自动刷新**: `ky.afterResponse` hook → 检测 ExpiredToken/InvalidToken → `fetch(refreshSession)` → 200ms 延迟防 TLS 争用 → 透明重试
- **方法**: 31 个 AT 协议方法 + follow/unfollow/deleteRecord

### 2. AI 助手 (`packages/core/src/ai/assistant.ts`)
- **流式 SSE**: `sendMessageStreaming()` AsyncGenerator → yield `token | tool_call | tool_result | thinking | confirmation_needed | done`
- **思考模式**: `reasoning_content` → yield `type: 'thinking'` → TUI dimmed blockquote，PWA 斜体左边框
- **写操作确认**: `requiresWrite` 标志 → Promise gate → `_waitForConfirmation()` → 必须用户批准才执行
- **工具系统**: 31 工具（24 读 + 6 写 + 1 AI），工具可读取 `client.getDID()` 以当前用户执行
- **高级搜索**: 系统提示词指示 AI 使用 `from:`/`to:`/`mentions:`/`since:`/`until:`/`lang:` 等 Lucene 运算符
- **系统提示词**: 包含用户 handle、环境（终端/浏览器）、UI 语言

### 3. useAIChat (`packages/app/src/hooks/useAIChat.ts`)
- **关键约束**：tools init effect **不得**依赖 `messages.length` — 否则在 streaming 工具链中会插入 system 消息破坏 API 协议
- **contextProfile**: 用于从资料页打开的 AI 会话 → 自动发送首条消息（`autoStartedRef` 防重复）
- **pendingConfirmation**: 流式 `confirmation_needed` 事件 → setState → UI 渲染确认框 → `confirmAction()` / `rejectAction()`
- **undoLastMessage / retry**: 操作 `assistant.getMessages()` 并重建对话

### 4. 翻译 (`packages/core/src/ai/assistant.ts`)
- **双模式**: `simple`（纯文本）/ `json`（`{translated, source_lang}` + `response_format: json_object`）
- **重试**: 最多 3 次，800ms/1600ms/2400ms 退避
- **TUI 使用**: 动态 `import('@bsky/core').then({translateText})` 避免循环依赖
- **TUI 讨论串翻译**: `f` 键
- **TUI 资料简介翻译**: `f` 键
- **PWA**: ThreadView translate 按钮 + ProfilePage bio translate 按钮

### 5. 讨论串 (`useThread.ts`)
- **扁平化**: `walk()` 递归，`visitedUris` Set 防止重复，`d >= 0` 守卫防止祖先级兄弟泄漏
- **expandedReplies**: `maxSiblings` state 控制可见兄弟数，默认 5，每次 +10
- **quotedPost**: 从 `embed.record` / `embed.recordWithMedia` 提取引用帖数据（文本/作者/图片）
- **repostReasons**: `Record<string, string>` 追踪资料页转贴来源
- **TUI**: j/k/↑↓ 移动光标，Enter 重聚焦，`flatLen` ref 避免旧闭包

### 6. 资料页 (`useProfile.ts`)
- **标签页**: `'posts'`（纯帖子）/ `'replies'`（帖子和回复），API 用 `getAuthorFeed(filter)` 区分
- **关注/取关**: `follow(did)` / `unfollow(followUri)`，`handleFollow` / `handleUnfollow` 刷新资料
- **关注/粉丝列表**: `openFollowList('follows'|'followers')` → cursor 分页
- **repostReasons**: 从 `FeedViewPost.reason` 提取转贴发起人
- **资料 AI**: "🤖 AI" 按钮 → `goTo({ type: 'aiChat', contextUri: actor })` → 检测非 `at://` URI → `contextProfile` 选项

### 7. PWA
- **路由**: `useHashRouter()` — `history.pushState` + `popstate`，格式 `#/view?param=value`
- **虚拟滚动**: `@tanstack/react-virtual` + `IntersectionObserver` 自动加载
- **PWA 安装**: manifest.json（`display: standalone`）+ Service Worker（cache-first 静态，network-first API）
- **图片**: `cdn.bsky.app/img/feed_fullsize/plain/{did}/{cid}@{ext}` — PWA `<img>` 和 TUI OSC 8 链接共用
- **灯箱**: `createPortal(document.body)` 避免虚拟滚动 `transform` 的 containing block

### 8. TUI
- **Pre-computed lines**: `postToLines()` 生成 FlatLine 数组，PostList 基于 `selectedIndex` 计算视口
- **Mouse**: ANSI escape sequences (`x1b[?1000h`) 在 feed 中支持滚轮
- **Markdown**: 自研 `renderMarkdown()` → Ink `Text`/`Box` 元素（标题/粗体/代码块/列表/引用/分割线）
- **SetupWizard**: 首次运行交互式配置，逐一输入 6 字段，存入 `.env`

### 9. 草稿
- **useDrafts**: 内存存储（`createDraftsStore`），`Draft { id, text, replyTo?, quoteUri?, createdAt, updatedAt }`
- **PWA**: compose header `📝 Drafts` 面板 + 退出 confirm() + sidebar 角标
- **TUI**: `D` 键草稿列表 + 退出 `Save draft? [y/n]` + `n` 保存并新建

### 10. i18n (`packages/app/src/i18n/`)
- **单例 store**: `getI18nStore()` → 所有 `useI18n()` 共享同一个 locale
- **模式**: `useI18n()` → `useState(() => getI18nStore())` + `useEffect(store.subscribe, ...)`
- **持久化**: PWA=`localStorage` (Settings → General)，TUI=`I18N_LOCALE` env var
- **160+ keys**: namespace：`nav.*`, `action.*`, `status.*`, `compose.*`, `thread.*`, `ai.*`, `profile.*`, `keys.*`, etc.

---

## 关键决策

| 决策 | 原因 |
|------|------|
| `FlattenThreadTree` 用 `d >= 0` 守卫 | 防止祖先帖的兄弟分支泄漏到 flatLines |
| `visitedUris` Set 防重复 | 每个 post.uri 只入列一次，避免 walk 递归链重复 |
| j/k handler 用 `flatLen` ref 替代 `flatLines.length` | 避免 Ink useInput 旧闭包（长度 0 时 cursor 震荡） |
| `store.error` 在成功时清零 | 初始加载 token 过期 → error 设置 → 手动刷新成功但横幅不消失 |
| `streamingContent` 在 tool_call 时重置 | 防止上一轮助手文本拼接到下一轮 |
| `chatId` 变化时 `assistant.clearMessages()` | 确保新对话从干净状态开始 |
| `confirmation_needed` 事件 + Promise gate | 实现写操作暂停/恢复，不破坏流式生成器 |
| 图片 CDN 替代 PDS blob 端点 | PDS 需要 JWT auth（浏览器从终端/标签页无 token），CDN 返回 inline |
| 灯箱 `createPortal(document.body)` | 虚拟滚动 `transform` 创建新的 CSS containing block，`position: fixed` 失效 |
| `messages.length` 不得在 tools init effect deps 中 | 避免 streaming 中 system message 插入破坏 API 协议 |
| React Portal 中合成事件沿 React 树冒泡 | 灯箱关闭按钮需 `e.stopPropagation()` 阻止到达 PostCard 的 onClick |
| `u` 键 = follow/unfollow, `g` 键 = go to profile | 避免与全局 `p`（自己资料）冲突 |

---

## 最近完成的工作

- ✅ i18n：zh/en/ja 共享模块，单例 store，即时切换
- ✅ AI 写操作确认：requiresWrite → Promise gate → 双 UI 确认框
- ✅ AI 撤销/重试：undoLastMessage() / retry()
- ✅ AI 思考模式：reasoning_content 流式渲染（💭 Thinking blockquote）
- ✅ AI 资料对话：contextProfile → 自动开始分析 + 高级搜索提示
- ✅ 回复展开：expandReplies() 每次 +10 条
- ✅ 引用帖内容：quotedPost 提取 + 双 UI 子卡片
- ✅ 转发/引用选择：TUI `r` → repost/quote 选择，PWA 下拉菜单
- ✅ 草稿：TUI `D` 键 + PWA 面板 + 退出保存
- ✅ 资料页关注/取关、标签页、帖子流、关注/粉丝列表
- ✅ 资料页 AI 按钮 + 简介翻译 + PWA 头像/横幅放大（灯箱 + 下载）
- ✅ 转贴标识：资料页 `↻ Reposted by @handle`
- ✅ 讨论串 focus 键 + 头像点击进资料
- ✅ 图片 CDN：cdn.bsky.app 替代 PDS blob 端点
- ✅ PWA 完整实现：manifest、Service Worker、图标、桌面安装
- ✅ 灯箱 portal 修复、notifications 点击跳转、timeline scroll 恢复
- ✅ session 过期自动重登录（PWA+TUI）
- ✅ 快捷键文档完全重写 + AGENTS.md 规则

---

## 待完成

- PWA 侧边栏常驻 AI 面板
- 头像缓存（Service Worker / IndexedDB）
- List/Feed 浏览、DM 私信、视频帖
- 推送通知（Web Push API）

---

## 快速命令

```bash
# TUI
cd packages/tui && npx tsx src/cli.ts

# PWA dev
cd packages/pwa && pnpm dev

# PWA build + deploy
cd packages/pwa && pnpm build
npx wrangler pages deploy dist --project-name ai-bsky --commit-dirty=true

# Tests
cd packages/core && npx vitest run --config vitest.config.ts

# Full typecheck + build
pnpm -r typecheck
pnpm -r build
```

---

## 开发规则

1. **绝不**硬编码凭证/handle/DID/API key/本地文件路径到任何提交文件
2. 新增快捷键必须：① 查 KEYBOARD.md 全局保留表 + 冲突表 ② 更新 KEYBOARD.md ③ 更新 i18n keys.* ④ 跨所有视图验证
3. `.zread/wiki/` 不可删除（zread-cli 自动文档）
4. Ink 中 5 个 `useInput` 同时触发 → 每个 handler 必须有 view 守卫
5. React Portal 合成事件沿 React 树冒泡，不是 DOM 树
6. CHANGELOG.md 格式：Keep a Changelog
