# TUI Utilities

## text.ts — CJK-Aware Text Wrapping

**File**: `packages/tui/src/utils/text.ts`
**PWA**: Not needed. Use CSS `word-wrap: break-word`.

```typescript
// Terminal column width (CJK/emoji = 2, ASCII = 1)
function visualWidth(str: string): number

// Wrap to maxCols with CJK-aware break points
function wrapLines(text: string, maxCols: number, indent?: number): string[]
```

### wrapLines behavior
- Preserves existing `\n` paragraph breaks
- Breaks at spaces when possible
- Falls back to hard break at CJK/emoji boundaries
- Second+ lines get `indent` spaces prefix
- Example: `wrapLines("你好世界ABC测试", 6)` → `["你好世界", "ABC测试"]` (correctly accounts for CJK=2cols)

### Usage in PostItem
```typescript
const maxCols = Math.max(20, cols - 4);
for (const l of wrapLines(text, maxCols)) {
  lines.push({ text: l, ... });
}
```

### Usage in AIChatView
```typescript
for (const l of wrapLines(msg.content, maxCols, 2)) {
  lines.push('▸ ' + l);
}
```

## mouse.ts — Terminal Mouse Scroll

**File**: `packages/tui/src/utils/mouse.ts`
**PWA**: Not needed. Use browser `scroll` event.

```typescript
// Enable xterm mouse tracking (writes x1b[?1000h)
function enableMouseTracking(stdout: WriteStream): void

// Disable (x1b[?1000l)
function disableMouseTracking(stdout: WriteStream): void

// Parse stdin data for mouse escape sequences
function parseMouseEvent(data: Buffer): MouseEvent | null

interface MouseEvent {
  type: 'scrollUp' | 'scrollDown'
  col: number
  row: number
}
```

### Integration in App.tsx
```typescript
useEffect(() => {
  enableMouseTracking(stdout);
  const handler = (data: Buffer) => {
    const evt = parseMouseEvent(data);
    if (!evt) return;
    if (evt.type === 'scrollUp') feedIdx = Math.max(0, feedIdx - 1);
    else feedIdx = Math.min(posts.length - 1, feedIdx + 1);
  };
  process.stdin.on('data', handler);
  return () => {
    process.stdin.off('data', handler);
    disableMouseTracking(stdout);
  };
}, [stdout, currentView.type, posts.length]);
```

### Mouse Event Format
```
 x1b[M<button_byte><col+32><row+32>
 button_byte 64 (0x60) = scroll up
 button_byte 65 (0x61) = scroll down
```

### Terminal Compatibility
- ✅ Windows Terminal, iTerm2, Kitty, WezTerm, tmux 3.3+
- ❌ ConEmu, traditional cmd.exe (harmless — write ignored)
- Fallback (passthrough stream) unaffected
