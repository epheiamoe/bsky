# PWA 网页应用入门

打开浏览器，输入网址，你就进入了这个双界面 Bluesky 客户端。本文带你走完首次使用的完整流程。

---

## 登录页：Bluesky Handle + App Password

首次打开页面，你会看到醒目的登录表单。它只需要两个信息：

1. **Handle** — 你的 Bluesky 用户名，例如 `alice.bsky.social`
2. **Password** — 注意这里不是账号密码，而是 **App Password**（应用专用密码）。页面下方提供了跳转到 Bluesky 设置页的链接帮你创建。

填写后点击提交，App.tsx 中的 `handleLogin` 会调用 `useAuth` Hook 的 `login(handle, password)` 方法，经由 `BskyClient` 向 AT Protocol 发起 `createSession` 请求。成功后，`accessJwt` 和 `refreshJwt` 双令牌会保存到 `localStorage`（通过 `saveSession`），下次刷新页面时自动恢复。

```mermaid
flowchart LR
    A[打开页面] --> B{localStorage 有 session?}
    B -->|有| C[restoreSession → 进入主界面]
    B -->|无| D[显示 LoginPage]
    D --> E[输入 Handle + App Password]
    E --> F[login() → createSession]
    F --> G[saveSession → 主界面]
```

登录成功后，页顶栏显示你的 handle 和绿色的连接状态圆点。如果 session 过期（例如电脑休眠后恢复），`authError` 事件会自动触发登出，返回登录页。

