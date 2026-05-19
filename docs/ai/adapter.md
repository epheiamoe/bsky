# ApiAdapter Pattern

**File**: `packages/core/src/ai/adapter.ts` (interface + `ChatCompletionsAdapter`)
**File**: `packages/core/src/ai/responses-adapter.ts` (`ResponsesApiAdapter`)

## Interface

```typescript
interface ApiAdapter {
  readonly apiType: string;
  buildRequest(config, messages, tools, stream, overrides?): RequestSpec;
  parseResponse(raw): ParsedResponse;
  createStreamProcessor(): StreamProcessor;
}

interface StreamProcessor {
  feed(chunkText): Array<{ type: 'token' | 'thinking'; content }>;
  getToolCalls(): Array<{ id, name, arguments }>;
  getFullContent(): string;
  getReasoningContent(): string;
}
```

## Implementations

| Adapter | Endpoint | Request Format | Stream Events |
|---------|----------|----------------|---------------|
| **ChatCompletionsAdapter** | `POST /v1/chat/completions` | `{ messages, tools, thinking, ... }` | SSE `data: {choices[0].delta}` |
| **ResponsesApiAdapter** | `POST /v1/responses` | `{ input, instructions, tools, reasoning, ... }` | Named SSE events (`response.output_text.delta`, `response.function_call_arguments.delta`, etc.) |

### Chat Completions Format

Standard OpenAI-compatible streaming:
```
data: {"id":"...","object":"chat.completion.chunk","choices":[{"index":0,"delta":{"content":"Hello"}}]}
data: [DONE]
```

### Responses API Format

Typed events with `event:` + `data:` lines:
```
event: response.output_text.delta
data: {"delta":"Hello","type":"response.output_text.delta"}

event: response.function_call_arguments.delta
data: {"delta":"{\"q\":\"test\"}","item_id":"fc_...","type":"response.function_call_arguments.delta"}

event: response.completed
data: { ... full response ... }
```

Key differences:
- **Text delta**: Chat uses `delta.content`, Responses uses `delta` under typed events
- **Tool calls**: Chat uses `delta.tool_calls[]` array; Responses uses `response.output_item.added` + `response.function_call_arguments.delta`
- **Tool call ID**: Chat uses `tc.id`; Responses uses `item.call_id` (xAI uses `item.id` as map key)
- **Reasoning**: Chat uses `delta.reasoning_content` field; Responses uses `response.reasoning_summary_text.delta` events
- **Done signal**: Chat uses `data: [DONE]`; Responses uses `event: response.completed`
- **Message format**: Chat uses `{ role, content }` array; Responses uses `{ input: [{role, content}, ...], instructions }`
- **Max tokens**: Chat uses `max_tokens`; Responses uses `max_output_tokens`

## xAI Grok Format Quirks

xAI's Grok implementation of the Responses API has several differences from OpenAI:

### Event Format Uses `item_id` (Not `call_id`)

```
event: response.function_call_arguments.delta
data: {"delta":"{\"q\":\"test\"}","item_id":"fc_abc123","type":"response.function_call_arguments.delta"}
```

The stream processor uses `parsed.item_id` as the map key for accumulating arguments.

### Reasoning Events

xAI reasoning events use a dot-separated event name:
```
event: response.reasoning_summary_text.delta
data: {"delta":"Analyzing the query...","type":"response.reasoning_summary_text.delta"}
```

### Tool Call Argument Accumulation

When a function call item is first added via `response.output_item.added`, xAI provides an `item.id` field:

```typescript
if (item.type === 'function_call') {
  const itemId = item.id || crypto.randomUUID();
  if (!this.toolCallAccum.has(itemId)) {
    this.toolCallAccum.set(itemId, {
      id: item.call_id || itemId,
      callId: item.call_id || '',
      name: item.name || '',
      arguments: item.arguments || '',
    });
    this.itemIdOrder.push(itemId);
  }
}
```

### Example Event Sequence

```
event: response.output_text.delta
data: {"delta":"I'll","type":"response.output_text.delta"}

event: response.reasoning_summary_text.delta
data: {"delta":"The user wants to search for posts. ","type":"response.reasoning_summary_text.delta"}

event: response.output_item.added
data: {"item":{"id":"fc_abc123","type":"function_call","call_id":"call_abc123","name":"search_posts","arguments":""},"type":"response.output_item.added"}

event: response.function_call_arguments.delta
data: {"delta":"{\"q\":\"AI news\"}","item_id":"fc_abc123","type":"response.function_call_arguments.delta"}

event: response.function_call_arguments.done
data: {"arguments":"{\"q\":\"AI news\"}","item_id":"fc_abc123","type":"response.function_call_arguments.done"}

event: response.completed
data: {...}
```
