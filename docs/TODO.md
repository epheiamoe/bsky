# TODO — Bluesky Client Feature Roadmap

> 所有功能必须实现 **TUI** + **PWA** 两个 UI，业务逻辑只写一次在 `@bsky/core` + `@bsky/app`。

## 功能清单

| 功能 | TUI | PWA | 说明 |
|------|-----|-----|------|
| **登录/认证** | ✅ | ✅ | TUI: .env + bsky-tui.config.json, PWA: localStorage session + JWT auto-refresh |
| **时间线** | ✅ | ✅ | 虚拟滚动 + IntersectionObserver 自动加载 |
| **讨论串** | ✅ | ✅ | 讨论源 + 回复树 + 嵌套回复 + 引用预览 + 回复展开 |
| **发帖/回复** | ✅ | ✅ | 自动增高 textarea + 300字红色标记(非截断) + 淡化X风格输入框 + 帖子串独立引用 + 回复讨论源样式 + 引用卡片PostCard样式 + 动画 + 上传进度弹窗 |
| **回复限制 (Threadgate)** | ✅ | ✅ | `app.bsky.feed.threadgate` — nobody/mentioned/followers/following/lists (含列表选择器); PWA: Compose 折叠面板 + ThreadView badge + ThreadgateEditor; TUI: g 键 + R 键 dialog; AI: create_post 参数 + 回复前检查 |
| **点赞** | ✅ | ✅ | TUI: `l` 键, PWA: 按钮 |
| **转发/引用** | ✅ | ✅ | TUI: `r` 键 → 转发/引用选择, PWA: 下拉菜单 |
| **通知** | ✅ | ✅ | 交互式通知（点击/Enter 查看帖子） |
| **搜索** | ✅ | ✅ | 搜索帖子 + 用户 + 动态源 + 趋势 |
| **个人资料** | ✅ | ✅ | 显示信息 + 统计 + 头像 |
| **书签** | ✅ | ✅ | AT 内置 API, TUI: v/d 键, PWA: 按钮 |
| **AI 对话** | ✅ | ✅ | 工具调用(无上限), 流式 SSE, 写操作确认, 撤销/重试, IndexedDB/File, 暂停/停止 |
| **AI 对话导出/导入** | ✅ | ✅ | JSON (bsky-chat-v1 完整格式含 tool_call_id), HTML, MD; Import with validation |
| **AI 翻译** | ✅ | ✅ | 7 语言, simple/json 双模式, 3 次重试, TUI: `f` 键 |
| **AI 润色** | ✅ | ✅ | PWA: PolishWidget 组件栏+浮窗; TUI: `f` 键 → polishReq 模式 → 复制/替换 |
| **组件系统 (Widgets)** | ⚠️ | ✅ | TUI: 2/6 widgets (AIChat + Polish) via WidgetOverlay modal; SuggestedFollows/SuggestedFeeds/Trends/ProfilePreview **deferred** |
| **组件页** | ⬜ | ✅ | `#/components` 管理所有 widget 启用/禁用 |
| **Markdown 渲染** | ✅ | ✅ | PWA: react-markdown+GFM, TUI: 自定义 Ink parser |
| **草稿** | ✅ | ✅ | AT Protocol `app.bsky.draft.*` + 本地回退(IndexedDB/JSON); 退出保存提示; 帖子串草稿支持 |
| **i18n 多语言** | ✅ | ✅ | zh/en/ja, 单例 store 即时切换 |
| **快速设置** | ✅ | N/A | TUI: `,` 键 — 结构化 config 编辑 (model/scenario/lang/keys tabs) |
| **首次设置向导** | ✅ | N/A | TUI: 提供商/模型下拉选择, 写 .env + bsky-tui.config.json |
| **深色/浅色主题** | N/A | ✅ | CSS 变量 + localStorage |
| **PWA 安装** | N/A | ✅ | manifest.json + Service Worker |
| **图片显示** | ✅ | ✅ | CDN URL 渲染, PWA: 灯箱 portal + ALT SVG 徽章 + 固定定位浮窗; TUI: OSC 8 链接 + ALT 文字完整显示; 单图可选原始宽高比模式 |
| **共享 extractEmbeds** | ✅ | ✅ | v0.13.2: extractImages/extractVideo/extractExternalLink/extractQuotedPost 集中在 @bsky/app，4 个消费者共享，删除 260 行重复代码 |
| **视频贴** | ✅ | ✅ | PWA: VideoCard (hls.js), TUI: OSC 8 视频链接 |
| **ALT 文本** | ✅ | ✅ | 上传时输入 + 提交前缺失警告; PWA: SVG 徽章 + 浮窗; TUI: 图片链接下完整显示 |
| **头像显示** | ✅ | ✅ | PWA: `<img>` + 字母 fallback |
| **头像缓存** | ⬜ | ⬜ | Service Worker / IndexedDB 缓存头像 |
| **关注/取关** | ✅ | ✅ | 资料页 + 帖子页 + 推荐关注 widget |
| **推荐关注** | ⬜ | ✅ | SuggestedFollowsWidget + AT API |
| **列表订阅到时间线** | N/A | ✅ | v0.14.0: 列表可作为时间线源，FeedHeader 下拉选择，ListDetailPage 订阅按钮，配置时间线管理 |
| **趋势** | ⬜ | ✅ | TrendsWidget + app.bsky.unspecced.getTrends |
| **List/Feed 浏览** | ✅ | ✅ | PWA: ListsPage + ListDetailPage (Posts/Members tabs + 虚拟滚动) + ProfilePage Lists tab; TUI: 内联视图 + L 快捷键 + j/k/Enter/d/r; AI: 4 工具 |
| **DM 私信** | ✅ | ✅ | Phase 1+2: send/get/list/delete/mute/read + emoji 反应(8 常用) + 引用帖(URI 粘贴) + 动画 + 加载更早 |
| **资料页 DM 按钮** | N/A | ✅ | 互相关注者资料页，SVG-only 私信按钮 |
| **编辑个人资料** | N/A | ✅ | 底部浮窗：头像/横幅/名称/描述 + putProfile API |
| **DM 自定义 emoji 选择器** | ⬜ | ⬜ | 可扩展的常用 emoji 列表 + 搜索 |
| **页面动画** | ⬜ | ✅ | 11 页面 fadeIn + PostCard hover + PostActionsRow 按压 + NotifsPage/DraftsPage 交错入场 |
| **虚拟滚动** | N/A | ✅ | FeedTimeline / ProfilePage / BookmarkPage |
| **滚动位置恢复** | ✅ | ✅ | TUI: idx state; PWA: 像素值模式 + requestAnimationFrame |
| **组件持久化** | ⬜ | ✅ | widgetStore.ts _onWidgetToggle 统一回调 + saveAppConfig |
| **组件排序** | ⬜ | ✅ | 侧边栏 + 组件页 chevron-up/down 排序 |
| **AI Chat 卡片** | ✅ | ✅ | 折叠式思考卡片 + 工具调用卡片(31 工具格式化) — TUI: ThinkingCard + ToolCard components |
| **AI Chat /view** | ⬜ | ✅ | /view 命令注入当前页面上下文给 AI |
| **Python 沙箱** | ✅ | ✅ | v0.14.0: execute_python 工具，三平台统一架构 (Pyodide/Node.js)，bsky_tools 库 (33 方法)，AST 安全分析，keyword-only 参数 |
| **工作区文件管理** | ✅ | ✅ | 上传/下载/删除/预览，FileWorkspaceStorage (filesystem)，chatId 隔离，MCP 已修复 |
| **AI Chat Widget** | ✅ | ✅ | WidgetOverlay 中的 AI Chat Widget，支持 /view 命令注入上下文 |
| **关于页面** | ✅ | ✅ | PWA(`#/about`) + TUI(`?` 键)，显示 commit hash 构建时注入 |
| **推送通知** | N/A | ⬜ | Web Push API |
| **资料页预览 (组件)** | ⬜ | ✅ | ProfilePreviewWidget — thread 视图置顶显示作者资料 |
| **AT Play 实验性功能** | ⬜ | ✅ | Social Circle analysis (PWA only): incoming interaction graph, Mermaid visualization, core/extended/potential layers, share to Bluesky |
| **AI 社交圈分析工具** | ⬜ | ⬜ | Future: AI tool using exported pure functions (generateSocialGraphMermaid, buildSocialCircleShareText) |
| **AT Play 热门灵感** | ⬜ | ⬜ | Future: trending posts + user's top posts + AI content strategy |
| **资料页简介翻译** | ✅ | ✅ | TUI: f 键, PWA: 🌐 翻译按钮 |
| **资料页头像/横幅放大** | N/A | ✅ | 点击头像/横幅 → 全屏灯箱 + 下载按钮 |
| **多提供商 AI** | ✅ | ✅ | DeepSeek + Mistral + OpenAI + xAI + Kimi + OpenRouter, per-provider API keys, per-scenario model config |
| **Gemini 适配** | ⬜ | ⬜ | 未实现；v0.13.9 已改用 OpenAI/xAI/Kimi/OpenRouter |
| **Kimi 适配** | ✅ | ✅ | Moonshot Kimi — 国产视觉模型，无速率限制问题 (v0.13.9) |
| **思考/视觉模式** | ✅ | ✅ | 从 ModelInfo 自动派生，自定义模型手动设置 |
| **图片自动压缩** | ✅ | ✅ | >2MB 自动压缩, TUI: sharp, PWA: Canvas API |
| **色弱友好调色板** | N/A | ✅ | Settings → General 切换 → .cvd class 将 红/绿/黄 映射为 品红/蓝绿/琥珀 |
| **WCAG 1.4.1 合规** | N/A | ✅ | PostActionsRow aria-pressed + 加粗计数; 所有横幅 role="alert"/"status"; 连接文本标签 |
| **屏幕阅读器支持** | N/A | ✅ | 语义HTML(landmark/label/list), ARIA(aria-pressed/expanded/current/live), 焦点管理(Modal trap/skip-link), 动态lang/title |
| **AI ALT 图像描述** | N/A | ✅ | 设置→场景→AI ALT选视觉模型, describeImage(downloadFn, targetLang), alt badge显示+Modal弹窗+缓存, 429重试+bsky.social回退 |
| **WCAG 4.1.2 表单+状态** | N/A | ✅ | htmlFor/id标签关联(14对), aria-expanded(6), aria-describedby, aria-invalid, role=progressbar, hidden input aria-label(5) |
| **MCP Server** | ✅ | ✅ | v0.13.0 + WorkspaceStorage 初始化修复 (2026-05-19) |
| **Session 持久化修复** | N/A | ✅ | v0.13.2: auth.ts 捕获 JWT 刷新后 token，App.tsx profile guard |
| **内容标记系统** | ✅ | ✅ | v0.14.0: 第三方标签提供商支持，通用/提供商独立配置，动态标签查询，隐藏/警告/徽章/媒体模糊，info 按钮显示来源 |
| **举报功能** | ✅ | ✅ | v0.14.0: 帖子详情页举报按钮 + TUI ! 快捷键 |
| **自标记** | ⬜ | ✅ | v0.14.0: AI create_post 工具支持 labels 参数；PWA/TUI UI 待完善 |
| **标记决策应用到帖子** | ✅ | ✅ | v0.14.0: 列表级批量处理 — useModerationBatch hook + 6 个组件集成 |
| **标签服务失败检测** | ✅ | ✅ | v0.14.0: 按提供商失败追踪，指数退避重试(3次)，失败通知(banner/toast) |
| **标签服务失效配置** | ✅ | ✅ | v0.14.0: 每标签提供商可配置 failureBehavior (silent/banner/block) |
| **标记 UI 重构** | ✅ | ✅ | v0.14.0: 3 种渲染模式 — HiddenBanner/ContentWarningOverlay/ModerationLabelBar + BadgeRow，官方 bsky.app 风格 |
| **统一帖子加载管道** | ✅ | ✅ | v0.14.0: useModerationBatch (blob-aware) + usePostModeration — 所有帖子走统一 moderation 流程 |
| **引用帖子标记** | ✅ | ✅ | v0.14.0: 引用帖子共享父帖 moderation decision，媒体模糊通过 blob 级标签 |

## 图例

- ✅ 已完成
- ⬜ 未开始
- N/A 不适用
