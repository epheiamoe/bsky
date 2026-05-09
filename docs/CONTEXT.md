# Context Compression Recovery Guide

> 当 AI 会话上下文被压缩后，阅读本文档快速恢复工作状态。

## 必读文件（按优先级）

1. **`AGENTS.md`** — 架构原则、安全红线、命令参考
2. **`docs/CONTEXT.md`** — 本文（上下文恢复 + 关键结论 + 教训）
3. **`docs/LESSONS.md`** — 本次会话详细教训（widget 索引、tool_call_id、双重格式化等）
4. **`docs/ARCHITECTURE.md`** — 系统架构
5. **`docs/PACKAGES.md`** — 各包职责与文件清单
6. **`docs/HOOKS.md`** — 所有 hook 签名
7. **`docs/ATPLAY.md`** — AT Play 实验功能参考（社交圈分析数据管线/API/组件/限制）
8. **`docs/KEYBOARD.md`** — TUI 快捷键
8. **`docs/DM.md`** — DM 私信公开文档（API/鉴权/模型/教训）
9. **`docs/SCROLL.md`** — 虚拟滚动 + 滚动恢复规范
10. **`CHANGELOG.md`** — 版本历史
11. **`packages/core/src/ai/prompts.ts`** — AI 提示词
12. **`packages/core/src/ai/tools.ts`** — 31 个 AI 工具定义

## 版本

**v0.7.0** — AT Play + Social Circle + AI auto-naming + Search history + Emoji config panel + Thread view cards + DM avatar navigation

## 项目状态

