# TODO — Bluesky Client Feature Roadmap

> 所有功能必须实现 **TUI** + **PWA** 两个 UI，业务逻辑只写一次在 `@bsky/core` + `@bsky/app`。

## 功能清单

| 功能 | TUI | PWA | 说明 |
|------|-----|-----|------|
| **登录/认证** | ✅ | ✅ | TUI: .env, PWA: localStorage session |
| **时间线** | ✅ | ✅ | Feed + 加载更多 |
| **讨论串** | ✅ | ✅ | 主题帖 + 回复树 + 互动按钮 |
| **发帖/回复** | ✅ | ✅ | 文本，最多 300 字符 |
| **点赞/转发** | ✅ | ✅ | TUI: 键盘, PWA: 按钮 |
| **通知** | ✅ | ✅ | 点赞/转/关注/回复 |
| **搜索** | ✅ | ✅ | 搜索帖子 |
| **个人资料** | ✅ | ✅ | 显示信息 + 统计 |
| **书签** | ✅ | ✅ | AT 内置 API |
| **AI 对话** | ✅ | ✅ | 工具调用，IndexedDB 存储 (PWA) / 文件 (TUI) |
| **AI 翻译** | ✅ | ✅ | 7 语言 |
| **AI 润色** | ✅ | ✅ | 草稿润色 |
| **深色/浅色主题** | N/A | ✅ | CSS 变量，localStorage |
| **PWA 安装** | N/A | ✅ | manifest.json + Service Worker |
| **图片贴** | ✅ | ✅ | 显示标记 → PWA `<img>` CDN |
| **图片显示** | ✅ | ✅ | CDN URL 渲染 |
| **头像显示** | ✅ | ✅ | PWA: `<img>` + 字母 fallback |
| **头像缓存** | ⬜ | ⬜ | Service Worker / IndexedDB 缓存头像 URL |
| **草稿** | ⬜ | ⬜ | AT 内置 draft API |
| **多语言 UI** | ⬜ | ⬜ | i18n: zh/en/ja |
| **关注/取关** | ⬜ | ⬜ | 用户资料页操作 |
| **引用帖子** | ⬜ | ⬜ | 发帖时引用 |
| **List/Feed 浏览** | ⬜ | ⬜ | 自定义 Feed |
| **DM 私信** | ⬜ | ⬜ | chat.bsky.convo.* |
| **视频贴** | ⬜ | ⬜ | PWA 播放，TUI 标记 |
| **推送通知** | N/A | ⬜ | Web Push API |

## 图例

- ✅ 已完成
- ⬜ 未开始
- N/A 不适用
