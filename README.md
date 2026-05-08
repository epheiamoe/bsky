# 🦋 Bluesky Client

**Your Bluesky, supercharged.**  
A dual-interface social client — terminal for the keyboard lovers, browser for everyone else.  
Pure front-end. Zero servers. AI-powered, privacy-first.

<div align="center">

[**Open Web App**](https://ai-bsky.pages.dev) · [**View Source**](https://github.com/epheiamoe/bsky)

</div>

---

## 📸 At a Glance

<div align="center">

| ![Timeline](assets/illustration/timeline.png) | ![Lists](assets/illustration/lists.png) | ![AI Chat](assets/illustration/AI-chat-1.png) |
|:---:|:---:|:---:|
| Timeline | Lists | AI Chat |

| ![DMs](assets/illustration/dm-chat.png) | ![Translate](assets/illustration/translate-a-post.png) | ![Welcome](assets/illustration/welcome-page.png) |
|:---:|:---:|:---:|
| Messages | Translate | Welcome |

</div>

---

## ✨ What You Can Do

**📰 Feed & Threads**
Browse Following, Discover, and custom feeds. Dive into threaded conversations with quoted posts and rich embeds. Virtual scroll keeps things fast no matter how far you go.

**📋 Lists**
Create curated lists for custom feeds, or moderation lists to mute in bulk. Manage members, browse list timelines. `#/lists` for your collections.

**🤖 AI Chat**
Streaming responses with visible thinking. 36 tools bridging AI to Bluesky — analyze threads, summarize discussions, manage your lists, polish drafts. All with confirmation gates on write actions.

**💬 Direct Messages**
Private conversations with reactions and quote post embeds. Polls silently in the background — new messages appear without refreshing.

**🌐 Everything Else**
- **Bookmarks** — bookmark anything, browse later
- **Search** — posts, users, feeds across 4 tabs
- **Profile** — edit avatar, banner, display name
- **Compose** — multi-post threads with images and ALT text
- **Drafts** — auto-save to Bluesky PDS + local fallback
- **Notifications** — real-time refresh

**🎨 Polish**
- Installable PWA — works offline
- Dark mode — follows your system
- i18n — 中文 · English · 日本語
- Every icon is SVG — crisp at any size

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

## 🏗 Under the Hood

```
@bsky/core ──→ @bsky/app ──→ @bsky/tui  (Ink · terminal)
                          └─→ @bsky/pwa  (React · browser)
```

Business logic lives once. TUI and PWA share the same hooks. 4 packages, 1 codebase, zero duplication.

---

## 📄 License

[MIT](LICENSE) — free to use, modify, and share.

**v0.6.0** · [Changelog](CHANGELOG.md) · [中文文档](README.zh.md)