- **PWA 在线**: https://ai-bsky.pages.dev
- **GitHub**: https://github.com/epheiamoe/bsky
- **PWA 部署**: `cd packages/pwa && pnpm build && npx wrangler pages deploy dist --project-name ai-bsky --commit-dirty=true`
- **TUI 部署**: `npx tsx packages/tui/src/cli.ts`
- **支持多 LLM 提供商**: DeepSeek, Mistral (设置 → Scenario 为不同场景分配不同模型)
- **默认 LLM**: `deepseek-v4-flash`，翻译默认 zh
- **左侧导航栏**: Feed / 通知 / 搜索 / 书签 / **列表** / 资料 / AI 对话 / 发帖 / **AT Play** / 组件
- **右侧组件栏** (lg+ 390px) : 6 widgets — header bar（icon+title+headerButtons+↑+↓+×），widget 纯内容。AI Widget 进入 AI 页面时临时禁用（离开时恢复），headerButtons 支持 open-in-page / new-chat。可通过 AIChatPage 的「Open in Widgets」按钮返回时间线并重新启用
- **组件页** `#/components` : ↑↓ 箭头排序 + 启用/禁用
- **关于页面** `#/about` : PWA+TUI，显示 repo URL / commit hash（Vite 构建时注入 `__COMMIT_HASH__`）/ build time / 描述 / 反馈 / 联系
- **AI Chat**: 折叠式思考卡片(brain SVG) + 工具调用卡片(wrench SVG, 人类可读结果), 31 工具格式化, `/view` 命令给 AI 注入当前页面上下文
- **AI Chat 侧边栏 Widget**: 持久化会话（`_aiChatSessionId`）、折叠卡片、新对话/全页打开按钮
- **DM 私信**: chat.bsky.convo.* — 文字消息 + emoji 反应 + 引用帖 + 删除 + 静音 + 加载更早
- **页面动画**: 11 页面 fadeIn 入场、PostCard hover、PostActionsRow 按压反馈、NotifsPage/DraftsPage 交错入场
- **滚动**: 像素值恢复（非索引）、AIChatPage requestAnimationFrame 精准滚动、visualViewport 移动键盘适应
- **JWT 刷新**: `withRefresh` 并发锁（`_refreshPromise` 缓存）、时间线首次加载自动重试
- **API 重试**: ky 实例显式 `retry: { statusCodes: [408,413,429,500,502,503,504] }`
- **tool_call_id 修复**: 3 个死亡路径全修复（assistant.ts yield、useAIChat 恢复、mapMessages）
- **列表功能** (v0.6.0): 15 个 BskyClient 方法 + useLists/useListDetail hooks + ListsPage + ListDetailPage (Posts/Members Tab + 虚拟滚动) + ProfilePage 列表导航 + TUI 列表视图 + 5 个 AI 工具。支持创建/删除/编辑名称描述/添加移除成员/静音/列表帖文流。AppView 去重 vs PDS 不去重（Lesson 13）。Widget 临时禁用与恢复（Lesson 14）。编辑消息正确保留思考内容和工具调用（Lesson 17）。
- **AI 工具**: 36 个（+5 列表工具：get_lists, get_list_feed, create_list, add_to_list, remove_from_list）。系统时间跟随浏览器时区（PF_CURRENT_TIME 改用 toLocaleString）。get_profile 描述增加 DID↔handle 反解。searchActors 统一使用 publicKy（bsky.social 返回 503/400）。
- **欢迎引导**: 登录后一次性 WelcomeCard — 引导新用户配置 AI（DeepSeek/Mistral 分步教程 + 隐私说明）。存储 `bsky_welcomed` 到 localStorage，跳过后永不再显。
- **DM 轮询刷新**: 对话列表 30s 静默轮询 + 聊天消息 10s 静默轮询。markConvoRead 模块级函数乐观清除未读标记。
- **AT Play 实验性功能** (v0.7.0): 侧边栏 🧪 AT Play 入口 → `#/atplay` 实验列表 → `#/atplay/social-circle` 社交圈分析。分析用户互动数据：权重图构建 + 核心/扩展/潜在分层 + Mermaid 可视化图表。默认分析 50 篇帖文（30-100 可调），Handle 预填充当前用户。结果底部「分享到 Bluesky」按钮。纯计算（无 AI 依赖），纯函数导出供未来 AI 工具复用。PWA only。
- **Compose 预填充 API** (v0.7.0): `AppView` compose 类型新增 `initialText?: string` — 任意页面可通过 `goTo({ type: 'compose', initialText: '...' })` 跳转到发帖页并预填充文本。
- **AI 自动标题命名** (v0.7.0): 使用 `singleTurnAI` 在首次助手回复后自动生成对话标题。`P_AUTO_TITLE_SYSTEM` + `PF_AUTO_TITLE_USER`。跳过 `<currently_viewing>` 上下文消息。`onTitleChanged` 回调刷新列表。
- **ThreadView 卡片化 + handle 换行** (v0.7.0): 聚焦帖 `rounded-xl border border-border bg-surface/30`，回复 `marginLeft` 层级缩进。handle+时间移至 username 下方。
- **搜索历史** (v0.7.0): 按 tab 分类存储（`localStorage`），最近 10 条。显示在 tabs 下方的块级元素（不遮挡 tabs）。每条可删除 + 全部删除。
- **自定义 AI 提示词** (v0.7.0): 设置→场景→AI Chat 下 textarea，输入内容追加到 `buildSystemPrompt` 末尾。TUI 通过 `bsky-tui.config.json` 配置。
- **AI 提示词写操作确认** (v0.7.0): `P_ASSISTANT_BASE` 新增规则 4 — 告知 AI 系统会自动弹出确认对话框，AI 无需单独询问。
- **DM 头像→资料页** (v0.7.0): 私信列表 + 聊天顶栏头像可点击跳转 profile 页。
- **表情配置面板** (v0.7.0): emoji picker 中新增 `+` 按钮 → modal 内加载 `/emoji.txt`（3551 个 emoji）→ 自动分组去肤 → 有肤色变体的展开 5 种肤色选择 → 点击切换选中/取消（在列表→退出，不在→加入）→ `localStorage` 持久化。
- **TUI 表情反应** (v0.7.0): `e` 键进入反应模式 → 显示编号的 emoji → 按数字选择 → 调用 `toggleReaction`。`bsky-tui.config.json` 可配置 `dmEmojis`。
- **Feed 订阅状态** (v0.7.0): `SuggestedFeedsWidget` 改用 `getFeedConfig()` 真实查询，显示 Subscribe/Unsubscribe。
- **时区修正** (v0.7.0): About 页动态计算 `getTimezoneOffset()` 显示正确时区标签。
- **PostCard 卡片化** (v0.7.0): 圆角矩形 `rounded-xl border border-border bg-surface/20`。
- **登录页关于入口** (v0.7.0): 右上角图标 → 内联 AboutPage（返回按钮只关闭 about，不导航到需登录页）。

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

