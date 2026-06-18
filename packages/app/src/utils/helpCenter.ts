import { HELP_ENTRIES, type HelpEntry, type HelpTip } from '../data/help-content.js';
import type { HelpProvider, HelpEntry as CoreHelpEntry } from '@bsky/core';

// ── Re-exports ───────────────────────────────────────────────────────

export type { HelpEntry, HelpTip } from '../data/help-content.js';

export type Platform = 'pwa' | 'tui';

export type HelpCategory =
  | 'navigation'
  | 'media'
  | 'ai'
  | 'shortcuts'
  | 'settings'
  | 'social'
  | 'advanced';

// ── Localized content extraction ─────────────────────────────────────

export type Lang = 'en' | 'zh' | 'ja';

/** Extract the localized string from an inline i18n object */
export function getLocalizedText(
  obj: { en: string; zh: string; ja: string },
  lang: Lang,
): string {
  return obj[lang] ?? obj.en;
}

/** Extract all localized content from a help entry for a given language */
export function getContent(entry: HelpEntry, lang: Lang): {
  title: string;
  summary: string;
  detail: string;
  tips: Array<{ icon: string; text: string }>;
} {
  return {
    title: getLocalizedText(entry.title, lang),
    summary: getLocalizedText(entry.summary, lang),
    detail: getLocalizedText(entry.detail, lang),
    tips: entry.tips.map(tip => ({
      icon: tip.icon,
      text: getLocalizedText(tip, lang),
    })),
  };
}

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
  if (!platform) return HELP_ENTRIES;
  return HELP_ENTRIES.filter(e => e.platforms.includes(platform));
}

/** Get a single help entry by ID */
export function getHelpEntry(id: string): HelpEntry | undefined {
  return HELP_ENTRIES.find(e => e.id === id);
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

/**
 * Search help entries by query string across inline content.
 * Searches title, summary, detail, and keywords in all languages.
 */
export function searchHelp(query: string, platform?: Platform): HelpEntry[] {
  const entries = getHelpEntries(platform);
  const lowerQuery = query.toLowerCase().trim();
  if (!lowerQuery) return entries;

  const terms = lowerQuery.split(/\s+/).filter(Boolean);

  const scored = entries.map(entry => {
    let score = 0;

    // Search across all languages
    const titleText = `${entry.title.en} ${entry.title.zh} ${entry.title.ja}`.toLowerCase();
    const summaryText = `${entry.summary.en} ${entry.summary.zh} ${entry.summary.ja}`.toLowerCase();
    const detailText = `${entry.detail.en} ${entry.detail.zh} ${entry.detail.ja}`.toLowerCase();
    const tipText = entry.tips
      .map(tip => `${tip.en} ${tip.zh} ${tip.ja}`)
      .join(' ')
      .toLowerCase();

    for (const term of terms) {
      // Title match: highest weight
      if (titleText.includes(term)) score += 10;
      // Keyword match: high weight
      if (entry.keywords.some(k => k.toLowerCase().includes(term))) score += 5;
      // Summary match: medium weight
      if (summaryText.includes(term)) score += 3;
      // Tip match: medium weight
      if (tipText.includes(term)) score += 2;
      // Detail match: low weight
      if (detailText.includes(term)) score += 1;
    }

    return { entry, score };
  });

  return scored
    .filter(s => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .map(s => s.entry);
}

// ── AI Tool HelpProvider ──────────────────────────────────────────────

/**
 * Create a HelpProvider for the AI tool system.
 * Bridges the app-layer help center data (with inline content) to the core-layer
 * HelpProvider interface (with translated text).
 *
 * @param lang - Language code ('en', 'zh', 'ja')
 */
export function createHelpProvider(lang: Lang): HelpProvider {
  return {
    search(query: string): CoreHelpEntry[] {
      const results = searchHelp(query);
      return results.map(e => {
        const content = getContent(e, lang);
        return {
          id: e.id,
          category: e.category,
          title: content.title,
          summary: content.summary,
          detail: content.detail,
          platforms: e.platforms,
          tips: content.tips,
          related: e.related,
        };
      });
    },

    get(id: string): CoreHelpEntry | undefined {
      const entry = getHelpEntry(id);
      if (!entry) return undefined;
      const content = getContent(entry, lang);
      return {
        id: entry.id,
        category: entry.category,
        title: content.title,
        summary: content.summary,
        detail: content.detail,
        platforms: entry.platforms,
        tips: content.tips,
        related: entry.related,
      };
    },

    listCategories(): Array<{ name: string; count: number }> {
      const categories = getHelpCategories();
      return Object.entries(categories).map(([name, entries]) => ({
        name: CATEGORY_META[name as HelpCategory]?.labelKey
          ? name
          : name,
        count: entries.length,
      }));
    },

    listByCategory(category: string): CoreHelpEntry[] {
      const categories = getHelpCategories();
      const entries = categories[category]
        ?? Object.entries(categories).find(
          ([key, _]) => key.toLowerCase() === category.toLowerCase()
        )?.[1];
      if (!entries) return [];
      return entries.map(e => {
        const content = getContent(e, lang);
        return {
          id: e.id,
          category: e.category,
          title: content.title,
          summary: content.summary,
          detail: content.detail,
          platforms: e.platforms,
          tips: content.tips,
          related: e.related,
        };
      });
    },
  };
}
