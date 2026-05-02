# 🦋 Bluesky Client

A dual-UI (TUI + PWA) Bluesky client with deep AI integration.
Built with TypeScript, Ink (React), React DOM, and AT Protocol.

```
@bsky/core ──→ @bsky/app ──→ @bsky/tui (terminal)
                          └─→ @bsky/pwa (browser, installable)
```

---

## Live Demo

**PWA Online**: [ai-bsky.pages.dev](https://ai-bsky.pages.dev)

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

## AI Integration

DeepSeek V4 Flash powers AI features not found in the official Bluesky client:

- **AI 对话** — Full multi-turn chat with 31 Bluesky API tools (read posts/profiles, write likes/reposts, analyze images with vision models)
- **流式输出** — TUI + PWA both use SSE streaming, real-time thinking display
- **思考模式** — Configurable reasoning content (DeepSeek V4), visible as 💭 thinking blocks
- **视觉模式** — Optional image analysis via `view_image` tool (for GPT-4V / Claude Vision / DeepSeek VL)
- **自定义 Feed** — Following / Discover / custom feed generators, `getSuggestedFeeds` recommendations
- **智能翻译** — 7 languages dual-mode (simple / JSON with source language detection)
- **Markdown 渲染** — PWA: full GFM (tables, code highlight); TUI: structured terminal rendering
- **AI 润色** — Polish post drafts with style requirements
- **写操作确认** — Prompts user confirmation before likes/reposts/posts
- **编辑消息** — Pre-fill last user input for editing (replaces retry)

---

## Features

| Feature | TUI | PWA | Notes |
|---------|:---:|:---:|-------|
| Timeline (virtual scroll) | ✅ | ✅ | Following / Discover / custom feeds |
| Custom feed switching | ✅ | ✅ | `f` key / `▾` dropdown, `getSuggestedFeeds` |
| Thread view (reply tree) | ✅ | ✅ | Expand replies, quoted post cards |
| Quoted post display | ✅ | ✅ | `│` pipe format (TUI) / clickable card (PWA) |
| Compose post/reply/quote | ✅ | ✅ | Draft save, image upload (max 4) |
| Delete own post | ✅ | ✅ | `d` key / `🗑` icon with confirmation |
| Like / Repost / Reply | ✅ | ✅ | Counts update after action, all views |
| Repost+Quote unified button | ✅ | ✅ | Popup menu: Repost / Quote |
| Unifed PostActionsRow (PWA) | N/A | ✅ | Same row in timeline/search/profile/bookmarks/thread |
| SVG icons (lucide style) | N/A | ✅ | Heart, repeat, bookmark, AI, etc. 50+ icons |
| Notifications | ✅ | ✅ | |
| Search (4 tabs) | ✅ | ✅ | Hot / Latest / Users / Feeds |
| Profile view | ✅ | ✅ | Follow/unfollow, tabs, follow lists |
| Bookmarks (built-in API) | ✅ | ✅ | |
| AI Chat (31 tools + streaming) | ✅ | ✅ | Thinking display, copy/edit by index |
| AI Session URL | N/A | ✅ | `#/ai?session=uuid` (context persisted) |
| Thinking mode | ✅ | ✅ | Configurable |
| Vision mode | ✅ | ✅ | Configurable |
| AI Translation (7 languages) | ✅ | ✅ | `f` key / icon button |
| AI Draft Polish | ✅ | ✅ | |
| Link/handle auto-coloring | ✅ | ✅ | Blue in text |
| Markdown rendering | ✅ | ✅ | PWA: react-markdown, TUI: custom parser |
| Image display (CDN) | ✅ | ✅ | Lightbox + local save |
| i18n (zh/en/ja) | ✅ | ✅ | Singleton store, instant switch |
| Dark mode | N/A | ✅ | CSS variables |
| PWA installable | N/A | ✅ | manifest.json + Service Worker |
| Hash-based routing | N/A | ✅ | `#/feed?feed=at://...`, `#/search?q=...` |
| JWT auto-refresh | ✅ | ✅ | |
| Scroll position restore | N/A | ✅ | Profile/Search/Bookmarks remember position on back |

---

## Configuration

### TUI — `.env` (gitignored)

```env
BLUESKY_HANDLE=user.bsky.social
BLUESKY_APP_PASSWORD=xxxx-xxxx-xxxx-xxxx
LLM_API_KEY=sk-your-api-key
LLM_BASE_URL=https://api.deepseek.com
LLM_MODEL=deepseek-v4-flash
LLM_THINKING_ENABLED=true
LLM_VISION_ENABLED=false
TRANSLATE_TARGET_LANG=zh
```

### PWA — Browser Login + Settings

- Login: Bluesky Handle + App Password → localStorage session
- AI: API Key + Base URL + Model + Think Mode + Vision Mode → Settings page
- Feed config: add/remove feeds, set default
- No `.env` needed; credentials never leave the browser

---

## Deploy PWA to Static Host

```bash
cd packages/pwa && pnpm build    # output → dist/
```

Upload `dist/` to any static host:

```bash
# Cloudflare Pages
npx wrangler pages deploy dist --project-name ai-bsky --commit-dirty=true

# Netlify
npx netlify deploy --dir dist --prod

# Vercel
npx vercel dist --prod
```

---

## Tests

```bash
pnpm test           # 19 tests (real API, no mocks)
pnpm -r typecheck   # full TypeScript check
```

---

## Architecture

**Golden rule**: Business logic lives ONCE in `@bsky/core` + `@bsky/app`.
TUI and PWA are pure render layers consuming the same React hooks.

| Package | Role |
|---------|------|
| `@bsky/core` | AT Protocol client, AI assistant, 31 tools, prompts, types |
| `@bsky/app` | React hooks (useAuth, useTimeline, useThread, useAIChat, usePostActions, useActiveFeed, useScrollRestore…), stores, i18n |
| `@bsky/tui` | Terminal UI via Ink (React-on-terminal) |
| `@bsky/pwa` | Web UI via React DOM + Tailwind, installable PWA, SVG icons |

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
| `CHANGELOG.md` | Version history |
| `AGENTS.md` | AI agent / contributor guide |

---
## License
[MIT](LICENSE) — Free to use, modify, and distribute.

**Version**: 0.3.0 — [Changelog](CHANGELOG.md)
