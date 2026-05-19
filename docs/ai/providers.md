# Provider Config

**File**: `packages/core/src/ai/providers.json`
**File**: `packages/core/src/ai/providers.ts`

## Provider Config Structure

```json
{
  "id": "openai",
  "label": "OpenAI",
  "baseUrl": "https://api.openai.com",
  "apiType": "responses",
  "reasoningStyle": "none",
  "models": [
    { "id": "gpt-5.5", "label": "GPT-5.5", "thinking": true, "vision": true, "supportsReasoningEffort": true }
  ]
}
```

## Provider-Specific Features

- `apiType`: `'chat'` | `'responses'` — selects adapter
- `reasoningStyle`: `'reasoning_content'` | `'structured_content'` | `'none'`
- `ModelInfo.fixedParams`: immutable params (Kimi: `top_p: 0.95`, `n: 1`, etc.)
- `ModelInfo.supportsReasoningEffort`: enables `reasoning: { effort }` in Responses API
- `ModelInfo.video`: reserved for future video input support (Kimi K2.6)

## Interfaces

### ModelInfo

```typescript
interface ModelInfo {
  id: string;                    // Model identifier (e.g., "gpt-5.5")
  label: string;                 // Human-readable name (e.g., "GPT-5.5 (旗舰高性能)")
  thinking: boolean;             // Whether model supports reasoning/thinking mode
  vision: boolean;               // Whether model supports image input
  video?: boolean;               // Reserved for video input support (Kimi K2.6)
  fixedParams?: Record<string, unknown>;  // Immutable parameters enforced per model
  supportsReasoningEffort?: boolean;      // Enables reasoning effort control (Responses API)
}
```

### ProviderInfo

```typescript
interface ProviderInfo {
  id: string;                    // Provider identifier (e.g., "openai")
  label: string;                 // Display name (e.g., "OpenAI")
  baseUrl: string;               // API endpoint base URL
  models: ModelInfo[];           // Available models for this provider
  reasoningStyle: 'reasoning_content' | 'structured_content' | 'none';
  apiType?: 'chat' | 'responses';  // Which adapter to use
}
```

## All 7 Providers

### DeepSeek (Chat Completions, reasoning_content)

```json
{
  "id": "deepseek",
  "label": "DeepSeek",
  "baseUrl": "https://api.deepseek.com",
  "apiType": "chat",
  "reasoningStyle": "reasoning_content",
  "models": [
    { "id": "deepseek-v4-flash", "label": "DeepSeek V4 Flash", "thinking": true, "vision": false },
    { "id": "deepseek-v4-pro", "label": "DeepSeek V4 Pro", "thinking": true, "vision": false }
  ]
}
```

### Mistral (Chat Completions, structured_content)

```json
{
  "id": "mistral",
  "label": "Mistral",
  "baseUrl": "https://api.mistral.ai",
  "apiType": "chat",
  "reasoningStyle": "structured_content",
  "models": [
    { "id": "mistral-small-latest", "label": "Mistral Small (24B)", "thinking": true, "vision": true },
    { "id": "pixtral-large-latest", "label": "Pixtral Large (Vision)", "thinking": false, "vision": true },
    { "id": "mistral-medium-latest", "label": "Mistral Medium (128B)", "thinking": false, "vision": true },
    { "id": "ministral-3b-latest", "label": "Ministral 3B (Fast)", "thinking": false, "vision": false }
  ]
}
```

### OpenAI (Responses API)

```json
{
  "id": "openai",
  "label": "OpenAI",
  "baseUrl": "https://api.openai.com",
  "apiType": "responses",
  "reasoningStyle": "none",
  "models": [
    { "id": "gpt-5.5", "label": "GPT-5.5 (旗舰高性能)", "thinking": true, "vision": true, "supportsReasoningEffort": true },
    { "id": "gpt-5.4", "label": "GPT-5.4 (中高端)", "thinking": true, "vision": true, "supportsReasoningEffort": true },
    { "id": "gpt-5.4-mini", "label": "GPT-5.4 Mini (中端轻量)", "thinking": true, "vision": true, "supportsReasoningEffort": true },
    { "id": "gpt-5.4-nano", "label": "GPT-5.4 Nano (低价高吞吐)", "thinking": false, "vision": true },
    { "id": "gpt-5-mini", "label": "GPT-5 Mini (低价低延迟)", "thinking": false, "vision": true }
  ]
}
```

