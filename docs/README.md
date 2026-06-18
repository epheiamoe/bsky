# Bluesky Client Documentation

> Dual-interface Bluesky client: PWA (browser) + TUI (terminal) with AI integration.

## Quick Navigation

| Doc | Content |
|-----|---------|
| [ARCHITECTURE.md](./ARCHITECTURE.md) | Overall architecture, monorepo layers, dependency flow |
| [PACKAGES.md](./PACKAGES.md) | Package descriptions, key files, exports, dependencies |
| [CONTEXT.md](./CONTEXT.md) | Context recovery guide: versions, status, quick commands, dev rules |
| [AGENTS.md](../AGENTS.md) | AI agent guide: safety rules, quick start, architecture |

### AI System
| Doc | Content |
|-----|---------|
| [ai/index.md](./ai/index.md) | AI architecture overview, section index |
| [ai/adapter.md](./ai/adapter.md) | ApiAdapter pattern, Chat vs Responses API |
| [ai/providers.md](./ai/providers.md) | 7 provider configs, ModelInfo, fixedParams |
| [ai/assistant.md](./ai/assistant.md) | AIAssistant class, AIConfig |
| [ai/tools.md](./ai/tools.md) | 34 AI tools architecture |
| [ai/streaming.md](./ai/streaming.md) | SSE streaming, token delivery |
| [ai/reasoning.md](./ai/reasoning.md) | Reasoning effort, thinking mode |
| [ai/features.md](./ai/features.md) | Translation, Polish draft, single-turn functions |
| [AI_CONTEXT.md](./AI_CONTEXT.md) | AI context injection mechanism |

### Hooks
| Doc | Content |
|-----|---------|
| [hooks/index.md](./hooks/index.md) | Hooks overview, cross-reference, store pattern |
| [hooks/auth.md](./hooks/auth.md) | Authentication |
| [hooks/timeline.md](./hooks/timeline.md) | Timeline, posts, threads |
| [hooks/compose.md](./hooks/compose.md) | Compose, drafts |
| [hooks/ai-chat.md](./hooks/ai-chat.md) | AI chat, chat history |
| [hooks/social.md](./hooks/social.md) | Profile, search, notifications, bookmarks |
| [hooks/messaging.md](./hooks/messaging.md) | DM conversations |
| [hooks/lists.md](./hooks/lists.md) | Lists management |
| [hooks/ui.md](./hooks/ui.md) | Navigation, virtualization, scroll, search history |
| [hooks/widgets.md](./hooks/widgets.md) | Widget system, post actions |
| [hooks/translation.md](./hooks/translation.md) | Translation, i18n |

### Feature Docs
| Doc | Content |
|-----|---------|
| [DM.md](./DM.md) | Direct messages API, auth, models |
| [MCP.md](./MCP.md) | MCP server implementation |
| [ATPLAY.md](./ATPLAY.md) | AT Play experimental features |
| [PDS.md](./PDS.md) | Third-party PDS support |
| [PYTHON_SANDBOX_STATUS.md](./PYTHON_SANDBOX_STATUS.md) | Python sandbox status tracker |
| [WORKSPACE.md](./WORKSPACE.md) | Workspace file management |
| [SCROLL.md](./SCROLL.md) | Virtual scrolling + scroll restore |
| [KEYBOARD.md](./KEYBOARD.md) | TUI keyboard shortcuts |
| [DESIGN.md](./DESIGN.md) | PWA design system |
| [PWA_GUIDE.md](./PWA_GUIDE.md) | PWA component mapping |
| [TODO.md](./TODO.md) | Feature roadmap, completion status |
| [CHANGELOG.md](../CHANGELOG.md) | Version history |

### Lessons & Issues
| Doc | Content |
|-----|---------|
| [LESSONS.md](./LESSONS.md) | 69 lessons learned, categorized index |
| [lessons/](./lessons/) | Categorized lesson files |
| [USER_ISSUSES.md](./USER_ISSUSES.md) | Known issues log |
| [archive/](./archive/) | Archived docs |

## Project Structure

```
bsky/
├── packages/
│   ├── core/        Layer 0: Zero UI. BskyClient, AIAssistant, 34 tools.
│   ├── app/         Layer 1: React hooks + pure stores. Shared by PWA/TUI.
│   ├── pwa/         Layer 2a: Browser PWA (React DOM + Tailwind).
│   ├── tui/         Layer 2b: Terminal UI (Ink).
│   └── mcp/         MCP server (npm: @epheiamoe/bsky-mcp).
├── docs/            Documentation.
├── contracts/       JSON Schemas, system prompts.
├── .env.example
└── README.md
```

## Key Architectural Decisions

1. **Core has zero UI dependencies** — can be used from any framework
2. **App layer hooks are shared** — PWA and TUI use the same hooks
3. **Single source of truth** — Business logic lives once in `core` + `app`
4. **ChatStorage interface** — PWA uses IndexedDB, TUI uses JSON files
5. **All tests use real API calls** — no mocks
6. **34 AI tools** — 28 read + 1 sandbox + 6 write operations

## Tech Stack

- TypeScript 5.x strict mode
- pnpm workspace monorepo
- React 19 + Tailwind CSS (PWA)
- Ink 5 (TUI)
- ky (HTTP client)
- DeepSeek / OpenAI / xAI / Mistral / Kimi (AI providers)
- Vitest (test runner)
- Pyodide WASM (Python sandbox in browser)
