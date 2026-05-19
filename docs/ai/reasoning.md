# Reasoning Effort

**File**: `packages/core/src/ai/responses-adapter.ts`
**File**: `packages/core/src/ai/adapter.ts`

## What is Reasoning Effort?

Reasoning effort controls how much computational work a model spends on internal reasoning before generating a response. It maps to four levels:

| Level | Description |
|-------|-------------|
| `none` | No explicit reasoning — fastest, lowest cost |
| `low` | Minimal reasoning chain |
| `medium` | Balanced reasoning (default) |
| `high` | Maximum reasoning depth — most thorough, slowest |

## API Mapping

### Responses API (OpenAI, xAI)

```typescript
body.reasoning = { effort: config.reasoningEffort || 'medium' };
```

Only sent when `modelInfo.supportsReasoningEffort === true`.

### Chat Completions (DeepSeek, Kimi)

```typescript
body.thinking = { type: config.thinkingEnabled !== false ? 'enabled' : 'disabled' };
```

For DeepSeek and Kimi models, reasoning is binary (enabled/disabled) rather than graded. Kimi additionally varies temperature based on thinking mode:
- Thinking enabled: `temperature: 1.0`
- Thinking disabled: `temperature: 0.6`

### Mistral (structured content reasoning)

```typescript
body.reasoning_effort = 'high';
```

Only applied when `reasoningStyle === 'structured_content'` and `thinkingEnabled !== false`.

## Supported Models

| Provider | Models with Reasoning | API Style |
|----------|----------------------|-----------|
| OpenAI | gpt-5.5, gpt-5.4, gpt-5.4-mini | Responses API — `reasoning: { effort }` |
| xAI | grok-4.3, grok-4.1-reasoning | Responses API — `reasoning: { effort }` |
| DeepSeek | deepseek-v4-flash, deepseek-v4-pro | Chat — `thinking: { type }` |
| Kimi | kimi-k2.6, kimi-k2.5 | Chat — `thinking: { type }` + temp override |
| Mistral | mistral-small-latest | Chat — `reasoning_effort: 'high'` |

## Default Values

- `reasoningEffort`: `'medium'` (when model supports it and user hasn't specified)
- `thinkingEnabled`: derived from `ModelInfo.thinking` for known models; defaults to `false` for unknown models