### xAI Grok (Responses API)

```json
{
  "id": "xai",
  "label": "xAI Grok",
  "baseUrl": "https://api.x.ai",
  "apiType": "responses",
  "reasoningStyle": "none",
  "models": [
    { "id": "grok-4.3", "label": "Grok 4.3 (旗舰)", "thinking": true, "vision": true, "supportsReasoningEffort": true },
    { "id": "grok-4.1-reasoning", "label": "Grok 4.1 Reasoning (轻量推理)", "thinking": true, "vision": false, "supportsReasoningEffort": true },
    { "id": "grok-4-fast", "label": "Grok 4 Fast (高吞吐)", "thinking": false, "vision": true },
    { "id": "grok-4-mini", "label": "Grok 4 Mini (极速低价)", "thinking": false, "vision": false }
  ]
}
```

### Kimi Moonshot (CN) (Chat Completions, reasoning_content)

```json
{
  "id": "kimi-cn",
  "label": "Kimi Moonshot (CN)",
  "baseUrl": "https://api.moonshot.cn",
  "apiType": "chat",
  "reasoningStyle": "reasoning_content",
  "models": [
    { "id": "kimi-k2.6", "label": "Kimi K2.6", "thinking": true, "vision": true, "video": true,
      "fixedParams": { "top_p": 0.95, "n": 1, "presence_penalty": 0, "frequency_penalty": 0 } },
    { "id": "kimi-k2.5", "label": "Kimi K2.5", "thinking": true, "vision": true, "video": false,
      "fixedParams": { "top_p": 0.95, "n": 1, "presence_penalty": 0, "frequency_penalty": 0 } }
  ]
}
```

### Kimi Moonshot (Overseas) (Chat Completions, reasoning_content)

```json
{
  "id": "kimi-overseas",
  "label": "Kimi Moonshot (Overseas)",
  "baseUrl": "https://api.moonshot.ai",
  "apiType": "chat",
  "reasoningStyle": "reasoning_content",
  "models": [
    { "id": "kimi-k2.6", "label": "Kimi K2.6", "thinking": true, "vision": true, "video": true,
      "fixedParams": { "top_p": 0.95, "n": 1, "presence_penalty": 0, "frequency_penalty": 0 } },
    { "id": "kimi-k2.5", "label": "Kimi K2.5", "thinking": true, "vision": true, "video": false,
      "fixedParams": { "top_p": 0.95, "n": 1, "presence_penalty": 0, "frequency_penalty": 0 } }
  ]
}
```

### OpenRouter (Chat Completions, custom models)

```json
{
  "id": "openrouter",
  "label": "OpenRouter",
  "baseUrl": "https://openrouter.ai",
  "apiType": "chat",
  "reasoningStyle": "none",
  "models": []
}
```

## fixedParams Behavior

`fixedParams` are immutable model-specific parameters that override any user or default settings. They are applied in `ChatCompletionsAdapter.buildRequest()` after the base body is constructed:

```typescript
if (modelInfo?.fixedParams) {
  for (const [key, val] of Object.entries(modelInfo.fixedParams)) {
    body[key] = val;
  }
}
```

### Kimi Example

Both K2.6 and K2.5 enforce:
- `top_p: 0.95` — nucleus sampling threshold
- `n: 1` — single completion (no variants)
- `presence_penalty: 0` — no repetition penalty
- `frequency_penalty: 0` — no frequency penalty

These values cannot be overridden by temperature or other config settings. The `fixedParams` mechanism ensures provider-mandated constraints are always respected.