### 20. 编辑消息后 API 400 "missing field tool_call_id"
**根因**：`tool_call_id` 在全链路中丢失 — streaming 事件未携带 → `AIChatMessage` 无此字段 → 存储恢复丢失 → `editByIndex` 后重发时 tool 消息缺少 ID。
**修复**：4 处改动：`AIChatMessage` 加 `toolCallId?: string`；assistant.ts yield 事件加 `toolCallId: tc.id`；useAIChat 创建/恢复 AIChatMessage 时传递 `toolCallId`。

### 21. 工具调用 10 轮上限过大对话中断
**根因**：`MAX_TOOL_ROUNDS = 10` 硬限制，复杂分析任务（多轮 get_post_context + get_profile + search_posts）超过上限抛错。
**修复**：两处循环改为 `for (;;)` 无限循环，用户通过暂停/停止按钮手动控制。

### 22. AI tool_call arguments JSON 格式不良造成崩溃
**根因**：`JSON.parse(tc.function.arguments)` 无 try-catch，AI 输出不完整 JSON 时直接崩溃 "Expected property name in JSON"。
**修复**：两处 parse 加 try-catch，回退到 `{ _raw: rawText }` 继续运行，不中断对话。

### 23. 右侧组件栏「用完就消失」+ 按钮/组件互斥逻辑
**根因**：PolishWidget 的 handleReplace 调用了 onClose（副作用是 toggleWidget 关闭组件），且按钮 visibility 用 `lg:hidden` 硬写。
**修复**：handleReplace 移除 onClose()；按钮 visibility 改为 `getEnabledWidgetIds().includes('polish') ? 'lg:hidden' : ''` — 组件启用时大屏隐藏按钮（侧边栏已有），关闭时所有屏幕显示按钮（退路）。

### 24. 组件启用状态不持久化
**根因**：`Layout.handleToggleWidget` 调用 `onConfigChange(updated)`（setAppConfig，仅 React state），从不调用 `saveAppConfig()`。刷新后 localStorage 仍为空数组，Layout mount 重新 auto-enable。
**修复**：`handleToggleWidget` 和 Layout mount 路径均追加 `saveAppConfig(updated)`。

### 25. 多帖润色只操作 post[0]
**根因**：PWA ComposePage 硬编码 `posts[0]`。TUI 完全没有润色功能。
**修复**：PWA 新增 `polishTargetPostId` 状态，`onFocus` 时跟踪当前聚焦帖子，按钮/桥接/bridge 均读取该值，fallback 到第一个非空帖子；TUI 新增 `f` 键 → polishReq 模式 → AI 调用 → polishResult 显示。

### 26. 草稿永远「未保存到服务器」
**根因**：`useDrafts` 单例 `_draftStoreInstance` 缓存了首次渲染时的 `client`（此时 auth 未完成，`client === null`）。后续所有 `saveDraft` 执行 `null?.isAuthenticated()` → 永不同步。
**修复**：模块级 `_clientRef` + 可变对象 `setClient()` 方法 + `useEffect` 同步最新 client。

### 27. TUI compose submit 缺失
**根因**：ComposeView 提取时 TextInput 丢失了 `onSubmit`，且全局键盘 handler 的 `key.return` 未处理 compose。
**修复**：在 `key.return` handler 加 compose 分支：检查 composeMedia 是否有空 alt（预留警告），构建 mediaMap 调用 `compose.submit()`。

### 28. ALT 弹窗被 overflow-hidden 裁剪
**根因**：ALT 浮窗用 `absolute` 定位在 `overflow-hidden` 父容器内，长文本被切。
**修复**：移至 `overflow-hidden` 外部，改为 `fixed` 定位 + 半透明 backdrop (z-[9998]) + 居中卡片 (z-[9999])。

