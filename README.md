# 🦋 Bluesky Client

**Your Bluesky, supercharged.**  
A dual-interface social client — terminal for the keyboard lovers, browser for everyone else.  
Pure front-end. Zero servers. AI-powered, privacy-first.

<div align="center">

[**Open Web App**](https://ai-bsky.pages.dev) · [**View Source**](https://github.com/epheiamoe/bsky)

</div>

---

## ✨ Features

### 📰 Timeline & Threads

![Timeline](assets/illustration/timeline.png)

Browse Following, Discover, and custom feeds. Dive into threaded conversations with quoted posts and rich embeds. Virtual scroll keeps things fast no matter how far you go.

---

### 📋 Lists

![Lists](assets/illustration/lists.png)

Create curated lists for custom feeds, or moderation lists to mute in bulk. Manage members, browse list timelines, remove and add on the fly. Visit `#/lists` for your collections.

---

### 🤖 AI Chat

![AI Chat](assets/illustration/AI-chat-1.png)

Streaming responses with visible thinking. 36 tools bridging AI to Bluesky — analyze threads, summarize discussions, manage your lists, polish drafts. All write actions require a confirmation tap. Bring your own API key — nothing runs through our servers.

---

### 💬 Direct Messages

![Direct Messages](assets/illustration/dm-chat.png)

Private conversations with reactions and quote post embeds. New messages appear automatically via background polling. Mute conversations, delete messages, search by user.

---

### 🌐 Translate

![Translate](assets/illustration/translate-a-post.png)

One tap to translate any post or thread into your language. Dual-mode: simple plain text or structured JSON with source language detection. 7 languages supported.

---

### 🎨 Welcome & Setup

![Welcome](assets/illustration/welcome-page.png)

First time here? A guided welcome card walks you through AI key setup — with step-by-step instructions for each provider. Skip it and all the core features work out of the box. Your credentials never leave your browser.

---

**And also:**
- **Bookmarks** — bookmark anything, browse later
- **Search** — posts, users, feeds across 4 tabs
- **Profile** — edit avatar, banner, display name
- **Compose** — multi-post threads with images and ALT text
- **Drafts** — auto-save to Bluesky PDS + local fallback
- **Notifications** — real-time refresh
- **PWA** — installable, works offline
- **Dark mode** — follows your system
- **i18n** — 中文 · English · 日本語

---

## 🚀 Quick Start

### Terminal (TUI)

```bash
git clone https://github.com/epheiamoe/bsky.git && cd bsky
pnpm install && pnpm -r build
cp .env.example .env   # add your Bluesky handle + App Password
cd packages/tui && npx tsx src/cli.ts
```

### Browser (PWA)

```bash
cd packages/pwa && pnpm dev     # → http://localhost:5173
```

Or visit **[ai-bsky.pages.dev](https://ai-bsky.pages.dev)** — login in-browser, no `.env` needed.

---

## 🔒 Privacy

Everything runs in your browser. Your Bluesky credentials, API keys, and conversations never touch our servers. Every request goes directly from your device to Bluesky or the AI provider you choose. Nothing to trust — nothing to leak.

---

## 🏗 Architecture

```
@bsky/core ──→ @bsky/app ──→ @bsky/tui  (Ink · terminal)
                          └─→ @bsky/pwa  (React · browser)
```

Business logic lives once. TUI and PWA share the same hooks. 4 packages, 1 codebase, zero duplication.

---

## 📄 License

[MIT](LICENSE) — free to use, modify, and share.

**v0.10.3** · [Changelog](CHANGELOG.md) · [中文文档](README.zh.md)
