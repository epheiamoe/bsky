# AGENTS.md — AI Agent & Developer Guide

> Read this before working on the project. Reference `AGENTS.local.md` for machine-specific notes (gitignored, never pushed).

## Project Overview

Bluesky Client — a dual-UI (TUI + PWA) social client with AI integration. Monorepo with 4 packages.

```
@bsky/core ──→ @bsky/app ──→ @bsky/tui (terminal)
                          └─→ @bsky/pwa (browser)
```

**Golden rule**: Business logic lives ONCE in `core` + `app`. TUI and PWA only write render layers.

## Critical Safety Rules

- **NEVER** hardcode credentials, handles, DIDs, API keys, or JWTs in ANY committed file
- **NEVER** write local file paths (like `C:\Users\...` or `/home/...`) in committed files
- **NEVER** put anything that could identify a real user or account in code or docs
- The ONLY place for local secrets is `.env` (gitignored) and `AGENTS.local.md` (gitignored)
- Test files MUST use `process.env.VARIABLE_NAME` — never hardcoded values
- All bluesky handles used in examples should be generic like `user.bsky.social`

## Quick Start

```bash
pnpm install
pnpm -r build          # build all packages

# TUI
cd packages/tui && npx tsx src/cli.ts

# PWA
cd packages/pwa && pnpm dev     # http://localhost:5173

# Tests (real API calls, no mocks)
cd packages/core && npx vitest run --config vitest.config.ts
```

## Key Files to Read

| Priority | File | Purpose |
|----------|------|---------|
| 1 | `docs/CONTEXT.md` | Context compression recovery — start here after session reset |
| 2 | `docs/ARCHITECTURE.md` | System architecture, dependency flow, key decisions |
| 3 | `docs/PACKAGES.md` | Complete file listing for each package |
| 4 | `docs/HOOKS.md` | All hook signatures and return types |
| 5 | `docs/DESIGN.md` | PWA design system (colors, typography, components) |
| 6 | `docs/PWA_GUIDE.md` | PWA architecture, component mapping, deployment |
| 7 | `docs/AI_SYSTEM.md` | AI integration: tools, streaming, translation |
| 8 | `docs/KEYBOARD.md` | TUI keyboard shortcuts |
| 9 | `docs/TODO.md` | Feature status (TUI/PWA checkboxes) |
| 10 | `docs/USER_ISSUSES.md` | Known & resolved user issues |

## Commands Reference

```bash
pnpm -r typecheck     # TypeScript check all packages
pnpm -r build         # Build all packages
pnpm test             # Run all tests
pnpm --filter @bsky/core build    # Build core only
pnpm --filter @bsky/pwa build     # Build PWA → dist/
```

## Architecture Pattern

When adding a new feature:
1. `@bsky/core` — add API method to BskyClient if needed
2. `@bsky/app` — create hook or pure utility
3. `@bsky/tui` — render with Ink (Text/Box components)
4. `@bsky/pwa` — render with React DOM + Tailwind

The hooks (`useTimeline`, `useThread`, `useAIChat`, etc.) are the bridge. Both UIs consume the same hooks with the same API.

## Key Implementation Notes

- **BskyClient**: Two `ky` instances — `this.ky` (bsky.social for writes) and `this.publicKy` (public.api.bsky.app for reads). Auto JWT refresh via `afterResponse` hook.
- **PWA routing**: `useHashRouter()` — `history.pushState` + `popstate`, format `#/view?param=value`
- **PWA timeline**: `useTimeline` held at App.tsx level (persists across navigation), virtual scroll via `@tanstack/react-virtual`
- **Images**: Bluesky CDN `cdn.bsky.app/img/feed_fullsize/plain/{did}/{cid}@{ext}`. (Old PDS blob endpoint required JWT; CDN serves inline, works in `<img>` and OSC 8 terminals.)
- **Tailwind**: Colors use CSS variables (`var(--color-primary)`). `@apply` doesn't work with opacity modifiers on CSS variables — use plain CSS instead.
- **PWA stubs**: `fs`, `os`, `path` are stubbed via Vite alias (FileChatStorage's Node imports that are never called in browser)
- **ChatStorage interface**: TUI uses `FileChatStorage` (JSON files), PWA uses `IndexedDBChatStorage` (IndexedDB)
- **Keyboard shortcuts**: Full reference at `docs/KEYBOARD.md`. When adding NEW shortcuts, you MUST:
  1. Check the Global Key Reserve and Conflict tables in `docs/KEYBOARD.md` — DO NOT reuse reserved or already-bound keys
  2. Update `docs/KEYBOARD.md` with the new binding
  3. Update the i18n `keys.*` footer hint strings in `packages/app/src/i18n/locales/*.ts`
  4. Verify no conflicts by checking the key across ALL views (feed, thread, bookmarks, notifications, aiChat, compose, profile, search)
  Note: Ink fires ALL `useInput` callbacks on every keystroke; 5 handlers coexist. Guards must be view-specific.
- **Wiki docs**: `.zread/wiki/` directory contains auto-generated project documentation by `zread-cli`. These are useful reference material — DO NOT remove them. Consult them as needed for architecture understanding.

## Local Development Notes

See `AGENTS.local.md` for machine-specific configuration, local paths, and non-secret development info. This file is gitignored and never pushed.

## Environment

- `.env` (gitignored): Bluesky credentials + AI API key (for TUI and tests)
- `.env.example` (committed): Template showing required variables
- PWA: No `.env` — credentials entered via login form, persisted in localStorage

---

*For context compression recovery, start with `docs/CONTEXT.md`.*
