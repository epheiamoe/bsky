# Bluesky TUI Documentation

Monorepo documentation for the Bluesky Terminal UI Client with AI integration.

## Quick Navigation

| Doc | Content |
|-----|---------|
| [ARCHITECTURE.md](./ARCHITECTURE.md) | Overall architecture, layer diagram, dependency flow |
| [PACKAGES.md](./PACKAGES.md) | Package descriptions, key files, exports, dependencies |
| [NAVIGATION.md](./NAVIGATION.md) | AppView state machine, goTo/goBack/goHome, keyboard shortcuts |
| [HOOKS.md](./HOOKS.md) | React hooks reference, store pattern, key signatures |
| [AI_SYSTEM.md](./AI_SYSTEM.md) | AIAssistant class, 31 tools, thread flattening, prompts |
| [CHAT_STORAGE.md](./CHAT_STORAGE.md) | ChatStorage interface, FileChatStorage, PWA IndexedDB plan |
| [PWA_GUIDE.md](./PWA_GUIDE.md) | How to build PWA: what to reuse, what to build new, component mapping |
| [KEYBOARD.md](./KEYBOARD.md) | Centralized keyboard dispatch, focus management, handler priority |
| [ENV.md](./ENV.md) | Environment variables (.env and PWA config) |
| [API_CLIENT.md](./API_CLIENT.md) | BskyClient reference: all endpoints, auth, post structure |
| [TESTING.md](./TESTING.md) | Test framework, test files, patterns, running tests |

## Project Structure

```
bsky/
├── packages/
│   ├── core/        Layer 0: Zero UI. BskyClient, AIAssistant, 31 tools.
│   ├── app/         Layer 1: React hooks + pure stores. PWA-ready.
│   └── tui/         Layer 2: Ink/React terminal UI.
├── contracts/       JSON Schemas, system prompts.
├── docs/            Documentation (this directory).
├── .env.example
├── README.md
└── TEST_REPORT.md
```

## Key Architectural Decisions

1. **Core has zero UI dependencies** — can be used from any framework
2. **App layer hooks are PWA-ready** — PWA only needs to write render components
3. **Single keyboard handler** — Ink's `useInput` in App.tsx, no stdin conflicts
4. **ChatStorage interface** — TUI uses JSON files, PWA implements IndexedDB
5. **All tests use real API calls** — no mocks, 29 tests all pass
6. **Translation supports 7 languages** — configured via `TRANSLATE_TARGET_LANG`

## Tech Stack

- TypeScript 5.x strict mode
- pnpm workspace monorepo
- Ink 5 (React-based TUI)
- ky (HTTP client)
- DeepSeek v3 (AI via OpenAI-compatible API)
- Vitest (test runner)
