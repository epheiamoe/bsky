# PWA 网页客户端入门

当你打开浏览器访问 Bluesky AI 客户端时，首先看到的是一个登录页面。输入你的 Bluesky 账号和应用密码后，便进入了由三栏布局构成的完整主界面。本文从技术视角追踪这一完整流程，帮助你理解浏览器端是如何工作的。

---

## 1. 从 main.tsx 开始：App 的启动流程

所有代码从 `packages/pwa/src/main.tsx` 启动。这个文件只做三件事：

1. **注册 Service Worker** — 让页面可以离线运行并支持 PWA 安装
2. **注入全局 CSS** — 引入 `index.css`（主题变量 + Tailwind）和代码高亮样式
3. **挂载 App 组件** — 将 `<App />` 渲染到 `<div id="root">` 中

```tsx
// main.tsx — 精简示意
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js');
}
ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode><App /></React.StrictMode>,
);
```

[来源](main.tsx#L1-L19)

这段代码等价于传统网页的入口文件，但多了 PWA 特有的 **Service Worker 注册**，使得用户可以将本应用"安装"到手机或电脑桌面，像原生应用一样离线访问。详见 [哈希路由、存储与离线支持](哈希路由-存储与离线支持.md)。

---

## 2. 登录流程：从 LoginPage 到主界面

### 2.1 未登录状态：展示登录表单

`App.tsx` 是真正的路由中枢。它的第一个判断逻辑是：

```tsx
if (!isLoggedIn || !client) {
  return <LoginPage onLogin={handleLogin} error={authError} />;
}
```

[来源](App.tsx#L89-L91)

此时用户看到的是 `LoginPage` 组件——一个居中显示的表单，包含两个输入框：

| 字段 | 说明 | 提示信息 |
|------|------|----------|
| **Handle** | 你的 Bluesky 用户名，如 `user.bsky.social` | `autoComplete="username"` |
| **Password** | **应用密码**，不是登录密码 | 底部有链接引导去 bsky.app 生成 |

[来源](LoginPage.tsx#L31-L68)

关键区别在此：PWA 版不需要 `.env` 文件，所有凭据通过 **登录表单** 输入，凭据（而非密码原文）通过 `useSessionPersistence` 存储在浏览器的 `localStorage` 中。这与 TUI 版的 [环境变量与认证](环境变量与认证.md) 机制完全不同。

### 2.2 登录成功后：保存会话并跳转

当用户点击提交，`handleLogin` 调用 `useAuth` 的 `login()` 方法。登录成功后，`App.tsx` 通过以下 `useEffect` 自动保存会话：

```tsx
useEffect(() => {
  if (session && client?.isAuthenticated()) {
    saveSession({
      accessJwt: session.accessJwt,
      refreshJwt: session.refreshJwt,
      handle: session.handle,
      did: session.did,
    });
    setIsLoggedIn(true);
  }
}, [session, client]);
```

[来源](App.tsx#L57-L66)

### 2.3 页面刷新后：自动恢复会话

`App.tsx` 启动时还有一个 `useEffect` 负责从 `localStorage` 恢复上次的登录状态：

```tsx
useEffect(() => {
  const saved = getSession();
  if (saved && !client) {
    restoreSession({
      accessJwt: saved.accessJwt,
      refreshJwt: saved.refreshJwt,
      handle: saved.handle,
      did: saved.did,
    });
    setIsLoggedIn(true);
  }
}, []);
```

[来源](App.tsx#L48-L55)

这意味着：**你只需登录一次**，即使关闭浏览器再打开，只要 JWT 未过期，都会自动进入主界面。

### 2.4 useSessionPersistence 的实现

会话持久化由 `hooks/useSessionPersistence.ts` 提供，它封装了三个函数，操作 `localStorage` 中键名为 `bsky_session` 的 JSON 字符串：

| 函数 | 作用 |
|------|------|
| `getSession()` | 读取并解析存储的会话 |
| `saveSession(session)` | 序列化并写入会话 |
| `clearSession()` | 删除会话（登出时调用） |

```ts
const SESSION_KEY = 'bsky_session';

export function saveSession(session: StoredSession): void {
  localStorage.setItem(SESSION_KEY, JSON.stringify(session));
}
```

[来源](useSessionPersistence.ts#L1-L21)

**安全说明**：存储的是 JWT 令牌（`accessJwt` 和 `refreshJwt`），而非明文密码。JWT 有过期时间，Bluesky 服务端会通过 [认证与会话自动刷新](认证与会话自动刷新.md) 机制自动续期。

---

## 3. Layout 三栏布局

登录后，所有页面都包裹在 `Layout` 组件中。它实现了**经典社交媒体三栏布局**：

```
┌──────────────────────────────────────────────────┐
│  Header（顶栏：Logo + 状态指示灯 + 设置/主题按钮）   │
├─────────┬──────────────────────┬──────────────────┤
│         │                      │                  │
│ Sidebar │    Main Content      │  Right Panel     │
│ (导航)   │    (主内容区)        │  (AI 建议/预留)   │
│         │                      │                  │
│ 7 个标签 │ 时间线/帖子/聊天...   │  TODO 占位       │
│         │                      │                  │
├─────────┴──────────────────────┴──────────────────┤
│     Mobile: 汉堡菜单替代左侧栏                       │
└──────────────────────────────────────────────────┘
```

### 3.1 顶栏 (Header)

固定顶部的导航栏包含：

- **汉堡菜单按钮**（仅移动端可见）— 打开侧边栏遮罩层
- **返回按钮**（桌面端可见）— 当 `canGoBack` 为 true 时显示
- **Logo + 当前用户名** — 显示 `@handle` 和绿色连接状态指示灯
- **右侧按钮组** — 设置齿轮图标、主题切换（太阳/月亮）、登出

[来源](Layout.tsx#L52-L96)

### 3.2 侧边栏 (Sidebar)

桌面端固定在左侧，移动端通过汉堡菜单以遮罩层形式弹出。包含 7 个导航标签：

| 标签 | 图标 | 导航目标 |
|------|------|----------|
| 首页 | `home` | 时间线 |
| 通知 | `bell` | 通知列表 |
| 搜索 | `compass` | 搜索页 |
| 书签 | `bookmark` | 书签页 |
| 我 | `at-sign` | 个人主页（自动带入当前 handle） |
| AI 聊天 | `astroid` | AI 对话页 |
| 发帖 | `pen-line` | 发帖/回复编辑页 |

每个标签都有**高亮状态**：当前所在页面会显示蓝色左边框和背景。通知和草稿标签还支持**未读徽章计数**。

[来源](Sidebar.tsx#L11-L21)

### 3.3 主内容区 (Main Content)

居中区域宽度受限（`max-w-content`），根据当前视图渲染不同内容组件。`App.tsx` 通过 `switch(currentView.type)` 分发到：

- `feed` → `FeedTimeline`
- `thread` → `ThreadView`
- `compose` → `ComposePage`
- `profile` → `ProfilePage`
- `search` → `SearchPage`
- `notifications` → `NotifsPage`
- `aiChat` → `AIChatPage`
- `bookmarks` → `BookmarkPage`

[来源](App.tsx#L93-L162)

### 3.4 右面板 (Right Panel)

右侧面板在桌面大屏下显示（`lg:flex`），当前为占位状态，预留用于 AI 建议等功能。

[来源](Layout.tsx#L117-L122)

### 3.5 移动端适配

- **侧边栏**：桌面 (`md:`) 以上固定显示，移动端通过点击汉堡菜单触发遮罩层
- **右面板**：仅大屏 (`lg:`) 以上显示
- **顶栏用户名**：小屏 (`sm:`) 以下隐藏

[来源](Layout.tsx#L69-L73)

---

## 4. 设置页面 SettingsModal

点击顶栏的齿轮图标，弹出 `SettingsModal`——一个带三个标签页的模态框，覆盖配置管理、AI 设置和通用偏好。

### 4.1 结构概览

```
┌─── SettingsModal ──────────────────────────┐
│  [Bluesky]  [AI]  [General]  ← 标签栏      │
├───────────────────────────────────────────┤
│  标签内容区域（根据选中标签切换）              │
│  Tab: bluesky → 重新登录/登出              │
│  Tab: ai     → API Key / Model / 思考模式  │
│  Tab: general → 语言/翻译/主题              │
└───────────────────────────────────────────┘
```

[来源](SettingsModal.tsx#L31-L44)

### 4.2 Bluesky 标签页

允许用户在**不登出**的情况下更换账号。提供两个输入框（Handle + App Password）和一个"更新登录"按钮，以及独立的"登出"按钮。

### 4.3 AI 标签页

AI 配置是 PWA 版特有的，因为浏览器无法读取 `.env` 文件。用户需要手动输入：

| 配置项 | 默认值 | 说明 |
|--------|--------|------|
| API Key | 空 | AI 服务商的 API 密钥（如 DeepSeek） |
| Base URL | `https://api.deepseek.com` | API 端点地址 |
| Model | `deepseek-v4-flash` | 模型名称 |
| 思考模式 | 开启 | 显示 AI 的推理过程 |
| 视觉模式 | 关闭 | 启用图片识别能力 |

[来源](SettingsModal.tsx#L134-L179)

配置保存到 `localStorage` 的 `bsky_app_config` 键中，由 `useAppConfig.ts` 管理。详见 [AI 功能快速体验](ai-功能快速体验.md)。

### 4.4 General 标签页

通用设置涵盖三个维度：

**翻译语言** — 选择帖子翻译的目标语言，支持 7 种语言（中文、英文、日文、韩文、法文、德文、西班牙文）。

**翻译模式** — 支持 `simple`（简单翻译）和 `json`（结构化翻译）两种模式，详见 [智能翻译与草稿润色](智能翻译与草稿润色.md)。

**UI 语言** — 切换界面语言。与 TUI 版共享 `useI18n` 的多语言系统，支持实时切换。

**深色模式** — 切换 Light/Dark 主题，通过 CSS 变量的 `dark` class 控制全局样式。详见 [设计系统与主题切换](设计系统与主题切换.md)。

[来源](SettingsModal.tsx#L182-L233)

---

## 5. TUI 到 PWA 的组件映射

`docs/PWA_GUIDE.md` 提供了一张清晰的映射表，帮助理解终端 UI 如何转换为网页 UI：

| TUI (Ink) | PWA (React DOM) |
|-----------|-----------------|
| `<Box>` | `<div>` |
| `<Text>` | `<span>` / `<p>` |
| `useInput` | `onClick` / `onKeyDown` |
| `ink-text-input` | `<input>` / `<textarea>` |
| `borderStyle="single"` | `border: 1px solid` CSS |
| `color="cyan"` | `color: #00FFFF` CSS |
| `backgroundColor="#1a56db"` | `background-color: #1a56db` CSS |

[来源](../docs/PWA_GUIDE.md#L68-L78)

键盘快捷键同样映射为直观的鼠标点击操作：

| TUI 快捷键 | PWA 等价操作 |
|-----------|-------------|
| Enter 选中帖子 | 点击帖子卡片 |
| ↑↓ / jk 滚动 | 鼠标滚轮 / 触摸滑动 |
| Esc 返回 | 点击返回按钮 / 浏览器返回 |
| R 回复 | 点击回复按钮 |
| T 翻译 | 点击翻译按钮 |

[来源](../docs/PWA_GUIDE.md#L56-L66)

---

## 6. 导航路由

PWA 版使用**哈希路由**（`useHashRouter`），所有 URL 以 `#/` 开头，适合静态托管：

```
#/feed?feed=at://...         时间线
#/thread?uri=at://...        帖子线程
#/profile?actor=did:plc:...  个人主页
#/notifications              通知
#/search?q=...               搜索
#/compose                    发帖
#/ai?context=at://...        AI 聊天
#/bookmarks                  书签
```

[来源](useHashRouter.ts#L83-L126)

哈希路由的核心优势在于**不需要服务端配置**——任何静态文件服务器都可以直接部署，解析由浏览器在前端完成。详见 [导航路由与视图管理](导航路由与视图管理.md)。

---

## 总结与下一步

现在你已经了解 PWA 网页客户端的完整工作流程：

```
浏览器打开 → main.tsx 启动
    → 检查 localStorage 中的会话
        → 无会话 → LoginPage 登录表单
        → 有会话 → 自动恢复登录
    → 进入 Layout 三栏布局
        → 侧边栏导航切换视图
        → 主内容区渲染对应页面
        → SettingsModal 管理配置
```

建议你接下来阅读：

- [组件树与渲染层](组件树与渲染层.md) — 深入每个组件的实现细节
- [Feed 与时间线数据流](feed-与时间线数据流.md) — 理解时间线数据如何从 API 流向页面
- [useAIChat: 深度解析](useaichat-深度解析.md) — 了解 AI 聊天功能的实现原理
- [快速开始](快速开始.md) — 本地运行 PWA 进行体验