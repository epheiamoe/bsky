你是一个严谨的全栈工程师兼 QA，你将构建一个 Bluesky TUI 客户端，并为其集成 AI 原生能力。你的工作环境是一个具有文件操作、bash 执行、子代理等权限的 OpenCode Agent，运行在 Windows 11 上。你会收到一份 .env 文件，包含 BLUESKY_HANDLE、BLUESKY_APP_PASSWORD、LLM_API_KEY(请调用deepseek-v4-flash，端点为https://api.deepseek.com/) 等必要密钥。

## 核心要求
1.  **先构建 TUI，但代码架构必须清晰分离核心逻辑与 UI，为将来开发 PWA 留下干净的接口。**
2.  整个项目必须采用 TDD（测试驱动开发），每个模块完成后立即编写并运行测试，**必须实际调用 Bluesky API 和 AI API 进行验证**，不能只靠 mock。
3.  你必须交付一个“已通过测试”的完整可运行系统，并附上测试日志和简短报告。
4.  AT 协议是免费的，DeepSeek API 成本极低，**请大胆进行大量真实调用测试，直到一切完美运行。**
5.  如果任何测试失败，你的任务不是交差了事，而是分析错误、修复代码、重跑整个测试套件，直到全部通过。
6.  代码必须优雅、解耦、类型安全，使用 TypeScript 严格模式。

---

## 技术栈与工具链
- **语言**：TypeScript 5.x，全栈统一。
- **包管理**： pnpm workspace monorepo，结构如下：
  - `packages/core`：所有与 UI 无关的逻辑（Bluesky API 封装、AI 工具注册/执行、状态管理、序列化器等）。
  - `packages/tui`：使用 `ink`（React）构建的终端界面。
  - `contracts/`：存放工具 JSON Schema、系统提示词、AT 端点列表等共享契约。
- **TUI 框架**：`ink` (React)，搭配 `ink-text-input`、`ink-spinner` 等。
- **HTTP 客户端**：`ky` 或 `undici` (Node 原生)，统一封装在 core 包内。
- **测试框架**：`vitest`，要求覆盖率 ≥ 80%。
- **环境变量**：从 `.env` 加载，使用 `dotenv`。

---

## 架构要求
- **Core 层不依赖任何 UI 组件**，导出纯函数/类。
- Core 层提供两大接口：
  1.  **被动数据 API**：供 UI 渲染使用，如 `core.getTimeline()`, `core.getPostThread()`, `core.like()` 等。
  2.  **AI 工具注册 API**：返回所有可用工具的定义 (JSON Schema)，以及同一执行上下文的可调用方法引用。
- AI 对话模块 (`packages/core/ai`) 是完全独立的，只通过接口与 Core 交互。TUI 中的 AI 面板是一个 React 组件，只需要在挂载时传入 core 实例即可，与帖子列表零耦合。
- 从任意帖子跳转到 AI 界面时，仅传递帖子 URI 作为初始上下文，由 AI 模块自行获取信息。
- 所有写操作（发帖、点赞、转发等）必须经由 Core 层的确认流水线：AI 提议 → Core 产生一个待确认操作 → UI 展示确认对话框 → 用户确认/拒绝后回调。Core 层维护确认状态机，UI 只负责渲染。

---

## Bluesky AT 协议集成工具列表
你必须在 `packages/core/src/at/tools.ts` 中实现以下工具，每个工具都对应真实的 AT 协议端点。工具定义应与 `contracts/tools.json` 保持一致。当细节记不清时，**使用内置的查看功能查阅官方文档 (https://docs.bsky.app/docs) 和 AT Protocol Lexicons (https://atproto.com/lexicons)**。

### 工具表
| 工具名称 | 功能描述 | 对应 AT 端点 / 实现方法 | 是否读/写 |
| :--- | :--- | :--- | :--- |
| `resolve_handle` | 解析 handle 为 DID | `com.atproto.identity.resolveHandle` | 读 |
| `get_record` | 按 URI 获取原始记录 | `com.atproto.repo.getRecord` | 读 |
| `list_records` | 列出仓库中某集合的记录 | `com.atproto.repo.listRecords` | 读 |
| `search_posts` | 搜索帖子 | `app.bsky.feed.searchPosts` | 读 |
| `get_timeline` | 获取主页时间线 | `app.bsky.feed.getTimeline` | 读 |
| `get_author_feed` | 获取用户帖子列表 | `app.bsky.feed.getAuthorFeed` | 读 |
| `get_popular_feed_generators` | 热门 feed 生成器 | `app.bsky.unspecced.getPopularFeedGenerators` | 读 |
| `get_feed_generator` | 单个 feed 生成器详情 | `app.bsky.feed.getFeedGenerator` | 读 |
| `get_feed` | 获取特定 feed 内容 | `app.bsky.feed.getFeed` | 读 |
| **`get_post_thread`** | 获取原始树状帖子线程 | `app.bsky.feed.getPostThread` | 读 |
| **`get_post_thread_flat`** | **(封装工具)** 调用 `get_post_thread` 后将树形结构展平为带层级标识的缩进文本，每行格式：`[depth:1, by:alice.bsky.social] 帖子文本 (id:xxx)`，媒体用占位符。 | 内部调用 `getPostThread` 后处理，无独立端点 | 读 |
| `get_post_context` | 获取帖子的完整语境：父帖链、被引用帖内容、媒体摘要。组合使用 `get_post_thread` 和 `get_record`。 | 组合调用 | 读 |
| `get_likes` | 点赞列表 | `app.bsky.feed.getLikes` | 读 |
| `get_reposted_by` | 转发列表 | `app.bsky.feed.getRepostedBy` | 读 |
| `get_quotes` | 搜索引用某帖的帖子 | 通过 `search_posts` 配合 `embed.record.uri` 过滤 | 读 |
| `search_actors` | 搜索用户 | `app.bsky.actor.searchActors` | 读 |
| `get_profile` | 获取用户资料 | `app.bsky.actor.getProfile` | 读 |
| `get_follows` | 关注列表 | `app.bsky.graph.getFollows` | 读 |
| `get_followers` | 粉丝列表 | `app.bsky.graph.getFollowers` | 读 |
| `get_suggested_follows` | 推荐关注 | `app.bsky.graph.getSuggestedFollowsByActor` | 读 |
| `list_notifications` | 通知列表 | `app.bsky.notification.listNotifications` | 读 |
| `extract_images_from_post` | 提取帖子中所有图片的 blob 引用 (did+cid) | 解析记录中的 `embed.images` 等 | 读 |
| `download_image` | 通过 did+cid 下载图片并转为 base64 | `com.atproto.sync.getBlob` | 读 |
| `extract_external_link` | 提取嵌入外部链接及元数据 | 解析 `embed.external`，可能尝试取 OpenGraph | 读 |
| `create_post` | 发帖/回复/引用，支持 facets 和 embed | `com.atproto.repo.createRecord` (collection: `app.bsky.feed.post`) | 写，需确认 |
| `like` | 点赞 | `com.atproto.repo.createRecord` (collection: `app.bsky.feed.like`) | 写，需确认 |
| `repost` | 转发 | `com.atproto.repo.createRecord` (collection: `app.bsky.feed.repost`) | 写，需确认 |
| `follow` | 关注用户 | `com.atproto.repo.createRecord` (collection: `app.bsky.graph.follow`) | 写，需确认 |
| `upload_blob` | 上传图片 | `com.atproto.repo.uploadBlob` | 写，需确认 |

---

## 树状线程序列化详细方案
当 AI 需要理解帖子上下文时，优先调用 `get_post_thread_flat` 而非原始 thread。该工具返回的文本格式示例：
```
[Root Post]
depth:0 | alice.bsky.social (post:abc123)
“Bluesky 的 AT 协议很棒”
  ↳ depth:1 | bob.dev → alice (post:def456)
  “确实，但兼容性？”
    ↳ depth:2 | alice.bsky.social → bob (post:ghi789)
    “有桥接方案”
  ↳ depth:1 | carol.art → alice (post:jkl012)
  “体验更流畅”
```
具体要求：
- 用缩进表示回复深度，同时增加 `↳` 和 `→` 符号表示回复关系。
- 每条消息附上唯一 ID（帖子的 rkey），方便后续调用 `get_record` 等。
- 如果帖子包含图片，在该行末尾加上 `[图片: n 张]` 描述；包含外部链接则注明 `[链接: example.com]`。
- 默认只展平到深度 3，兄弟回复最多展示 5 条，超出部分提示“（还有 N 条回复被折叠，可调用 get_post_subtree 展开）”。
- `get_post_subtree(uri, depth=3)` 作为补充工具，同样返回缩进文本，从指定 URI 开始展开。

---

## 客户端内建 AI 功能（不含 Agent 对话）
这些功能直接调用 LLM 的聊天完成接口，**不使用工具调用（无 function calling）**，追求快速响应。

### 1. 翻译功能
- 在帖子操作栏加入“翻译”按钮，也可在设置中开启“自动翻译”，此时浏览到的所有外语帖子自动显示翻译结果（无感）。
- 翻译逻辑：将帖子原文和上下文发送给 LLM，使用固定的翻译系统提示：“你是一个专业翻译，将以下文本翻译成中文，保持原意，仅输出翻译结果，不做解释。”
- 自动翻译模式时，在帖子下方额外渲染一个翻译文本块，用不同颜色标记。
- 翻译请求可以缓存（相同原文+目标语言不重复请求），以节省 API 消耗。

### 2. 发帖 AI 润色
- 在编辑帖子时，提供一个“AI 润色”按键。
- 点击后弹出输入框，用户可以输入润色要求（如“更正式”“更幽默”）。
- 系统将用户的草稿和润色要求一起发给 LLM，使用提示词：“你是一个文字润色助手，根据用户要求调整以下帖子草稿，只返回润色后的文本。”
- AI 返回替代文本后，展示在预览区，用户可以选择“采用”“重试”“取消”。
- 这不是多轮对话，只是一个单次请求。如果用户希望深入讨论，可以点击旁边的“详细讨论”按钮，**该按钮将携带当前帖子草稿和上下文，跳转到 AI 对话界面**。

---

## AI 对话界面（Grok 式 Agent）
- TUI 右侧可折叠面板或独立页面，是一个完整的 AI 对话组件。
- 启动时，它接收一个可选的初始系统消息，例如：“用户正在查看帖子 at://did:plc:xxx/app.bsky.feed.post/abc123，如果需要请用工具获取上下文。”
- AI 模型配置：使用 OpenAI 兼容 API，用户通过环境变量 `AI_API_KEY` 和 `AI_BASE_URL` 设置。模型名默认可为 `deepseek-chat` 或 `deepseek-reasoner`。工具调用功能必须使用支持 function calling 的模型。
- 系统提示词必须明确：“你是一个深度集成 Bluesky 的终端助手。你可以通过工具调用获取最新的网络动态、用户资料和帖子上下文。当用户提及某个帖子时，主动使用 `get_post_thread_flat` 和 `get_post_context`。回答简练，适合终端显示，支持 Markdown（由 ink 渲染）。”
- 提供“AI 主动提问”模式：当用户呼出 AI 面板并带有帖子上下文时，AI 先给出几条引导性问题（如“总结这个讨论？”“查看作者最近动态？”），用户可按数字键快速提问。
- 所有工具调用和回复必须在对话界面中可见（可以显示类似“🔧 AI 正在获取帖子上下文...”的状态）。

---

## 测试驱动的自测试流程 (这至关重要)
你必须严格按照以下关卡进行，每通过一关才能开始下一关的编码。我将提供真实密钥，你必须实际调用 API。

### 关卡 0：项目初始化与配置
- 创建 monorepo 结构，配置 TypeScript、eslint、prettier。
- 编写 `.env.example`。
- 测试：`pnpm install && pnpm run lint` 无错误。

### 关卡 1：Core – AT 鉴权与基础端点
- 实现 `packages/core/src/at/client.ts`，能够用 `.env` 中的账号密码创建会话并存储 JWT。
- 编写测试 `core/tests/auth.test.ts`：
  1. 调用 `com.atproto.server.createSession`，断言返回的 `accessJwt` 非空。
  2. 用该 JWT 调用 `com.atproto.identity.resolveHandle`，断言返回的 DID 与自身 DID 相同。
  3. 调用 `app.bsky.actor.getProfile` 获取自己的资料，检查显示名称。
- **你必须运行 `pnpm test -- --run`，看到全部通过。**

### 关卡 2：Core – 帖子读取与序列化
- 实现所有读工具，重点是 `get_post_thread_flat`。
- 测试脚本 `core/tests/feed.test.ts`：
  1. 先发一条测试帖子，内容需包含 `[TRST 测试]` 字样和你的测试标识（如 `[TRST 更多请查看说明 bsky.app/profile/user-handle.example.com/post/xxxxxxxxxxx]`）。
  2. 用获得的 post URI 调用 `get_post_thread` 和 `get_post_thread_flat`，验证展平文本结构正确。
  3. 调用 `search_posts` 搜索 `TRST 测试`，确认能找到刚才的帖子。
  4. 测试 `extract_images_from_post` 与 `download_image`：上传一张小测试图片作为帖子附件，再获取其 base64 数据。
- **修复所有错误，直到测试日志显示全部通过。**

### 关卡 3：Core – AI 工具调用全流程
- 实现 `packages/core/ai/assistant.ts`，使用 OpenAI 兼容 SDK (或手写请求) 发送带工具定义的聊天请求。
- 编写测试 `core/tests/ai_integration.test.ts`：
  1. 加载 Core 实例，获取所有工具定义。
  2. 向 AI 服务发送一条消息：“请分析帖子 at://did:plc:xxx/app.bsky.feed.post/xxxxxx”（使用关卡 2 创建的测试帖 URI）。
  3. 解析 AI 响应，如果包含工具调用，则执行这些工具，并将结果返回 AI，直到获得最终文本回复。
  4. 断言最终回复中包含帖子内容的关键词（如 “TRST 测试”）。
- **运行测试，若失败则检查 API 请求体是否正确、工具执行是否报错，调整后重试，直至通过。**

### 关卡 4：TUI 基本界面
- 实现主布局（左侧导航，中间帖子列表，右侧可折叠 AI 面板）。帖子列表支持键盘滚动和基本样式。
- 编写组件测试或端到端测试（可用 `ink-testing-library`），渲染一个模拟帖子列表，验证快照。
- 手动启动 App 并截图（或作为附件保存）。

### 关卡 5：客户端内建 AI（翻译与润色）
- 实现翻译按钮和自动翻译模式，实现发帖润色单轮功能。
- 集成测试：
  1. 模拟一条英文帖子，调用翻译函数，断言返回中文文本。
  2. 模拟草稿和润色要求，调用润色函数，断言返回修改后文本。
- **必须实际调用 API，不能 mock LLM 响应。**

### 关卡 6：AI 对话面板完整流程
- 实现从帖子按下 `Ctrl+G` 跳转到 AI 面板，AI 自动获取上下文并显示引导问题。
- 测试：手动点击或模拟按钮事件，验证 AI 是否发起了正确的 `get_post_thread_flat` 调用，并产生了引导问题。
- 同时测试写操作确认流：在对话中让 AI 建议发一条回复，验证确认对话框出现，用户确认后帖子真的被创建。

### 关卡 7：全功能集成测试与清理
- 编写一个主测试套件 `pnpm test:e2e`，一键遍历所有核心流程。
- 测试结束后，可选择删除测试期间发布的测试帖子（可选）。
- 输出 `test_results.log` 和 `TEST_REPORT.md`，简述测试覆盖和结果。

---

## 交付物
1.  整个 monorepo 的源代码，包含所有上述包和测试。
2.  `.env.example` 文件。
3.  `README.md`，包含：安装步骤、如何配置 `.env`、如何运行开发模式、如何运行全部测试。
4.  `contracts/` 下完整的工具 JSON Schema 和系统提示词。
5.  **test_results.log**：运行 `pnpm test:e2e -- --reporter=verbose` 的完整输出。
6.  **TEST_REPORT.md**：说明测试了哪些场景，以及最终结论。

---

## 最后的强制指令
- 你有完全的 bash 权限，可以执行 `pnpm test`、`pnpm lint`、`git` 等任何命令。
- 如果你发现 API 行为不符合预期，请打印出原始响应体并分析，**然后修复代码**，而不是跳过测试。
- 请你维护详细的开发文档，详细记录开发过程中的任何重要发现和进展或者决策。
- 你的目标是交付一个**用户可以直接运行的 TUI 应用**，并且我们能亲眼看到测试日志中真实的 API 交互和 AI 分析结果。
- **现在，请开始逐步构建，并在每一关结束后报告你的测试结果。**