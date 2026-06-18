# AI & Tool System

> Split reference docs for the AI subsystem.

## Architecture

```
User types message
    │
    ▼
useAIChat.send(text)
    │
    ▼
AIAssistant.sendMessage(text)        ← packages/core/src/ai/assistant.ts
    │
    ├──▶ addUserMessage(text)
    │
    ├──▶ adapter.buildRequest()       ← ApiAdapter (chat or responses)
    │     │
    │     ├──▶ POST {adapter url}     ← Chat: /v1/chat/completions
    │     │                             Responses: /v1/responses
    │     │
    │     ├──▶ adapter.parseResponse(raw)
    │     │     ├── has tool_calls?
    │     │     │   YES → execute tools → add tool results → loop (unlimited)
    │     │     │   NO  → return final response
    │     │
    │     └──▶ tool execution via toolMap.get(toolName).handler(args)
    │
    └──▶ return { content, toolCallsExecuted, intermediateSteps }
```

## Sections

| Doc | Content | Key Files |
|-----|---------|-----------|
| [adapter.md](./adapter.md) | `ApiAdapter` interface, `ChatCompletionsAdapter`, `ResponsesApiAdapter`, `StreamProcessor` | `adapter.ts`, `responses-adapter.ts` |
| [providers.md](./providers.md) | Provider config, `ProviderInfo` / `ModelInfo`, all 7 providers, `fixedParams` | `providers.ts`, `providers.json` |
| [assistant.md](./assistant.md) | `AIAssistant` class, `AIConfig` interface, system prompts | `assistant.ts`, `prompts.ts` |
| [reasoning.md](./reasoning.md) | Reasoning effort, thinking mode, supported models by provider | `adapter.ts`, `responses-adapter.ts` |
| [tools.md](./tools.md) | Tools architecture, `ToolDescriptor`, tool execution flow, guards | `tools.ts` |
| [streaming.md](./streaming.md) | Streaming, SSE parsers (Chat Completions vs Responses API), reasoning content preservation | `assistant.ts`, `adapter.ts`, `responses-adapter.ts` |
| [features.md](./features.md) | Translation (dual-mode + retry), Polish draft, single-turn functions | `assistant.ts` |

## Quick Reference

- **34 tools** (28 read + 1 sandbox + 6 write) — see [tools.md](./tools.md)
- **7 providers** (OpenAI, xAI, DeepSeek, Mistral, Kimi CN, Kimi Overseas, OpenRouter) — see [providers.md](./providers.md)
- **2 adapter types**: Chat Completions (`/v1/chat/completions`) and Responses API (`/v1/responses`) — see [adapter.md](./adapter.md)
- **Default model**: `deepseek-v4-flash`

## System Prompts

**Main assistant** (from `packages/core/src/ai/prompts.ts`):
```
你是用户的 Bluesky 助手，帮助用户浏览和分析 Bluesky 上的内容。
可以通过工具调用获取最新的网络动态、用户资料和帖子上下文。
【重要规则】绝对不要主动代表用户发帖、回复、点赞、转发或关注任何人。
所有写操作必须由用户明确要求后才执行。
```

All prompts are centralized in `packages/core/src/ai/prompts.ts` — edit this file to customize AI behavior.
