/**
 * TUI text utilities — CJK-aware width calculation and line wrapping.
 * PWA uses CSS word-wrap, doesn't need this.
 */

/** Returns the terminal visual column width of a string. CJK/emoji = 2, ASCII = 1. */
export function visualWidth(str: string): number {
  let w = 0;
  for (const ch of str) {
    const cp = ch.codePointAt(0)!;
    if (isWide(cp)) w += 2;
    else if (cp === 0 || cp === 0x200b) { /* zero-width, skip */ }
    else w += 1;
  }
  return w;
}

function isWide(cp: number): boolean {
  return (
    (cp >= 0x1100 && cp <= 0x115f) ||   // Hangul Jamo
    (cp >= 0x2e80 && cp <= 0xa4cf) ||   // CJK + Yi
    (cp >= 0xac00 && cp <= 0xd7a3) ||   // Hangul Syllables
    (cp >= 0xf900 && cp <= 0xfaff) ||   // CJK Compatibility
    (cp >= 0xfe30 && cp <= 0xfe6f) ||   // CJK Compatibility Forms
    (cp >= 0xff01 && cp <= 0xff60) ||   // Fullwidth Forms
    (cp >= 0xffe0 && cp <= 0xffe6) ||   // Fullwidth Signs
    (cp >= 0x1f300 && cp <= 0x1f9ff) || // Emoji / Misc Symbols
    (cp >= 0x1fa00 && cp <= 0x1fa6f) || // Chess Symbols
    (cp >= 0x20000 && cp <= 0x2ffff)     // CJK Ext B+
  );
}

/**
 * Wrap text to fit within maxCols visual columns.
 * Breaks at space boundaries when possible; falls back to hard break at maxCols.
 * @param text  input text (newlines preserved)
 * @param maxCols  maximum visual width per line
 * @param indent  optional indent width for continuation lines (default 0)
 */
export function wrapLines(text: string, maxCols: number, indent = 0): string[] {
  if (maxCols <= 0) return [text];
  const lines: string[] = [];
  const paragraphs = text.split('\n');
  for (const para of paragraphs) {
    if (!para) { lines.push(''); continue; }
    let remaining = para;
    let firstLine = true;
    while (remaining.length > 0) {
      const lineMax = firstLine ? maxCols : maxCols - indent;
      if (lineMax <= 0) { lines.push(remaining); break; }
      if (visualWidth(remaining) <= lineMax) {
        lines.push((firstLine ? '' : ' '.repeat(indent)) + remaining);
        break;
      }
      // Find break point: prefer space, then CJK boundary, then hard break
      let bp = findBreakPoint(remaining, lineMax);
      lines.push((firstLine ? '' : ' '.repeat(indent)) + remaining.slice(0, bp).trimEnd());
      remaining = remaining.slice(bp).trimStart();
      firstLine = false;
    }
  }
  return lines;
}

function findBreakPoint(text: string, maxVisual: number): number {
  const chars = [...text];
  let vis = 0;
  let lastSpace = -1;
  for (let i = 0; i < chars.length; i++) {
    const cp = chars[i]!.codePointAt(0)!;
    const w = isWide(cp) ? 2 : 1;
    if (vis + w > maxVisual) {
      // Prefer space break
      if (lastSpace > 0) return lastSpace;
      return i; // hard break at current char
    }
    if (chars[i] === ' ') lastSpace = i + 1; // include the space
    vis += w;
  }
  return chars.length;
}
