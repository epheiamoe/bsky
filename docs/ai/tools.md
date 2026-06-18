# Tool System

**File**: `packages/core/src/ai/tools.ts`

## ToolDescriptor

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

## Tool Categories

**Read Tools (28)**:
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
- `ai-bsky_help` — search/retrieve help center content (action=search|get|listCategories|listByCategory)

**Sandbox Tools (1, read-only)**:
- `execute_python` — run isolated Python code in browser via Pyodide WASM (pandas/numpy/matplotlib available). Files can be uploaded to workspace for analysis. Returns stdout/stderr/output files (CSV/PNG/JSON). Lazy init on first call. See `docs/WORKSPACE.md`.

**Write Tools (6, require confirmation)**:
- `create_list` — create a list
- `edit_list_members` — add/remove list members
- `create_post` — post/reply/quote (supports `pendingImageIndex` for chat-uploaded images)
- `like` — like a post
- `repost` — repost a post
- `follow` — follow a user

## Tool Execution Flow

1. AI generates `tool_calls` in response
2. `adapter.parseResponse(raw)` extracts tool calls
3. For each tool call: `toolMap.get(toolName).handler(args)` is executed
4. Tool returns JSON string result
5. Result is added back to conversation as `tool_result` message
6. AI receives tool results and generates next response (loop until no more tool calls)

## Tool Empty-Arg Protection

Search tools include guards to prevent empty query parameters from reaching the API, which would waste tokens and return confusing errors:

### search_posts

```typescript
handler: async (p) => {
  const query = (p.q as string) || '';
  if (!query.trim()) {
    return JSON.stringify({ posts: [], total: 0, error: 'Search query is empty.' });
  }
  // ... proceed with search
}
```

### search_web_ddg

```typescript
handler: async (p) => {
  const query = ((p.query as string) || '').trim();
  if (!query) {
    return JSON.stringify({ heading: '', content: 'Search query is empty.' });
  }
  // ... proceed with search
}
```

### search_wikipedia

```typescript
handler: async (p) => {
  const query = String(p.query ?? '').trim();
  if (!query) return JSON.stringify({ error: 'Empty query.' });
  // ... proceed with search
}
```

These guards catch the empty string case early, returning a friendly JSON error message to the AI instead of making an unnecessary API call that would fail or return garbage results.

### ai-bsky_help

```typescript
handler: async (p) => {
  if (!helpProvider) {
    return JSON.stringify({ error: 'Help center is not available in this context.' });
  }
  // ... proceed with help lookup
}
```

The help tool also guards against missing `helpProvider` (e.g., when called from MCP or ToolDispatcher without injected help data).

## HelpProvider Dependency Injection

The `ai-bsky_help` tool uses **dependency injection** to bridge the core↔app layer boundary:

```
packages/core/src/ai/tools.ts   — defines HelpProvider interface + tool handler
packages/app/src/utils/helpCenter.ts — implements createHelpProvider(t) using i18n
packages/app/src/hooks/useAIChat.ts  — wires provider into createTools()
```

**Why DI?** `@bsky/core` cannot import from `@bsky/app` (dependency direction). The help center data and i18n live in `@bsky/app`. The `HelpProvider` interface lets the app layer inject translated help data into the core-layer tool.

**MCP/ToolDispatcher**: When no `helpProvider` is passed, the tool returns a graceful error. MCP and the Python sandbox dispatcher don't need help center access.

## Thread Flattening Format

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
