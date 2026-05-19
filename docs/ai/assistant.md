# AIAssistant Class

**File**: `packages/core/src/ai/assistant.ts`

## Class API

```typescript
class AIAssistant {
  constructor(config?: Partial<AIConfig>)
  setTools(tools: ToolDescriptor[]): void
  addSystemMessage(content: string): void
  addUserMessage(content: string): void
  getMessages(): ChatMessage[]
  clearMessages(): void
  loadMessages(msgs: ChatMessage[]): void
  sendMessage(content: string): Promise<{
    content: string;
    toolCallsExecuted: number;
    intermediateSteps: Array<{
      type: 'tool_call' | 'tool_result' | 'assistant' | 'user';
      content: string;
    }>;
  }>
}
```

## AIConfig Interface

```typescript
interface AIConfig {
  apiKey: string;
  baseUrl: string;          // default: 'https://api.deepseek.com'
  model: string;            // default: 'deepseek-v4-flash'
  provider?: string;        // 'deepseek' | 'mistral' | 'openai' | 'xai' | 'kimi-cn' | 'kimi-overseas' | 'openrouter'
  reasoningStyle?: 'reasoning_content' | 'structured_content' | 'none';
  apiType?: 'chat' | 'responses';   // selects ChatCompletionsAdapter or ResponsesApiAdapter
  reasoningEffort?: 'none' | 'low' | 'medium' | 'high';  // for Responses API reasoning models
  thinkingEnabled?: boolean;   // derived from ModelInfo for known models
  visionEnabled?: boolean;     // derived from ModelInfo for known models
}
```

## sendMessage Flow

1. `addUserMessage(content)` — adds user message to history
2. `adapter.buildRequest(config, messages, tools, stream, overrides?)` — constructs request spec
3. POST to provider endpoint
4. `adapter.parseResponse(raw)` — parses response
   - If tool calls found: execute tools → add tool results → loop (unlimited)
   - If no tool calls: return final response
5. Return `{ content, toolCallsExecuted, intermediateSteps }`

## Streaming Method

`sendMessageStreaming(content: string, signal?: AbortSignal)` — returns an async generator that yields tokens in real-time. See [streaming.md](./streaming.md) for details.
