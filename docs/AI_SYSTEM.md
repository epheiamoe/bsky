# AI & Tool System

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
    ├──▶ makeRequest()                ← POST to {baseUrl}/v1/chat/completions
    │     │                             with messages[] + tools[]
    │     │
    │     ├──▶ response has tool_calls?
    │     │     YES → execute tools → add tool results → goto makeRequest (max 10 rounds)
    │     │     NO  → return final response
    │     │
    │     └──▶ tool execution via toolMap.get(toolName).handler(args)
    │
    └──▶ return { content, toolCallsExecuted, intermediateSteps }
```

## AIAssistant Class

**File**: `packages/core/src/ai/assistant.ts`

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

### AIConfig

```typescript
interface AIConfig {
  apiKey: string;
  baseUrl: string;     // default: 'https://api.deepseek.com'
  model: string;       // default: 'deepseek-chat'
}
```

## Single-Turn Functions

```typescript
// Polish draft
polishDraft(config: AIConfig, draft: string, requirement: string): Promise<string>

// Generic single-turn
singleTurnAI(config: AIConfig, systemPrompt: string, userPrompt: string,
             temperature?: number, maxTokens?: number): Promise<string>
```

## Translation

**File**: `packages/core/src/ai/assistant.ts`

### Dual-Mode Architecture

`translateText` operates in two modes, selected automatically:

| Mode | Condition | Behaviour |
|------|-----------|-----------|
| **Simple** | Target language is CJK or the text is short (<200 chars) | Standard `system` + `user` prompt, no JSON wrapping |
| **JSON** | All other cases (European languages, long text) | `response_format: { type: 'json_object' }` with `source_lang` field |

```typescript
translateText(config: AIConfig, text: string, targetLang: string): Promise<{
  translation: string;
  source_lang?: string;  // only in JSON mode
  mode: 'simple' | 'json';
}>
```

### JSON Mode Prompt

```
Translate the following text to {targetLang}.
Return ONLY a JSON object with fields:
  - "translation": the translated text
  - "source_lang": ISO 639-1 code of the source language (e.g. "en", "fr", "de")

Do NOT include any other text or explanation.
```

Request body includes `response_format: { type: 'json_object' }` to enforce structured output.

### Retry Logic

DeepSeek's JSON mode occasionally returns empty content. Retry with exponential backoff:

| Attempt | Delay before send |
|---------|-------------------|
| 1 (initial) | — |
| 2 | 800 ms |
| 3 | 1,600 ms |
| 4 (final) | 2,400 ms |

Max retries: **3** (4 total attempts). Each retry re-sends the identical prompt. If all attempts fail, the function throws with `translateText failed after 4 attempts`.

One special retry trigger: **empty `choices[0].message.content`** — treated as a failure even if HTTP 200, because DeepSeek JSON mode can return `200 OK` with a blank body.

```typescript
const MAX_RETRIES = 3;
const BACKOFF_MS = 800;
for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
  if (attempt > 0) await sleep(BACKOFF_MS * attempt);
  const resp = await ky.post(...);
  const content = resp.choices[0]?.message?.content;
  if (content) return parseContent(content);  // success
  // else blank content → retry
}
throw new Error('translateText failed after 4 attempts');
```

## Streaming

**File**: `packages/core/src/ai/assistant.ts`

### sendMessageStreaming

A separate method on `AIAssistant` for real-time token delivery. Unlike `sendMessage` (which waits for the full response), this method returns a `ReadableStream` that yields tokens as they arrive.

```typescript
sendMessageStreaming(content: string): Promise<ReadableStream<StreamChunk>>

interface StreamChunk {
  type: 'token' | 'tool_call' | 'tool_result' | 'done' | 'error';
  content?: string;
  toolCallId?: string;
  error?: string;
}
```

### SSE Parser

The stream is parsed as Server-Sent Events (SSE). Each line prefixed with `data: ` is a JSON object matching the OpenAI-compatible streaming format (`choices[0].delta`).

```
data: {"id":"...","object":"chat.completion.chunk","choices":[{"index":0,"delta":{"content":"Hello"}}]}

data: {"id":"...","object":"chat.completion.chunk","choices":[{"index":0,"delta":{"content":" world"}}]}

data: [DONE]
```

### Reasoning Content Preservation

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

### Integration with useAIChat

The `useAIChat` hook in `@bsky/app` can consume the streaming method when `options.streaming = true`:

```typescript
const { messages, loading, send } = useAIChat(client, aiConfig, contextUri, {
  streaming: true,
  onToken: (token) => {
    // append token to the current assistant message in real-time
  },
});
```

## Tool System

**File**: `packages/core/src/at/tools.ts`

### ToolDescriptor

```typescript
interface ToolDescriptor {
  definition: {
    name: string;
    description: string;
    inputSchema: { type: 'object'; properties: Record<string, { type: string; description: string }>; required: string[] };
  };
  handler: (params: Record<string, unknown>) => Promise<string>;  // Returns JSON string
  requiresWrite: boolean;   // true for create_post, like, repost, follow, upload_blob
}
```

### All 31 Tools

**Read Tools (24)**:
- `resolve_handle` — resolve handle → DID
- `get_record` — get raw AT record
- `list_records` — list repo collection records
- `search_posts` — search Bluesky posts
- `get_timeline` — home timeline
- `get_author_feed` — user's posts
- `get_popular_feed_generators` — trending feeds
- `get_feed_generator` — feed generator details
- `get_feed` — feed content
- `get_post_thread` — raw thread tree
- `get_post_thread_flat` — **flattened thread with depth markers** (prefer for AI context)
- `get_post_subtree` — expand folded replies
- `get_post_context` — full context: thread + media + text
- `get_likes` — who liked a post
- `get_reposted_by` — who reposted
- `get_quotes` — posts quoting a specific post
- `search_actors` — search users
- `get_profile` — user profile
- `get_follows` / `get_followers` / `get_suggested_follows` — social graph
- `list_notifications` — notifications
- `extract_images_from_post` — extract blob refs (did+cid)
- `download_image` — download blob as base64
- `extract_external_link` — extract link embed
- `fetch_web_markdown` — **fetch external URL as markdown via r.jina.ai proxy**

**Write Tools (6, require confirmation)**:
- `create_post` — post/reply/quote
- `like` / `repost` — engagement
- `follow` — follow user
- `upload_blob` — upload image

### Thread Flattening Format

`get_post_thread_flat` returns:
```
depth:0 | alice.bsky.social (Alice) (post:abc123)
"Hello World"
  ↳ depth:1 | bob.dev → alice (post:def456)
  "Hi Alice!"
    ↳ depth:2 | carol.art → bob (post:ghi789)
    "Great post!"
```
- Max depth: 3 (configurable)
- Max siblings: 5 (excess folded with hint to `get_post_subtree`)
- Media indicators: `[图片: N 张]`, `[链接: hostname]`, `[引用: rkey]`

## System Prompts

**Main assistant** (from `contracts/system_prompts.md`):
```
你是一个深度集成 Bluesky 的终端助手。你可以通过工具调用获取最新的网络动态、用户资料和帖子上下文。
当用户提及某个帖子时，主动使用 get_post_thread_flat 和 get_post_context。
回答简练，适合终端显示，支持 Markdown（由 ink 渲染）。
```

**Translation**: `将以下文本翻译成{目标语言}，保持原意，仅输出翻译结果，不做解释。`

**Draft Polish**: `你是一个文字润色助手，根据用户要求调整以下帖子草稿，只返回润色后的文本。`
