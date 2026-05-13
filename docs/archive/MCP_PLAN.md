# MCP Server — Bluesky Tools for External AI Clients

> **Status**: Planning (v0.13.x target)  
> **Package**: `@bsky/mcp` (new)  
> **Protocol**: [Model Context Protocol (MCP)](https://modelcontextprotocol.io/)

---

## Motivation

ai-bsky currently has **33 AI tools** for Bluesky operations — search, timeline, profiles, lists, threads, notifications, web search, image analysis, full write CRUD with confirmation gates. But they're only accessible through the built-in AI chat in TUI and PWA.

**This matters**: external AI clients (ChatGPT, Claude Desktop, VS Code, Cursor, Windsurf) are increasingly supporting MCP as a standard for connecting to third-party tools. The existing Bluesky MCP servers are basic (~18 tools, mostly read-only). We can ship the most complete Bluesky MCP server in existence.

### Use Cases

| Client | How it works | Example |
|--------|-------------|---------|
| **ChatGPT** (Developer Mode) | User adds MCP server URL → ChatGPT discovers and calls tools | "Check what my friends posted this week on Bluesky" |
| **Claude Desktop** | `claude_desktop_config.json` → MCP server process | "Summarize the discussion on bsky about AI regulation" |
| **VS Code / Cursor / Windsurf** | IDE extension (MCP client) | "Analyze my Bluesky notifications and suggest replies" |
| **Any MCP-compatible client** | Protocol standardized by Anthropic | Natural-language Bluesky client through any LLM |

### Competitive landscape

| MCP Server | Tools | Write ops | Image/Web | Lists | Threads | Threadgate |
|------------|-------|-----------|-----------|-------|---------|------------|
| bsky-mcp-server (brianellin) | ~18 | Basic | No | Read-only | Basic | No |
| atproto-mcp | ~12 | No | No | No | No | No |
| **@bsky/mcp (planned)** | **33** | Full + confirm | Yes | Full CRUD | 3 formats | Yes |

---

## Architecture: Relationship to Existing Packages

```
@bsky/core (business logic: BskyClient, 33 tools, AIAssistant, types)
    │
    ├── @bsky/app (hooks, stores, i18n)
    │       ├── @bsky/tui (Ink terminal UI)
    │       └── @bsky/pwa (React DOM PWA)
    │
    └── @bsky/mcp (MCP stdio server) ◀── NEW
            └── External MCP clients (ChatGPT, Claude, VS Code, etc.)
```

**Key design decision**: `@bsky/mcp` depends directly on `@bsky/core`, NOT on `@bsky/app`. 

- `@bsky/app` provides React hooks, pure stores, i18n — all UI-layer concerns irrelevant to a headless MCP server
- `@bsky/core` provides `BskyClient` (API), `createTools()` (tool definitions + handlers), `AIConfig`, `ChatMessage` — exactly what the MCP server needs
- This keeps the MCP server zero-UI, zero-React, pure Node.js
- No dependency on hooks, no dependency on PWA/TUI

### What flows through @bsky/core

```
@bsky/core exports:
  BskyClient          ← MCP uses this for API operations
  createTools(client) ← MCP calls this to get tool definitions + handlers
  ChatMessage, AIConfig, ToolCall  ← types
  AIAssistant         ← optional: MCP could wrap this or go direct
```

The MCP server:
1. Takes Bluesky credentials + AI provider config from env
2. Calls `createTools(client)` → gets 33 tool definitions (name, description, inputSchema) + handlers
3. Converts each tool definition into MCP tool schema
4. On tool invocation, calls the handler → formats result → returns to MCP client

### What does NOT flow through @bsky/core

- i18n strings (lives in `@bsky/app`)
- React hooks / state management
- UI rendering
- Virtual scroll / mouse / keyboard handling

The MCP server may need minimal i18n for tool descriptions, but can start with English only (or inline simple translations).

---

## Implementation Plan

### Phase 1: Minimal Viable MCP Server (MVP)

**Package**: `packages/mcp`

**Dependencies**:
- `@bsky/core` (workspace)
- `@modelcontextprotocol/sdk` (npm)
- `dotenv` or manual env parsing

**Main requirements**:
- stdio transport (MCP standard)
- Reads credentials from env: `BSKY_HANDLE`, `BSKY_APP_PASSWORD`, `BSKY_PDS` (optional)
- Reads AI provider config from env (optional — only needed if MCP client doesn't supply its own):
  - `LLM_API_KEY`, `LLM_BASE_URL`, `LLM_MODEL`, `LLM_PROVIDER`
- Initializes `BskyClient`, logs in, creates tools via `createTools(client)`
- Exposes all 33 tools as MCP tools
- Tool schemas auto-generated from `ToolDefinition` (name, description, inputSchema)
- Write operations (like, repost, follow, create_post, edit_list_members) include a descriptive warning in their output — since MCP clients typically don't support interactive confirmation dialogs, the responsibility shifts to the MCP client or user

**Tool mapping**:
```typescript
// In @bsky/core: export ToolDefinition { name, description, inputSchema }
// In @bsky/mcp: convert to MCP Tool schema
function toMcpTool(tool: ToolDefinition): McpTool {
  return {
    name: tool.name,
    description: tool.description,
    inputSchema: tool.inputSchema, // JSON Schema, directly compatible
  };
}
```

**Handler wrapper**:
```typescript
async function handleToolCall(name: string, args: Record<string, unknown>) {
  const tool = tools.find(t => t.name === name);
  if (!tool) throw new Error(`Unknown tool: ${name}`);
  const result = await tool.handler(args, bskyClient);
  return formatAsMarkdown(result); // or raw JSON
}
```

### Phase 2: Auth & Session Management

- Multi-account support through MCP server restart with different env
- Session persistence (JWT refresh auto-handled by `BskyClient`)
- Graceful error handling: expired session → clear error message (not crash)

### Phase 3: Confirmation for Write Operations

MCP protocol doesn't have a native confirmation dialog mechanism. Options:

1. **Partial write opt-in** (MVP): Expose only read tools by default. Write tools require explicit env flag `BSKY_ENABLE_WRITE=true`.
2. **Descriptive warnings**: Write tool responses include `[WRITE]` prefix and a reminder that confirmation was not requested. User sees this in the MCP client.
3. **Two-phase confirmation** (future): Use MCP sampling to request confirmation from the client LLM. If the client LLM confirms, proceed; otherwise abort.

### Phase 4: Polishing & Distribution

- **README** with setup instructions for ChatGPT, Claude Desktop, VS Code
- **npm publish** to npm registry
- **Smithery** or **MCP Hub** listing
- **Environment variable validation** with clear error messages
- **Graceful degradation** when AI provider is not configured (server still works, just reports "AI features unavailable")

### Phase 5: AI Chat Bridge (Optional)

Optionally expose the `AIAssistant` class as an MCP resource — allowing the external LLM to use the internal AI chat engine for reasoning about Bluesky data. This would make the MCP server a full Bluesky AI proxy.

---

## Tool Categories for MCP Exposure

All 33 tools from `packages/core/src/ai/tools.ts`. Grouped for documentation:

### Read (`isReadOnly: true`, no confirmation needed)

| Category | Count | Tools |
|----------|-------|-------|
| **Profile & Identity** | 4 | `resolve_handle`, `get_profile`, `search_actors`, `get_suggested_follows` |
| **Social Graph** | 1 | `get_connections` |
| **Timeline & Feed** | 4 | `get_timeline`, `get_author_feed`, `get_feed`, `get_popular_feeds` |
| **Thread & Context** | 2 | `get_post_thread`, `get_post_context` |
| **Post Discovery** | 2 | `search_posts`, `get_post_interactions` |
| **Lists** | 2 | `get_lists`, `get_list_feed` |
| **Notifications** | 1 | `get_notifications` |
| **Images & Media** | 2 | `extract_images_from_post`, `view_image` |
| **Web & Knowledge** | 2 | `search_web_ddg`, `fetch_web_markdown` |
| **Links** | 1 | `extract_links_from_post` |
| **Records** | 2 | `get_record`, `list_records` |
| | **21** | |

### Write (`isReadOnly: false`, confirmation gated)

| Category | Count | Tools |
|----------|-------|-------|
| **Posts** | 5 | `create_post`, `reply_to_post`, `quote_post`, `like`, `repost` |
| **Social** | 1 | `follow` |
| **Lists** | 2 | `create_list`, `edit_list_members` |
| **Images** | 1 | `download_image` |
| | **9** | |

(3 tools pending categorization: internal/utility tools that may not need MCP exposure)

---

## Configuration

### Minimal `.env`

```bash
# Required
BSKY_HANDLE=your-handle.bsky.social
BSKY_APP_PASSWORD=xxxx-xxxx-xxxx-xxxx

# Optional (for PDS users)
BSKY_PDS=https://your-pds.example.com

# Optional (for write operations — omit to be read-only)
BSKY_ENABLE_WRITE=true
```

### MCP Client Configuration

**Claude Desktop** (`claude_desktop_config.json`):
```json
{
  "mcpServers": {
    "bsky": {
      "command": "npx",
      "args": ["@bsky/mcp"],
      "env": {
        "BSKY_HANDLE": "your-handle.bsky.social",
        "BSKY_APP_PASSWORD": "xxxx-xxxx-xxxx-xxxx"
      }
    }
  }
}
```

**ChatGPT** (Developer Mode): Add MCP server via URL or local process.

**VS Code** / **Cursor**: GitHub Copilot MCP extension → add bsky server.

---

## Implementation Order

| Step | Package | Effort | Description |
|------|---------|--------|-------------|
| 1 | `packages/mcp` | 🟢 Small | Package scaffolding: `package.json`, `tsconfig.json`, `pnpm-workspace` entry |
| 2 | `packages/mcp` | 🟢 Small | MCP stdio transport setup with `@modelcontextprotocol/sdk` |
| 3 | `packages/mcp` | 🟡 Medium | Tool schema mapping: `ToolDefinition[]` → MCP `tools/list` |
| 4 | `packages/mcp` | 🟡 Medium | Tool handler: `BskyClient` init + auth → dispatch to `createTools()` handlers |
| 5 | `packages/mcp` | 🟢 Small | Env config parsing + validation |
| 6 | `packages/mcp` | 🟡 Medium | Write operation gating (`BSKY_ENABLE_WRITE` env flag) |
| 7 | `packages/mcp` | 🟢 Small | `bin` entry, `npx @bsky/mcp` CLI |
| 8 | `packages/mcp` | 🟢 Small | README with setup instructions for 3+ clients |
| 9 | `packages/mcp` | 🟢 Small | CI / npm publish |

---

## Open Questions

1. **Tool schema compatibility**: Are any `ToolDefinition.inputSchema` fields incompatible with MCP's JSON Schema subset? (MCP uses standard JSON Schema, should be fine.)

2. **Tool confirmation UX**: Can MCP sampling be used for two-phase write confirmation? Or should we enforce `BSKY_ENABLE_WRITE` flag only?

3. **Image handling**: MCP supports `image` content blocks. Should tool results include image URLs as embedded images? Or keep them as text URLs?

4. **Rate limiting**: Should the MCP server implement Bluesky rate limit awareness? Or leave it to the MCP client to handle errors?

5. **Pagination**: Tools with `cursor` parameters — should the MCP server auto-paginate for large results, or leave it to the client LLM?

6. **AI chat integration**: Should `@bsky/mcp` optionally support the AI chat flow (i.e., be a Bluesky agent, not just a tool server)? Phase 5 considers this.

7. **Should TUI/PWA be MCP clients themselves?** Currently they have their own built-in AI chat. An MCP bridge would allow swapping the AI backend seamlessly. But this is a separate architectural decision.

---

## Relationship Summary

```
                    @bsky/mcp              @bsky/tui / @bsky/pwa
                    ─────────              ─────────────────────
User interacts via  ChatGPT, Claude, etc.  Terminal / Browser
AI engine           External LLM           Built-in AIAssistant
Tools               33 (same)              33 (same)
Business logic      @bsky/core             @bsky/core
UI layer            None (headless)        Ink (TUI) / React (PWA)
Auth                Env vars               Env vars / Login form
Session             BskyClient             BskyClient (same)
Deployment          npx / npm / npm          pnpm build + wrangler
```

MCP is **not a replacement** for TUI/PWA. It's a **bridge** that extends ai-bsky's tool ecosystem to the broader MCP-compatible AI world. The same 33 tools, the same business logic, the same BskyClient — just consumed through a different channel.

---

*Plan written 2026-05-12 for v0.13.x target. Will be updated as implementation progresses.*
