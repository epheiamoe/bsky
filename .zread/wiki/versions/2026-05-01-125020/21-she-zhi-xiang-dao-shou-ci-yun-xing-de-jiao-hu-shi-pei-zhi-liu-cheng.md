当你在终端首次启动 Bluesky TUI 客户端时，如果检测不到 `.env` 配置文件，系统不会直接抛出错误退出——而是呈现一个优雅的交互式设置向导，引导你逐项填写必要的凭证信息。这个向导是终端 UI 包（`@bsky/tui`）中的 React 组件，利用 Ink 框架在命令行中渲染出带有视觉反馈的表单界面。设置完成后，向导自动将你的配置写入 `.env` 文件，然后无缝衔接到主应用界面。

Sources: [SetupWizard.tsx](packages/tui/src/components/SetupWizard.tsx#L1-L10), [cli.ts](packages/tui/src/cli.ts#L54-L68)

---

## 触发条件：.env 缺失时的智能降级

设置向导的触发逻辑位于入口文件 `cli.ts` 中的 `Root` 组件。启动时，`getConfigFromEnv()` 函数尝试从环境变量中读取 `BLUESKY_HANDLE` 和 `BLUESKY_APP_PASSWORD`。只要这两个关键字段有一个为空，函数返回 `null`，`Root` 组件就会渲染 `SetupWizard` 而不是主 `App`。

```mermaid
flowchart TD
    A[启动 TUI 客户端] --> B{getConfigFromEnv()}
    B -->|BLUESKY_HANDLE 或 APP_PASSWORD 缺失| C[渲染 SetupWizard]
    B -->|所有凭证齐全| D[直接渲染 App]
    C --> E[用户填写配置]
    E --> F[writeEnvFile 写入 .env]
    F --> G[重载 dotenv.config]
    G --> H[setAppConfig -> 渲染 App]
    H --> I[自动登录 Bluesky]
```

这种设计遵循了**先验配置不存在时的优雅降级**原则。新用户无需预先创建 `.env` 文件，开箱即用。老用户如果环境变量齐全，则绕过向导直接进入主界面，毫无影响。这是一种典型的配置缺失 → 交互引导 → 自动完成的三段式流程。

Sources: [cli.ts](packages/tui/src/cli.ts#L54-L68), [cli.ts](packages/tui/src/cli.ts#L72-L85)

---

## 六个配置字段：覆盖完整启动需求

设置向导收集 6 个字段，涵盖了 Bluesky 客户端启动所需的全部凭证和 AI 功能参数。每个字段都定义了 `Field` 接口，其中包括键名、i18n 标签、默认值、密码掩码标记和可选的验证函数。

| 字段键 | 标签（中文） | 默认值 | 密码掩码 | 验证规则 |
|---|---|---|---|---|
| `blueskyHandle` | Bluesky 账号 (handle.bsky.social) | 无 | ❌ | 必填，不能为空 |
| `blueskyPassword` | Bluesky App Password | 无 | ✅ 显示 **** | 必填，不能为空 |
| `llmApiKey` | LLM API Key (DeepSeek / OpenAI 兼容) | 无 | ✅ 显示 **** | 可选 |
| `llmBaseUrl` | LLM Base URL | `https://api.deepseek.com` | ❌ | 可选 |
| `llmModel` | LLM Model | `deepseek-v4-flash` | ❌ | 可选 |
| `locale` | 界面语言 (zh/en/ja) | `zh` | ❌ | 必须是 zh、en 或 ja |

验证函数在用户按下 Enter 确认当前字段时触发。如果验证失败，底部会显示红色错误提示，用户无法前进到下一个字段。对于 `locale` 字段，除了验证之外，还有一个**即时生效的副作用**：当用户提交语言选择后，向导会立即调用 `setLocale()` 更新 i18n 上下文，后续的提示文字会立即切换为目标语言。

Sources: [SetupWizard.tsx](packages/tui/src/components/SetupWizard.tsx#L18-L41)

---

## 交互体验：Focus/Unfocus/Done 三态视觉反馈

设置向导利用 Ink 的 `useInput` 钩子捕获键盘事件，用 `focusIndex` 状态管理当前聚焦的字段。每个字段在渲染时呈现三种视觉状态之一：

```
  ✓ Bluesky 账号 (handle.bsky.social): alice.bsky.social    ← Done（已完成，绿色）
  ▸ Bluesky App Password: ****                                ← Focus（当前编辑，青色边框）
    LLM API Key (https://api.deepseek.com)                    ← Unfocus（未编辑，灰色）
```

**三种状态的视觉规则：**
- **Done（已填写）**：左侧显示 `✓` 绿色标记，密码字段显示 `****`，非密码字段显示填写的值
- **Focus（正在编辑）**：左侧显示 `▸` 青色箭头，字段名加粗青色，下方显示带单线边框的 `TextInput`，光标在此等待输入
- **Unfocus（待编辑）**：左侧显示空格，字段名普通颜色，如果有默认值则在末尾用灰色括号显示 `(default-value)`

当用户按下 **Enter** 提交当前字段后，如果验证通过，`focusIndex` 递增到下一个字段。如果已经是最后一个字段（`isLastField === true`），则自动组装完整的 `SetupConfig` 对象并调用 `onComplete` 回调。

键盘导航支持 **Tab** 和 **向下箭头** 前进到下一个字段，**向上箭头** 返回到上一个字段。底部始终显示 `Tab/↑↓ 切换 Enter 确认` 的操作提示。

Sources: [SetupWizard.tsx](packages/tui/src/components/SetupWizard.tsx#L74-L135), [SetupWizard.tsx](packages/tui/src/components/SetupWizard.tsx#L43-L72)

---

## 配置持久化：writeEnvFile 与 .env 生命周期

当用户完成所有字段的填写后，`onComplete` 回调触发 `writeEnvFile()` 函数。这个函数负责将配置持久化到文件系统：

```
BLUESKY_HANDLE=alice.bsky.social
BLUESKY_APP_PASSWORD=xxxx-xxxx-xxxx-xxxx
LLM_API_KEY=sk-your-api-key
LLM_BASE_URL=https://api.deepseek.com
LLM_MODEL=deepseek-v4-flash
TRANSLATE_TARGET_LANG=zh
```

`writeEnvFile` 使用 Node.js 的 `writeFileSync` 将 `.env` 文件写入 `process.cwd()` 目录。写入完成后，`Root` 组件立即调用 `dotenv.config({ path: envPath, override: true })` 重新加载环境变量，然后通过 `getConfigFromEnv()` 提取配置并调用 `setAppConfig(newConfig)`。这一步触发了 React 状态的更新，`Root` 组件从渲染 `SetupWizard` 切换为渲染 `App` 组件。

**重要设计细节**：`dotenv.config` 的参数中 `override: true` 是必需的。因为 Node.js 的 `process.env` 一旦设置就不会被覆盖，如果不加这个选项，重复调用 `dotenv.config` 不会更新已有变量。

Sources: [cli.ts](packages/tui/src/cli.ts#L78-L89), [cli.ts](packages/tui/src/cli.ts#L72-L85)

---

## 事后修改：SettingsView 的补充作用

设置向导仅在新安装时触发一次。如果用户后续需要修改配置，可以通过主界面按 `,` 键进入 **SettingsView**（设置视图）。SettingsView 提供了类似但更简洁的字段编辑界面：

- **LLM API Key** — 修改 AI 密钥
- **LLM Base URL** — 修改 AI 服务地址
- **LLM Model** — 修改 AI 模型
- **UI 语言 (zh/en/ja)** — 修改界面语言

与设置向导不同的是，SettingsView 直接读取并改写现有的 `.env` 文件，而不是创建新文件。它使用 `readFileSync` 读取现有内容，逐行替换匹配的键，保留不匹配的行。修改完成后，底部显示 `✅ Saved! Restart needed for changes to take effect.` 提示，1.5 秒后自动返回。

**注意**：修改 `.env` 后需要重启终端客户端才能生效，这是因为 `process.env` 在进程运行期间不会被动态更新。

Sources: [SettingsView.tsx](packages/tui/src/components/SettingsView.tsx#L1-L94), [App.tsx](packages/tui/src/components/App.tsx#L75-L81)

---

## 国际化支持：三种语言的完整翻译

设置向导的 i18n 翻译键集中定义在 `packages/app/src/i18n/locales/` 下的三个文件中。以下是所有 `setup.*` 键的中英日对照表：

| 键 | 中文 (zh) | English (en) | 日本語 (ja) |
|---|---|---|---|
| `setup.title` | 🦋 Bluesky TUI — 初次设置 | 🦋 Bluesky TUI — Initial Setup | 🦋 Bluesky TUI — 初期設定 |
| `setup.welcome` | 欢迎！请配置以下信息以开始使用： | Welcome! Please configure the following: | ようこそ！以下の情報を設定してください： |
| `setup.blueskyHandle` | Bluesky 账号 (handle.bsky.social) | Bluesky Handle (handle.bsky.social) | Bluesky ハンドル (handle.bsky.social) |
| `setup.blueskyPassword` | Bluesky App Password | Bluesky App Password | Bluesky App パスワード |
| `setup.llmApiKey` | LLM API Key (DeepSeek / OpenAI 兼容) | LLM API Key (DeepSeek / OpenAI compatible) | LLM API キー (DeepSeek / OpenAI 互換) |
| `setup.llmBaseUrl` | LLM Base URL (留空使用默认: https://api.deepseek.com) | LLM Base URL (leave blank for default: https://api.deepseek.com) | LLM Base URL (デフォルトなら空欄: https://api.deepseek.com) |
| `setup.llmModel` | LLM Model (留空使用默认: deepseek-v4-flash) | LLM Model (leave blank for default: deepseek-v4-flash) | LLM モデル (デフォルトなら空欄: deepseek-v4-flash) |
| `setup.locale` | 界面语言 / Language / 言語 (zh/en/ja) | 界面语言 / Language / 言語 (zh/en/ja) | 界面语言 / Language / 言語 (zh/en/ja) |
| `setup.navigate` | Tab/↑↓ 切换 Enter 确认 | Tab/↑↓:Switch Enter:Confirm | Tab/↑↓:切替 Enter:確認 |
| `setup.complete` | 设置完成！按任意键开始… | Setup complete! Press any key to start… | 設定完了！何かキーを押して開始… |

i18n 系统采用三级回退机制：优先使用当前语言，缺失则回退到英文，再缺失回退到中文，最后返回原始键名。`setup.locale` 的标签在所有语言中统一使用中英日三语显示 `界面语言 / Language / 言語 (zh/en/ja)`，这是一个有意为之的设计，确保用户无论当前界面是什么语言，都能理解这个字段的含义。

Sources: [zh.ts](packages/app/src/i18n/locales/zh.ts#L219-L234), [en.ts](packages/app/src/i18n/locales/en.ts#L219-L233), [ja.ts](packages/app/src/i18n/locales/ja.ts#L219-L233)

---

## 组件结构总览

```
packages/tui/src/
├── cli.ts                          ← 入口：判断环境变量 → 渲染 SetupWizard 或 App
└── components/
    ├── SetupWizard.tsx             ← 设置向导组件（6 字段表单 + 验证 + i18n）
    ├── SettingsView.tsx            ← 事后修改配置的视图
    └── App.tsx                     ← 主应用（设置完成后进入）

packages/app/src/i18n/locales/
├── zh.ts                          ← 中文翻译（含 setup.* 12 条键值）
├── en.ts                          ← 英文翻译
└── ja.ts                          ← 日文翻译
```

**核心依赖**：`ink`（React 终端渲染框架）、`ink-text-input`（文本输入组件）、`dotenv`（环境变量管理）、`writeFileSync/readFileSync`（文件读写）。

Sources: [cli.ts](packages/tui/src/cli.ts#L1-L16), [SetupWizard.tsx](packages/tui/src/components/SetupWizard.tsx#L1-L7)

---

## 下一步阅读

设置向导是 TUI 客户端的入口体验。完成配置后，你将进入主应用界面。建议按以下顺序继续阅读：

- [启动 TUI 终端客户端](5-qi-dong-tui-zhong-duan-ke-hu-duan) — 了解从命令行启动的完整流程
- [四层架构设计：Core → App → TUI/PWA 分层原则](7-si-ceng-jia-gou-she-ji-core-app-tui-pwa-fen-ceng-yuan-ze) — 理解设置向导在架构中的位置
- [导航系统与 AppView 视图路由设计](13-dao-hang-xi-tong-yu-appview-shi-tu-lu-you-she-ji) — 进入主界面后的导航逻辑
- [键盘快捷键系统与 ANSI 鼠标事件追踪](18-jian-pan-kuai-jie-jian-xi-tong-yu-ansi-shu-biao-shi-jian-zhui-zong) — 掌握交互操作