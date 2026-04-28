/**
 * Mouse event parsing for terminal scroll support.
 * Enables xterm mouse tracking (x1b[?1000h) and parses scroll events.
 * PWA uses native scroll events — this is TUI-only.
 */
import type { WriteStream } from 'tty';

export interface MouseEvent {
  type: 'scrollUp' | 'scrollDown';
  col: number;
  row: number;
}

/** Enable mouse tracking on stdout. Safe to call even if unsupported. */
export function enableMouseTracking(stdout: WriteStream): void {
  try { stdout.write('\x1b[?1000h'); } catch {}
}

/** Disable mouse tracking. */
export function disableMouseTracking(stdout: WriteStream): void {
  try { stdout.write('\x1b[?1000l'); } catch {}
}

/**
 * Parse a raw stdin data buffer for mouse escape sequences.
 * Returns a MouseEvent if found, null otherwise.
 * Mouse events format: x1b[M<button><col+32><row+32>
 *   scrollUp   = button 64 (0x60)
 *   scrollDown = button 65 (0x61)
 */
let mouseBuf = '';

export function parseMouseEvent(data: Buffer): MouseEvent | null {
  const str = data.toString();
  for (const ch of str) {
    mouseBuf += ch;
    // Look for complete mouse sequence: x1b[M + 3 bytes
    if (mouseBuf.startsWith('\x1b[M') && mouseBuf.length >= 6) {
      const button = mouseBuf.charCodeAt(3);
      const col = mouseBuf.charCodeAt(4) - 32;
      const row = mouseBuf.charCodeAt(5) - 32;
      mouseBuf = '';
      if (button === 64) return { type: 'scrollUp', col, row };
      if (button === 65) return { type: 'scrollDown', col, row };
    }
    // Prevent runaway buffer
    if (mouseBuf.length > 20 && !mouseBuf.startsWith('\x1b[M')) {
      mouseBuf = '';
    }
  }
  return null;
}
