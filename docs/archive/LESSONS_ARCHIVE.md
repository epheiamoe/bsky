# Archived Lessons (21-45)

> 这些是从 `docs/CONTEXT.md` 的「关键教训」章节中移出的较早教训（第 21-45 条）。
> 较新的教训（第 1-20 条及第 46-48 条）保留在 `docs/CONTEXT.md` 中。
> 完整的教训历史请查阅 [`../LESSONS.md`](../LESSONS.md)。

---

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

### 43. didDoc 返回的可选性
**根因**：`com.atproto.server.createSession` 的响应中 `didDoc` 是**可选**字段——Bluesky PDS 可能包含也可能不包含。登录时假设它一定存在会导致 PDS 发现失败。
**修复**：两阶段发现——先检查 response.didDoc，不存在时调用 `resolveDid` 补查。
**教训**：AT Protocol 响应字段的可选性必须始终作为假设下限。

### 44. login() 的 this.ky 鸡生蛋问题
**根因**：`login()` 使用 `this.ky` 发送 `createSession`，但此时 `this.ky` 指向的是构造时确定的入口 PDS（可能硬编码 bsky.social）。登录后才知道用户真实 PDS，无法重新指向。
**修复**：两阶段创建——`login()` 先用临时 entryKy（或传入的 PDS URL）认证，获取 session 和 didDoc 后重建 `this.ky` 指向用户真实 PDS。
**教训**：认证流和目标操作流可以分离。入口 PDS（auth）和数据 PDS（operations）不必相同。

### 45. withRefresh 闭包必须可复用
**根因**：`withRefresh` 在构造函数中定义为局部 `const`，登录后重建 `this.ky` 时无法引用同一 hook，导致新 ky 实例没有刷新能力。
**修复**：将 `withRefresh` 存储为 `this._withRefresh` 实例属性，重建 `this.ky` 时传入同一引用。
**教训**：闭包引用在对象重建时必须作为实例属性保存，而非局部变量。

---

*[返回 `../LESSONS.md`](../LESSONS.md)*
