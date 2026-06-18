import helpData from '../data/help-center.json';
import type { HelpProvider, HelpEntry as CoreHelpEntry } from '@bsky/core';

// ── Types ─────────────────────────────────────────────────────────────

export interface HelpTip {
  icon: string;
  textKey: string;
}

export interface HelpEntry {
  id: string;
  category: string;
  icon: string;
  titleKey: string;
  summaryKey: string;
  detailKey: string;
  platforms: Array<'pwa' | 'tui'>;
  tips: HelpTip[];
  keywords: string[];
  related?: string[];
}

export type Platform = 'pwa' | 'tui';

export type HelpCategory =
  | 'navigation'
  | 'media'
  | 'ai'
  | 'shortcuts'
  | 'settings'
  | 'social'
  | 'advanced';

// ── Category metadata (for rendering category headers) ────────────────

interface CategoryInfo {
  labelKey: string;
  icon: string;
  emoji: string;
}

const CATEGORY_META: Record<HelpCategory, CategoryInfo> = {
  navigation: { labelKey: 'help.category.navigation', icon: 'compass', emoji: '🧭' },
  media:      { labelKey: 'help.category.media',      icon: 'image',  emoji: '🖼️' },
  ai:         { labelKey: 'help.category.ai',         icon: 'astroid-as-AI-Button', emoji: '🤖' },
  shortcuts:  { labelKey: 'help.category.shortcuts',  icon: 'keyboard', emoji: '⌨️' },
  settings:   { labelKey: 'help.category.settings',   icon: 'settings', emoji: '⚙️' },
  social:     { labelKey: 'help.category.social',     icon: 'users',  emoji: '👥' },
  advanced:   { labelKey: 'help.category.advanced',   icon: 'cpu',    emoji: '🔬' },
};

/** TUI icon mapping: Lucide name → emoji fallback */
const ICON_EMOJI_MAP: Record<string, string> = {
  'clipboard-paste': '📋',
  'at-sign': '@',
  'globe': '🌐',
  'file-image': '🖼️',
  'image': '🖼️',
  'video': '🎬',
  'music': '🎵',
  'astroid-as-AI-Button': '🤖',
  'sparkles': '✨',
  'flask-conical': '🧪',
  'key': '🔑',
  'keyboard': '⌨️',
  'hash': '#',
  'shield': '🛡️',
  'palette': '🎨',
  'eye': '👁️',
  'layout-grid': '⊞',
  'users': '👥',
  'list': '📋',
  'bookmark': '🔖',
  'zap': '⚡',
  'monitor': '🖥️',
  'terminal': '>_',
  'type': '⌨️',
  'search': '🔍',
  'settings': '⚙️',
  'copy': '📄',
  'mouse-pointer-click': '🖱️',
  'link': '🔗',
  'bell': '🔔',
  'message-circle': '💬',
  'repeat': '🔄',
  'heart': '❤️',
  'table': '📊',
  'cpu': '🔬',
  'compass': '🧭',
  'default': '❓',
};

// ── Core query functions ──────────────────────────────────────────────

/** Get all help entries, optionally filtered by platform */
export function getHelpEntries(platform?: Platform): HelpEntry[] {
  const entries = helpData as HelpEntry[];
  if (!platform) return entries;
  return entries.filter(e => e.platforms.includes(platform));
}

/** Get a single help entry by ID */
export function getHelpEntry(id: string): HelpEntry | undefined {
  return (helpData as HelpEntry[]).find(e => e.id === id);
}

/** Get all categories with their entries, optionally filtered by platform */
export function getHelpCategories(platform?: Platform): Record<string, HelpEntry[]> {
  const entries = getHelpEntries(platform);
  const categories: Record<string, HelpEntry[]> = {};
  for (const entry of entries) {
    if (!categories[entry.category]) {
      categories[entry.category] = [];
    }
    categories[entry.category]!.push(entry);
  }
  return categories;
}

/** Get display metadata for a category (label i18n key, Lucide icon, emoji) */
export function getCategoryInfo(category: string): CategoryInfo {
  return CATEGORY_META[category as HelpCategory] ?? {
    labelKey: `help.category.${category}`,
    icon: 'help-circle',
    emoji: '❓',
  };
}

/** Map a Lucide icon name to an emoji (for TUI rendering) */
export function iconToEmoji(icon: string): string {
  return ICON_EMOJI_MAP[icon] ?? ICON_EMOJI_MAP['default']!;
}

/** Search help entries by query string. Returns results sorted by relevance. */
export function searchHelp(query: string, platform?: Platform): HelpEntry[] {
  const entries = getHelpEntries(platform);
  const lowerQuery = query.toLowerCase().trim();
  if (!lowerQuery) return entries;

  const terms = lowerQuery.split(/\s+/).filter(Boolean);

  const scored = entries.map(entry => {
    let score = 0;
    const titleLower = entry.titleKey.toLowerCase();
    const summaryLower = entry.summaryKey.toLowerCase();
    const detailLower = entry.detailKey.toLowerCase();

    for (const term of terms) {
      // Title match: highest weight
      if (titleLower.includes(term)) score += 10;
      // Keyword match: high weight
      if (entry.keywords.some(k => k.toLowerCase().includes(term))) score += 5;
      // Summary match: medium weight
      if (summaryLower.includes(term)) score += 3;
      // Detail match: low weight
      if (detailLower.includes(term)) score += 1;
    }

    return { entry, score };
  });

  return scored
    .filter(s => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .map(s => s.entry);
}

// ── AI Tool HelpProvider ──────────────────────────────────────────────

/** Translate a raw HelpEntry (with i18n keys) into a CoreHelpEntry (with translated text) */
function translateEntry(entry: HelpEntry, t: (key: string) => string): CoreHelpEntry {
  return {
    id: entry.id,
    category: entry.category,
    title: t(entry.titleKey),
    summary: t(entry.summaryKey),
    detail: t(entry.detailKey),
    platforms: entry.platforms,
    tips: entry.tips.map(tip => ({ icon: tip.icon, text: t(tip.textKey) })),
    related: entry.related,
  };
}

/**
 * Create a HelpProvider for the AI tool system.
 * Bridges the app-layer help center data (with i18n keys) to the core-layer
 * HelpProvider interface (with translated text).
 *
 * @param t - i18n translation function (e.g., from getI18nStore().t)
 */
export function createHelpProvider(t: (key: string) => string): HelpProvider {
  return {
    search(query: string): CoreHelpEntry[] {
      const results = searchHelp(query);
      return results.map(e => translateEntry(e, t));
    },

    get(id: string): CoreHelpEntry | undefined {
      const entry = getHelpEntry(id);
      return entry ? translateEntry(entry, t) : undefined;
    },

    listCategories(): Array<{ name: string; count: number }> {
      const categories = getHelpCategories();
      return Object.entries(categories).map(([name, entries]) => ({
        name: t(`help.category.${name}`) || name,
        count: entries.length,
      }));
    },

    listByCategory(category: string): CoreHelpEntry[] {
      const categories = getHelpCategories();
      // Match by category key (e.g., "media") or translated name (e.g., "Media")
      const entries = categories[category]
        ?? Object.entries(categories).find(
          ([key, _]) => t(`help.category.${key}`).toLowerCase() === category.toLowerCase()
        )?.[1];
      if (!entries) return [];
      return entries.map(e => translateEntry(e, t));
    },
  };
}
