# 🦋 Bluesky 客户端

**你的 Bluesky，AI 加持。**  
双界面社交客户端——终端给键盘党，浏览器给所有人。  
纯前端，零服务器。AI 不止于 Bluesky——网页搜索、维基百科、任意 URL，尽在对话中。  
内置 [**MCP 服务器**](https://www.npmjs.com/package/@epheiamoe/bsky-mcp) 供外部 AI 客户端使用。隐私优先。

支持第三方PDS。

<div align="center">

[**打开网页版**](https://ai-bsky.pages.dev) · [**MCP 服务器 (npm)**](https://www.npmjs.com/package/@epheiamoe/bsky-mcp) · [**源代码**](https://github.com/epheiamoe/bsky)

</div>

---

## ✨ 功能一览

### 🤖 AI 对话 — 核心能力

![AI 对话](assets/illustration/AI-chat-1.png)

流式输出，思考过程可见。**33 个工具**桥接 AI 与 Bluesky——分析讨论、总结内容、管理列表、润色草稿。所有写操作需点击确认。自带 API Key，数据不经过我们的服务器。

### 🌍 AI 超脱 Bluesky — 内置网页搜索

> **无需任何密钥。无需配置。开箱即用。**

你的 AI 不会被锁在 Bluesky 里。三个内置工具让它零成本接入开放互联网：

| 工具                       | 功能                                         | 需要密钥？ |
| ------------------------ | ------------------------------------------ |:-----:|
| **`search_web_ddg`**     | DuckDuckGo 网页搜索 + jina.ai 阅读器——获取摘要和完整页面内容 | ✗ 无需  |
| **`search_wikipedia`**   | 直接调用 Wikipedia API，自动重定向和模糊匹配，支持多语言        | ✗ 无需  |
| **`fetch_web_markdown`** | 抓取任意 URL 并提取干净的 Markdown——文档、博客、任何公开页面     | ✗ 无需  |

问 AI「AT Protocol 有什么新动态？」「帮我总结这个 GitHub README」「查一下 Wikipedia 上的这个词条」——剩下的事交给它。

### 📰 时间线 & 讨论串

![时间线](assets/illustration/timeline.png)

浏览 Following、Discover 和自定义 Feed。查看嵌套讨论串、引用帖和富媒体嵌入。虚拟滚动保证无论刷多远都流畅。

---

### 📋 列表

![列表](assets/illustration/lists.png)

创建精选列表用于定制信息流，创建管理列表用于批量静音。随时管理成员、浏览列表帖文流。`#/lists` 查看你的收藏。

---

### 💬 私信

![私信](assets/illustration/dm-chat.png)

私人对话 + emoji 反应 + 引用帖嵌入。后台静默轮询，新消息自动出现。静音对话、删除消息、搜索用户。

---

### 🌐 翻译

![翻译](assets/illustration/translate-a-post.png)

一键翻译任意帖子或讨论串。双模式：简易纯文本或带源语言检测的结构化 JSON。支持 7 种语言。

---

### 🎨 欢迎引导

![欢迎引导](assets/illustration/welcome-page.png)

第一次使用？欢迎引导卡片带你几步配置 AI Key——每个提供商都有详细步骤。直接跳过也能用全部核心功能。你的凭据不会离开浏览器。

---

**还有更多：**

- **书签** — 收藏任意帖子，稍后查看
- **搜索** — 帖子、用户、动态源 4 标签搜索
- **资料页** — 编辑头像、横幅、显示名称
- **发帖** — 多帖串 + 图片 + ALT 文本
- **草稿** — 自动保存到你的 PDS + 本地回退
- **通知** — 实时刷新
- **PWA** — 可安装，离线使用
- **深色模式** — 跟随系统
- **国际化** — 中文 · English · 日本語

---

## 🚀 快速开始

### 终端（TUI）

```bash
git clone https://github.com/epheiamoe/bsky.git && cd bsky
pnpm install && pnpm -r build
cp .env.example .env   # 填入你的 Bluesky 账号 + App Password
cd packages/tui && npx tsx src/cli.ts
```

### 浏览器（PWA）

```bash
cd packages/pwa && pnpm dev     # → http://localhost:5173
```

或直接访问 **[ai-bsky.pages.dev](https://ai-bsky.pages.dev)** —— 在浏览器内登录，无需 `.env`。

### MCP 服务器（供 AI 客户端使用）

```bash
pnpm install && pnpm -r build          # 首次构建
cd packages/mcp && pnpm build          # 构建 MCP 服务器
BSKY_HANDLE=... BSKY_APP_PASSWORD=... node dist/index.js
```

或从 npm 全局安装：

```bash
npm install -g @epheiamoe/bsky-mcp
BSKY_HANDLE=... BSKY_APP_PASSWORD=... bsky-mcp
```

---

## 🦯 无障碍支持

为所有人打造——屏幕阅读器用户、色弱用户、AI 代理。

- **屏幕阅读器语义**：规范的地标标签、列表角色、每个交互元素的 `aria-label`，动态 `<html lang>` 和页面标题
- **色弱友好调色板**：可选 `.cvd` 模式将 红/绿/黄 映射为 品红/蓝绿/琥珀，覆盖三类色觉缺陷
- **AI ALT — 图像替代文本**：使用视觉模型为图片生成 ALT 描述。覆盖动态流、帖子详情、资料页、搜索、书签

<img src="assets/illustration/AI-alt.png" alt="AI ALT 功能演示：一张狗狗照片带有 ALT 徽章。点击打开弹窗，显示「原始 ALT：一只狗站在草地上」。下方显示「AI 生成描述：一只金毛犬站在绿色草地上，背景是蓝天白云，它正朝着镜头开心地看。」以及重新生成按钮。" width="100%" style="max-width:800px;border-radius:12px;border:1px solid var(--color-border)" />

---

## 🔒 隐私

一切在你的浏览器中运行。你的 Bluesky 凭据、API Key 和对话内容不会接触任何外部服务器。所有请求直接从你的设备发往 Bluesky 或你选择的 AI 提供商。无需信任，无从泄露。

---

## 🏗 架构

```
@bsky/core ──→ @bsky/app ──→ @bsky/tui  (Ink · 终端)
   │                     └─→ @bsky/pwa  (React · 浏览器)
   │
   └── @epheiamoe/bsky-mcp (npm: 供外部 AI 客户端使用的 MCP 服务器)
```

业务逻辑只写一次。TUI、PWA 和 MCP 共享同一核心。5 个包，一份代码，零重复。

---

## 📄 许可

[MIT](LICENSE) — 自由使用、修改、分发。

**v0.13.1** · [更新日志](CHANGELOG.md) · [English Docs](README.md)