### 29. PWA 视频无法播放
**根因**：`VideoCard` 有条件渲染 `<video>`（`{playing ? <video> : <thumbnail>}`），但 `handlePlay` 同步检查 `videoRef.current` —— 此时 re-render 尚未发生，ref 为 `null` → 直接 return。即使 ref 可用，`play()` 也在 `hls.attachMedia()` 后立即调用，早于 `MANIFEST_PARSED` 事件 → `play()` reject。且 `hls.on(ERROR)` 捕获所有错误（含可恢复的），一次错误永久停播。
**修复**：始终渲染 `<video>`（`hidden` when idle）确保 ref 永不为 null；HLS 初始化移至 `useEffect`（`playing=true` 时触发）；`play()` 在 `MANIFEST_PARSED` 回调中调用；仅 `data.fatal` 设置 error；出错显示 retry 按钮；`useEffect` cleanup 中销毁 hls 实例。

### 30. DM 私信实现
**架构**：`@bsky/core` 加 `chatKy`（指向 `api.bsky.chat/xrpc`）+ 7 个 `chat.bsky.convo.*` 方法。鉴权使用 session JWT 直连 `api.bsky.chat`（不需要 PDS 代理、不需要 `getServiceAuth`、不需要 `xrpc-service-proxy`）。`chatKy` 也挂 `afterResponse` 钩子自动刷新 JWT。
**关键决策**：emoji 反应使用固定常用列表（👍❤️😂😮😢😡🔥🎉），PWA 点击切换/添加，TUI 简化版。引用帖通过粘贴 `at://` 或 `bsky.app` URL 自动检测 resolves handle → `getRecord()` → embed。
**教训**：`getServiceAuth` 在 PDS 返回 501（未实现），实际 `api.bsky.chat` 直接信任 PDS 签发的 session JWT。`sendMessage` 的 Lexicon 输出 schema 是 `MessageView` 直接返回（不是 `{ message: MessageView }`），需与 `addReaction`/`removeReaction` 区分。

### 31. 资料页私信按钮 + 编辑个人资料
**私信按钮**：互相关注者的资料页，AI 按钮左边，SVG only（`message-square` 图标），无文字避免手机排版异常。点击 → `getConvoForMembers([profile.did])` → 导航到 DM。
**编辑资料**：自己的资料页，铅笔图标 → 底部浮窗（`EditProfileModal`），支持头像/横幅上传 + 名称/描述编辑。通过 `com.atproto.repo.putRecord` 写入 `app.bsky.actor.profile`。
**判断 own profile**：`client.isAuthenticated() && (actor === client.getHandle() || profile?.did === client.getDID())`。

### 32. Scroll 位置恢复：索引 → 像素值
**根因**：`FeedTimeline` 用 `scrollToIndex(N)` 恢复滚动位置，但调用时虚拟器只有估算高度（`ESTIMATED_POST_HEIGHT=120px`），实际帖子 ~170px → 偏移 5-6 帖。
**修复**：改为像素值恢复 `scrollRef.current.scrollTop = savedPixel`，虚拟器自然根据像素计算哪些条目可见。`App.tsx` 中 `feedScrollIndexRef` → `feedScrollTopRef`，`FeedTimeline` props 从 `initialScrollIndex`/`onFirstVisibleIndexChange` → `initialScrollTop`/`onScrollTopChange`。
**规范**：所有页面的滚动恢复必须使用像素值而非索引。参考 `docs/SCROLL.md`。

### 33. DMChatPage auto-scroll 守卫
**根因**：`useEffect([messages])` 无条件 `scrollIntoView` 到底部 → 用户翻看历史消息时新消息到达被拉回 → `loadOlder` 加载更早消息也被拉回。
**修复**：加 `isNearBottom` 守卫（`scrollHeight - scrollTop - clientHeight < 120`），仅当用户接近底部时才自动滚动。

### 34. BookmarkPage 虚拟滚动
**根因**：收藏列表用简单 `.map()`，无虚拟化，可积累数百条 PostCard + PostActionsRow，性能堪忧。
**修复**：改为 `@tanstack/react-virtual` + `useScrollRestore('bookmarks', scrollRef, ...)` 容器 ref 滚动。

