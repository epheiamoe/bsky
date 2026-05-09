# Prompt 工程与多提供者注册表

## 集中式提示词管理

整个应用的 AI 提示词集中在 `packages/core/src/ai/prompts.ts` 中管理，遵循一个简明命名约定：

- **`P_` 前缀**：纯字符串常量，可直接拼接使用。
- **`PF_` 前缀**：参数化函数，接受运行时变量返回动态字符串。

[来源](packages/core/src/ai/prompts.ts#L1-L10)

### 所有提示词一览

| 标识符 | 类型 | 用途 |
|--------|------|------|
| `P_ASSISTANT_BASE` | 常量 | 助手角色定义 + 3 条硬规则（禁止主动写操作） |
| `PF_CURRENT_USER(name, handle?)` | 函数 | 注入当前用户身份 |
| `PF_PROFILE_CONTEXT(handle, currentUserHandle?)` | 函数 | 用户主页分析上下文，含工具调用指导 |
| `PF_POST_CONTEXT(uri)` | 函数 | 帖子分析上下文，告知 AI 正在查看的帖子 URI |
| `PF_ENVIRONMENT(env)` | 函数 | 声明运行环境（TUI 纯文本 vs PWA 富文本） |
| `PF_LOCALE_HINT(locale)` | 函数 | 指定回复语言 |
| `P_CONCISE` | 常量 | 简练回答指令 |
| `PF_CURRENT_TIME()` | 函数 | 注入当前系统时间 |
| `PF_VISION_HINT(enabled)` | 函数 | 视觉模式开关提示 |
| `PF_TRANSLATE_SIMPLE(targetLang)` | 函数 | 简单模式翻译提示 |
| `PF_TRANSLATE_JSON(targetLang)` | 函数 | JSON 模式翻译提示（输出结构化翻译结果） |
| `P_POLISH_SYSTEM` | 常量 | 润色助手系统提示 |
| `PF_POLISH_USER(requirement, draft)` | 函数 | 润色用户提示模板 |
| `PF_AUTO_ANALYSIS(handle)` | 函数 | 自动分析消息（Profile 场景自动发送） |
| `P_GUIDING_QUESTIONS` | 常量数组 | 引导问题按钮文案（"总结这个讨论"等） |

[来源](packages/core/src/ai/prompts.ts#L30-L195)

### System Prompt 组装顺序

System prompt 由 `buildSystemPrompt()` 按固定顺序拼接各个片段。代码位于 `packages/app/src/hooks/useAIChat.ts`：

```typescript
function buildSystemPrompt(withContext?: string, contextProfile?: string) {
  const parts: string[] = [];
  parts.push(P_ASSISTANT_BASE);           // ① 助手角色 + 硬规则
  if (user身份存在) parts.push(PF_CURRENT_USER(name, handle)); // ② 当前用户
  if (contextProfile) {
    parts.push(PF_PROFILE_CONTEXT(handle, userHandle)); // ③a 用户分析上下文
  } else if (withContext) {
    parts.push(PF_POST_CONTEXT(uri));     // ③b 帖子分析上下文
  }
  parts.push(PF_ENVIRONMENT(env));        // ④ 运行环境
  if (locale) parts.push(PF_LOCALE_HINT(locale)); // ⑤ 语言提示
  parts.push(PF_CURRENT_TIME());          // ⑥ 当前时间
  parts.push(PF_VISION_HINT(enabled));    // ⑦ 视觉模式
  parts.push(P_CONCISE);                  // ⑧ 简练回答
  return parts.join('');
}
```

[来源](packages/app/src/hooks/useAIChat.ts#L68-L86)

### 三种上下文注入场景

根据打开 AI 聊天时的入口不同，注入不同的上下文片段：

| 场景 | 触发方式 | 注入的 Prompt |
|------|----------|---------------|
| **帖子分析** | `contextPost: uri` | `PF_POST_CONTEXT(uri)` — 告知帖子 AT URI，让 AI 用工具获取上下文 |
| **用户分析** | `contextProfile: handle` | `PF_PROFILE_CONTEXT(handle)` — 含详细分析指令 + 工具调用指导 |
| **通用对话** | 无 context | 仅有基础 assistant prompt，无上下文注入 |

用户分析场景还会自动发送 `PF_AUTO_ANALYSIS(handle)` 消息（500ms 延迟），而帖子场景仅显示引导问题按钮供用户选择分析方向。

[来源](docs/AI_CONTEXT.md#L52-L56)

### 组装流程图

```
点击 AI 按钮 (ThreadView/ProfilePage/PostActionsRow)
  │  goTo({ type: 'aiChat', sessionId, contextPost/contextProfile })
  ▼
buildSystemPrompt()
  ├── P_ASSISTANT_BASE         固定角色定义
  ├── PF_CURRENT_USER          "当前用户: {name} (@{handle})"
  ├── PF_PROFILE_CONTEXT       或 PF_POST_CONTEXT  (二选一)
  ├── PF_ENVIRONMENT           "你运行在 TUI/PWA 中..."
  ├── PF_LOCALE_HINT           "用户界面语言: zh"
  ├── PF_CURRENT_TIME          "当前时间: 2024-01-15..."
  ├── PF_VISION_HINT           "视觉模式已开启/未开启"
  └── P_CONCISE                "回答简练。"
      │
      ▼
  一条 system message 注入 AIAssistant
      │
      ▼
  Effect 1 (chatId变化): 清空历史 + 注入
  Effect 2 (storage恢复): 从DB恢复 + 重注入
  Effect 3 (client就绪): 首次登录 + 上下文变化时重注入
```

[来源](docs/AI_CONTEXT.md#L7-L26)

---

## 多提供者注册表

提供者定义采用 **TS 接口校验 + JSON 数据编辑** 的架构：`providers.json` 提供可编辑的数据，`providers.ts` 提供类型安全和查询函数。

[来源](packages/core/src/ai/providers.ts#L1-L4)

### 数据模型

```typescript
interface ProviderInfo {
  id: string;           // 唯一标识（如 'deepseek'）
  label: string;        // 显示名称（如 'DeepSeek'）
  baseUrl: string;      // API 基础 URL
  models: ModelInfo[];  // 模型列表
  reasoningStyle: 'reasoning_content' | 'structured_content' | 'none';
}

interface ModelInfo {
  id: string;           // 模型 ID（如 'deepseek-v4-flash'）
  label: string;        // 显示标签
  thinking: boolean;    // 是否支持思考/推理
  vision: boolean;      // 是否支持视觉
}
```

[来源](packages/core/src/ai/providers.ts#L7-L20)

### 当前注册的提供者

| 提供者 | ID | Base URL | Reasoning Style |
|--------|----|----------|-----------------|
| **DeepSeek** | `deepseek` | `https://api.deepseek.com` | `reasoning_content` |
| **Mistral** | `mistral` | `https://api.mistral.ai` | `structured_content` |

[来源](packages/core/src/ai/providers.json#L1-L24)

### 模型矩阵

| 提供者 | 模型 ID | 显示名 | 思考 | 视觉 |
|--------|---------|--------|:----:|:----:|
| DeepSeek | `deepseek-v4-flash` | DeepSeek V4 Flash | ✅ | ❌ |
| DeepSeek | `deepseek-v4-pro` | DeepSeek V4 Pro | ✅ | ❌ |
| Mistral | `mistral-small-latest` | Mistral Small (24B) | ✅ | ✅ |
| Mistral | `pixtral-large-latest` | Pixtral Large (Vision) | ❌ | ✅ |
| Mistral | `mistral-medium-latest` | Mistral Medium (128B) | ❌ | ✅ |
| Mistral | `ministral-3b-latest` | Ministral 3B (Fast) | ❌ | ❌ |

[来源](packages/core/src/ai/providers.json#L2-L24)

### `reasoningStyle` 的三种语义

`reasoningStyle` 决定了 AI 的思考过程（reasoning）如何传递和处理，这是各提供商 API 规范差异的核心点：

| 样式 | 含义 | 适用提供商 | 处理方式 |
|------|------|-----------|---------|
| `reasoning_content` | 原生推理字段 | DeepSeek | 直接使用 API 的 `reasoning_content` 字段，不修改消息体 |
| `structured_content` | 结构化思考内容 | Mistral | 在请求中附加 `reasoning_effort: 'high'`；在响应中将 `reasoning_content` 合并为 `【上一步思考过程】` 前缀 |
| `none` | 无特殊推理处理 | 自定义/Ollama | 不做任何推理相关的消息转换 |

代码中两个关键处理点：

1. **请求阶段**（`makeRequest`）：DeepSeek 发送 `thinking: { type }` 参数；Mistral 发送 `reasoning_effort: 'high'` 参数。
2. **消息构建阶段**（`_buildMessages`）：非 `reasoning_content` 的提供者，将历史消息中的 `reasoning_content` 字段合并到 `content` 中作为思考前缀，然后移除该字段，避免 API 抛出 `extra_forbidden` 错误。

[来源](packages/core/src/ai/assistant.ts#L318-L334)

[来源](packages/core/src/ai/assistant.ts#L367-L372)

### 辅助函数

| 函数 | 作用 |
|------|------|
| `getProviderById(id)` | 按 ID 查找提供者 |
| `getProviderByBaseUrl(url)` | 按基础 URL 查找提供者（自动去除尾部斜杠） |
| `getModelInfo(providerId, modelId)` | 获取指定模型的详细信息 |
| `cleanBaseUrl(url)` | 标准化 URL（去除 `/v1/chat/completions` 后缀和尾部斜杠） |
| `isCustomModel(providerId, modelId)` | 判断是否为注册表之外的模型 |
| `shouldSendThinkingParam(providerId)` | 是否发送非标准 `thinking` 参数（仅 DeepSeek） |

[来源](packages/core/src/ai/providers.ts#L26-L56)

### 用户配置方式

生产系统默认配置为 DeepSeek V4 Flash：

```typescript
const DEFAULT_CONFIG = {
  baseUrl: 'https://api.deepseek.com',
  model: 'deepseek-v4-flash',
  thinkingEnabled: true,
};
```

用户通过环境变量覆盖，详见 [环境变量与配置](环境变量与配置.md)。用户可指定任意 `LLM_PROVIDER`、`LLM_MODEL` 和 `LLM_BASE_URL`，系统通过 `getProviderByBaseUrl` 自动关联提供者信息，若匹配不到则视为自定义模型。

[来源](packages/core/src/ai/assistant.ts#L87-L91)

---

## 下一步

- 了解 AI 引擎如何消费这些提示和提供者配置 → [](aiassistant-多提供者-llm-引擎.md)
- 查看 36 个工具如何被 AI 调用 → [](36-个-ai-工具-从定义到执行.md)
- 了解 TUI 和 PWA 如何向 AI 传递上下文 → [](tui-组件架构与渲染原理.md) 和 [](pwa-架构与组件映射.md)