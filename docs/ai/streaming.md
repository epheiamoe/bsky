# Streaming

**File**: `packages/core/src/ai/assistant.ts`

## sendMessageStreaming

A separate method on `AIAssistant` for real-time token delivery. Unlike `sendMessage` (which waits for the full response), this method uses `fetch()` with `stream: true` and returns an async generator that yields tokens as they arrive via a manual SSE parser.

```typescript
sendMessageStreaming(content: string, signal?: AbortSignal): AsyncGenerator<{

interface StreamChunk {
  type: 'token' | 'tool_call' | 'tool_result' | 'done' | 'error';
  content?: string;
  toolCallId?: string;
  error?: string;
}
```

## SSE Parser (Chat Completions)

The stream body uses SSE format (`data: ` prefixed lines), parsed manually from the `fetch` response reader. Each line prefixed with `data: ` is a JSON object matching the OpenAI-compatible streaming format (`choices[0].delta`).

```
data: {"id":"...","object":"chat.completion.chunk","choices":[{"index":0,"delta":{"content":"Hello"}}]}
data: [DONE]
```

## SSE Parser (Responses API)

Responses API uses named SSE events with a different format:

```
event: response.output_text.delta
data: {"delta":"Hello","type":"response.output_text.delta"}

event: response.function_call_arguments.delta
data: {"delta":"{\"q\":\"test\"}","item_id":"fc_...","type":"response.function_call_arguments.delta"}

event: response.function_call_arguments.done
data: {"arguments":"{\"q\":\"test\"}","item_id":"fc_...","type":"response.function_call_arguments.done"}

event: response.completed
data: { ... full response ... }
```

Key difference: Chat Completions uses delta chunks with `choices[0].delta.{content,reasoning_content,tool_calls}` while Responses API uses typed events with `event:` + `data:` lines. The `StreamProcessor` abstraction in `responses-adapter.ts` handles both formats.

## Reasoning Content Preservation

DeepSeek models return `reasoning_content` in streaming chunks (separate from `content`). The parser preserves this:

```
data: {"choices":[{"delta":{"reasoning_content":"Let me think about this..."}}]}
data: {"choices":[{"delta":{"content":"The answer is..."}}]}
```

Both fields are accumulated separately and exposed in the final `StreamChunk` of type `done`:

```typescript
interface StreamDoneChunk extends StreamChunk {
  type: 'done';
  fullContent: string;
  reasoningContent?: string;   // DeepSeek R1 reasoning trace
  toolCalls: ToolCallResult[];
  tokensUsed: number;
}
```

## Integration with useAIChat

The `useAIChat` hook in `@bsky/app` can consume the streaming method when `options.streaming = true`:

```typescript
const { messages, loading, send } = useAIChat(client, aiConfig, contextUri, {
  streaming: true,
  onToken: (token) => {
    // append token to the current assistant message in real-time
  },
});
```

## SSE Format Differences

A side-by-side comparison of the two streaming formats:

| Feature | Chat Completions | Responses API |
|---------|-----------------|---------------|
| **Endpoint** | `/v1/chat/completions` | `/v1/responses` |
| **Request format** | `{ messages, tools, ... }` | `{ input, instructions, tools, ... }` |
| **Stream events** | `data: {choices[0].delta}` | `event: response.output_text.delta` |
| **Text delta field** | `delta.content` | `delta` (under typed event) |
| **Tool calls** | `delta.tool_calls[]` array | `response.output_item.added` + `response.function_call_arguments.delta` |
| **Tool call ID** | `tc.id` | `item.call_id` (xAI uses `item.id` as map key) |
| **Reasoning** | `delta.reasoning_content` field | `response.reasoning_summary_text.delta` events |
| **Done signal** | `data: [DONE]` | `event: response.completed` |
| **Message format** | `{ role, content }` array | `{ input: [{role, content}, ...], instructions }` |
| **Temperature** | `temperature` | `temperature` |
| **Max tokens** | `max_tokens` | `max_output_tokens` |

## xAI Grok Streaming Format

xAI's Grok implementation of the Responses API has several format quirks:

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

event: response.output_text.delta
data: {"delta":" search","type":"response.output_text.delta"}

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
