本页面向初学者开发者解释：**本项目如何管理配置信息**，以及 **TUI 终端版与 PWA 浏览器版在配置持久化方式上的根本差异**。读完本文，你将掌握从哪里配置 Bluesky 账号凭据、AI API 密钥、翻译语言等各项参数，并理解为什么同一项目需要两套截然不同的配置机制。

Sources: [.env.example](/.env.example#L1-L12), [ENV.md](/docs/ENV.md#L1-L51), [PWA_GUIDE.md](/docs/PWA_GUIDE.md#L200-L210)

---

## 配置全景概览

本项目是一个双界面客户端——同一套业务逻辑（`@bsky/app` + `@bsky/core`）同时驱动 TUI 终端界面和 PWA 浏览器界面。然而，**终端应用和浏览器应用获取配置的渠道完全不同**：

- **TUI** 运行在 Node.js 环境中，可以读写文件系统，因此使用 `.env` 文件来存储配置
- **PWA** 运行在浏览器沙箱中，无法访问文件系统，因此依赖 `localStorage`（浏览器本地存储）

以下架构图展示了这一差异：
Sources: [cli.ts](packages/tui/src/cli.ts#L1-L128), [useAppConfig.ts](packages/pwa/src/hooks/useAppConfig.ts#L1-L43)

---

## 两种配置机制概览

| 维度 | TUI 终端版 | PWA 浏览器版 |
|------|-----------|-------------|
| 存储介质 | 磁盘文件 `.env` | 浏览器 `localStorage` |
| 配置加载时机 | 进程启动时通过 `dotenv` 解析 | 页面加载时通过 `getAppConfig()` 读取 |
| 首次配置流程 | 交互式 `SetupWizard` 向导 → 写入 `.env` | 用户输入 `LoginPage` 表单 + 可选设置 |
| 配置修改方式 | `SettingsView` 终端 UI → 原地编辑 `.env` | `SettingsModal` 弹窗 → 写入 `localStorage` |
| 需重启生效？ | **是**（.env 仅在进程启动时加载） | **否**（配置实时热更新） |
| 安全性 | 文件权限（系统级） | 浏览器的同源策略 |

Sources: [cli.ts](packages/tui/src/cli.ts#L8-L43), [useAppConfig.ts](packages/pwa/src/hooks/useAppConfig.ts#L1-L43), [SetupWizard.tsx](packages/tui/src/components/SetupWizard.tsx#L1-L156)

---

## 配置键一览

无论是 TUI 的 `.env` 还是 PWA 的 `localStorage`，它们管理的参数都是相同的——只是读取来源不同。

### Bluesky 账号（必须配置）

| 配置键 | 含义 | 示例值 |
|--------|------|--------|
| `BLUESKY_HANDLE` | Bluesky 用户名 | `your-handle.bsky.social` |
| `BLUESKY_APP_PASSWORD` | 应用专用密码 | 在 bsky.app/settings/app-passwords 创建 |

**关于 App Password 的安全提示**：请勿使用你的主密码。在 Bluesky 设置中创建一个"应用密码"（App Password），此密码仅包含字母和数字，不包含空格。它拥有完整的读写权限。

Sources: [.env.example](/.env.example#L2-L3), [ENV.md](/docs/ENV.md#L4-L7), [LoginPage.tsx](packages/pwa/src/components/LoginPage.tsx#L35-L57)

### LLM / AI 配置

| 配置键 | 默认值 | 含义 |
|--------|--------|------|
| `LLM_API_KEY` | （必填） | 兼容 OpenAI 接口的 API 密钥 |
| `LLM_BASE_URL` | `https://api.deepseek.com` | API 端点地址 |
| `LLM_MODEL` | `deepseek-v4-flash` | 模型名称 |

该项目兼容任何 OpenAI 格式的 API（DeepSeek、OpenAI、Groq、Together AI 等）。只需修改 `LLM_BASE_URL` 和 `LLM_MODEL` 即可切换提供方。

Sources: [.env.example](/.env.example#L6-L8), [ENV.md](/docs/ENV.md#L10-L14), [assistant.ts](packages/core/src/ai/assistant.ts#L60-L64)

### 翻译与界面语言

| 配置键 | 默认值 | 可选值 |
|--------|--------|--------|
| `TRANSLATE_TARGET_LANG` | `zh` | `zh`, `en`, `ja`, `ko`, `fr`, `de`, `es` |

此参数影响两件事：AI 翻译的目标语言（帖子翻译功能），以及 TUI 设置界面的 `I18N_LOCALE`（PWA 则在设置弹窗中独立控制 UI 语言）。

Sources: [.env.example](/.env.example#L11), [ENV.md](/docs/ENV.md#L17-L20)

---

## TUI 配置详解：基于 `.env` 的文件式配置

TUI 的配置流程分三步：**启动加载 → 缺失则向导 → 运行时编辑**。以下是完整的流程图：

### 启动加载阶段

TUI 的入口文件 `packages/tui/src/cli.ts` 在进程启动时执行以下逻辑：

```typescript
// 1. 用 dotenv 从两个位置搜索 .env 文件
const envPaths = [
  path.resolve(__dirname, '..', '..', '..', '.env'),  // 项目根目录
  path.resolve(process.cwd(), '.env'),                  // 当前工作目录
];
for (const envPath of envPaths) {
  dotenv.config({ path: envPath });
}

// 2. 尝试从环境变量中读取配置
const HANDLE = process.env.BLUESKY_HANDLE;
const APP_PASSWORD = process.env.BLUESKY_APP_PASSWORD;
```

**搜索顺序**：先查看项目根目录（monorepo 顶级），再检查当前工作目录。后加载的文件会覆盖先加载的值，这意味着你可以在项目根目录保留一份默认配置，在工作目录使用自定义覆盖。

Sources: [cli.ts](packages/tui/src/cli.ts#L12-L25)

### 首次运行向导（SetupWizard）

如果环境变量中缺少 `BLUESKY_HANDLE` 或 `BLUESKY_APP_PASSWORD`，程序认为这是**首次运行**，自动启动交互式 `SetupWizard` 组件：

```typescript
function getConfigFromEnv(): AppConfig | null {
  const handle = process.env.BLUESKY_HANDLE;
  const password = process.env.BLUESKY_APP_PASSWORD;
  if (!handle || !password) return null;  // 缺少关键配置 → 进入向导
  // ...
}
```

`SetupWizard` 依次收集 6 个字段：

| 步骤 | 字段 | 键盘输入 | 说明 |
|------|------|---------|------|
| 1 | Bluesky Handle | 用户输入 | 必须填写 |
| 2 | App Password | 密码掩码输入 | 必须填写 |
| 3 | LLM API Key | 密码掩码输入 | 可选 |
| 4 | LLM Base URL | 带默认值输入 | 默认 `https://api.deepseek.com` |
| 5 | LLM Model | 带默认值输入 | 默认 `deepseek-v4-flash` |
| 6 | Locale | 带默认值输入 | 默认 `zh`，支持 zh/en/ja |

用户完成所有输入后，`SetupWizard` 调用 `writeEnvFile()` 将配置写入 `CWD/.env`：

```typescript
function writeEnvFile(config: SetupConfig): string {
  const lines = [
    `BLUESKY_HANDLE=${config.blueskyHandle}`,
    `BLUESKY_APP_PASSWORD=${config.blueskyPassword}`,
    `LLM_API_KEY=${config.llmApiKey}`,
    `LLM_BASE_URL=${config.llmBaseUrl || 'https://api.deepseek.com'}`,
    `LLM_MODEL=${config.llmModel || 'deepseek-v4-flash'}`,
    config.locale ? `TRANSLATE_TARGET_LANG=${config.locale}` : '',
  ].filter(Boolean);
  writeFileSync(envPath, lines.join('\n') + '\n', 'utf-8');
  return envPath;
}
```

写入成功后，`dotenv.config({ path: envPath, override: true })` 重新加载，然后自动进入主界面。整个过程用户无需手动创建或编辑任何文件。

Sources: [SetupWizard.tsx](packages/tui/src/components/SetupWizard.tsx#L1-L156), [cli.ts](packages/tui/src/cli.ts#L31-L55)

### 运行时设置编辑（SettingsView）

已配置完成后，用户仍可在运行中通过 `SettingsView` 修改 LLM 相关参数。但需注意**修改后必须重启才能生效**——因为 `.env` 仅在进程启动时由 `dotenv` 加载一次，后续的 `process.env` 修改不会自动传播到已运行的组件中。

```typescript
// SettingsView 核心逻辑：读取现有 .env → 修改 → 写回
const envPath = path.resolve(process.cwd(), '.env');
if (existsSync(envPath)) {
  const existing = readFileSync(envPath, 'utf-8').split('\n');
  // 替换或追加新的键值对
  // ...
}
writeFileSync(envPath, lines.join('\n') + '\n', 'utf-8');
```

设置界面底部会显示提示信息：`"Saved! Restart needed for changes to take effect."`

Sources: [SettingsView.tsx](packages/tui/src/components/SettingsView.tsx#L1-L94)

---

## PWA 配置详解：基于 localStorage 的浏览器持久化

PWA 运行在浏览器的 JavaScript 沙箱中，无法读写文件系统，因此使用 `localStorage` 作为配置存储介质。

### 配置加载与保存

核心模块是 `packages/pwa/src/hooks/useAppConfig.ts`，它提供三个函数：

```typescript
const CONFIG_KEY = 'bsky_app_config';

// 读取配置
export function getAppConfig(): AppConfig {
  try {
    const raw = localStorage.getItem(CONFIG_KEY);
    if (!raw) return { ...DEFAULT_CONFIG };  // 返回默认值
    return { ...DEFAULT_CONFIG, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}

// 保存完整配置
export function saveAppConfig(config: AppConfig): void {
  localStorage.setItem(CONFIG_KEY, JSON.stringify(config));
}

// 更新部分字段
export function updateAppConfig(partial: Partial<AppConfig>): AppConfig {
  const current = getAppConfig();
  const updated = { ...current, ...partial };
  saveAppConfig(updated);
  return updated;
}
```

PWA 的 `AppConfig` 接口定义：

```typescript
export interface AppConfig {
  aiConfig: {         // AI 配置（API 密钥、端点、模型）
    apiKey: string;
    baseUrl: string;
    model: string;
  };
  targetLang: string;       // 翻译目标语言（默认 "zh"）
  translateMode: 'simple' | 'json';  // 翻译模式
  darkMode: boolean;        // 深色模式开关
}
```

注意：PWA 的 `AppConfig` **不包含 Bluesky 用户名和密码**。Bluesky 凭据仅在登录时使用一次，换取 JWT 令牌后即不再保留原始密码。

Sources: [useAppConfig.ts](packages/pwa/src/hooks/useAppConfig.ts#L1-L43)

### 登录与会话持久化

PWA 使用独立的 `useSessionPersistence` 模块管理登录态，存储在 `localStorage` 的 `bsky_session` 键下：

```typescript
const SESSION_KEY = 'bsky_session';

export interface StoredSession {
  accessJwt: string;     // 短期访问令牌（2小时有效期）
  refreshJwt: string;    // 长期刷新令牌（用于自动续期）
  handle: string;        // 用户句柄（仅用于显示）
  did: string;          // 分布式标识符
}
```

**启动恢复流程**：PWA 的 `App.tsx` 在挂载时自动检查 `localStorage` 中是否存在有效会话：

```typescript
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

如果会话过期（例如设备休眠数小时后返回），`AuthProvider` 会检测到认证错误，自动清除本地会话并跳回登录页。

Sources: [useSessionPersistence.ts](packages/pwa/src/hooks/useSessionPersistence.ts#L1-L27), [App.tsx](packages/pwa/src/App.tsx#L32-L55)

### 设置弹窗（SettingsModal）

PWA 的设置弹窗分为三个标签页，各自独立保存：

| 标签页 | 配置项 | 存储方式 |
|--------|--------|---------|
| 🦋 Bluesky | 重新登录（handle + password） | 调用 `onRelogin` → 更新 `bsky_session` |
| 🤖 AI | API Key、Base URL、Model | `updateAppConfig({ aiConfig })` |
| ⚙️ 通用 | 翻译语言、翻译模式、UI 语言、深色模式 | `updateAppConfig({ targetLang, darkMode })` |

与 TUI 不同，**PWA 的配置修改立即生效**，无需重启页面。例如切换深色模式时立即通过 `document.documentElement.classList.toggle('dark', darkMode)` 应用。

Sources: [SettingsModal.tsx](packages/pwa/src/components/SettingsModal.tsx#L1-L230)

---

## 常见问题（Troubleshooting）

### Q1：我编辑了 `.env` 文件，TUI 为什么没有生效？

TUI 使用 `dotenv` 在进程启动时一次性加载 `.env` 到 `process.env`。**运行中修改 `.env` 不会影响已运行的进程**。修改配置后，请退出 TUI 重新启动。

### Q2：PWA 的配置存在哪里？刷新页面会丢失吗？

PWA 的配置存储在浏览器 `localStorage` 中，对应键名为 `bsky_app_config`（应用配置）和 `bsky_session`（会话令牌）。**刷新页面不会丢失**——它们与 cookie 一样是持久化的。只有用户手动清除浏览器数据（或调用 `localStorage.clear()`）时才会丢失。

### Q3：如果既没有 `.env` 又没有 `localStorage` 缓存，PWA 怎么启动？

PWA 的 `getAppConfig()` 会在 `localStorage` 为空时返回内置的 `DEFAULT_CONFIG`——此时 AI 功能不可用（API Key 为空字符串），但浏览帖子、查看通知等功能不受影响。用户可在设置弹窗中随时填写 API Key。

### Q4：能不能让 TUI 和 PWA 共享同一套配置？

技术上说，二者面向不同的运行时环境（Node.js vs 浏览器），**无法直接共享配置存储**。建议的 workflow 是：先用 TUI 的 `SetupWizard` 生成 `.env`，然后在 PWA 的设置弹窗中手动输入相同的参数。

### Q5：我可以在 `.env` 中使用引号或特殊字符吗？

`dotenv` 支持使用双引号包裹包含空格的值：`BLUESKY_APP_PASSWORD="my pass word"`。但 Bluesky 的 App Password 本身不包含空格，因此通常不需要。避免在未加引号的值中使用 `#`（会被解析为注释）。

Sources: [cli.ts](packages/tui/src/cli.ts#L18-L23), [useAppConfig.ts](packages/pwa/src/hooks/useAppConfig.ts#L16-L21)

---

## 下一步阅读

你已掌握两种界面下的配置管理方式。若要深入了解它们如何加载和使用这些配置，推荐按以下顺序继续阅读：

- **[快速启动：TUI 终端客户端安装与运行](2-kuai-su-qi-dong-tui-zhong-duan-ke-hu-duan-an-zhuang-yu-yun-xing)** —— 从头搭建 TUI 环境的完整指南
- **[快速启动：PWA 浏览器客户端安装与部署](3-kuai-su-qi-dong-pwa-liu-lan-qi-ke-hu-duan-an-zhuang-yu-bu-shu)** —— 在浏览器中运行 PWA 的步骤
- **[BskyClient：AT 协议 HTTP 客户端、双端点架构与 JWT 自动刷新](10-bskyclient-at-xie-yi-http-ke-hu-duan-shuang-duan-dian-jia-gou-yu-jwt-zi-dong-shua-xin)** —— 理解配置如何驱动 Bluesky API 认证
- **[PWA 组件全景：页面组件、钩子与服务层清单](24-pwa-zu-jian-quan-jing-ye-mian-zu-jian-gou-zi-yu-fu-wu-ceng-qing-dan)** —— 查看 PWA 如何使用配置驱动各页面