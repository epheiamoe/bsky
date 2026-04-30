# TUI Keyboard Shortcuts — Complete Reference

> **IMPORTANT**: When adding a new keyboard shortcut, you MUST update this document.
> Also see `AGENTS.md` for the enforcement rule.

## Architecture

There are **5 `useInput`** handlers across the application. Ink fires ALL of them on every keystroke in registration order. Each handler must use condition guards to avoid conflicts.

| Handler | File | Scope |
|---------|------|-------|
| App.tsx | `packages/tui/src/components/App.tsx:87` | Always active. Processes Tab, Esc, Ctrl+G, global nav, feed, bookmarks, compose. |
| UnifiedThreadView | `packages/tui/src/components/UnifiedThreadView.tsx:48` | Active only when `currentView.type === 'thread'`. |
| AIChatView (chat) | `packages/tui/src/components/AIChatView.tsx:89` | Active when `!showHistory`. Scroll only. |
| AIChatView (history) | `packages/tui/src/components/AIChatView.tsx:101` | Active when `showHistory`. |
| NotifView | `packages/tui/src/components/NotifView.tsx:20` | Active when `currentView.type === 'notifications'`. |
| SetupWizard | `packages/tui/src/components/SetupWizard.tsx:93` | First-run only. |

Plus a raw `process.stdin.on('data')` handler in App.tsx for **mouse scroll** tracking.

---

## Global Keys (all views)

Processed in App.tsx:87 in this order. Each returns immediately.

| Key | Action | Context |
|-----|--------|---------|
| `Tab` | Toggle `focusedPanel` between `'main'` and `'ai'` | Only in aiChat view |
| `Esc` | See table below | Varies by view |

### Esc Behavior by View

| View | First Esc | Second Esc |
|------|-----------|------------|
| aiChat + focusedPanel === 'ai' | Unfocus AI → `focusedPanel = 'main'` | `goBack()` |
| compose + imagePathInput !== null | Cancel image input | `goBack()` |
| compose + no image input | `goBack()` | — |
| feed | No-op | — |
| thread, profile, notifications, search, bookmarks | `goBack()` | — |

### Ctrl+G

| Key | Action | Scope |
|-----|--------|-------|
| `Ctrl+G` | `goTo({ type: 'aiChat', contextUri: threadUri })` | All views. `threadUri` is only set when in thread view. |

### Global Navigation Shortcuts

These fire in **all non-compose views**, after earlier conditions clear.

| Key | Action | Description |
|-----|--------|-------------|
| `t` | `goHome()` | Timeline — clears navigation stack to feed |
| `n` | `goTo({ type: 'notifications' })` | Notifications |
| `p` | `goTo({ type: 'profile', actor: handle })` | Profile (own) |
| `s` | `goTo({ type: 'search' })` | Search |
| `a` | `goTo({ type: 'aiChat' })` | AI chat |
| `c` | `goTo({ type: 'compose' })` | Compose (no reply context) |
| `b` | `goTo({ type: 'bookmarks' })` | Bookmarks |

### Global Key Reserve Rules

These keys are permanently reserved across ALL views and MUST NOT be reused for view-specific actions:

| Key | Reason |
|-----|--------|
| `t`, `n`, `p`, `s`, `a`, `c`, `b` | Global navigation |
| `Esc` | Universal back |
| `Tab` | AI focus toggle |
| `Ctrl+G` | AI chat launcher |

**When adding a new view-specific shortcut, pick from**: `f`, `z`, `x`, `w`, `u`, `o`, `g`, `q`, `e`, `d` (except in bookmarks), `l` (except in thread/ai-history), `h` (except in thread), `y` (except in thread), `i` (except in compose), `,` (comma).

---

## Feed View

| Key | Action |
|-----|--------|
| `j` / `↓` | Move cursor down |
| `k` / `↑` | Move cursor up |
| `PgUp` | Page up (5 posts) |
| `PgDn` | Page down (5 posts) |
| `Enter` | View selected post in thread |
| `m` | Load more (older posts) |
| `r` | Refresh feed from top |
| `v` | Toggle bookmark on selected post |
| Mouse scroll up | Move cursor up by 1 |
| Mouse scroll down | Move cursor down by 1 |

**Footer hint**: `↑↓/jk:导航 Enter:查看 m:更多 r:刷新 v:收藏`

---

## Thread View

**WARNING**: The global keys `t`, `a`, `c`, `b`, `p`, `n`, `s` ALSO fire in thread view alongside these local bindings.

### Navigation

| Key | Action |
|-----|--------|
| `j` / `↓` | Move cursor down (highlight, does NOT change focused post) |
| `k` / `↑` | Move cursor up |
| `Enter` | Make cursor line the new focused post (full refocus) |
| `h` / `H` | Go back to root/theme post |

### Actions on Cursor Line

| Key | Action |
|-----|--------|
| `l` / `L` | Like post (noop if already liked) |
| `r` | Repost with confirmation dialog |
| `c` / `C` | Reply (opens compose with reply context) |
| `v` | Toggle bookmark |
| `y` | Yank URI — copies `@handle uri bsky.app/...` to stderr (5s display) |

### Repost Confirmation Dialog (when open)

| Key | Action |
|-----|--------|
| `y` / `Y` | Confirm repost |
| `n` / `N` | Cancel repost |

**Footer hint**: `h:主题帖 ↑↓/jk:移动 Enter:聚焦 c:回复 l:赞 r:转发 v:收藏`

