import React from 'react';
import type { AppView } from '@bsky/app';
import { useI18n, isBskyAppUrl } from '@bsky/app';
import { BskyLinkCard } from './BskyLinkCard.js';

// ── Color utility ──

/**
 * Convert a {r,g,b} color object to a CSS "rgb(r,g,b)" string.
 * Returns undefined if the color object is missing, so inline styles
 * gracefully fall back to CSS defaults.
 */
function colorRGBToString(c?: { r: number; g: number; b: number }): string | undefined {
  if (!c) return undefined;
  return `rgb(${c.r},${c.g},${c.b})`;
}

// ── Relative time formatting ──

const MINUTE = 60;
const HOUR = 3600;
const DAY = 86400;
const WEEK = 604800;
const MONTH = 2592000;
const YEAR = 31536000;

/**
 * Format a date relative to now for the UI footer.
 * Uses Intl.RelativeTimeFormat when the value fits its supported units
 * (second/minute/hour/day/week); falls back to a short localized date
 * for older timestamps.
 */
function formatRelativeTime(isoString: string): string {
  const date = new Date(isoString);
  const now = new Date();
  const diffSeconds = (now.getTime() - date.getTime()) / 1000;

  // Intl.RelativeTimeFormat only supports second/minute/hour/day/week
  try {
    const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto', style: 'short' });

    if (diffSeconds < MINUTE) {
      return rtf.format(-Math.floor(diffSeconds), 'second');
    }
    if (diffSeconds < HOUR) {
      return rtf.format(-Math.floor(diffSeconds / MINUTE), 'minute');
    }
    if (diffSeconds < DAY) {
      return rtf.format(-Math.floor(diffSeconds / HOUR), 'hour');
    }
    if (diffSeconds < WEEK) {
      return rtf.format(-Math.floor(diffSeconds / DAY), 'day');
    }
    if (diffSeconds < MONTH) {
      return rtf.format(-Math.floor(diffSeconds / WEEK), 'week');
    }
  } catch {
    // Intl not available — fall through to date-only
  }

  // Older than a month: show short date
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined });
}

// ── Props ──

/**
 * Inline type avoids importing ExtractExternalLink from @bsky/app,
 * preventing circular dependency chains in the PWA component layer.
 */
export interface ExternalLinkCardProps {
  link: {
    uri: string;
    title: string;
    description: string;
    /** Thumbnail CDN URL [viewExternal] */
    thumb?: string;
    /** Content creation timestamp (ISO string) [viewExternal] */
    createdAt?: string;
    /** Content update timestamp (ISO string) [viewExternal] */
    updatedAt?: string;
    /** Estimated reading time in minutes [viewExternal] */
    readingTime?: number;
    /** Publication source with icon + theme [viewExternal] */
    source?: {
      uri: string;
      icon?: string;
      title: string;
      description?: string;
      theme?: {
        backgroundRGB?: { r: number; g: number; b: number };
        foregroundRGB?: { r: number; g: number; b: number };
        accentRGB?: { r: number; g: number; b: number };
        accentForegroundRGB?: { r: number; g: number; b: number };
      };
    };
  };
  /** Handler for bsky.app URLs (opens choice modal instead of navigating away) */
  onOpenInternal?: (view: AppView) => void;
}

// ── Component ──

/**
 * Rich external link card with viewExternal metadata support.
 *
 * Layout adapts to available data:
 * - bsky.app URLs → delegates to BskyLinkCard (in-app choice modal)
 * - Has source → header row with source icon + name
 * - Has theme   → colored background/border via inline styles
 * - Has thumb   → left-aligned 80px thumbnail
 * - Always      → title (bold) + description (muted) + URI footer
 *
 * All viewExternal fields (thumb, source, readingTime, timestamps) are
 * optional — the card gracefully degrades to the minimal title+url layout.
 */
