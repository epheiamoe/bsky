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

## ApiAdapter Pattern

**File**: `packages/core/src/ai/adapter.ts` (interface + ChatCompletionsAdapter)
**File**: `packages/core/src/ai/responses-adapter.ts` (ResponsesApiAdapter)

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

Two implementations:
- **ChatCompletionsAdapter**: POST `/v1/chat/completions`, `{ messages, tools, thinking, ... }`, SSE `data: {choices[0].delta}`
- **ResponsesApiAdapter**: POST `/v1/responses`, `{ input, instructions, tools, reasoning, ... }`, SSE named events (`response.output_text.delta`, `response.function_call_arguments.delta`, etc.)

## Provider Config

**File**: `packages/core/src/ai/providers.json`

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

Provider-specific features:
- `apiType`: `'chat'` | `'responses'` — selects adapter
- `reasoningStyle`: `'reasoning_content'` | `'structured_content'` | `'none'`
- `ModelInfo.fixedParams`: immutable params (Kimi: `top_p: 0.95`, `n: 1`, etc.)
- `ModelInfo.supportsReasoningEffort`: enables `reasoning: { effort }` in Responses API
- `ModelInfo.video`: reserved for future video input support (Kimi K2.6)

## Provider Metadata System

**File**: `packages/core/src/ai/providers.ts`
**File**: `packages/core/src/ai/providers.json`

### ModelInfo Interface

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

### ProviderInfo Interface

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

### Example Provider Configurations (All 7 Providers)

**DeepSeek** (Chat Completions, reasoning_content):
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

**Mistral** (Chat Completions, structured_content):
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

**OpenAI** (Responses API):
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

**xAI Grok** (Responses API):
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

**Kimi Moonshot (CN)** (Chat Completions, reasoning_content):
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

**Kimi Moonshot (Overseas)** (Chat Completions, reasoning_content):
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

**OpenRouter** (Chat Completions, custom models):
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

### fixedParams Behavior

`fixedParams` are immutable model-specific parameters that override any user or default settings. They are applied in `ChatCompletionsAdapter.buildRequest()` after the base body is constructed:

```typescript
if (modelInfo?.fixedParams) {
  for (const [key, val] of Object.entries(modelInfo.fixedParams)) {
    body[key] = val;
  }
}
```

**Kimi Example**: Both K2.6 and K2.5 enforce:
- `top_p: 0.95` — nucleus sampling threshold
- `n: 1` — single completion (no variants)
- `presence_penalty: 0` — no repetition penalty
- `frequency_penalty: 0` — no frequency penalty

These values cannot be overridden by temperature or other config settings. The `fixedParams` mechanism ensures provider-mandated constraints are always respected.

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

## Reasoning Effort

**File**: `packages/core/src/ai/responses-adapter.ts`
**File**: `packages/core/src/ai/adapter.ts`

### What is Reasoning Effort?

Reasoning effort controls how much computational work a model spends on internal reasoning before generating a response. It maps to four levels:

| Level | Description |
|-------|-------------|
| `none` | No explicit reasoning — fastest, lowest cost |
| `low` | Minimal reasoning chain |
| `medium` | Balanced reasoning (default) |
| `high` | Maximum reasoning depth — most thorough, slowest |

### API Mapping

**Responses API** (OpenAI, xAI):
```typescript
body.reasoning = { effort: config.reasoningEffort || 'medium' };
```

Only sent when `modelInfo.supportsReasoningEffort === true`.

**Chat Completions** (DeepSeek, Kimi):
```typescript
body.thinking = { type: config.thinkingEnabled !== false ? 'enabled' : 'disabled' };
```

For DeepSeek and Kimi models, reasoning is binary (enabled/disabled) rather than graded. Kimi additionally varies temperature based on thinking mode:
- Thinking enabled: `temperature: 1.0`
- Thinking disabled: `temperature: 0.6`

**Mistral** (structured content reasoning):
```typescript
body.reasoning_effort = 'high';
```

Only applied when `reasoningStyle === 'structured_content'` and `thinkingEnabled !== false`.

### Supported Models

| Provider | Models with Reasoning | API Style |
|----------|----------------------|-----------|
| OpenAI | gpt-5.5, gpt-5.4, gpt-5.4-mini | Responses API — `reasoning: { effort }` |
| xAI | grok-4.3, grok-4.1-reasoning | Responses API — `reasoning: { effort }` |
| DeepSeek | deepseek-v4-flash, deepseek-v4-pro | Chat — `thinking: { type }` |
| Kimi | kimi-k2.6, kimi-k2.5 | Chat — `thinking: { type }` + temp override |
| Mistral | mistral-small-latest | Chat — `reasoning_effort: 'high'` |

### Default Values

