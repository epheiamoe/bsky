# TODO — Bluesky Client Feature Roadmap

> 所有功能必须实现 **TUI** + **PWA** 两个 UI，业务逻辑只写一次在 `@bsky/core` + `@bsky/app`。

## 功能清单

| 功能 | TUI | PWA | 说明 |
|------|-----|-----|------|
| **登录/认证** | ✅ | ✅ | TUI: .env + bsky-tui.config.json, PWA: localStorage session + JWT auto-refresh |
| **时间线** | ✅ | ✅ | 虚拟滚动 + IntersectionObserver 自动加载 |
| **讨论串** | ✅ | ✅ | 讨论源 + 回复树 + 嵌套回复 + 引用预览 + 回复展开 |
| **发帖/回复** | ✅ | ✅ | 文本 300 字符 + 帖子串(多帖顺序发布) + 图片/视频上传(最多 4 图/1 视频, 2MB/100MB) + ALT + 引用 |
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
| **组件系统 (Widgets)** | ⬜ | ✅ | 5 个 widget: 润色/资料页预览/推荐关注/推荐动态源/趋势; 页面限定组件置顶; 启用状态持久化到 localStorage |
| **组件页** | ⬜ | ✅ | `#/components` 管理所有 widget 启用/禁用 |
| **Markdown 渲染** | ✅ | ✅ | PWA: react-markdown+GFM, TUI: 自定义 Ink parser |
| **草稿** | ✅ | ✅ | AT Protocol `app.bsky.draft.*` + 本地回退(IndexedDB/JSON); 退出保存提示; 帖子串草稿支持 |
| **i18n 多语言** | ✅ | ✅ | zh/en/ja, 单例 store 即时切换 |
| **快速设置** | ✅ | N/A | TUI: `,` 键 — 结构化 config 编辑 (model/scenario/lang/keys tabs) |
| **首次设置向导** | ✅ | N/A | TUI: 提供商/模型下拉选择, 写 .env + bsky-tui.config.json |
| **深色/浅色主题** | N/A | ✅ | CSS 变量 + localStorage |
| **PWA 安装** | N/A | ✅ | manifest.json + Service Worker |
| **图片显示** | ✅ | ✅ | CDN URL 渲染, PWA: 灯箱 portal + ALT SVG 徽章 + 固定定位浮窗; TUI: OSC 8 链接 + ALT 文字完整显示 |
| **视频贴** | ✅ | ✅ | PWA: VideoCard (hls.js), TUI: OSC 8 视频链接 |
| **ALT 文本** | ✅ | ✅ | 上传时输入 + 提交前缺失警告; PWA: SVG 徽章 + 浮窗; TUI: 图片链接下完整显示 |
| **头像显示** | ✅ | ✅ | PWA: `<img>` + 字母 fallback |
| **头像缓存** | ⬜ | ⬜ | Service Worker / IndexedDB 缓存头像 |
| **关注/取关** | ✅ | ✅ | 资料页 + 帖子页 + 推荐关注 widget |
| **推荐关注** | ⬜ | ✅ | SuggestedFollowsWidget + AT API |
| **趋势** | ⬜ | ✅ | TrendsWidget + app.bsky.unspecced.getTrends |
| **List/Feed 浏览** | ⬜ | ⬜ | 自定义 Feed |
| **DM 私信** | ⬜ | ⬜ | chat.bsky.convo.* |
| **推送通知** | N/A | ⬜ | Web Push API |
| **资料页预览 (组件)** | ⬜ | ✅ | ProfilePreviewWidget — thread 视图置顶显示作者资料 |
| **资料页 AI 按钮** | ✅ | ✅ | TUI: a 键, PWA: 🤖 AI 按钮 |
| **资料页简介翻译** | ✅ | ✅ | TUI: f 键, PWA: 🌐 翻译按钮 |
| **资料页头像/横幅放大** | N/A | ✅ | 点击头像/横幅 → 全屏灯箱 + 下载按钮 |
| **多提供商 AI** | ✅ | ✅ | DeepSeek + Mistral, per-provider API keys, per-scenario model config |
| **思考/视觉模式** | ✅ | ✅ | 从 ModelInfo 自动派生，自定义模型手动设置 |
| **图片自动压缩** | ✅ | ✅ | >2MB 自动压缩, TUI: sharp, PWA: Canvas API |

## 图例

- ✅ 已完成
- ⬜ 未开始
- N/A 不适用
