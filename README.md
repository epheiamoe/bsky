# 🦋 Bluesky Client

A dual-UI (TUI + PWA) Bluesky client with deep AI integration. Built with TypeScript, Ink (React), React DOM, and AT Protocol.

```
@bsky/core ──→ @bsky/app ──→ @bsky/tui (terminal)
                          └─→ @bsky/pwa (browser, installable)
```

## Quick Start

```bash
pnpm install
pnpm -r build

# Terminal UI
cd packages/tui && npx tsx src/cli.ts

# Web PWA
cd packages/pwa && pnpm dev        # http://localhost:5173
cd packages/pwa && pnpm build      # static deploy → dist/
```

## Features

| Feature | TUI | PWA |
|---------|-----|-----|
| Timeline with virtual scroll | ✅ | ✅ |
| Thread view with reply tree | ✅ | ✅ |
| Compose with image upload | ✅ | ✅ |
| Like / Repost / Reply | ✅ | ✅ |
| Notifications | ✅ | ✅ |
| Search | ✅ | ✅ |
| Profile view | ✅ | ✅ |
| Bookmarks | ✅ | ✅ |
| AI Chat (tool calling, streaming) | ✅ | ✅ |
| AI Translation (7 languages) | ✅ | ✅ |
| Markdown rendering | ✅ | ✅ |
| Image display (CDN) | ✅ | ✅ |
| Dark mode | N/A | ✅ |
| PWA installable | N/A | ✅ |
| Hash-based routing | N/A | ✅ |

## Architecture

See `docs/ARCHITECTURE.md` for full details. Key principle: **business logic lives ONCE** in `@bsky/core` + `@bsky/app`. TUI and PWA are pure render layers consuming the same hooks.

## Configuration

**TUI**: Copy `.env.example` to `.env` and fill in credentials:
```env
BLUESKY_HANDLE=user.bsky.social
BLUESKY_APP_PASSWORD=xxxx-xxxx-xxxx-xxxx
LLM_API_KEY=sk-...
```

**PWA**: No `.env` needed. Credentials entered via browser login form. AI API key configured in Settings.

## Tests

```bash
pnpm test     # all tests (real API calls, no mocks)
```

## Docs

| File | Purpose |
|------|---------|
| `docs/CONTEXT.md` | Context compression recovery guide |
| `docs/ARCHITECTURE.md` | System architecture |
| `docs/DESIGN.md` | PWA design system |
| `docs/PWA_GUIDE.md` | PWA quick start + deployment |
| `docs/TODO.md` | Feature roadmap |
| `docs/KEYBOARD.md` | TUI shortcuts |
| `AGENTS.md` | AI agent / contributor guide |
| `AGENTS.local.md` | Local dev notes (gitignored) |