export function ExternalLinkCard({ link, onOpenInternal }: ExternalLinkCardProps) {
  const { t } = useI18n();

  // ── bsky.app URL: delegate to BskyLinkCard ──
  if (isBskyAppUrl(link.uri) && onOpenInternal) {
    return <BskyLinkCard url={link.uri} onOpenInternal={onOpenInternal} />;
  }

  // ── Theme colors from source ──
  const theme = link.source?.theme;
  const bgColor = colorRGBToString(theme?.backgroundRGB);
  const borderColor = colorRGBToString(theme?.accentRGB) ?? bgColor;
  const fgColor = colorRGBToString(theme?.foregroundRGB);
  const hasTheme = Boolean(bgColor);

  // ── Reading time ──
  const readingTimeLabel =
    link.readingTime != null && link.readingTime > 0
      ? t('external.readingTime', { minutes: String(link.readingTime) })
      : undefined;

  // ── Timestamp (use updatedAt if newer than createdAt) ──
  const displayTimestamp =
    link.updatedAt ?? link.createdAt;
  const relativeTime = displayTimestamp
    ? formatRelativeTime(displayTimestamp)
    : undefined;

  // ── aria-label for screen readers ──
  const ariaParts: string[] = [link.title || link.uri];
  if (readingTimeLabel) ariaParts.push(readingTimeLabel);
  if (link.source?.title) {
    const bySource = t('external.bySource', { source: link.source.title });
    ariaParts.push(bySource);
  }
  const ariaLabel = ariaParts.join(', ');

  // ── Determine text color when themed background is present ──
  // Use foregroundRGB if provided; otherwise fall back to CSS variable.
  const textStyle = fgColor ? { color: fgColor } : undefined;
  // For muted text on themed background, use foreground with reduced opacity
  const mutedStyle = fgColor
    ? { color: fgColor, opacity: 0.7 }
    : undefined;

  const cardStyle: React.CSSProperties | undefined = hasTheme
    ? {
        backgroundColor: bgColor,
        borderColor: borderColor,
        ...(textStyle ?? {}),
      }
    : undefined;

  return (
    <a
      href={link.uri}
      target="_blank"
      rel="noopener noreferrer"
      onClick={(e) => e.stopPropagation()}
      aria-label={ariaLabel}
      className={`mt-2 block rounded-lg border p-3 transition-colors no-underline ${
        hasTheme
          ? ''
          : 'border-border hover:bg-surface'
      }`}
      style={cardStyle}
    >
      {/* ── Source publisher header ── */}
      {link.source && (
        <div className="flex items-center gap-1.5 mb-2">
          {link.source.icon && (
            <img
              src={link.source.icon}
              alt=""
              className="w-4 h-4 rounded-sm object-cover shrink-0"
              aria-hidden="true"
            />
          )}
          <span
            className="text-xs truncate"
            style={mutedStyle}
          >
            {link.source.title}
          </span>
        </div>
      )}

      {/* ── Content: thumbnail + text ── */}
      <div className="flex gap-3">
        {link.thumb && (
          <img
            src={link.thumb}
            alt=""
            className="w-20 h-20 rounded object-cover shrink-0"
            loading="lazy"
            aria-hidden="true"
          />
        )}
        <div className="min-w-0 flex-1">
          <p
            className={`font-semibold text-sm line-clamp-2 ${
              hasTheme ? '' : 'text-text-primary'
            }`}
            style={hasTheme ? textStyle : undefined}
          >
            {link.title || link.uri}
          </p>
          {link.description && (
            <p
              className={`text-xs mt-0.5 line-clamp-2 ${
                hasTheme ? '' : 'text-text-secondary'
              }`}
              style={hasTheme ? mutedStyle : undefined}
            >
              {link.description}
            </p>
          )}
        </div>
      </div>

      {/* ── Footer: reading time, timestamp, URI ── */}
      <div className="flex items-center gap-2 mt-2 flex-wrap">
        {readingTimeLabel && (
          <span
            className="text-xs shrink-0"
            style={hasTheme ? mutedStyle : { color: 'var(--color-text-muted)' }}
          >
            {readingTimeLabel}
          </span>
        )}
        {readingTimeLabel && relativeTime && (
          <span
            className="text-xs opacity-40 select-none shrink-0"
            aria-hidden="true"
            style={hasTheme ? { color: fgColor } : undefined}
          >
            ·
          </span>
        )}
        {relativeTime && (
          <span
            className="text-xs shrink-0"
            style={hasTheme ? mutedStyle : { color: 'var(--color-text-muted)' }}
          >
            {relativeTime}
          </span>
        )}
        <span
          className={`text-xs truncate ${
            hasTheme ? '' : 'text-primary'
          }`}
          style={hasTheme ? mutedStyle : undefined}
        >
          {link.uri}
        </span>
      </div>
    </a>
  );
}
