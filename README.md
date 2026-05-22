# 🦋 Bluesky Client

**Your Bluesky, supercharged.**  
A dual-interface social client — terminal for the keyboard lovers, browser for everyone else.  
Pure front-end. Zero servers. AI that reaches beyond Bluesky — web search, Wikipedia, any URL.  
Includes an [**MCP server**](https://www.npmjs.com/package/@epheiamoe/bsky-mcp) for external AI clients. Privacy-first.

Supports third-party PDS.

<div align="center">

[**Open Web App**](https://bsky.epheia.dev) · [**MCP Server (npm)**](https://www.npmjs.com/package/@epheiamoe/bsky-mcp) · [**View Source**](https://github.com/epheiamoe/bsky)

</div>

---

## ✨ Features

### 🤖 AI Chat — The Core

![AI Chat](assets/illustration/AI-chat-1.png)

Streaming responses with visible thinking. **33 tools** bridging AI to Bluesky — analyze threads, summarize discussions, manage your lists, polish drafts. All write actions require a confirmation tap.

Bring your own API key — nothing runs through our servers.

---

### 🐍 Python Sandbox & bsky_tools

![Python Sandbox](assets/illustration/Create-a-chart-using-python-tool.png)

AI executes Python in an isolated sandbox for data analysis, batch processing, and visualization. **Pandas, NumPy, and Matplotlib** run in-browser via Pyodide WASM (PWA) or local Python (TUI/MCP).

**bsky_tools** — a Python library that lets AI batch-call all 33 Bluesky API methods from code. Search posts, fetch profiles, analyze timelines, generate charts — all in a single Python script with per-chat workspace isolation.

Results saved to workspace. Upload CSV/JSON, download outputs, preview charts in-app.

---

### 🌍 AI Beyond Bluesky — Web Search Built In

> **No API keys required. No configuration. Just works.**

Your AI isn't locked inside Bluesky. Three built-in tools bridge it to the open web at zero cost:

| Tool                     | What it does                                                                          | Key needed? |
| ------------------------ | ------------------------------------------------------------------------------------- |:-----------:|
| **`search_web_ddg`**     | DuckDuckGo web search with jina.ai reader — get summarized answers and full pages     | ✗ None      |
| **`search_wikipedia`**   | Direct Wikipedia API with auto-redirect and fuzzy matching. Multi-language support.   | ✗ None      |
| **`fetch_web_markdown`** | Fetch any URL and extract clean Markdown — documentation, blog posts, any public page | ✗ None      |

Ask the AI _"what's new in AT Protocol?"_, _"summarize this GitHub README"_, or _"look up this term on Wikipedia"_ — it handles the rest.

### 📰 Timeline & Threads

![Timeline](assets/illustration/timeline.png)

Browse Following, Discover, and custom feeds. Dive into threaded conversations with quoted posts and rich embeds. Virtual scroll keeps things fast no matter how far you go.

---

### 📋 Lists

![Lists](assets/illustration/lists.png)

Create curated lists for custom feeds, or moderation lists to mute in bulk. Manage members, browse list timelines, remove and add on the fly. Visit `#/lists` for your collections.

---

### 💬 Direct Messages

![Direct Messages](assets/illustration/dm-chat.png)

Private conversations with reactions and quote post embeds. New messages appear automatically via background polling. Mute conversations, delete messages, search by user.

---

### 🌐 Translate

![Translate](assets/illustration/translate-a-post.png)

One tap to translate any post or thread into your language. Dual-mode: simple plain text or structured JSON with source language detection. 7 languages supported.

---

## 🎨 Setup & Onboarding

**A welcome experience built with respect, not just functionality.**

Five guided steps that introduce you to the app's philosophy — from AI transparency to personal identity. Every step is skippable, and you can restart the wizard anytime from Settings.

| Step | Screenshot | What it does |
|------|-----------|--------------|
| ① **Welcome + Authorization** | ![Welcome 1](assets/illustration/welcome-1.jpg) | Privacy guarantee, AI permission tiers (Read/Write/Confirm), and an expandable list of all 33 AI tools — full transparency from day one |
| ② **Pronouns** | ![Welcome 2](assets/illustration/welcome-2.jpg) | Choose how AI addresses you: skip (no pronoun injection), neutral (gender-neutral terms), or custom pronouns. Prevents misgendering at the architectural level — pronouns are injected into every system prompt |
| ③ **Personalization** | ![Welcome 3](assets/illustration/welcome-3.jpg) | Live toggles for Dark Mode, CVD-friendly palette (red→magenta, green→teal), and AI ALT description generation. Changes take effect immediately — no save button needed |
| ④ **AI Provider** | ![Welcome 4](assets/illustration/welcome-4.jpg) | Configure DeepSeek, Mistral, or any OpenAI-compatible provider with step-by-step instructions. BYOK (Bring Your Own Key) — no server proxy |
| ⑤ **Done** | ![Welcome 5](assets/illustration/welcome-5.jpg) | Completion with BYOK privacy card emphasizing your API key stays in your browser, and a path to the full settings panel |

> **Why this matters**: Most AI clients skip consent and identity. This onboarding treats AI agency as a first-class concern — what AI can read, what it needs confirmation for, and how it addresses you. All configurable later in Settings → Account / Settings → AI.

---

**And also:**

- **Python Sandbox** — AI executes Python for data analysis, statistics, plotting. Pandas/NumPy/Matplotlib (PWA auto-installs, TUI/MCP requires manual pip install)
- **Workspace Files** — per-chat file isolation. Upload CSV/JSON, download results, preview in-app
- **Bookmarks** — bookmark anything, browse later
- **Search** — posts, users, feeds across 4 tabs
- **Profile** — edit avatar, banner, display name
- **Compose** — multi-post threads with images and ALT text
- **Drafts** — auto-save to your PDS + local fallback
- **Notifications** — real-time refresh
- **PWA** — installable, works offline
- **Dark mode** — follows your system
- **i18n** — 中文 · English · 日本語

---

## 🦯 Accessibility & Human-Centric Design

Built for everyone — regardless of ability, identity, or language.

- **Pronoun respect**: Open-ended pronoun field (never binary) injected into every AI system prompt. Choose skip, neutral, or custom — AI adapts to you, not the other way around
- **Screen reader semantics**: proper landmarks, list roles, `aria-label` on every interactive element, dynamic `<html lang>` and page titles
- **Color-blind friendly palette**: optional `.cvd` mode remaps red/green/yellow → magenta/teal/amber for all CVD types. Toggle at any time with instant feedback
- **AI ALT — image description**: AI-generated alt text for images using vision models. Works across feed, thread, profile, search, bookmarks
- **i18n**: 中文 · English · 日本語 — all UI strings, including the setup wizard and system prompts, are fully translated
- **BYOK privacy**: Your API key stays entirely in your browser. All AI requests go directly from your device to your chosen provider. We never proxy, relay, or store your key

![AI ALT](assets/illustration/AI-alt.png)

---

## 🔒 Privacy

Everything runs in your browser. Your Bluesky credentials, API keys, and conversations never touch our servers. Every request goes directly from your device to Bluesky or the AI provider you choose. Nothing to trust — nothing to leak.

---

## 🚀 Quick Start

### Terminal (TUI)

```bash
git clone https://github.com/epheiamoe/bsky.git && cd bsky
pnpm install && pnpm -r build
cd packages/tui && npx tsx src/cli.ts
# First run launches the interactive Setup Wizard automatically
# Guides you through: Auth consent → Credentials → AI provider → Pronouns → Done
# No manual .env editing needed
```

### Browser (PWA)

```bash
cd packages/pwa && pnpm dev     # → http://localhost:5173
```

Or visit **[bsky.epheia.dev](https://bsky.epheia.dev)** or **[ai-bsky.pages.dev](https://ai-bsky.pages.dev)** — login in-browser, no `.env` needed.

### MCP Server (for AI clients)

Connect external AI clients (Claude Desktop, ChatGPT, VS Code, Cursor, OpenCode) to your Bluesky account via MCP.

```bash
pnpm install && pnpm -r build          # first time only
cd packages/mcp && pnpm build          # build MCP server
BSKY_HANDLE=... BSKY_APP_PASSWORD=... node dist/index.js
```

**OpenCode integration** (with `.env` auto-loading):
```jsonc
// opencode.jsonc
{
  "mcp": {
    "bsky": {
      "type": "local",
      "command": ["node", "packages/mcp/dist/start-with-env.js"],
      "enabled": true
    }
  }
}
```

The `start-with-env.js` wrapper automatically loads your `.env` file and maps `BLUESKY_HANDLE` → `BSKY_HANDLE` for compatibility.

Or install globally from npm:

```bash
npm install -g @epheiamoe/bsky-mcp
BSKY_HANDLE=... BSKY_APP_PASSWORD=... bsky-mcp
```

**Troubleshooting**: See [docs/MCP_TROUBLESHOOTING.md](docs/MCP_TROUBLESHOOTING.md) for common issues.

---

## 🏗 Architecture

```
@bsky/core ──→ @bsky/app ──→ @bsky/tui  (Ink · terminal)
   │                     └─→ @bsky/pwa  (React · browser)
   │
   └── @epheiamoe/bsky-mcp (npm: MCP server for external AI clients)
```

Business logic lives once. TUI, PWA, and MCP share the same core. 5 packages, 1 codebase, zero duplication.

---

## 📄 License

[MIT](LICENSE) — free to use, modify, and share.

**v0.14.0** · [Changelog](CHANGELOG.md) · [中文文档](README.zh.md)
