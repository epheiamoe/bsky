本项目采用一种 deliberately opinionated 的测试哲学：**所有测试直接调用生产环境 API** — Bluesky AT Protocol 和 DeepSeek AI 服务 — 不使用任何模拟（mock）、桩（stub）或测试替身（test double）。这一策略源于一个核心第一性原则：**如果测试不与真实系统对话，那么它验证的是我们对 API 的理解，而非 API 本身的实际行为。**

Sources: [TESTING.md](docs/TESTING.md#L1-L10), [TEST_REPORT.md](TEST_REPORT.md#L1-L13)

## 架构概览：无 Mock 的三层验证

测试体系以四层架构中最底层 `@bsky/core` 为核心测试目标，共包含 **4 个测试文件、29 个测试用例**，覆盖认证、内容流、社交图谱、媒体处理和 AI 工具调用五大领域。

```mermaid
flowchart TB
    subgraph TestSuite[测试套件 — 29 tests]
        A[auth.test.ts<br/>3 tests]
        F[feed.test.ts<br/>8 tests]
        AI[ai_integration.test.ts<br/>8 tests]
        E2E[e2e.test.ts<br/>10 tests]
    end

    subgraph CoreLayer[@bsky/core]
        C[BskyClient]
        T[createTools<br/>31 tools]
        AS[AIAssistant<br/>multi-turn]
        ST[singleTurnAI<br/>translate/polish]
    end

    subgraph RealAPIs[生产环境真实 API]
        BS[Bluesky Social<br/>AT Protocol]
        DS[DeepSeek API<br/>Chat Completion]
    end

    A --> C
    F --> C
    F --> T
    AI --> C
    AI --> T
    AI --> AS
    AI --> ST
    E2E --> C
    E2E --> T
    E2E --> AS
    E2E --> ST

    C --> BS
    AS --> DS
    ST --> DS
```

**无 mock 带来的原子性约束**：每一层测试都依赖下层真实服务，这意味着 `auth.test.ts` 中的登录失败会传递性导致所有后续测试失败。这一特性不是缺陷，而是设计意图 — 它确保在 CI/CD 流程中，任何 API 合约的破坏都会被立即检测，而非被 mock 层掩盖。

Sources: [TEST_REPORT.md](TEST_REPORT.md#L1-L13), [packages/core/tests/auth.test.ts](packages/core/tests/auth.test.ts#L1-L43)

## 测试维度与覆盖率矩阵

四个测试文件构成了从单元级集成到全流程端到端的分层验证体系：

| 测试文件 | 用例数 | 覆盖范围 | 测试类型 | 平均耗时时长 |
|----------|--------|----------|----------|------------|
| `auth.test.ts` | 3 | 登录会话创建、身份解析、个人资料获取 | 原子 API 验证 | ~3-5s |
| `feed.test.ts` | 8 | 内容搜索、帖子上下文获取 | 只读内容流 | ~30s |
| `ai_integration.test.ts` | 8 | 工具注册、AI 驱动的搜索/资料/翻译/润色/引导问题 | AI 工具调用 | ~90s |
| `e2e.test.ts` | 10 | 全流程：认证→时间线→资料→通知→翻译→润色→引导问题 | 端到端流程 | ~103s (合计) |

**关键设计模式：写操作为注释状态**

值得特别注意的是，`feed.test.ts`、`ai_integration.test.ts` 和 `e2e.test.ts` 中所有涉及 **创建帖子、上传图片、创建记录** 的测试用例均以 `/* ... */` 块注释形式存在。这一设计源于 AT Protocol 的架构限制 — 该协议**不提供便捷的记录删除 API**（删除需要通过 `com.atproto.repo.deleteRecord` 且需要知道记录的确切 rkey），因此写操作测试会产生不可清理的残留数据。测试策略因此采用 "read-only by default" 模式，仅在需要验证写管道时临时解除注释。

Sources: [packages/core/tests/feed.test.ts](packages/core/tests/feed.test.ts#L30-L80), [packages/core/tests/ai_integration.test.ts](packages/core/tests/ai_integration.test.ts#L30-L80), [packages/core/tests/e2e.test.ts](packages/core/tests/e2e.test.ts#L40-L100)

## 测试基础设施：Vitest 配置与环境加载

测试运行底层由 Vitest 3.x 驱动，配置集中于 `packages/core/vitest.config.ts`：

```typescript
export default defineConfig({
  test: {
    globals: true,      // 全局 describe/it/expect
    testTimeout: 60000, // 单用例 60s 超时
    hookTimeout: 30000, // beforeAll/afterAll 30s
  },
});
```

超时设置远超传统单元测试（通常 2-5s），这是对真实 API 调用延迟的务实回应。Bluesky 的 `getTimeline` 通常在 800ms-2s 内完成，但 `searchPosts` 需要额外 3s 的索引等待；AI 多轮工具调用（如 `assistant.sendMessage`）包含 2-5 次 LLM 推理往返，单次耗时可达 15-30s，因此配置了 **120s 的超时**。

**环境变量加载**采用从测试文件到项目根目录的相对路径解析：

```typescript
const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '..', '..', '..', '.env') });
```

所需的三项凭证：`BLUESKY_HANDLE`、`BLUESKY_APP_PASSWORD` 和 `LLM_API_KEY`。若缺少任意一项，测试在 `beforeAll` 阶段即抛错中止。

Sources: [packages/core/vitest.config.ts](packages/core/vitest.config.ts#L1-L10), [packages/core/tests/auth.test.ts](packages/core/tests/auth.test.ts#L1-L20), [TESTING.md](docs/TESTING.md#L37-L42)

## 认证测试：JWT 会话的生命周期验证

`auth.test.ts` 是测试体系中路径最短但语义最重的文件——它验证的是整个系统的信任根基。三个测试构造了一个线性依赖链：

1. **`should create a session and return accessJwt`** — 调用 `client.login(HANDLE, APP_PASSWORD)`，断言返回的 `session.accessJwt` 存在，且 `session.did` 符合 `did:plc:` 的正则格式（Bluesky 的 DID 标识符模式）
2. **`should resolve own handle to same DID`** — 通过 `client.resolveHandle(HANDLE)` 验证手柄到 DID 的解析结果与登录会话中的 DID 一致
3. **`should get own profile`** — 验证 `client.getProfile(HANDLE)` 返回的 `profile.handle` 和 `profile.did` 与预期匹配

注意到每个用例都重新调用 `client.login(HANDLE, APP_PASSWORD)`——这并非冗余，而是有意验证 JWT 自动刷新机制（`BskyClient` 内部实现了 `ExpiredToken`/`InvalidToken` 拦截后的自动刷新，详见 [BskyClient：AT 协议客户端与 JWT 自动刷新机制](8-bskyclient-at-xie-yi-ke-hu-duan-yu-jwt-zi-dong-shua-xin-ji-zhi)），确保连续调用场景下 token 管理的稳定性。

Sources: [packages/core/tests/auth.test.ts](packages/core/tests/auth.test.ts#L22-L43), [packages/core/src/at/client.ts](packages/core/src/at/client.ts#L30-L50)

## 内容流测试：只读模式与工具函数验证

`feed.test.ts` 验证 Bluesky 内容生态的核心读取 API。活跃的测试集中于 **搜索功能**（`searchPosts`），而帖子创建、线程展平、图片上传/下载/提取等需要写操作或精确 URI 的测试均被注释。

**活跃测试**：`should search posts and find some results` 以 `'Bluesky'` 为查询词，使用最新排序，获取 25 条结果。该测试不断言结果数量 > 0（因为搜索可用性受外部系统影响），仅断言响应结构符合类型定义。

**注释测试揭示的重要模式**：`createTools(client)` 被用于获取工具描述符（`ToolDescriptor`），然后通过 `tools.find(t => t.definition.name === 'get_post_thread_flat')` 定位特定工具并调用其 `handler`。这种模式是 AI 测试的前置验证——确保工具注册系统和参数解析在生产环境中正确工作。

**延迟补偿模式**：`searchPosts` 前通过 `await new Promise(r => setTimeout(r, 3000))` 插入 3s 延迟，补偿 Bluesky 搜索索引的最终一致性延迟。这是无 mock 测试特有的挑战：真实系统存在时间维度上的非确定性行为，需要通过经验值校准等待窗口。

Sources: [packages/core/tests/feed.test.ts](packages/core/tests/feed.test.ts#L80-L90), [TESTING.md](docs/TESTING.md#L53-L60)

## AI 集成测试：工具调用自主性与文本生成验证

`ai_integration.test.ts` 跨越三个描述块，分别验证 AI 工具调用能力、翻译/润色功能，以及引导问题生成——这是项目中复杂度最高的测试套件。

**工具调用自主性测试**：构造 `AIAssistant` 实例并注入 `createTools(client)` 返回的全部工具描述符（31 个），通过 `assistant.sendMessage` 发起中文自然语言请求。例如：
- `搜索包含 "Bluesky" 的帖子，告诉我找到了多少条` — AI 必须自主选择 `search_posts` 工具，解析返回的 JSON，并以中文总结结果
- `查看用户 ${HANDLE} 的个人资料` — AI 必须调用 `get_profile` 工具

验证逻辑：断言 `result.toolCallsExecuted >= 1`（至少一次工具调用）且 `result.content` 非空。**不断言具体数值或特定字符串**，因为 LLM 输出具有非确定性。这体现了无 mock 测试的一个核心原则：**验证行为模式而非精确输出**。

**翻译验证**：`should translate English to Chinese` 使用正则 `[\u4e00-\u9fff]` 检测输出中是否包含 CJK 统一表意文字字符，而非检查具体翻译结果。这是一种语言无关的验证策略，适用于任何源语言的翻译测试。

**润色验证**：`polishDraft` 测试提供 "更正式" 和 "更幽默" 两种润色要求，仅断言输出长度 > 0。润色质量的主观性使其不适合自动化断言，但运行测试时的人工审查可以发现明显退化。

Sources: [packages/core/tests/ai_integration.test.ts](packages/core/tests/ai_integration.test.ts#L85-L175), [packages/core/src/ai/assistant.ts](packages/core/src/ai/assistant.ts#L660-L687)

## 端到端测试：10 步全流程验证

`e2e.test.ts` 以线性流程模拟用户操作路径，10 个测试按顺序执行：

| 步骤 | 端点 | 验证内容 | 状态 |
|------|------|----------|------|
| 1 | `createSession` / `resolveHandle` / `getProfile` | 认证三件套 | 活跃 |
| 2 | `getTimeline` / 工具注册 | 时间线读取 | 活跃 |
| 3 | `uploadBlob` / `createRecord` / 图片提取/下载 | 图片全生命周期 | 注释 |
| 4 | AI 工具调用 → 分析帖子 | 多轮对话 | 注释 |
| 5 | `translateToChinese` | AI 翻译管道 | 活跃 |
| 6 | `polishDraft` | AI 润色管道 | 活跃 |
| 7 | `getProfile`(bsky.app) + `getFollows` | 社交图谱读取 | 活跃 |
| 8 | `getTimeline`(10) | 时间线分页 | 活跃 |
| 9 | `listNotifications`(10) | 通知列表 | 活跃 |
| 10 | `singleTurnAI` | 引导问题生成 | 活跃 |

步骤 2 中值得注意的设计：虽然帖子创建被注释，但 `getTimeline` 测试直接读取登录用户的时间线（不需要测试帖子即可执行），且通过 `createTools(client)` 验证工具函数加载（断言 `> 20` 个工具），确保持续集成中工具注册逻辑始终有效。

Sources: [packages/core/tests/e2e.test.ts](packages/core/tests/e2e.test.ts#L89-L188)

## 无 Mock 策略的得失权衡

**优势**：
- **合约保真度** — 测试直接暴露 API 变化。2026 年 4 月的提交记录显示 `deepseek-chat → deepseek-v4-flash` 的模型变更仅需修改配置参数即可通过测试，验证了接口兼容性
- **无需维护 mock 层** — 无 mock 定义、无 stub 响应、无 fixture 数据文件，减少约 30-50% 的测试代码体积
- **环境感知** — `.env` 中的凭证过期、API 限流、网络延迟等问题会在测试阶段即时暴露

**代价**：
- **执行时间长** — 全套 29 测试约需 103s（实际受网络和 LLM 推理速度影响在 60-180s 之间波动）
- **外部依赖脆弱性** — Bluesky 服务中断或 DeepSeek API 降级会导致测试失败，即使代码未变更
- **非确定性输出** — LLM 响应的变化性要求使用宽松断言（长度检查、字符模式匹配而非精确值断言）
- **写操作不可逆** — 导致创建/删除类测试被注释，这部分测试覆盖率存在空白

Sources: [TEST_REPORT.md](TEST_REPORT.md#L1-L106), [commits](.zread/wiki#commit-1ad0da3)

## 运行与调试模式

项目提供三个运行层级：

```bash
# 全量测试（所有包）
pnpm test

# 单个套件（快速反馈）
pnpm --filter @bsky/core test tests/ai_integration.test.ts

# 端到端详细输出
pnpm --filter @bsky/core test:e2e
```

`test:e2e` 脚本使用 `--reporter=verbose` 标志，将每个测试的 `console.log` 输出完整呈现。这在调试 AI 工具调用时尤为关键——`intermediateSteps` 数组记录了 LLM 每次工具调用的输入输出，是诊断 AI 行为异常的第一手数据源。

**常见故障模式**：

| 现象 | 根因 | 修复 |
|------|------|------|
| `Missing BLUESKY_HANDLE or BLUESKY_APP_PASSWORD` | `.env` 文件缺失或路径不对 | 在项目根目录创建 `.env`，参考 `.env.example` |
| `ExpiredToken` | JWT 超过 2 小时有效期 | `BskyClient` 自动刷新机制应处理此情况；若持续失败，检查系统时钟同步 |
| AI 测试返回空内容 | DeepSeek API 超时或限流 | 检查 `LLM_API_KEY` 额度；增加 `max_tokens` 或降低 `temperature` |
| `searchPosts` 返回空数组 | Bluesky 搜索索引延迟 | 增加等待时间至 5s；确认查询词未被过滤 |

Sources: [TESTING.md](docs/TESTING.md#L12-L35), [packages/core/package.json](packages/core/package.json#L16-L21)

## 下一步阅读

- 理解测试底层的 API 客户端设计：参阅 [BskyClient：AT 协议客户端与 JWT 自动刷新机制](8-bskyclient-at-xie-yi-ke-hu-duan-yu-jwt-zi-dong-shua-xin-ji-zhi)
- 了解测试覆盖的 31 个工具函数系统：参阅 [31 个 Bluesky 工具函数系统：读写分离与权限控制](10-31-ge-bluesky-gong-ju-han-shu-xi-tong-du-xie-fen-chi-yu-quan-xian-kong-zhi)
- 掌握 AI 多轮对话与工具调用的实现细节：参阅 [AIAssistant 类：多轮对话、工具调用与 SSE 流式输出](9-aiassistant-lei-duo-lun-dui-hua-gong-ju-diao-yong-yu-sse-liu-shi-shu-chu)
- 如需了解其他包的测试（TUI 组件测试），参阅架构文档中的测试章节：参阅 [四层架构设计：Core → App → TUI/PWA 分层原则](7-si-ceng-jia-gou-she-ji-core-app-tui-pwa-fen-ceng-yuan-ze)