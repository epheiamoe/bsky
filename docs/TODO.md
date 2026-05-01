# TODO — Bluesky Client Feature Roadmap

> 所有功能必须实现 **TUI** + **PWA** 两个 UI，业务逻辑只写一次在 `@bsky/core` + `@bsky/app`。

## 功能清单

| 功能 | TUI | PWA | 说明 |
|------|-----|-----|------|
| **登录/认证** | ✅ | ✅ | TUI: .env, PWA: localStorage session + JWT auto-refresh |
| **时间线** | ✅ | ✅ | 虚拟滚动 + IntersectionObserver 自动加载 |
| **讨论串** | ✅ | ✅ | 讨论源 + 回复树 + 嵌套回复 + 引用预览 + 回复展开 |
| **发帖/回复** | ✅ | ✅ | 文本 300 字符 + 图片上传(最多 4 张, 1MB/张) + 引用 |
| **点赞** | ✅ | ✅ | TUI: `l` 键, PWA: 按钮 |
| **转发/引用** | ✅ | ✅ | TUI: `r` 键 → 转发/引用选择, PWA: 下拉菜单 |
| **通知** | ✅ | ✅ | 交互式通知（点击/Enter 查看帖子） |
| **搜索** | ✅ | ✅ | 搜索帖子 |
| **个人资料** | ✅ | ✅ | 显示信息 + 统计 + 头像 |
| **书签** | ✅ | ✅ | AT 内置 API, TUI: v/d 键, PWA: 按钮 |
| **AI 对话** | ✅ | ✅ | 工具调用, 流式 SSE, 写操作确认, 撤销/重试, IndexedDB/File |
| **AI 翻译** | ✅ | ✅ | 7 语言, simple/json 双模式, 3 次重试, TUI: `f` 键 |
| **AI 润色** | ✅ | ✅ | 草稿润色 |
| **Markdown 渲染** | ✅ | ✅ | PWA: react-markdown+GFM, TUI: 自定义 Ink parser |
| **草稿** | ✅ | ✅ | TUI: `D` 键草稿列表, PWA: 草稿面板 + 退出保存 |
| **i18n 多语言** | ✅ | ✅ | zh/en/ja, 单例 store 即时切换 |
| **快速设置** | ✅ | N/A | TUI: `,` 键编辑 .env |
| **首次设置向导** | ✅ | N/A | TUI: 首次运行交互式配置 |
| **深色/浅色主题** | N/A | ✅ | CSS 变量 + localStorage |
| **PWA 安装** | N/A | ✅ | manifest.json + Service Worker |
| **图片显示** | ✅ | ✅ | CDN URL 渲染, PWA: 灯箱 portal |
| **头像显示** | ✅ | ✅ | PWA: `<img>` + 字母 fallback |
| **头像缓存** | ⬜ | ⬜ | Service Worker / IndexedDB 缓存头像 |
| **关注/取关** | ✅ | ✅ | 资料页 + 帖子页, g 键 / 按钮 |
| **List/Feed 浏览** | ⬜ | ⬜ | 自定义 Feed |
| **DM 私信** | ⬜ | ⬜ | chat.bsky.convo.* |
| **视频贴** | ⬜ | ⬜ | PWA 播放, TUI 标记 |
| **推送通知** | N/A | ⬜ | Web Push API |
| **转贴标识** | ⬜ | ⬜ | 时间线中标记「此帖是转贴」 |
| **PWA 侧边栏 AI** | N/A | ⬜ | 侧边栏常驻 AI 面板 |

## 图例

- ✅ 已完成
- ⬜ 未开始
- N/A 不适用
