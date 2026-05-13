# MCP Server — Implementation Record

> **Package**: `@epheiamoe/bsky-mcp` (npm) / `packages/mcp` (monorepo)  
> **Version**: 0.1.1  
> **Status**: Published, tested, operational

---

## Motivation

External AI clients (Claude Desktop, ChatGPT, VS Code, Cursor, Windsurf, OpenCode) support MCP for connecting to third-party tools. ai-bsky had 33 tools locked inside the built-in AI chat. Exporting them as an MCP server makes them available to any MCP-compatible AI client.

---

## Architecture

```
@bsky/core (BskyClient + 33 tools)
    └── @epheiamoe/bsky-mcp (MCP stdio server)
            └── External MCP clients (Claude Desktop, OpenCode, etc.)
```

### Dependency strategy

- `@bsky/mcp` depends on `@bsky/core` at **dev time** only (`devDependencies: workspace:*`)
- At **build time**, esbuild bundles `@bsky/core` + `@bsky/ddg-search` into a single 96 KB output
- At **runtime**, only 3 npm packages are needed: `@modelcontextprotocol/sdk`, `dotenv`, `ky`
- This eliminates the need to publish `@bsky/core` to npm separately

### Build pipeline

```
src/*.ts → tsc --noEmit (typecheck only)
        → esbuild (bundle + minify)
           ├── bundle: @bsky/core + @bsky/ddg-search
           ├── external: @modelcontextprotocol/sdk, dotenv, ky
           └── output: dist/index.js (96 KB, self-contained)
```

---

## Implementation Details

### Tool mapping

```typescript
createTools(client: BskyClient) → ToolDescriptor[] (33 tools)
  → filter by BSKY_ENABLE_WRITE gate
  → map to MCP tool schema (name, description, inputSchema)
  → register via Server.setRequestHandler(ListToolsRequestSchema)
  → dispatch via Server.setRequestHandler(CallToolRequestSchema)
```

### Handler adapter

```typescript
// Internal handler: (params, assistant?) → Promise<string>
// MCP handler:       (args) → Promise<CallToolResult>
async function callTool(name, args, descriptors, client, enableWrite) {
  const tool = descriptors.find(d => d.definition.name === name);
  const jsonText = await tool.handler(args, undefined); // no assistant
  return { content: [{ type: 'text', text: jsonText }] };
}
```

### Write gating

- 6 write tools (`create_post`, `like`, `repost`, `follow`, `create_list`, `edit_list_members`) hidden by default
- `BSKY_ENABLE_WRITE=true` env var exposes them
- Description prefixed with `[WRITE]` when enabled
- Call-time double-check: `tool.requiresWrite && !enableWrite → error`

### Environment variables

| Variable | Required | Purpose |
|----------|:--------:|---------|
| `BSKY_HANDLE` | Yes | Bluesky handle |
| `BSKY_APP_PASSWORD` | Yes | Bluesky App Password |
| `BSKY_PDS` | No | Custom PDS URL (default: bsky.social) |
| `BSKY_ENABLE_WRITE` | No | `"true"` to expose write tools |

---

## OpenCode Integration

### The `{env:...}` problem

OpenCode supports `{env:VAR}` references in config to pass env vars to MCP subprocesses. However:
- `.env` files are **not** automatically loaded into the process environment
- `$env:VAR = value` in PowerShell does **not** persist across `bash` tool calls (each call is a fresh process)
- Result: MCP server started with empty `BSKY_HANDLE` → login failure

### Solution: Launcher script

`scripts/start-mcp.mjs` — loads `.env` before spawning the MCP server:

```
opencode.jsonc
  └─ "command": ["node", "scripts/start-mcp.mjs"]
       ├─ Reads .env → maps BLUESKY_HANDLE → BSKY_HANDLE
       └─ spawns npx @epheiamoe/bsky-mcp with stdio inherit
```

OpenCode config (`opencode.jsonc`):
```jsonc
{
  "$schema": "https://opencode.ai/config.json",
  "mcp": {
    "bsky": {
      "type": "local",
      "command": ["node", "scripts/start-mcp.mjs"],
      "enabled": true
    }
  }
}
```

This approach is simpler than the `{env:VAR}` method because:
- No system env vars needed
- Works cross-platform (Windows/Linux/macOS)
- `.env` is the single source of truth for credentials

---

## Test Results

Tested in OpenCode with real Bluesky credentials. All categories verified:

| Tool | Category | Status |
|------|----------|:------:|
| `get_profile` | Profile | ✓ |
| `resolve_handle` | Identity | ✓ |
| `get_timeline` | Timeline | ✓ |
| `list_notifications` | Notifications | ✓ |
| `get_lists` | Lists | ✓ |
| `get_post_context` | Threads | ✓ |
| `search_web_ddg` | Web (0 keys) | ✓ |
| `search_wikipedia` | Knowledge (0 keys) | ✓ |

---

## Limitations & Design Decisions

### Image upload (assistant-less)
`view_image` and `create_post` use `assistant.getUserUpload(index)` for chat-uploaded images. In MCP context, `assistant` is `undefined`. DID/CID paths (Bluesky post images) work normally. The `uploadIndex` path returns an error.

### Pagination
Tools with `cursor` return the cursor in the response. The client LLM decides whether to fetch the next page.

### No interactive confirmation
MCP has no native confirmation dialog. Write tools are gated by `BSKY_ENABLE_WRITE` only. No per-action confirmation.

### bin removal warning
On Windows, `npm publish` emits `"bin[bsky-mcp]" script name dist/index.js was invalid and removed` but the published package **does** contain the correct bin entry. This is a cosmetic warning.

### Workspace dependency handling
`@bsky/core` uses `workspace:*` protocol (pnpm-only). Publishing directly would fail for end users. Solution: esbuild bundles workspace deps into dist, leaving only npm-registry packages as runtime dependencies.

---

## Lessons

1. **`{env:VAR}` in OpenCode config reads process env, not `.env`** — requires launcher script or system env vars
2. **Bash tool calls are fresh processes** — env vars set in one call don't carry to the next
3. **`npm publish` removes bin on Windows but publishes correctly** — cosmetic only, registry has bin intact
4. **`workspace:*` can't go to npm** — must be bundled or published separately
5. **`spawn(npx, ...)` needs `shell: true` on Windows** — npx is a .cmd script, not a native binary
6. **esbuild bundling is simpler than multi-package publishing** — single 96 KB file, no dependency chain

---

## Future Work

- [ ] v0.2.0: MCP resource support (expose feeds/lists as resources)
- [ ] v0.2.0: MCP sampling for write confirmation (two-phase)
- [ ] v0.2.0: Auto-pagination for large result sets
- [ ] v0.3.0: Multi-account support
- [ ] List on Smithery / MCP Hub directories

---

*Last updated: 2026-05-13*
