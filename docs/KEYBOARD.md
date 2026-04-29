# Keyboard Handling (TUI)

## Architecture

**Single handler**: `App.tsx` uses Ink's `useInput` hook — the only keyboard handler in the entire application.

**Why centralized**: Earlier versions had each view component registering its own `process.stdin.on('data')` handler, causing 7 simultaneous handlers processing every keystroke. This caused AI output truncation, stale callbacks, and refresh failures.

## Handler Priority Order

```typescript
useInput((input, key) => {
  // 1. Tab — ALWAYS processed (toggle focus)
  if (key.tab) { ... return; }

  // 2. Esc — ALWAYS processed (go back / unfocus AI)
  if (key.escape) { ... return; }

  // 3. When AI focused: ALL other keys → TextInput
  if (currentView.type === 'aiChat' && focusedPanel === 'ai') return;

  // 4. Arrow keys
  if (key.upArrow) { ... }
  if (key.downArrow) { ... }

  // 5. Enter
  if (key.return) { ... }

  // 6. Ctrl+G → AI chat
  if (input === '\x07') { ... }

  // 7. View-specific single-character keys
  switch (currentView.type) {
    case 'feed':          j/k/m/r/b
    case 'detail':        r/h/a/t
    case 'thread':        j/k/r/v
    case 'bookmarks':     j/k/d
    case 'notifications': j/k
    case 'compose':       (TextInput onSubmit handles submission)
    case 'aiChat':        a/t (when main focused)
  }
});
```

## Focus Management

| Focus State | AI Panel | Main Panel |
|-------------|----------|------------|
| `focusedPanel === 'main'` | TextInput shows "按 Tab 聚焦" | Arrow keys navigate posts |
| `focusedPanel === 'ai'` | TextInput active, receives all keys | Tab/Esc only |

**Tab key**: Toggles `focusedPanel` between `'main'` and `'ai'` (only in aiChat mode).
**Esc in AI mode**: First Esc unfocuses AI panel → `focusedPanel = 'main'`. Second Esc calls `goBack()`.

## Avoided Patterns

**DO NOT** register `process.stdin.on('data')` in child components. Always use App.tsx's centralized `useInput`.

**DO NOT** use raw `process.stdin.setRawMode()` — Ink's `useInput` handles it internally.

## View-Specific Keymaps

### Feed View
| Key | Action |
|-----|--------|
| `j` / `↓` | Move cursor down |
| `k` / `↑` | Move cursor up |
| `Enter` | View selected post |
| `m` | Mark/unmark for quote |
| `r` | Refresh feed |
| `b` | Open bookmarks page |
| `v` | Toggle bookmark on selected post |

### Detail View
| Key | Action |
|-----|--------|
| `r` | Reply |
| `h` | Like |
| `a` | Repost |
| `t` | View thread |
| `v` | Toggle bookmark |

### Thread View
| Key | Action |
|-----|--------|
| `j` / `↓` | Move cursor down |
| `k` / `↑` | Move cursor up |
| `r` | Refresh thread |
| `v` | Toggle bookmark on selected post |

### Bookmarks Page
| Key | Action |
|-----|--------|
| `j` / `↓` | Move cursor down |
| `k` / `↑` | Move cursor up |
| `Enter` | View bookmarked post |
| `d` | Delete bookmark |
| `r` | Refresh list |

### Notifications
| Key | Action |
|-----|--------|
| `j` / `↓` | Move cursor down |
| `k` / `↑` | Move cursor up |
| `Enter` | View post |
| `r` | Refresh notifications |

### Compose View
Keyboard focus delegated to `TextInput` (via `onSubmit`). Arrow keys / single-character keys are inactive while composing.

### AI Chat
| Key (main focused) | Action |
|--------------------|--------|
| `a` | Copy last AI response |
| `t` | Copy full conversation transcript |

## Footer Hints

Each view renders a bottom hint bar showing current key bindings:

| View | Footer |
|------|--------|
| Feed | `j/k:nav  m:mark  b:bookmarks  r:refresh  v:bookmark  Ctrl+G:AI` |
| Detail | `r:reply  h:like  a:repost  t:thread  v:bookmark  Ctrl+G:AI` |
| Thread | `j/k:nav  r:refresh  v:bookmark  Ctrl+G:AI` |
| Bookmarks | `j/k:nav  Enter:view  d:delete  r:refresh  Ctrl+G:AI` |
| Notifications | `j/k:nav  Enter:view  r:refresh  Ctrl+G:AI` |
| Compose | `Tab/Esc only — TextInput active` |
| AI Chat (main) | `a:copy  t:transcript  Tab:focus AI` |
| AI Chat (ai) | `Esc:return` |

## For PWA

PWA replaces keyboard completely with mouse/touch:
- `key.upArrow` → scroll up
- `key.return` → `onClick`
- `key.escape` → browser back button / close modal
- Single-character keys → buttons with labels
