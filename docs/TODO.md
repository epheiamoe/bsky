# TODO — Bluesky Client Feature Roadmap

> 所有功能必须实现 **TUI** + **PWA** 两个 UI，业务逻辑只写一次在 `@bsky/core` + `@bsky/app`。

## 功能清单

| 功能 | TUI | PWA | 说明 |
|------|-----|-----|------|
| **登录/认证** | ✅ | ✅ | TUI: .env, PWA: localStorage session + JWT auto-refresh |
| **时间线** | ✅ | ✅ | 虚拟滚动 + IntersectionObserver 自动加载 |
| **讨论串** | ✅ | ✅ | 主题帖 + 讨论源 + 回复树 + 互动按钮 |
| **发帖/回复** | ✅ | ✅ | 文本 300 字符 + 图片上传(最多 4 张, 1MB/张) |
| **点赞/转发** | ✅ | ✅ | TUI: 键盘, PWA: 按钮 |
| **通知** | ✅ | ✅ | 交互式通知（导航 + Enter 查看帖子） |
| **搜索** | ✅ | ✅ | 搜索帖子 |
| **个人资料** | ✅ | ✅ | 显示信息 + 统计 + 头像 |
| **书签** | ✅ | ✅ | AT 内置 API |
| **AI 对话** | ✅ | ✅ | 工具调用, 流式 SSE, IndexedDB/File storage |
| **AI 翻译** | ✅ | ✅ | 7 语言, simple/json 双模式, 3 次重试 |
| **AI 润色** | ✅ | ✅ | 草稿润色 |
| **Markdown 渲染** | ✅ | ✅ | PWA: react-markdown+GFM, TUI: 自定义 Ink parser |
| **深色/浅色主题** | N/A | ✅ | CSS 变量 + localStorage |
| **PWA 安装** | N/A | ✅ | manifest.json + Service Worker |
| **图片显示** | ✅ | ✅ | CDN URL 渲染 |
| **头像显示** | ✅ | ✅ | PWA: `<img>` + 字母 fallback |
| **头像缓存** | ⬜ | ⬜ | Service Worker / IndexedDB 缓存头像 |
| **草稿** | ⬜ | ⬜ | AT 内置 draft API |
| **多语言 UI** | ⬜ | ⬜ | i18n: zh/en/ja |
| **关注/取关** | ⬜ | ⬜ | 用户资料页操作 |
| **引用帖子** | ⬜ | ⬜ | 发帖时引用 |
| **List/Feed 浏览** | ⬜ | ⬜ | 自定义 Feed |
| **DM 私信** | ⬜ | ⬜ | chat.bsky.convo.* |
| **视频贴** | ⬜ | ⬜ | PWA 播放, TUI 标记 |
| **推送通知** | N/A | ⬜ | Web Push API |

## 图例

- ✅ 已完成
- ⬜ 未开始
- N/A 不适用