[来源](packages/pwa/src/App.tsx#L188-L190)、[来源](packages/pwa/src/App.tsx#L154-L165)、[来源](packages/pwa/src/App.tsx#L168-L178)、[来源](packages/pwa/src/App.tsx#L181-L186)、[来源](packages/pwa/src/hooks/useSessionPersistence.ts#L1-L27)、[来源](packages/pwa/src/components/LoginPage.tsx#L42-L91)

---

## 主界面布局与导航

登录后，页面被分为三个区域：

| 区域 | 位置 | 功能 |
|------|------|------|
| 顶部栏 | 全宽固定 | 返回按钮、Bluesky 标志、handle、设置/暗黑切换/关于 |
| 左侧边栏（桌面） | 固定宽 `w-sidebar` | 导航按钮：Feed、通知、DM、搜索、书签、列表、个人资料、AI 聊天、发帖 |
| 右侧面板（桌面宽屏） | 固定宽 `w-right-panel` | Widget 系统：帖子润色、AI 聊天、用户预览等小组件 |

移动端下，左侧边栏隐藏为汉堡菜单，右侧 Widget 面板消失，内容区占满全宽。顶部栏始终可见。

[来源](packages/pwa/src/components/Layout.tsx#L152-L279)、[来源](packages/pwa/src/components/Sidebar.tsx#L17-L27)

---

## Hash 路由：页面切换的核心机制

这是一个**单页应用（SPA）**，所有页面切换不依赖服务器，而是通过 URL hash 驱动。`useHashRouter` Hook 解析 `window.location.hash` 并映射到 `AppView` 联合类型。

### 完整路由表

| Hash | 目标页面 | AppView type |
|------|---------|-------------|
| `#/feed` 或 `#/feed?feed=at://...` | 时间线 | `feed` |
| `#/thread?uri=at://...` | 帖子详情 | `thread` |
| `#/compose?replyTo=...` | 发帖/回复/引用 | `compose` |
| `#/profile?actor=...` | 用户主页 | `profile` |
| `#/search?q=...` | 搜索 | `search` |
| `#/notifications` | 通知 | `notifications` |
| `#/bookmarks` | 书签 | `bookmarks` |
| `#/lists` | 列表 | `lists` |
| `#/drafts` | 草稿 | `drafts` |
| `#/ai?session=...` | AI 对话 | `aiChat` |
| `#/dm` | 私信列表 | `dm` |
| `#/dm?conv=id` | 私信对话 | `dmChat` |
| `#/components` | 组件管理 | `components` |
| `#/about` | 关于页面 | `about` |

点击左侧边栏或帖子中的链接时，`goTo(view)` 调用 `history.pushState` 更新 URL；浏览器后退按钮由 `popstate` 事件监听并重新解析 hash。这也意味着你可以直接复制 URL 分享特定页面（比如某条帖子或某个 AI 会话）。

[来源](packages/pwa/src/hooks/useHashRouter.ts#L76-L163)、[来源](packages/pwa/src/hooks/useHashRouter.ts#L21-L74)、[来源](docs/PACKAGES.md#L163-L178)

---

## SettingsModal：AI 配置入口

点击顶部栏的齿轮图标打开设置弹窗，内含四个标签页。

### Bluesky 标签

重新登录或切换账号。填写新的 handle + App Password 即可更新凭证，底部的"退出登录"按钮清除 `localStorage` 中的 session。

### AI 标签（核心配置）

这里配置驱动 AI 助手的 LLM（大语言模型）：

- **Provider 选择** — 从预置提供商列表（DeepSeek、Mistral 等）中选择，或选 Custom 自行输入。切换 Provider 会自动填充其 `baseUrl` 和首个模型。
- **API Key** — 输入你的 API 密钥，保存在 `localStorage`。不同 Provider 的 key 按 `apiKeys: { [providerId]: string }` 结构独立存储。
- **Base URL** — 兼容 OpenAI 的 API 端点，例如 `https://api.deepseek.com`。
- **Model** — 选择模型 ID。已知 Provider 的模型列表自动加载，选 `Custom model...` 可手动输入。
- **Think Mode** — 控制 AI 是否输出**思考链**（reasoning chain）。已知模型自动推导此能力，自定义模型时手动开关。
- **Vision Mode** — 启用图像理解能力。同样，已知模型自动推导，自定义模型手动开关。

### Scenario 标签

为不同场景分配特定模型。例如让"翻译"用更便宜的模型、AI 聊天用高性能模型。格式为 `providerId/modelId`，留空则使用默认 AI 配置。

### General 标签

翻译目标语言、翻译模式（simple 一键翻译 / JSON 结构化翻译）、UI 语言（中文/English/日本語等）、**暗黑模式开关**。

所有配置通过 `saveAppConfig` 写入 `localStorage`，key 为 `bsky_app_config`。

[来源](packages/pwa/src/components/SettingsModal.tsx#L31-L409)、[来源](packages/pwa/src/hooks/useAppConfig.ts#L5-L63)

---

## 特色功能

### 暗黑模式切换

两种进入方式：

1. 顶部栏的月亮/太阳图标按钮（`Layout.tsx` 中的 `toggleDark`）
2. 设置弹窗 General 标签的复选框

切换时操作 `document.documentElement.classList.toggle('dark')`，配合 Tailwind CSS 的 `dark:` 前缀类实现全局样式切换。配置持久化到 `localStorage`，页面刷新后自动恢复。

[来源](packages/pwa/src/components/Layout.tsx#L138-L138)、[来源](packages/pwa/src/components/Layout.tsx#L131-L136)、[来源](packages/pwa/src/components/Layout.tsx#L194-L200)

### PWA 可安装性

这是一个完整的渐进式网页应用（PWA），满足可安装条件：

- **manifest.json** — 声明了名称、图标（64/192/512px）、`display: standalone`（全屏无浏览器 chrome）、主题色 `#00A5E0`。
- **Service Worker** (`sw.js`) — 安装时缓存 `index.html` + `manifest.json`；激活时清理旧缓存；拦截请求并分层缓存：
  - Bluesky CDN 图片 → 缓存优先（不可变资源）
  - Google Fonts → 缓存优先
  - API 请求（`bsky.social` 等）→ 网络优先
  - Vite 构建资源（带 hash 的文件名）→ 缓存优先
  - HTML → Stale-While-Revalidate
- **index.html** — 包含 `apple-mobile-web-app-capable` 元标签，支持 iOS 添加到主屏幕。

在支持的浏览器中，会在地址栏或底部弹出"安装 App"提示。安装后 PWA 以独立窗口运行，体验接近原生应用。

[来源](packages/pwa/public/manifest.json#L1-L30)、[来源](packages/pwa/public/sw.js#L1-L123)、[来源](packages/pwa/index.html#L6-L10)、[来源](packages/pwa/src/main.tsx#L8-L15)

### 无限滚动时间线

Feed 主页使用 `@tanstack/react-virtual` 虚拟列表 + cursor 分页。滚动到底部自动加载更多帖子，顶部栏保留滚动位置（`feedScrollTopRef`），导航到其他页面再返回时恢复。

[来源](packages/pwa/src/components/FeedTimeline.tsx#L1-L12)

---

## PostActionsRow：统一帖子操作栏

这是所有帖子卡片底部的**统一操作栏**组件，出现在时间线、帖子详情、用户主页等任何展示帖子的地方。它提供五个操作：

| 按钮 | 图标 | 功能 |
|------|------|------|
| 💬 回复 | `corner-down-right` | 跳转到发帖页面，自动填入 `replyTo` URI |
| 🔄 转发/引用 | `repeat` | 弹出菜单：转发（Repost）或引用（Quote Post） |
| ❤️ 喜欢 | `heart` | 切换喜欢状态，显示计数 |
| 🔖 书签 | `bookmark` | 可选功能，通过 `showBookmark` 属性控制显示 |
| 🤖 AI 分析 | `astroid-as-AI-Button` | 用 AI 分析当前帖子 |

### 状态管理

喜欢和转发状态来源于 `@bsky/app` 的模块级函数：`isPostLiked(uri)`、`isPostReposted(uri)`。`App.tsx` 中的 `seedPostViewers` 在时间线加载时预先填充所有帖子的喜欢/转发状态，所以 `PostActionsRow` 不需要后端请求就能立即显示状态。

点击操作按钮时，`likePost` 和 `repostPost` 调用 BskyClient 的真实 API，同时更新模块级缓存，其他引用同一帖子的卡片也会自动同步。

AI 分析按钮的行为分为两步：如果 `aiChat` Widget 已启用（`isWidgetEnabled`），则直接打开右侧面板中的 AI 聊天 Widget；否则导航到全屏 AI 聊天页面（`#/ai?session=...&post=...`），将当前帖子 URI 作为上下文传入。

[来源](packages/pwa/src/components/PostActionsRow.tsx#L1-L82)

---

## 下一步

- 了解 PWA 的完整架构和组件层次：[](pwa-网页应用实现.md)
- 配置你的 AI 模型和提供商：[](多提供商支持与模型注册表.md)
- 深入 AI 对话的实现原理：[](ai-对话-hook-深度解析.md)
- 探索 DM 私信功能：[](dm-私信实现.md)
- 学习所有页面视图在 hash 路由下的状态转换：[](导航状态机.md)