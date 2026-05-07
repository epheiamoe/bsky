# 🦋 Bluesky 客户端

**双界面 AI 驱动 Bluesky 客户端。**终端 + 浏览器，一套代码，零后端。

<div align="center">

[**在线体验**](https://ai-bsky.pages.dev) · [功能一览](#-功能一览) · [快速开始](#-快速开始) · [文档](#-文档)

</div>

---

## 为什么选择它？

### 📱 双界面，同一核心

终端（TUI）给键盘党。浏览器（PWA）给所有人。同一套 hooks，同一套业务逻辑，零重复。随意切换——数据跟着你走。

### 🤖 AI 不只是聊天

36 个工具桥接 AI 与 AT Protocol。分析讨论串、管理列表、润色草稿、翻译帖子。流式输出 + 实时思考展示。所有写操作需用户确认。

### 🔒 隐私优先，零后端

纯静态 HTML。无需服务器。你的 Bluesky 凭据永不离开浏览器。PWA 可安装，支持离线。TUI 完全在你本地运行。

---

## ✨ 功能一览

| 分类 | 功能 |
|------|------|
| **时间线** | Following / Discover / 自定义 Feed 生成器，虚拟滚动，滚动位置恢复 |
| **讨论串** | 完整回复树，引用帖卡片，展开/折叠 |
| **发帖** | 多帖串，图片 + ALT 文本，草稿自动保存（PDS + 本地） |
| **列表** | 创建、编辑、删除、添加/移除成员、静音、列表帖文流。15 个 API 方法。`#/lists` |
| **书签** | 内置 Bluesky API，任意帖子弹窗切换，虚拟滚动 |
| **私信** | 文字消息、emoji 反应、引用帖、静音对话 |
| **资料页** | 关注/取关、帖文/回复/列表分页、编辑头像/横幅/名称/描述 |
| **搜索** | 4 标签：热门 / 最新 / 用户 / 动态源 |
| **通知** | 实时刷新，已读标记 |
| **AI 对话** | 36 工具（读/写/列表），流式输出，思考模式，视觉模式，JSON 导出/导入 |
| **智能翻译** | 7 语言，双模式（简易 / JSON 带源语言检测） |
| **AI 润色** | 按风格要求重写草稿 |
| **国际化** | 中文 / English / 日本語 — 即时切换 |
| **深色模式** | CSS 变量，跟随系统 |
| **PWA** | 可安装，manifest.json，Service Worker |

---

## 🚀 快速开始

### TUI（终端）

```bash
git clone https://github.com/epheiamoe/bsky.git
cd bsky
pnpm install && pnpm -r build
cp .env.example .env   # 填入你的 Bluesky 账号 + App Password + AI Key
cd packages/tui && npx tsx src/cli.ts
```

### PWA（浏览器）

```bash
cd packages/pwa && pnpm dev     # http://localhost:5173
# 或者构建生产版本：
pnpm build && npx wrangler pages deploy dist --project-name ai-bsky --commit-dirty=true
```

**无需 `.env`** — PWA 的登录和 AI 配置全在浏览器内完成。

---

## 🏗 架构

```
@bsky/core ──→ @bsky/app ──→ @bsky/tui (Ink/React 终端)
                          └─→ @bsky/pwa (React DOM + Tailwind, PWA)
```

| 包 | 职责 | 关键文件 |
|----|------|----------|
| `@bsky/core` | AT Protocol 客户端，AI 引擎，36 工具，提示词，类型 | `client.ts`, `assistant.ts`, `tools.ts`, `prompts.ts` |
| `@bsky/app` | React hooks, stores, i18n, widget 系统 | `useAIChat.ts`, `useLists.ts`, `widgetStore.ts`, `navigation.ts` |
| `@bsky/tui` | 终端 UI（Ink） | `App.tsx`, `ComposeView.tsx`, `DMListView.tsx` |
| `@bsky/pwa` | 网页 UI（React DOM），可安装 PWA | `App.tsx`, `ListsPage.tsx`, `ListDetailPage.tsx`, `Icon.tsx` |

---

## 📚 文档

| 文档 | 用途 |
|------|------|
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) | 系统架构，依赖流 |
| [`docs/LESSONS.md`](docs/LESSONS.md) | 每次开发会话的关键教训 |
| [`docs/KEYBOARD.md`](docs/KEYBOARD.md) | TUI 快捷键完整参考 |
| [`docs/HOOKS.md`](docs/HOOKS.md) | 所有 hook 签名 |
| [`docs/SCROLL.md`](docs/SCROLL.md) | 虚拟滚动 + 滚动位置恢复规范 |
| [`docs/DM.md`](docs/DM.md) | 私信实现文档 |
| [`AGENTS.md`](AGENTS.md) | 贡献者指南 |

[English Docs](README.md)

---

## 🧪 测试

```bash
cd packages/core && npx vitest run --config vitest.config.ts
# 12+ 集成测试，使用真实 Bluesky API
```

---

## 📄 许可

[MIT](LICENSE) — 自由使用、修改、分发。

**v0.6.0** · [更新日志](CHANGELOG.md) · [反馈](https://github.com/epheiamoe/bsky/issues)