- `reasoningEffort`: `'medium'` (when model supports it and user hasn't specified)
- `thinkingEnabled`: derived from `ModelInfo.thinking` for known models; defaults to `false` for unknown models

### Polish Draft (wired to UI)

The `polishDraft()` function is accessible via:
- **PWA**: Polish Widget in right component panel (compose view `lg+`) or via 润色 button (small screens).
  Targets first non-empty post in multi-post threads (not hardcoded post[0]).
  The widget calls `polishDraft(config, draft, requirement)` and provides copy/results, replace buttons.
- **TUI**: Press `f` in compose text mode → polish requirement input → AI polish call → show result with [R] Replace / [C] Copy / [Esc] dismiss.
  Uses `resolveScenarioConfig(config.scenarioModels.polish)` for per-scenario model config.
  Targets the currently active post (via Tab cycling) in multi-post threads.

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

### SSE Parser (Chat Completions)

The stream body uses SSE format (`data: ` prefixed lines), parsed manually from the `fetch` response reader. Each line prefixed with `data: ` is a JSON object matching the OpenAI-compatible streaming format (`choices[0].delta`).

```
data: {"id":"...","object":"chat.completion.chunk","choices":[{"index":0,"delta":{"content":"Hello"}}]}
data: [DONE]
```

### SSE Parser (Responses API)

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

## SSE Format Differences

**File**: `packages/core/src/ai/adapter.ts`
**File**: `packages/core/src/ai/responses-adapter.ts`

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

### xAI Grok Streaming Format

**File**: `packages/core/src/ai/responses-adapter.ts`

xAI's Grok implementation of the Responses API has several format quirks that differ from OpenAI's implementation:

#### Event Format Uses `item_id` (Not `call_id`)

Unlike OpenAI which uses `call_id` in function call events, xAI uses `item_id` as the accumulation key:

```
event: response.function_call_arguments.delta
data: {"delta":"{\"q\":\"test\"}","item_id":"fc_abc123","type":"response.function_call_arguments.delta"}
```

The stream processor uses `parsed.item_id` (not `parsed.call_id`) as the map key for accumulating arguments.

#### Reasoning Events Use `response.reasoning_summary_text.delta`

xAI reasoning events use a dot-separated event name (not underscore):

```
event: response.reasoning_summary_text.delta
data: {"delta":"Analyzing the query...","type":"response.reasoning_summary_text.delta"}
```

The parser matches against `eventType === 'response.reasoning_summary_text.delta'`.

#### Tool Call Argument Accumulation Uses `item.id`

When a function call item is first added via `response.output_item.added`, xAI provides an `item.id` field that serves as the accumulation key:

```typescript
if (item.type === 'function_call') {
  const itemId = item.id || crypto.randomUUID();
  if (!this.toolCallAccum.has(itemId)) {
    this.toolCallAccum.set(itemId, {
      id: item.call_id || itemId,  // call_id for final identification
      callId: item.call_id || '',
      name: item.name || '',
      arguments: item.arguments || '',
    });
    this.itemIdOrder.push(itemId);
  }
}
```

#### Example Event Sequence

A typical xAI Grok streaming response looks like:

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

## Tool System

**File**: `packages/core/src/ai/tools.ts`

### ToolDescriptor

```typescript
interface ToolDescriptor {
  definition: {
    name: string;
    description: string;
    inputSchema: { type: 'object'; properties: Record<string, { type: string; description: string }>; required: string[] };
  };
  handler: (params: Record<string, unknown>) => Promise<string>;  // Returns JSON string
  requiresWrite: boolean;   // true for create_post, like, repost, follow
}
```

### All 33 Tools

**Read Tools (27)**:
- `resolve_handle` — resolve handle → DID
- `get_record` — get raw AT record
- `list_records` — list repo collection records
- `search_posts` — search Bluesky posts
- `get_timeline` — home timeline
- `get_author_feed` — user's posts
- `get_popular_feed_generators` — trending feeds
- `get_feed_generator` — feed generator details
- `get_feed` — feed content
- `get_post_thread` — thread tree (format=flat|tree|subtree)
- `get_post_context` — full context: thread + media + text
- `get_post_interactions` — who liked/reposted a post
- `get_quotes` — posts quoting a specific post
- `search_actors` — search users
- `get_profile` — user profile
- `get_connections` — social graph (direction=following|followers)
- `get_suggested_follows` — suggested follows
- `list_notifications` — notifications
- `extract_images_from_post` — extract blob refs (did+cid)
- `download_image` — download blob (TUI saves to disk, PWA returns data URL)
- `view_image` — download + convert to base64 for vision model
- `extract_external_link` — extract link embed
- `fetch_web_markdown` — fetch external URL as markdown via r.jina.ai proxy
- `search_web_ddg` — web search via jina.ai → DDG Lite (no API key)
- `search_wikipedia` — Wikipedia page summary
- `get_lists` — user's lists
- `get_list_feed` — posts from list members

**Write Tools (6, require confirmation)**:
- `create_list` — create a list
- `edit_list_members` — add/remove list members
- `create_post` — post/reply/quote (supports `pendingImageIndex` for chat-uploaded images)
- `like` — like a post
- `repost` — repost a post
- `follow` — follow a user

### Tool Empty-Arg Protection

Search tools include guards to prevent empty query parameters from reaching the API, which would waste tokens and return confusing errors:

**search_posts**:
```typescript
handler: async (p) => {
  const query = (p.q as string) || '';
  if (!query.trim()) {
    return JSON.stringify({ posts: [], total: 0, error: 'Search query is empty.' });
  }
  // ... proceed with search
}
```

**search_web_ddg**:
```typescript
handler: async (p) => {
  const query = ((p.query as string) || '').trim();
  if (!query) {
    return JSON.stringify({ heading: '', content: 'Search query is empty.' });
  }
  // ... proceed with search
}
```

**search_wikipedia**:
```typescript
handler: async (p) => {
  const query = String(p.query ?? '').trim();
  if (!query) return JSON.stringify({ error: 'Empty query.' });
  // ... proceed with search
}
```

These guards catch the empty string case early, returning a friendly JSON error message to the AI instead of making an unnecessary API call that would fail or return garbage results.

### Thread Flattening Format

`get_post_thread` with `format=flat` returns:
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

**Main assistant** (from `packages/core/src/ai/prompts.ts`):
```
你是用户的 Bluesky 助手，帮助用户浏览和分析 Bluesky 上的内容。
可以通过工具调用获取最新的网络动态、用户资料和帖子上下文。
【重要规则】绝对不要主动代表用户发帖、回复、点赞、转发或关注任何人。
所有写操作必须由用户明确要求后才执行。
```
All prompts are centralized in `packages/core/src/ai/prompts.ts` — edit this file to customize AI behavior.