### 35. chat API 鉴权演进
**错误路径（已废）**：
1. `getServiceAuth` → `bsky.social/xrpc/com.atproto.server.getServiceAuth` → 501（PDS 未实现）
2. session JWT + `xrpc-service-proxy: did:web:api.bsky.chat` → `bsky.social/xrpc/chat.*` → 501（PDS 不支持聊天代理）
3. 同上但用用户 PDS host → 501（同样不支持）
**正确路径（最终）**：`chatKy = ky.create({ prefixUrl: 'https://api.bsky.chat/xrpc', hooks: { afterResponse: [withRefresh] } })` + `this.getAuthHeaders()`（session JWT）。
**陷阱**：`sendMessage` 返回 `MessageView` 直接（不是 `{ message: MessageView }`），但 `addReaction`/`removeReaction` 返回 `{ message: MessageView }` — 需逐个确认 Lexicon schema。

### 36. AI auto-naming chat titles: maxTokens + thinking mode
**根因**：`generateChatTitle` 传了 `maxTokens: 50` 给 `singleTurnAI`，用户开启了 thinking 模式。DeepSeek 的 thinking 链消耗了所有 token 预算，导致 `content` 为空 → 回退到用户消息原文。
**修复**：移除 `maxTokens` 覆盖（使用 `singleTurnAI` 默认 2000）。
**教训**：`singleTurnAI` 继承主 AI 的 thinking 配置。对于简单任务（标题生成），thinking 模式会消耗大量 token 导致响应为空。可用 `config.thinkingEnabled = false` 禁用。

### 37. AI title generated but UI not updated
**根因**：`autoSave` 直接用 `storage.saveChat()` 保存标题，但没有触发 `useChatHistory` 的 `refresh()` 来刷新对话列表。
**修复**：新增 `UseAIChatOptions.onTitleChanged` 回调，`autoSave` 保存标题后调用。`AIChatPage` 传入 `refresh`。
**教训**：直接操作 storage 绕过 hook 状态管理时需要显式同步。

### 38. /view 上下文干扰标题生成
**根因**：`msgs.find(m => m.role === 'user')` 取到的是 `/view` 注入的 `<currently_viewing>` 消息，而非用户真实输入。标题变成了复读上下文。
**修复**：过滤掉以 `<currently_viewing>` 开头的消息，只对真实用户消息触发标题生成。
**教训**：注入的系统消息和用户消息在 messages 数组中不可区分，需要字符串前缀过滤。

### 39. ThreadView 竖线过犹不及
**根因**：给父链和回复帖添加了 `border-l-2` 线程连线，白色/蓝色竖线破坏了卡片化风格。
**修复**：移除所有连线，仅保留 `marginLeft` 层级缩进。用户反馈「太丑了」。
**教训**：现代化卡片风格不需要复古线程连线。简约缩进+圆角卡片更干净。

### 40. 搜索历史 dropdown 遮挡 tabs
**根因**：搜索历史用 `absolute top-full` 定位在 input 下方，tabs 渲染在后，dropdown 覆盖了 tabs。
**修复**：移除 absolute 定位，将 history 放在 tabs 之后的块级元素，自然撑开不遮挡。
**教训**：dropdown/overlay 定位时需要考虑后续 DOM 元素的 z-index 关系，更安全的做法是用块级元素自然布局。

### 41. handle+时间应在 username 下方
**根因**：ThreadView 聚焦帖的 handle 和时间与 username 同行显示，不符合主流 SNS 风格。
**修复**：改为 avatar + [username+follow] 首行，[handle·时间] 次行的两行布局。
**教训**：UI 布局应跟随平台惯例（Twitter/Bluesky 都是 handle 在 name 下方）。

### 42. emoji.txt 的皮肤变体分组
**根因**：emoji.txt 包含 3551 个 emoji，大量肤色变体（🏻🏼🏽🏾🏿）需要合理分组展示。
**修复**：解析时检测 Unicode 肤色修饰符，自动分组为基础 emoji + variants。配置面板展示基础 emoji，仅点击时展开肤色选择。
**教训**：处理含肤色的 Unicode 字符串时，用 `includes()` 检测特定 codepoint 比用正则更可靠。`replaceAll()` 剥离修饰符获得 base key。

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
| `widgetStore.ts` | Widget 状态管理 (v0.5.3) | `initEnabledWidgets`, `getEnabledWidgetIds`, `toggleWidget`, `initAIChatSession`, `setWidgetToggleCallback` |

