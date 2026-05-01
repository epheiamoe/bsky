import React from 'react';

/**
 * Icon component using lucide-style inline SVGs.
 * Icons are defined as path data extracted from the SVG files in src/icons/.
 * SVG files are auto-imported by Vite as raw strings via ?raw transform.
 */

// ── Import all icon SVGs as raw strings ──
const iconFiles = import.meta.glob('../icons/*.svg', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;

// Build lookup: filename without ext → raw SVG string
const SVG_RAW: Record<string, string> = {};
for (const [path, raw] of Object.entries(iconFiles)) {
  const name = path.split('/').pop()?.replace('.svg', '') ?? '';
  SVG_RAW[name] = raw;
}

export type IconName = string;

interface IconProps {
  name: IconName;
  size?: number;
  className?: string;
  filled?: boolean;
}

function injectSize(html: string, size: number, filled?: boolean): string {
  return html
    .replace(/width="24"/g, `width="${size}"`)
    .replace(/height="24"/g, `height="${size}"`)
    .replace(/fill="none"/, filled ? 'fill="currentColor"' : 'fill="none"');
}

/**
 * Inline SVG icon component (lucide style).
 * Uses stroke="currentColor" to inherit text color.
 *
 * Available icon names are the filenames in src/icons/ without .svg extension.
 * E.g.: 'heart', 'bookmark', 'pen-line', 'arrow-big-left', etc.
 */
export function Icon({ name, size = 18, className = '', filled }: IconProps) {
  const raw = SVG_RAW[name];
  if (!raw) return null;

  return (
    <span
      className={`inline-flex items-center justify-center flex-shrink-0 align-middle ${className}`}
      style={{ width: size, height: size }}
      dangerouslySetInnerHTML={{ __html: injectSize(raw, size, filled) }}
      aria-hidden="true"
    />
  );
}

/** List available icon names (for reference) */
export const ICON_NAMES = Object.keys(SVG_RAW);
