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
    case 'feed':    j/k/m/r
    case 'detail':  r/h/a/t
    case 'thread':  j/k/r
    case 'compose': (Enter handled above)
    case 'aiChat':  a/t (when main focused)
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

## For PWA

PWA replaces keyboard completely with mouse/touch:
- `key.upArrow` → scroll up
- `key.return` → `onClick`
- `key.escape` → browser back button / close modal
- Single-character keys → buttons with labels