### AI 共享组件（`packages/pwa/src/components/ai/`）
```tsx
import { ThinkingCard, ToolCard, UserMessage, AssistantMessage, formatToolResult } from './ai/index.js';
```
- **ThinkingCard**: 可折叠推理卡片，brain SVG，紫色主题
- **ToolCard**: 可折叠工具结果卡片，wrench SVG，琥珀主题，`formatToolResult` 格式化 31 种工具输出
- **UserMessage/AssistantMessage**: Markdown 渲染用户/AI 消息
- AIChatPage 和 AIChatWidget 共同引用，`compact` prop 控制大小

### Widget 系统 (v0.5.3 重构)
```
WidgetPanel 统一 header:
  [icon] [title]              [↑] [↓] [×]
Widget 纯内容（无标题、无关闭按钮）
```
- 6 widgets: SuggestedFollows, SuggestedFeeds, Trends, Polish(compose), ProfilePreview(thread), AIChat(all)
- 组件页 `#/components` 提供 ↑↓ 排序
- Widget 持久化回调：`toggleWidget()` → `_onWidgetToggle(id)` → `saveAppConfig()`
- AI Chat Widget: `_aiChatSessionId` 持久化会话，`/view` 命令支持
- AIChatPage 进入时自动 `disableWidget('aiChat')`

### /view 命令（注入上下文给 AI）
```
输入 /view → 自动检测当前页面 → 替换为 <currently_viewing> 标签
历史消息中 <currently_viewing> 渲染为独立信息卡片
支持的页面：帖子(uri)、用户(@handle)、搜索(query)
私人页面(书签/草稿/DM)不支持
```

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
11. FlatLine 图片数据从 `imageUrls: string[]` 改为 `imageDetails: Array<{url, alt}>` — 所有消费方需同步
12. DraftStore 的 `saveDraft/syncDraft/refreshDrafts` 使用模块级 `_clientRef`，不可闭包捕获 client
13. 滚动位置恢复必须使用**像素值**（`scrollTop`），不能用索引（`scrollToIndex`）——虚拟器在 ResizeObserver 触发前使用估算高度，造成系统性偏移。见 `docs/SCROLL.md`
14. chat API 直连 `api.bsky.chat` + session JWT，不要走 PDS 代理（返回 501）。`chatKy` 也挂 `afterResponse` 钩子自动刷新 JWT
15. Widget 排序索引必须用完整 `enabledIds.indexOf(w.id)`，不能用过滤后的视觉索引 —— view-limited widget 排除后索引偏移。见 `docs/LESSONS.md` 第 1 课
16. SVG 图标在共享组件（`ai/` 目录）中必须硬编码为 inline SVG 常量，不可依赖 `Icon.tsx` 的 glob loader
17. Widget 职责边界：WidgetPanel 统一提供 header（icon+title+^+v+x），widget 只负责内容区域
18. Widget 持久化：所有 module-level `toggleWidget()` 调用通过 `_onWidgetToggle` 回调自动 `saveAppConfig()`
19. AI 卡片动画：不可条件渲染，必须用 CSS `max-h` + `opacity` transition，外层容器加 `relative`
20. 流式输出 scroll：用 `requestAnimationFrame(() => container.scrollTop = container.scrollHeight)`，放在 effect 中延迟到 paint 后执行
21. 移动键盘避免空白：用 `window.visualViewport.height` 而非 `100dvh` 设容器高度
22. ky retry：显式 `retry: { limit: 1, statusCodes: [408,413,429,500,502,503,504] }`，不依赖默认值
23. i18n 插值必须使用单大括号 `{n}`，正则 `/\{(\w+)\}/g` 只匹配 `{n}`。`{{n}}` 会渲染为 `{1}`（外括号残瘤）。见 LESSONS.md Lesson 12
24. 涉及重复数据时使用 PDS 层 API（`listRecords`）而非 AppView（`getList`），因为 AppView 会去重。见 LESSONS.md Lesson 13
25. 构建时注入的元数据（commit hash）必须在 commit 之后构建，否则 About 页面显示旧 hash。流程：commit → build → deploy
26. 新增 `requiresWrite` AI 工具时必须同步添加 `buildToolDescription` case，否则确认弹窗显示原始 JSON

