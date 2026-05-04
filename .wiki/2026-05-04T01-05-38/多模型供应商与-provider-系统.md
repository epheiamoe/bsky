以下是完整的 Wiki 页面内容。

---

# 多模型供应商与 Provider 系统

Provider 系统是 @bsky/core 中实现多供应商 LLM 集成的核心抽象。它定义了供应商的注册契约、模型规格查询、URL 标准化规则，以及按场景（对话/翻译/润色）独立选择模型的机制。整个系统以 **类型安全的数据驱动** 为设计原则：供应商和模型清单以 JSON 文件作为唯一数据源，TypeScript 接口提供编译时校验，运行时通过纯函数查询，不持有任何可变状态。

## 注册契约：PROVIDERS 数组

PROVIDERS 是系统中所有受支持模型供应商的注册表。它的定义方式与众不同——并非在代码中硬编码，而是通过 `import providerData from './providers.json'` 加载外部 JSON 文件，再断言为 `ProviderInfo[]` 类型导出。

```typescript
export const PROVIDERS: ProviderInfo[] = providerData as ProviderInfo[];
```

这种设计有两层意图。其一，**JSON 作为数据源**，非开发者可以直接编辑 JSON 文件来添加或修改供应商，无需触碰 TypeScript 编译流程；其二，**TS 接口作为约束**，任何对 providers.json 的修改如果不符合 `ProviderInfo` 的结构要求，编译时会报错。接口定义如下：

```typescript
export interface ProviderInfo {
  id: string;
  label: string;
  baseUrl: string;
  models: ModelInfo[];
  reasoningStyle: 'reasoning_content' | 'structured_content' | 'none';
}

export interface ModelInfo {
  id: string;
  label: string;
  thinking: boolean;
  vision: boolean;
}
```

每个字段含义清晰：
- `id`：供应商唯一标识，在 API Key 配置和场景模型覆盖中用作查找键；
- `baseUrl`：API 入口地址，不含路径后缀（如 `/v1/chat/completions`）；
- `reasoningStyle`：该供应商的推理内容格式，决定消息发送前是否需要对 `reasoning_content` 做预处理；
- `models`：模型清单，每项标注 `thinking`（是否支持思维链输出）和 `vision`（是否支持图片输入）能力。

