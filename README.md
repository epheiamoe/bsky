# 🦋 Bluesky Client

A dual-UI (TUI + PWA) Bluesky client with deep AI integration.
Built with TypeScript, Ink (React), React DOM, and AT Protocol.

```
@bsky/core ──→ @bsky/app ──→ @bsky/tui (terminal)
                          └─→ @bsky/pwa (browser, installable)
```

---

## 🚀 Live Demo

**PWA Online**: *（即将部署到 Cloudflare Pages）*

---

## Quick Start

### Prerequisites

- **Node.js** >= 18, **pnpm** (`npm install -g pnpm`)
- TUI: terminal with raw mode support (Windows Terminal, iTerm2, Kitty)
- PWA: modern browser (Chrome/Firefox/Safari)

```bash
git clone https://github.com/epheiamoe/bsky.git
cd bsky
pnpm install
pnpm -r build
```

### TUI (Terminal)

```bash
# Copy .env.example → .env and fill in credentials
cp .env.example .env

# Run
cd packages/tui && npx tsx src/cli.ts
```

### PWA (Web)

```bash
# No .env needed — all credentials via browser login form
cd packages/pwa && pnpm dev    # http://localhost:5173
```

---

## Features

| Feature | TUI | PWA |
|---------|-----|-----|
| Timeline (virtual scroll) | ✅ | ✅ |
| Thread view (reply tree) | ✅ | ✅ |
| Compose post/reply | ✅ | ✅ |
| Image upload (max 4) | ✅ | ✅ |
| Like / Repost / Reply | ✅ | ✅ |
| Notifications | ✅ | ✅ |
| Search | ✅ | ✅ |
| Profile view | ✅ | ✅ |
| Bookmarks (built-in API) | ✅ | ✅ |
| AI Chat (tools + streaming) | ✅ | ✅ |
| AI Translation (7 languages) | ✅ | ✅ |
| AI Draft Polish | ✅ | ✅ |
| Markdown rendering | ✅ | ✅ |
| Image display (CDN) | ✅ | ✅ |
| Dark mode | N/A | ✅ |
| PWA installable | N/A | ✅ |
| Hash-based routing | N/A | ✅ |
| JWT auto-refresh | ✅ | ✅ |

---

## Configuration

### TUI — `.env` (gitignored)

```env
BLUESKY_HANDLE=user.bsky.social
BLUESKY_APP_PASSWORD=xxxx-xxxx-xxxx-xxxx
LLM_API_KEY=sk-your-api-key
LLM_BASE_URL=https://api.deepseek.com
LLM_MODEL=deepseek-chat
```

### PWA — Browser Login + Settings

- Login: Bluesky Handle + App Password → localStorage session
- AI: API Key + Base URL + Model → Settings page
- No `.env` needed; credentials never leave the browser

---

## Deploy PWA to Static Host

```bash
cd packages/pwa && pnpm build    # output → dist/
```

Upload `dist/` to any static host:

```bash
# Cloudflare Pages (Wrangler)
npx wrangler pages deploy dist

# Netlify
npx netlify deploy --dir dist --prod

# Vercel
npx vercel dist --prod

# GitHub Pages
cp -r dist /path/to/gh-pages && git push
```

---

## Tests

```bash
pnpm test           # all tests (real API, no mocks)
pnpm -r typecheck   # full TypeScript check
```

---

## Architecture

**Golden rule**: Business logic lives ONCE in `@bsky/core` + `@bsky/app`.
TUI and PWA are pure render layers consuming the same React hooks.

| Package | Role |
|---------|------|
| `@bsky/core` | AT Protocol client, AI assistant, 31 tools, types |
| `@bsky/app` | React hooks (useAuth, useTimeline, useThread, useAIChat…), stores, utilities |
| `@bsky/tui` | Terminal UI via Ink (React-on-terminal) |
| `@bsky/pwa` | Web UI via React DOM + Tailwind, installable PWA |

---

## Docs

| File | Purpose |
|------|---------|
| `docs/CONTEXT.md` | Context compression recovery guide |
| `docs/ARCHITECTURE.md` | System architecture |
| `docs/DESIGN.md` | PWA design system (colors, typography) |
| `docs/PWA_GUIDE.md` | PWA quick start + deployment |
| `docs/HOOKS.md` | All hook signatures and return types |
| `docs/KEYBOARD.md` | TUI keyboard shortcuts |
| `docs/TODO.md` | Feature roadmap |
| `docs/AI_SYSTEM.md` | AI integration: tools, streaming, translation |
| `docs/USER_ISSUSES.md` | Known & resolved user issues |
| `AGENTS.md` | AI agent / contributor guide |
| `AGENTS.local.md` | Local dev notes (gitignored) |
