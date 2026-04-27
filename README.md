# 🦋 Bluesky TUI Client with AI Integration

A terminal-based Bluesky client with deep AI integration, built with TypeScript, Ink (React), and AT Protocol.

## Architecture

```
bsky/
├── packages/
│   ├── core/          # API-agnostic logic: AT Protocol client, AI assistant, tools
│   └── tui/           # Terminal UI built with Ink (React)
├── contracts/         # Shared JSON Schemas, system prompts, AT endpoint lists
├── .env.example       # Environment variable template
└── README.md
```

**Core layer** exports pure functions/classes with zero UI dependencies, enabling future PWA development.

## Installation

```bash
# Prerequisites: Node.js >= 18, pnpm
npm install -g pnpm

# Clone and install
pnpm install

# Build core package
pnpm --filter @bsky/core build
```

## Configuration

Copy `.env.example` to `.env` and fill in your credentials:

```env
BLUESKY_HANDLE=your-handle.bsky.social
BLUESKY_APP_PASSWORD=your-app-password

LLM_API_KEY=sk-your-api-key
LLM_BASE_URL=https://api.deepseek.com
LLM_MODEL=deepseek-chat
```

- To get a Bluesky App Password: Settings → App Passwords → Add App Password
- For LLM: Get an API key from [DeepSeek](https://platform.deepseek.com/) or any OpenAI-compatible API

## Running

```bash
# Development mode (TUI) - requires a terminal with raw mode support
pnpm --filter @bsky/tui dev

# Note: The TUI uses Ink (React) which requires raw mode stdin.
# If you see "Raw mode is not supported", run in a proper terminal:
# - Windows: Windows Terminal, ConEmu
# - macOS: iTerm2, Terminal.app
# - Linux: GNOME Terminal, Konsole, tmux

# Run all tests
pnpm test

# Run tests with verbose output
pnpm test:e2e
```

## TUI Controls

| Key | Action |
|-----|--------|
| `t` | Timeline |
| `n` | Notifications |
| `p` | Profile |
| `s` | Search |
| `a` | Toggle AI Panel |
| `c` | Compose Post |
| `Ctrl+G` | Open AI with current post context |
| `↑/↓` | Navigate posts |
| `Enter` | Select post |
| `Esc` | Close / Back |
| `Ctrl+C` | Quit |

## AI Features

### Tool Calling
The AI assistant can autonomously use 30 Bluesky API tools:
- Read: get_timeline, search_posts, get_profile, get_post_thread_flat, etc.
- Write: create_post, like, repost, follow (with confirmation)

### Translation
- Per-post translation to Chinese
- Translation cache to reduce API usage

### Draft Polish
- Single-turn AI refinement of post drafts
- Supports style requirements (formal, humorous, etc.)

### AI Dialog Panel
- Full multi-turn chat with tool calling
- Context-aware: automatically loads post context when opened from a post
- Guiding questions for quick interaction

## Testing

```bash
# Run all tests
pnpm test

# Run specific test suite
pnpm --filter @bsky/core test

# Tests include:
# - auth.test.ts: Authentication & session management
# - feed.test.ts: Post reading, thread flattening, image handling
# - ai_integration.test.ts: AI tool calling, translation, polish
```

All tests use **real API calls** against Bluesky and DeepSeek. No mocks.

## Project Structure

```
packages/core/src/
├── at/
│   ├── client.ts    # BskyClient: AT Protocol HTTP client
│   ├── tools.ts     # 30+ tool definitions & handlers
│   └── types.ts     # TypeScript type definitions
├── ai/
│   └── assistant.ts # AIAssistant, singleTurnAI, translateToChinese, polishDraft
└── index.ts         # Public API exports

packages/tui/src/
├── cli.ts           # Entry point
└── components/
    ├── App.tsx      # Main app layout
    ├── Sidebar.tsx  # Navigation sidebar
    ├── PostList.tsx # Feed display
    ├── PostItem.tsx # Single post card
    ├── AIPanel.tsx  # AI chat panel
    └── Dialogs.tsx  # Compose & confirm dialogs
```

## Tech Stack

- **TypeScript 5.x** with strict mode
- **pnpm workspace** monorepo
- **Ink 5** (React-based TUI framework)
- **ky** (HTTP client for AT Protocol)
- **DeepSeek v3** (AI via OpenAI-compatible API)
- **Vitest** (test runner)
