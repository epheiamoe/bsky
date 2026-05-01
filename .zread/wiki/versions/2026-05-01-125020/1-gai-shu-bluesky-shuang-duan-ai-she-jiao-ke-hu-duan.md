## 项目定位

本项目的官方名称为 `bsky`，是一个**双端（TUI + PWA）Bluesky 社交客户端**，其最核心的差异化能力是与 **DeepSeek 大语言模型**的深度集成。与官方 Bluesky 客户端不同，本项目不是对官方功能的简单复刻，而是将 AI 作为一等公民嵌入社交体验的每一个环节——从浏览时间线、撰写帖子、翻译内容到分析讨论串上下文，AI 助手均可通过工具调用直接操作 Bluesky API。Sources: [README.md](README.md#L1-L9)

项目采用 **TypeScript 全栈**、基于 **pnpm monorepo** 组织，遵循"业务逻辑仅存一份"的黄金法则——核心逻辑在 `@bsky/core` 和 `@bsky/app` 中实现一次，TUI 终端和 PWA 浏览器端作为纯渲染层复用同一套 React Hooks。Sources: [README.md](README.md#L147-L156)

## 双端形态

| 维度 | TUI（终端） | PWA（浏览器） |
|------|-------------|---------------|
| 渲染引擎 | Ink（React 终端渲染框架） | React DOM |
| 运行环境 | 任何支持 raw mode 的终端（Windows Terminal、iTerm2、Kitty） | 现代浏览器（Chrome/Firefox/Safari） |
| 启动方式 | `cd packages/tui && npx tsx src/cli.ts` | `cd packages/pwa && pnpm dev` |
| 凭证管理 | `.env` 文件配置（Bluesky Handle + App Password + LLM API Key） | 浏览器登录表单 + localStorage 持久化 |
| 部署方式 | 本地运行 | 静态托管（Cloudflare Pages / Netlify / Vercel） |
| PWA 安装 | 不适用 | ✅ 支持，有 Service Worker 离线缓存 |
| 暗色模式 | 终端原生 | ✅ Tailwind CSS 暗色主题 |
| 聊天持久化 | JSON 文件（FileChatStorage） | IndexedDB（IndexedDBChatStorage） |
| AI 流式输出 | 回调方式更新 | SSE 实时流式令牌渲染 |

Sources: [README.md](README.md#L65-L88), [packages/core/package.json](packages/core/package.json#L1-L32), [packages/app/package.json](packages/app/package.json#L1-L30)

## 四层架构

```
┌─────────────────────────────────────────────────────────┐
│                    @bsky/tui (Ink)                       │
│  Ink 终端渲染组件 · 视口计算 · CJK 文本换行 · Markdown  │
│  键盘快捷键 · ANSI 鼠标追踪 · 虚拟滚动 · 平铺线程视图    │
└───────────────────────┬─────────────────────────────────┘
                        │
┌───────────────────────▼─────────────────────────────────┐
│                    @bsky/app (React)                     │
│  useAuth · useTimeline · useThread · useAIChat          │
│  useTranslation · useCompose · useNotifications         │
│  useProfile · useSearch · useBookmarks · useDrafts      │
│  ChatStorage 接口 · i18n 国际化系统                     │
│  纯 Store (createXxxStore) + Subscribe 模式             │
└───────────────────────┬─────────────────────────────────┘
                        │
┌───────────────────────▼─────────────────────────────────┐
│                   @bsky/core (纯 TS)                     │
│  BskyClient (AT 协议 + JWT 自动刷新)                    │
│  AIAssistant (多轮对话 + 工具调用循环)                  │
│  31 个工具函数 (读写分离 + 权限标注)                    │
│  双模式翻译 (simple / JSON + 指数退避重试)              │
│  AT 协议类型定义 (PostView, ThreadViewPost 等)          │
└─────────────────────────────────────────────────────────┘
```

Sources: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md#L1-L114), [packages/core/src/index.ts](packages/core/src/index.ts#L1-L25)

## 五大技术特征

### 1. 纯 Store + Hook 订阅模式

应用层（`@bsky/app`）未采用 Redux、Zustand 等第三方状态管理库，而是自建了极简的发布-订阅模式。每个 Store（如 `auth`、`timeline`、`postDetail`）都是一个包含数据、操作方法和 `subscribe`/`_notify` 机制的普通对象——而非 class。Hook 层通过 `useSyncExternalStore` 将 Store 的变更同步到 React 渲染周期。这种模式的好处是零外部依赖、类型推导流畅、TUI 和 PWA 共享同一套 Hook 签名。Sources: [packages/app/src/stores/auth.ts](packages/app/src/stores/auth.ts#L1-L70), [packages/app/src/stores/timeline.ts](packages/app/src/stores/timeline.ts#L1-L75)

### 2. AI 工具调用循环

`AIAssistant` 类实现了完整的工具调用循环：用户消息 → LLM 请求 → 若返回 `tool_calls` 则执行对应工具 → 将结果追加回对话历史 → 再次请求 LLM（最多 10 轮）。共有 31 个 Bluesky 工具函数，分为只读操作（如阅读帖子、查看通知、搜索用户）和写操作（如发帖、点赞、转发）。写操作在 TUI 端会触发确认对话框，确保用户对 AI 代理的操作有最终控制权。Sources: [packages/core/src/ai/assistant.ts](packages/core/src/ai/assistant.ts#L1-L60), [packages/core/src/at/tools.ts](packages/core/src/at/tools.ts#L1-L50)

### 3. 双模式智能翻译

翻译系统是 AI 集成的另一个体现。`translateText` 函数根据目标语言类型和文本长度自动选择两种模式：**simple 模式**（面向 CJK 语言或短文本）输出纯文本翻译；**JSON 模式**（面向西语系长文本）要求 LLM 返回结构化 JSON，包含 `translation` 和 `source_lang`（源语言自动检测）两个字段。两种模式均配有指数退避重试机制（最多 3 次），以应对空结果或解析失败。Sources: [docs/AI_SYSTEM.md](docs/AI_SYSTEM.md#L1-L100)

### 4. JWT 自动刷新

`BskyClient` 通过 `ky` 的 `afterResponse` 钩子实现了对 Bluesky 会话令牌的自动管理。当检测到 `ExpiredToken` 或 `InvalidToken` 错误（HTTP 400）时，客户端会自动使用 `refreshJwt` 调用 `/xrpc/com.atproto.server.refreshSession`，获取新令牌后重试原始请求——整个过程对上层 Hook 完全透明。Sources: [packages/core/src/at/client.ts](packages/core/src/at/client.ts#L1-L60)

### 5. 无 Mock 集成测试

项目所有测试（29 个）均基于真实 Bluesky API 和 DeepSeek API，不依赖任何 Mock 或桩代码。测试通过 `dotenv` 加载 `.env` 中的凭证，直接对生产环境接口进行调用验证。这一策略确保了测试的真实性和可靠性，但同时也意味着运行测试需要有效的 Bluesky 账号和 LLM API Key。Sources: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md#L114)

## 项目结构速览

```
bsky/
├── packages/                  # Monorepo 四大包
│   ├── core/                  # 零 UI 依赖的核心层
│   │   ├── src/at/            # AT 协议客户端 + 31 个工具 + 类型
│   │   ├── src/ai/            # AIAssistant + 翻译 + 润色
│   │   └── src/state/         # (预留)
│   ├── app/                   # React Hook 应用层
│   │   ├── src/hooks/         # 14 个 React Hooks
│   │   ├── src/stores/        # 纯状态管理 Store
│   │   ├── src/state/         # 导航状态
│   │   ├── src/services/      # 聊天记录持久化服务
│   │   └── src/i18n/          # 国际化 (zh/en/ja)
│   ├── tui/                   # 终端 UI（Ink）
│   │   └── src/components/    # 13 个终端组件
│   └── pwa/                   # 浏览器 PWA
│       └── src/components/    # 13 个 Web 组件
├── docs/                      # 20+ 份技术文档
├── contracts/                 # 合约
│   ├── tools.json             # 31 个工具的 JSON Schema
│   └── system_prompts.md      # AI 系统提示词
└── .env.example               # 环境变量模板
```

Sources: [README.md](README.md#L1-L174), [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md#L1-L114)

## 适合谁使用

- **终端重度用户**——习惯在键盘上完成一切操作，希望用命令行管理 Bluesky 社交动态，同时拥有 AI 助手的加持
- **AI 应用开发者**——研究如何将大语言模型与真实社交网络 API 深度集成，学习工具调用循环、SSE 流式输出、双模式翻译等工程实践
- **React 跨平台架构学习者**——研究如何通过纯 Store + Hook 模式实现一套业务逻辑同时驱动终端（Ink）和 Web（React DOM）两个渲染目标
- **AT 协议探索者**——理解 Bluesky 的 AT 协议在真实客户端中的调用方式，包括会话管理、记录读写、图片上传等

## 阅读路线建议

如果您是第一次接触本项目，推荐按以下顺序阅读文档：

1. **起步**：先了解环境准备与启动方式——[快速开始：环境准备与项目启动](2-kuai-su-kai-shi-huan-jing-zhun-bei-yu-xiang-mu-qi-dong) 会带您在 5 分钟内运行起其中一个客户端
2. **架构总览**：理解四层设计的核心理念——[四层架构设计：Core → App → TUI/PWA 分层原则](7-si-ceng-jia-gou-she-ji-core-app-tui-pwa-fen-ceng-yuan-ze)
3. **核心层**：深入 `@bsky/core` 的三根支柱——[BskyClient：AT 协议客户端与 JWT 自动刷新机制](8-bskyclient-at-xie-yi-ke-hu-duan-yu-jwt-zi-dong-shua-xin-ji-zhi)、[AIAssistant 类：多轮对话、工具调用与 SSE 流式输出](9-aiassistant-lei-duo-lun-dui-hua-gong-ju-diao-yong-yu-sse-liu-shi-shu-chu)、[31 个 Bluesky 工具函数系统：读写分离与权限控制](10-31-ge-bluesky-gong-ju-han-shu-xi-tong-du-xie-fen-chi-yu-quan-xian-kong-zhi)
4. **应用层**：理解 Hook 系统的全貌——[所有 Hook 签名速查](14-suo-you-hook-qian-ming-su-cha-useauth-usetimeline-usethread-useaichat-deng)
5. **按需深入**：根据您使用的客户端类型，选择 TUI 或 PWA 的专题文档继续阅读