**Note**: `t` is GLOBAL (`goHome`) and NOT available for thread-local translation. Use `f` or `z` for translation.

---

## Bookmarks View

| Key | Action |
|-----|--------|
| `j` / `↓` | Move cursor down |
| `k` / `↑` | Move cursor up |
| `Enter` | View bookmarked post in thread |
| `d` | Delete selected bookmark |
| `r` | Refresh bookmarks list |

**Known bug**: `b` (global → `goTo bookmarks`) consumes the key before the view-specific `b` (refresh) handler runs. Pressing `b` in bookmarks view is a no-op. Use `r` to refresh instead.

**Footer hint**: `↑↓/jk:导航 Enter:查看 d:删除 r:刷新`

---

## Notifications View

| Key | Action |
|-----|--------|
| `j` / `↓` | Move cursor down |
| `k` / `↑` | Move cursor up |
| `Enter` | View referenced post (if `reasonSubject` exists) |
| `r` / `R` | Refresh notifications |

**Footer hint**: `↑↓/jk:导航 Enter:查看帖子 R:刷新`

---

## Compose View

Keyboard focus is delegated to `TextInput` (via `onSubmit`). Global shortcuts are BLOCKED while composing.

### Normal Mode

| Key | Action |
|-----|--------|
| `Enter` | Submit post (via TextInput onSubmit) |
| `Esc` | Go back |
| `i` / `I` | Enter image path input mode (max 4 images) |

### Image Path Input Mode

| Key | Action |
|-----|--------|
| `Enter` | Validate + upload image (check exists, size < 1MB, count < 4) |
| `Esc` | Cancel image input |
| Any other key | Type image path |

**Footer hint**: `Enter:发送 · Esc:取消 · i:添加图片`

---

## AI Chat View

### When Chat is Active (not in history mode)

| Key | Action | Condition |
|-----|--------|-----------|
| `PgUp` | Scroll up ~70% of visible height | Always |
| `PgDn` | Scroll down ~70% of visible height | Always |
| `↑` | Scroll up 3 lines | Only when `focused === false` (not typing) |
| `↓` | Scroll down 3 lines | Only when `focused === false` |

When `focused === true` (Tab switched focus to AI panel), arrow keys pass through to TextInput.

**Note**: While `focusedPanel === 'main'`, keys `a` and `t` navigate to feed (overriding their global meaning).

**Footer hint**: `Tab:切换 Esc:返回 PgUp/PgDn:滚动`

### When Chat History is Open

| Key | Action |
|-----|--------|
| `Esc` | Go back |
| `↑` | Move up in conversation list |
| `↓` | Move down in conversation list |
| `n` / `N` | Start new chat |
| `l` / `L` | Load selected conversation |
| `d` / `D` | Delete selected conversation |

**Footer hint**: `Esc 返回 ↑↓:选 N:新建 L:加载 D:删除`

---

## Profile View

No keyboard handler of its own. Only global nav keys (`t`, `n`, `p`, `s`, `a`, `c`, `b`) and `Esc` work. No cursor or interaction.

---

## Search View

No keyboard handler. Only global nav keys and `Esc`. No cursor to navigate results.

---

## Setup Wizard (first-run)

| Key | Action |
|-----|--------|
| `Tab` / `↓` | Move to next field |
| `↑` | Move to previous field |
| `Enter` | Submit current field (via TextInput onSubmit) |

---

## Mouse Scroll (Feed View Only)

ANSII mouse tracking (`x1b[?1000h`) is enabled on supported terminals (Windows Terminal, iTerm2, Kitty, WezTerm, tmux 3.3+).

| Event | Action |
|-------|--------|
| Scroll Up | Move feed cursor up by 1 |
| Scroll Down | Move feed cursor down by 1 |

Not supported on: ConEmu, traditional cmd.exe (harmless — tracking write is ignored).

---

## Key Conflict Table

Keys that have **different meanings** depending on view:

| Key | Feed | Thread | Bookmarks | Notifications | AI Chat | Compose |
|-----|------|--------|-----------|---------------|---------|---------|
| `t` | goHome | goHome | goHome | goHome | feed (main-focus) | blocked |
| `a` | goTo AI | goTo AI | goTo AI | goTo AI | feed (main-focus) | blocked |
| `c` | goTo compose | reply (conflict*) | goTo compose | goTo compose | goTo compose | blocked |
| `b` | goTo bm | goTo bm | goTo bm (broken) | goTo bm | goTo bm | blocked |
| `r` | refresh | repost confirm | — | refresh notifs | — | blocked |
| `l` | — | like | — | — | load conv (hist) | blocked |
| `d` | — | — | delete bm | — | delete conv (hist) | blocked |
| `h` | — | go to root | — | — | — | blocked |
| `y` | — | yank URI | — | — | — | blocked |
| `i` | — | — | — | — | — | add image |
| `Enter` | view thread | refocus post | view thread | view post | TextInput | submit |

\* In thread, `c` fires BOTH the global `goTo compose` (no replyTo) and the thread-local `goTo compose` (with replyTo). The second push wins due to navigation stack ordering, so the reply context is preserved. This is a benign double-navigation.

---

## Process for Adding a New Shortcut

1. Check the [Global Key Reserve](#global-key-reserve-rules) table — don't reuse reserved keys
2. Check the [Conflict Table](#key-conflict-table) — avoid keys with existing view-specific meanings
3. Add the `useInput` / switch case in the appropriate component
4. Update the footer hint in the i18n locale files (`keys.*`)
5. **Update this document**

See `AGENTS.md` for the mandatory review step.
