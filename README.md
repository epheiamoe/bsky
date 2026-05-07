# 🦋 Bluesky Client

**A dual-UI Bluesky client with AI superpowers.**
Terminal + Browser, one codebase, zero backends.

<div align="center">

[**Live Demo**](https://ai-bsky.pages.dev) · [Features](#-what-it-can-do) · [Quick Start](#-quick-start) · [Docs](#-docs)

</div>

---

## Why Bluesky Client?

### 📱 Two Interfaces, One Core

TUI (terminal) for keyboard warriors. PWA (browser) for everyone else. Same hooks, same business logic, zero duplication. Switch freely — your data follows.

### 🤖 AI That Actually Does Things

Not just chat — 36 tools bridging AI to AT Protocol. Analyze threads, manage lists, polish drafts, translate posts. Streaming with real-time thinking display. Confirmation gates on all write operations.

### 🔒 Privacy-First, Zero Backend

Static HTML. No server. Your Bluesky credentials never leave your browser. PWA installable with offline support. TUI runs entirely on your machine.

---

## ✨ What It Can Do

| Category | Features |
|----------|----------|
| **Feed** | Following / Discover / custom feed generators, virtual scroll, scroll position restore |
| **Threads** | Full reply trees, quoted post cards, expand/collapse |
| **Compose** | Multi-post threads, images with ALT text, draft auto-save (PDS + local) |
| **Lists** | Create, edit, delete, add/remove members, mute, list feed. 15 API methods. `#/lists` |
| **Bookmarks** | Built-in Bluesky API, toggle from any post, virtual scroll |
| **DMs** | Direct messages, emoji reactions, quote posts, mute conversations |
| **Profile** | Follow/unfollow, posts/replies/lists tabs, edit avatar/banner/display name |
| **Search** | 4 tabs: Hot / Latest / Users / Feeds |
| **Notifications** | Real-time refresh, mark read |
| **AI Chat** | 36 tools (read/write/list), streaming, thinking mode, vision mode, export/import JSON |
| **Translation** | 7 languages, dual-mode (simple / JSON with source detection) |
| **Draft Polish** | AI rewrites your drafts with style requirements |
| **i18n** | 中文 / English / 日本語 — switch instantly |
| **Dark Mode** | CSS variables, system-aware |
| **PWA** | Installable, manifest.json, Service Worker |

---

## 🚀 Quick Start

### TUI (Terminal)

```bash
git clone https://github.com/epheiamoe/bsky.git
cd bsky
pnpm install && pnpm -r build
cp .env.example .env   # fill in your Bluesky handle + App Password + AI key
cd packages/tui && npx tsx src/cli.ts
```

### PWA (Browser)

```bash
cd packages/pwa && pnpm dev     # http://localhost:5173
# Or build for production:
pnpm build && npx wrangler pages deploy dist --project-name ai-bsky --commit-dirty=true
```

**No `.env` needed** — PWA handles login and AI config entirely in-browser.

---

## 🏗 Architecture

```
@bsky/core ──→ @bsky/app ──→ @bsky/tui (Ink/React terminal)
                          └─→ @bsky/pwa (React DOM + Tailwind, PWA)
```

| Package | Role | Key Files |
|---------|------|-----------|
| `@bsky/core` | AT Protocol client, AI engine, 36 tools, prompts, types | `client.ts`, `assistant.ts`, `tools.ts`, `prompts.ts` |
| `@bsky/app` | React hooks, stores, i18n, widget system | `useAIChat.ts`, `useLists.ts`, `widgetStore.ts`, `navigation.ts` |
| `@bsky/tui` | Terminal UI (Ink) | `App.tsx`, `ComposeView.tsx`, `DMListView.tsx` |
| `@bsky/pwa` | Web UI (React DOM), installable PWA | `App.tsx`, `ListsPage.tsx`, `ListDetailPage.tsx`, `Icon.tsx` |

---

## 📚 Docs

| Document | Purpose |
|----------|---------|
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) | System architecture, dependency flow |
| [`docs/LESSONS.md`](docs/LESSONS.md) | Key lessons from each development session |
| [`docs/KEYBOARD.md`](docs/KEYBOARD.md) | TUI keyboard shortcuts |
| [`docs/HOOKS.md`](docs/HOOKS.md) | All hook signatures |
| [`docs/SCROLL.md`](docs/SCROLL.md) | Virtual scroll + scroll restoration spec |
| [`docs/DM.md`](docs/DM.md) | DM implementation docs |
| [`AGENTS.md`](AGENTS.md) | Contributor guide |

[中文文档](README.zh.md)

---

## 🧪 Tests

```bash
cd packages/core && npx vitest run --config vitest.config.ts
# 12+ integration tests against real Bluesky API
```

---

## 📄 License

[MIT](LICENSE) — Free to use, modify, and distribute.

**v0.6.0** · [Changelog](CHANGELOG.md) · [Issues](https://github.com/epheiamoe/bsky/issues)