[来源](packages/core/src/ai/providers.ts#L1-L22)

## 当前支持的供应商

截至当前代码，providers.json 中注册了两家供应商：

| 供应商 | ID | baseUrl | Reasoning Style |
|--------|----|---------|----------------|
| **DeepSeek** | `deepseek` | `https://api.deepseek.com` | `reasoning_content` |
| **Mistral** | `mistral` | `https://api.mistral.ai` | `structured_content` |

其模型规格对比如下：

| 模型 ID | 所属供应商 | Thinking | Vision |
|----------|-----------|----------|--------|
| `deepseek-v4-flash` | DeepSeek | ✅ | ❌ |
| `deepseek-v4-pro` | DeepSeek | ✅ | ❌ |
| `mistral-small-latest` | Mistral | ✅ | ✅ |
| `pixtral-large-latest` | Mistral | ❌ | ✅ |
| `mistral-medium-latest` | Mistral | ❌ | ✅ |
| `ministral-3b-latest` | Mistral | ❌ | ❌ |

Mistral 的覆盖范围更广：从 3B 轻量模型到 128B 大模型，且三个模型具备视觉能力。DeepSeek 的两个模型均支持思维链但不支持图片输入。

[来源](packages/core/src/ai/providers.json#L1-L22)

## 查询函数

Provider 系统提供四个纯查询函数，均在 PROVIDERS 数组上执行线性查找。

### getProviderById

```typescript
export function getProviderById(id: string): ProviderInfo | undefined {
  return PROVIDERS.find(p => p.id === id);
}
```

O(1) 语义查找，返回匹配的 `ProviderInfo` 或 `undefined`。这是最常用的入口，在场景配置解析、API Key 获取等场景中均被调用。

### getProviderByBaseUrl

```typescript
export function getProviderByBaseUrl(baseUrl: string): ProviderInfo | undefined {
  const clean = baseUrl.replace(/\/+$/, '');
  return PROVIDERS.find(p => p.baseUrl.replace(/\/+$/, '') === clean);
}
```

通过清理后的 URL 匹配供应商。两侧均移除尾部斜杠后再做全等比较，避免了用户在配置中多写或少写斜杠导致的误匹配。这个函数主要用于自动检测——当用户只配置了 `baseUrl` 而未指定 `provider` 时，可以用它推断出对应的供应商。

### getModelInfo

```typescript
export function getModelInfo(providerId: string, modelId: string): ModelInfo | undefined {
  const provider = getProviderById(providerId);
  if (!provider) return undefined;
  return provider.models.find(m => m.id === modelId);
}
```

先查供应商，再在该供应商的模型列表中查找。如果供应商不存在或模型未注册，返回 `undefined`。返回值中的 `thinking` 和 `vision` 字段会被用于构建 `AIConfig`，见下文 "场景模型解析"。

### isCustomModel

```typescript
export function isCustomModel(providerId: string, modelId: string): boolean {
  const info = getModelInfo(providerId, modelId);
  return !info;
}
```

如果模型不在注册表内，即为自定义模型。TUI 的设置页面利用此条件判断是否显示"自定义模型"输入框，给予用户绕过预设清单的自由。

[来源](packages/core/src/ai/providers.ts#L24-L51)

## cleanBaseUrl：路径清理规则

`cleanBaseUrl` 是请求构建前的标准化步骤，它将用户配置的各种形式 URL 统一为无后缀的 API 根地址。

```typescript
export function cleanBaseUrl(baseUrl: string): string {
  return baseUrl
    .replace(/\/v1\/chat\/completions\/?$/, '')
    .replace(/\/v1\/?$/, '')
    .replace(/\/+$/, '');
}
```

规则按优先级依次执行：

1. **移除 `/v1/chat/completions`（含尾部可选斜杠）**：有些用户配置的 baseUrl 是完整的 API 路径（如 `https://api.deepseek.com/v1/chat/completions`），需要还原为根地址。
2. **移除 `/v1`（含尾部可选斜杠）**：部分供应商使用 `/v1` 作为 API 版本前缀，同样需要剥离。
3. **移除尾部多余斜杠**：容错处理。

最终在 AIAssistant 中拼接时统一追加 `cleanBaseUrl(...) + '/v1/chat/completions'`，确保无论用户如何配置，发出的请求 URL 始终正确。

```typescript
const url = `${cleanBaseUrl(this.config.baseUrl)}/v1/chat/completions`;
```

[来源](packages/core/src/ai/providers.ts#L44-L46)
[来源](packages/core/src/ai/assistant.ts#L208)

## scenarioModels：每场景模型覆盖

同一个用户可能希望对话使用 DeepSeek V4 Flash，翻译使用 Mistral Small，润色使用 DeepSeek V4 Pro——这就是 `scenarioModels` 存在的理由。

### 定义与存储

在 TUI 的配置接口 `TuiConfig` 中，`scenarioModels` 是一个三字段对象：

```typescript
scenarioModels: {
  aiChat: string;    // AI 对话场景
  translate: string; // 翻译场景
  polish: string;    // 润色场景
}
```

每个字段的值为空字符串（表示使用默认 `aiConfig`），或为 `"providerId/modelId"` 格式（如 `"mistral/mistral-small-latest"`）。配置存储于 `bsky-tui.config.json`。

[来源](packages/tui/src/config/configStore.ts#L30-L40)

### 解析逻辑

当 TUI 的 `App` 组件需要为某个场景构建 `AIConfig` 时，调用 `resolveScenarioConfig`：

```typescript
const resolveScenarioConfig = useCallback((scenarioModel: string): AIConfig => {
  if (!scenarioModel || !scenarioModel.includes('/')) {
    return { ...config.aiConfig };
  }
  const [providerId, model] = scenarioModel.split('/');
  const provider = getProviderById(providerId);
  const modelInfo = provider ? getModelInfo(providerId, model) : undefined;
  return {
    ...config.aiConfig,
    baseUrl: provider?.baseUrl || config.aiConfig.baseUrl,
    model,
    apiKey: config.apiKeys?.[providerId] || config.aiConfig.apiKey,
    provider: provider?.id,
    reasoningStyle: provider?.reasoningStyle,
    thinkingEnabled: modelInfo?.thinking ?? config.aiConfig.thinkingEnabled ?? true,
    visionEnabled: modelInfo?.vision ?? config.aiConfig.visionEnabled ?? false,
  };
}, [config]);
```

解析过程的关键决策：
- **provider/baseUrl/model** 从覆盖字符串中提取，若覆盖的供应商未注册则回退到全局 `aiConfig`；
- **apiKey** 从 `config.apiKeys` 中按 provider ID 获取，实现每个供应商独立配置密钥；
- **thinkingEnabled/visionEnabled** 优先使用模型规格中的元数据，若模型未注册（自定义模型）则回退到全局设置。

这种设计实现了 **three-layer override chain**：模型规格元数据 → 场景覆盖配置 → 全局默认值，每一层只覆盖需要变更的字段，其余自动继承。

[来源](packages/tui/src/components/App.tsx#L104-L119)

### 场景分发点

三个场景在代码中各自使用不同的模型模型覆盖键：

- **AI 对话** (`aiChat`)：由 `AIAssistant` 类使用，在 `packages/core/src/ai/assistant.ts` 中通过 `config.model` 确定模型。
- **翻译** (`translate`)：由 `translateText` 函数使用，接受 `modelOverride` 参数，在 `packages/tui/src/components/App.tsx` 中传入 `config.scenarioModels.translate`。
- **润色** (`polish`)：由 `polishDraft` 函数使用，同样通过 `modelOverride` 参数传入 `config.scenarioModels.polish`。

这些场景的详细实现可参见 [AI 助手与工具调用系统](ai-助手与工具调用系统.md)、[翻译与润色功能](翻译与润色功能.md) 和 [提示词工程与系统提示](提示词工程与系统提示.md)。

## shouldSendThinkingParam：为何仅对 DeepSeek 生效

```typescript
export function shouldSendThinkingParam(providerId: string): boolean {
  return providerId === 'deepseek';
}
```

这个函数控制是否在请求体中注入非标准的 `thinking` 参数。其背景是不同供应商对"思维链"（Chain-of-Thought）的控制方式不同：

- **DeepSeek**：使用专有参数 `thinking: { type: 'enabled' | 'disabled' }` 来控制是否输出推理内容。这是非标准字段，不在 OpenAI 兼容 API 规范中。
- **Mistral**：使用行业内更通用的 `reasoning_effort: 'high'` 参数来控制推理深度，完全符合 OpenAI 兼容 API 标准。
- **其他供应商**：若某供应商 `reasoningStyle` 为 `'none'`，则既不发送 `thinking` 也不发送 `reasoning_effort`。

两套参数在 AIAssistant 的 `makeRequest` 方法中条件性地注入：

```typescript
if (this.config.provider && shouldSendThinkingParam(this.config.provider)) {
  (body as any).thinking = { type: this.config.thinkingEnabled !== false ? 'enabled' : 'disabled' };
}
if (this.config.reasoningStyle === 'structured_content' && this.config.thinkingEnabled !== false) {
  (body as any).reasoning_effort = 'high';
}
```

第二段的 `reasoningStyle === 'structured_content'` 恰好匹配 Mistral 供应商的类型。两段互斥逻辑并存，意味着一个供应商要么走 `thinking` 路径（DeepSeek），要么走 `reasoning_effort` 路径（Mistral），不会同时发送两个参数。

[来源](packages/core/src/ai/providers.ts#L54-L57)
[来源](packages/core/src/ai/assistant.ts#L195-L199)

关于思考模式的端到端呈现，参见[流式输出与思考模式](流式输出与思考模式.md)。

## 整体数据流

```mermaid
flowchart LR
    JSON[providers.json<br/>数据源] -->|import + type assertion| PROVIDERS[PROVIDERS: ProviderInfo[]]
    PROVIDERS --> getById[getProviderById]
    PROVIDERS --> getByUrl[getProviderByBaseUrl]
    PROVIDERS --> getModel[getModelInfo]
    PROVIDERS --> isCustom[isCustomModel]

    Config[bsky-tui.config.json] -->|scenarioModels| Resolve[resolveScenarioConfig]
    Resolve --> getById
    Resolve --> getModel
    Resolve -->|产出| AIConfig[AIConfig]

    AIConfig -->|provider + baseUrl + model| AIAssistant
    AIConfig --> shouldSend[shouldSendThinkingParam]
    shouldSend -->|DeepSeek only| thinking[thinking param]
    AIConfig -->|reasoningStyle===structured| effort[reasoning_effort param]
    AIConfig --> cleanBaseUrl[cleanBaseUrl]
    cleanBaseUrl -->|标准化URL| APICall[API Call]
    APICall --> AIAssistant
```

## 扩展新供应商

添加新供应商只需在 `providers.json` 中新增一个条目，无需修改任何 TypeScript 代码：

```json
{
  "id": "openai",
  "label": "OpenAI",
  "baseUrl": "https://api.openai.com",
  "reasoningStyle": "none",
  "models": [
    { "id": "gpt-4o", "label": "GPT-4o", "thinking": false, "vision": true }
  ]
}
```

随后在 `.env` 或 `bsky-tui.config.json` 中加入该供应商的 API Key（键名为 `openai`），即可在对话/翻译/润色三个场景中使用。更详细的配置说明参见[环境与凭据配置](环境与凭据配置.md)。

[来源](packages/core/src/ai/providers.json#L1-L22)