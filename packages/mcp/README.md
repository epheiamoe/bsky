# @epheiamoe/bsky-mcp

**MCP server for Bluesky AT Protocol** — 33 tools that let any MCP-compatible AI client (Claude Desktop, ChatGPT, VS Code, Cursor, Windsurf, OpenCode) interact with Bluesky.

> Source: [github.com/epheiamoe/bsky](https://github.com/epheiamoe/bsky) · Zero UI · Pure Node.js stdio transport

---

## Install

```bash
npm install -g @epheiamoe/bsky-mcp
# or
npx @epheiamoe/bsky-mcp
```

---

## Setup

### 1. Get a Bluesky App Password

Go to [Settings > App Passwords](https://bsky.app/settings/app-passwords) and create one.

### 2. Configure your MCP client

Pick your client below. All configs follow the same pattern: pass `BSKY_HANDLE` and `BSKY_APP_PASSWORD` as environment variables.

#### OpenCode

Add to your `opencode.json` or `opencode.jsonc`:

```jsonc
{
  "$schema": "https://opencode.ai/config.json",
  "mcp": {
    "bsky": {
      "type": "local",
      "command": ["npx", "-y", "@epheiamoe/bsky-mcp"],
      "enabled": true,
      "environment": {
        "BSKY_HANDLE": "your-handle.bsky.social",
        "BSKY_APP_PASSWORD": "xxxx-xxxx-xxxx-xxxx",
        "BSKY_ENABLE_WRITE": "true"
      }
    }
  }
}
```

> **Tip:** If you're developing in the [ai-bsky](https://github.com/epheiamoe/bsky) repository, the included `opencode.jsonc` already configures this for you via `scripts/start-mcp.mjs` (auto-loads `.env`).

#### Claude Desktop

Edit `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "bsky": {
      "command": "npx",
      "args": ["@epheiamoe/bsky-mcp"],
      "env": {
        "BSKY_HANDLE": "your-handle.bsky.social",
        "BSKY_APP_PASSWORD": "xxxx-xxxx-xxxx-xxxx",
        "BSKY_ENABLE_WRITE": "true"
      }
    }
  }
}
```

Config locations:
- **macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Windows**: `%APPDATA%\Claude\claude_desktop_config.json`
- **Linux**: `~/.config/Claude/claude_desktop_config.json`

#### VS Code / Cursor / Windsurf

Install the MCP extension for your editor, then add the server configuration referencing `npx @epheiamoe/bsky-mcp`.

---

## Configuration

| Variable | Required | Default | Description |
|----------|:--------:|---------|-------------|
| `BSKY_HANDLE` | Yes | — | Your Bluesky handle (e.g. `alice.bsky.social`) |
| `BSKY_APP_PASSWORD` | Yes | — | Bluesky App Password |
| `BSKY_PDS` | No | `https://bsky.social` | Custom PDS URL |
| `BSKY_ENABLE_WRITE` | No | `false` | Set to `"true"` to enable write tools |

---

## Tools

### Read (27 tools — always available)

| Category | Tools |
|----------|-------|
| **Profile & Identity** | `resolve_handle`, `get_profile`, `search_actors`, `get_suggested_follows` |
| **Social Graph** | `get_connections` |
| **Timeline & Feed** | `get_timeline`, `get_author_feed`, `get_feed`, `get_popular_feed_generators` |
| **Thread & Context** | `get_post_thread`, `get_post_context` |
| **Post Discovery** | `search_posts`, `get_post_interactions`, `get_quotes` |
| **Lists** | `get_lists`, `get_list_feed` |
| **Notifications** | `list_notifications` |
| **Images & Media** | `extract_images_from_post`, `download_image`, `view_image` |
| **Web & Knowledge** | `search_web_ddg`, `search_wikipedia`, `fetch_web_markdown` |
| **Links** | `extract_external_link` |
| **Records** | `get_record`, `list_records` |

### Write (6 tools — requires `BSKY_ENABLE_WRITE=true`)

| Tool | Description |
|------|-------------|
| `create_post` | Create a post, reply, or quote with images and threadgate |
| `like` | Like a post |
| `repost` | Repost a post |
| `follow` | Follow a user |
| `create_list` | Create a new user list |
| `edit_list_members` | Add or remove a user from a list |

---

## Limitations

- **Image upload**: `create_post` and `view_image` support images by DID/CID (from Bluesky posts). The `uploadIndex` / `pendingImageIndex` path (user-uploaded images) is not available in MCP context.
- **Pagination**: Tools with `cursor` parameters return a cursor for the next page. The client LLM decides whether to paginate.
- **Write safety**: Write tools are hidden by default. Set `BSKY_ENABLE_WRITE=true` to expose them.

---

## License

[MIT](https://github.com/epheiamoe/bsky/blob/master/LICENSE)