## 关键文件速查

| 文件 | 职责 |
|------|------|
| `packages/app/src/hooks/usePostActions.ts` | 模块级赞/转状态+计数 |
| `packages/app/src/hooks/useActiveFeed.ts` | 模块级活跃 feed 跟踪 |
| `packages/app/src/hooks/useScrollRestore.ts` | 跨视图滚动保存/恢复 |
| `packages/app/src/hooks/useCompose.ts` | 发帖 hook v2（posts[] 数组 + 帖子串 submit） |
| `packages/app/src/hooks/useDrafts.ts` | 草稿存储 v2（PDS + 本地回退 + _clientRef） |
| `packages/app/src/services/draftStorage.ts` | DraftStorage 接口 + FileDraftStorage + 工厂模式 |
| `packages/app/src/hooks/widgetRegistry.ts` | Widget 注册表：`registerWidget/getWidgetsForView` |
| `packages/app/src/hooks/widgetStore.ts` | Widget 状态：启用/关闭 + ComposePage 草稿桥接 |
| `packages/core/src/at/client.ts` | BskyClient + draft XRPC 方法 (createDraft/updateDraft/getDrafts/deleteDraft) |
| `packages/pwa/src/components/PostActionsRow.tsx` | 统一帖子行为栏 |
| `packages/pwa/src/components/Icon.tsx` | SVG 图标组件（`import.meta.glob`） |
| `packages/pwa/src/components/ComposePage.tsx` | 发帖页 v2（多帖卡片 + per-post media + ALT 输入） |
| `packages/pwa/src/components/DraftsPage.tsx` | 草稿列表（书签风格 + syncStatus 标签 + 同步按钮） |
| `packages/pwa/src/components/WidgetPanel.tsx` | 右侧组件栏渲染 |
| `packages/pwa/src/components/WidgetPicker.tsx` | 添加/移除组件面板 |
| `packages/pwa/src/components/WidgetModal.tsx` | 组件弹出窗口（小屏幕） |
| `packages/pwa/src/components/ComponentsPage.tsx` | `#/components` 组件页面 |
| `packages/pwa/src/components/widgets/PolishWidget.tsx` | 润色组件（compose only） |
| `packages/pwa/src/components/widgets/ProfilePreviewWidget.tsx` | 资料页预览（thread only） |
| `packages/pwa/src/components/widgets/SuggestedFollowsWidget.tsx` | 推荐关注（全部视图） |
| `packages/pwa/src/components/widgets/SuggestedFeedsWidget.tsx` | 推荐动态源（全部视图） |
| `packages/pwa/src/components/widgets/TrendsWidget.tsx` | 趋势（全部视图） |
| `packages/pwa/src/components/VideoCard.tsx` | HLS 视频播放器 |
| `packages/pwa/src/components/ConvoListPage.tsx` | DM 会话列表 |
| `packages/pwa/src/components/DMChatPage.tsx` | DM 对话视图（气泡 + 反应 + 引用 + 删除 + 静音） |
| `packages/pwa/src/components/EditProfileModal.tsx` | 编辑个人资料底部浮窗 |
| `packages/pwa/src/components/ComponentsPage.tsx` | 组件管理页（含持久化 toggle） |
| `packages/tui/src/components/DMChatView.tsx` | TUI DM 对话 |
| `packages/tui/src/components/DMListView.tsx` | TUI DM 会话列表 |
| `packages/app/src/hooks/useConvoList.ts` | 会话列表 hook |
| `packages/app/src/hooks/useChatMessages.ts` | 对话消息 hook + URI 解析 |
| `packages/pwa/src/icons/message-square.svg` | DM 图标 |
| `packages/pwa/src/icons/refresh-cw.svg` | 刷新图标 |
| `packages/pwa/src/icons/smile.svg` | 反应图标 |
| `packages/pwa/src/icons/plus-circle.svg` | 添加图标 |
| `docs/DM.md` | DM 公开文档（API/鉴权/模型/教训） |
| `docs/SCROLL.md` | 虚拟滚动 + 滚动恢复规范 |
| `docs/LESSONS.md` | 本期会话详细教训（上下文压缩快速恢复） |
| `packages/pwa/src/components/ai/` | AI 共享组件（ThinkingCard, ToolCard, UserMessage, AssistantMessage, formatToolResult） |
| `packages/pwa/src/components/ai/formatToolResult.ts` | 31 工具结果人类可读格式化 |
| `packages/pwa/src/components/widgets/AIChatWidget.tsx` | 侧边栏 AI 对话 Widget（持久化, /view） |
| `packages/pwa/src/components/AboutPage.tsx` | PWA 关于页面 |
| `packages/pwa/vite.config.ts` | +`define.__COMMIT_HASH__/__COMMIT_DESC__/__BUILD_TIME__` |
| `packages/app/src/hooks/widgetStore.ts` | Widget 状态 (v0.5.3: _order 数组 + _onWidgetToggle 回调 + _aiChatSessionId) |
| `packages/pwa/src/utils/compressImage.ts` | PWA 图片自动压缩 |
| `packages/pwa/src/services/indexeddb-draft-storage.ts` | IndexedDB draft 存储（PWA） |
| `packages/pwa/src/hooks/useHashRouter.ts` | 哈希路由（含 `/drafts`/`/components`） |
| `packages/tui/src/components/ComposeView.tsx` | TUI 发帖渲染（多帖 + polishReq/altReq 模式） |
| `packages/app/src/hooks/useThread.ts` | FlatLine 含 imageDetails[{url,alt}] |
| `packages/app/src/hooks/useTimeline.ts` | 时间线 |
| `packages/app/src/hooks/useAIChat.ts` | AI 对话 |
| `packages/core/src/ai/tools.ts` | 31 个 AI 工具定义 |
| `packages/core/src/ai/prompts.ts` | AI 系统提示词 |
| `packages/core/src/ai/assistant.ts` | AI 对话引擎 |
| `packages/core/src/ai/providers.ts` | 多提供商注册表 |
| `packages/core/src/ai/providers.json` | 提供商配置文件 |
| `packages/app/src/services/chatStorage.ts` | ChatRecord.context 字段 |
| `packages/pwa/src/components/ListsPage.tsx` | PWA 列表索引页（浏览/创建/删除/加他人到列表） |
| `packages/pwa/src/components/ListDetailPage.tsx` | PWA 列表详情页（Posts/Members 双 Tab + 内联编辑） |
| `packages/app/src/hooks/useLists.ts` | 列表集合 CRUD hook |
| `packages/app/src/hooks/useListDetail.ts` | 列表详情 hook（成员/feed/mute/CRUD） |
| `packages/pwa/src/icons/list.svg, user-plus.svg, users.svg` | 列表 SVG 图标 |
| `docs/ATPLAY.md` | AT Play 实验功能参考 |
| `packages/app/src/hooks/useSocialCircle.ts` | 社交圈分析 hook + 纯函数（generateSocialGraphMermaid, buildSocialCircleShareText） |
| `packages/pwa/src/components/AtPlayPage.tsx` | AT Play 实验列表页 |
| `packages/pwa/src/components/AtPlaySocialCircle.tsx` | 社交圈分析 UI（表单/进度/结果/分享） |
| `packages/pwa/src/icons/flask-conical.svg` | AT Play 侧边栏图标 |
| `packages/core/src/at/client.ts` (getRelationships, getActorLikes) | 社交圈分析 API 方法 |
| `generateChatTitle`, `P_AUTO_TITLE_SYSTEM`, `PF_AUTO_TITLE_USER` (assistant.ts, prompts.ts) | AI 自动对话标题命名 |
| `packages/app/src/hooks/useDmEmojiConfig.ts` | DM 表情持久化管理 + emoji.txt 解析分组 |
| `packages/pwa/public/emoji.txt` | 3551 个 emoji 源文件 |
| `packages/pwa/src/components/DMChatPage.tsx` | 动态表情读取 + 配置面板 + 头像跳转 |
| `packages/pwa/src/components/ConvoListPage.tsx` | 头像跳转资料页 |
| `packages/tui/src/components/DMChatView.tsx` | TUI 表情反应（e 键 + 编号选择） |
