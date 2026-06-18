import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useI18n } from '@bsky/app';
import { getHelpCategories, getCategoryInfo, getContent, type HelpEntry, type Platform, type Lang } from '@bsky/app';
import { Icon } from './Icon.js';

// ── Glass card styles (using CSS variables for light/dark + CVD support) ──

// Glass card base styles — hover visual effects (background, border, boxShadow)
// are handled by CSS :hover in ensureStyles() for reliable border reset.
const GLASS_CARD_BASE: React.CSSProperties = {
  backdropFilter: 'blur(16px)',
};

const SEARCH_INPUT_STYLE: React.CSSProperties = {
  background: 'color-mix(in srgb, var(--color-surface) 60%, transparent)',
  border: '1px solid var(--color-border)',
};

const SEARCH_INPUT_FOCUS: React.CSSProperties = {
  background: 'color-mix(in srgb, var(--color-surface) 80%, transparent)',
  borderColor: 'var(--color-primary)',
  boxShadow: '0 0 0 3px color-mix(in srgb, var(--color-primary) 15%, transparent)',
};

const ICON_BOX_STYLE: React.CSSProperties = {
  background: 'linear-gradient(135deg, color-mix(in srgb, var(--color-primary) 15%, transparent) 0%, color-mix(in srgb, var(--color-primary) 5%, transparent) 100%)',
  border: '1px solid color-mix(in srgb, var(--color-primary) 15%, transparent)',
};

const KBD_STYLE: React.CSSProperties = {
  background: 'color-mix(in srgb, var(--color-surface) 80%, transparent)',
  border: '1px solid var(--color-border)',
  boxShadow: '0 2px 0 color-mix(in srgb, var(--color-border) 20%, transparent)',
};

const TIP_ITEM_STYLE: React.CSSProperties = {
  background: 'color-mix(in srgb, var(--color-surface) 60%, transparent)',
  border: '1px solid var(--color-border)',
};

// ── Keyframe + modal animation styles (injected once) ──────────────

const STYLE_ID = 'help-page-styles';

function ensureStyles() {
  if (typeof document === 'undefined') return;
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    @keyframes helpCardEnter {
      from { opacity: 0; transform: translateY(20px) scale(0.96); }
      to   { opacity: 1; transform: translateY(0) scale(1); }
    }

    /* Modal overlay transitions */
    .help-modal-overlay {
      transition: opacity 0.3s ease;
    }
    .help-modal-overlay.closing {
      opacity: 0 !important;
      pointer-events: none !important;
    }

    /* Mobile: bottom sheet slide */
    .help-modal-sheet {
      transition: transform 0.4s cubic-bezier(0.32, 0.72, 0, 1), opacity 0.3s ease;
      transform: translateY(0);
    }
    .help-modal-sheet.opening {
      transform: translateY(100%);
    }
    .help-modal-sheet.closing {
      transform: translateY(100%) !important;
    }
    .help-modal-sheet.dragging {
      transition: none !important;
    }

    /* Desktop: centered scale animation */
    @media (min-width: 768px) {
      .help-modal-sheet {
        transition: all 0.4s cubic-bezier(0.32, 0.72, 0, 1);
      }
      .help-modal-sheet.opening {
        transform: translateY(20px) scale(0.96);
        opacity: 0;
      }
      .help-modal-sheet.closing {
        transform: translateY(20px) scale(0.96) !important;
        opacity: 0 !important;
      }
    }

    /* Hide scrollbar */
    .help-modal-content::-webkit-scrollbar { display: none; }
    .help-modal-content { -ms-overflow-style: none; scrollbar-width: none; }

    /* Glass card hover — CSS :hover for reliable border reset */
    .help-glass-card {
      background: color-mix(in srgb, var(--color-surface) 50%, transparent);
      border: 1px solid transparent;
      box-shadow: 0 0 0 1px color-mix(in srgb, var(--color-border) 10%, transparent) inset, 0 4px 24px rgba(0,0,0,0.2);
      transition: background 0.4s cubic-bezier(0.4, 0, 0.2, 1), border-color 0.4s cubic-bezier(0.4, 0, 0.2, 1), box-shadow 0.4s cubic-bezier(0.4, 0, 0.2, 1), transform 0.4s cubic-bezier(0.4, 0, 0.2, 1);
    }
    .help-glass-card:hover {
      background: color-mix(in srgb, var(--color-surface) 70%, transparent);
      border-color: color-mix(in srgb, var(--color-border) 50%, transparent);
      box-shadow: 0 0 0 1px color-mix(in srgb, var(--color-border) 15%, transparent) inset, 0 12px 40px rgba(0,0,0,0.3);
    }
  `;
  document.head.appendChild(style);
}

// ── Component ──────────────────────────────────────────────────────

interface HelpPageProps {
  goBack: () => void;
}

export function HelpPage({ goBack: _goBack }: HelpPageProps) {
  const { t, locale } = useI18n();

  // Map i18n locale to help content language
  const lang: Lang = useMemo(() => {
    if (locale === 'zh' || locale === 'ja') return locale;
    return 'en';
  }, [locale]);

  // ── State ──
  const [query, setQuery] = useState('');
  const [selectedEntry, setSelectedEntry] = useState<HelpEntry | null>(null);
  const [searchFocused, setSearchFocused] = useState(false);
  const [hoveredCard, setHoveredCard] = useState<string | null>(null);
  const [activeCard, setActiveCard] = useState<string | null>(null);
  const [collapsedCategories, setCollapsedCategories] = useState<Set<string>>(new Set());

  const searchRef = useRef<HTMLInputElement>(null);
  const modalRef = useRef<HTMLDivElement>(null!);
  const touchStartY = useRef(0);
  const [modalDragY, setModalDragY] = useState(0);
  const [isModalClosing, setIsModalClosing] = useState(false);
  const [isModalOpening, setIsModalOpening] = useState(false);

  // Inject styles on mount
  useEffect(() => { ensureStyles(); }, []);

  // ── Data ──
  const categories = useMemo(() => getHelpCategories('pwa' as Platform), []);

  // ── Search (across inline content in current language + keywords) ──
  const filteredCategories = useMemo(() => {
    const lowerQuery = query.toLowerCase().trim();
    if (!lowerQuery) return categories;

    const terms = lowerQuery.split(/\s+/).filter(Boolean);
    const result: Record<string, HelpEntry[]> = {};

    for (const [cat, entries] of Object.entries(categories)) {
      const matched = entries.filter(entry => {
        const content = getContent(entry, lang);
        const title = content.title.toLowerCase();
        const summary = content.summary.toLowerCase();
        const detail = content.detail.toLowerCase();
        const keywords = entry.keywords.map(k => k.toLowerCase());

        return terms.some(term =>
          title.includes(term) ||
          summary.includes(term) ||
          detail.includes(term) ||
          keywords.some(k => k.includes(term))
        );
      });
      if (matched.length > 0) result[cat] = matched;
    }
    return result;
  }, [query, categories, lang]);

  const hasResults = Object.keys(filteredCategories).length > 0;

  // ── Keyboard shortcuts ──
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === '/' && document.activeElement !== searchRef.current) {
        e.preventDefault();
        searchRef.current?.focus();
      }
      if (e.key === 'Escape') {
        if (selectedEntry) {
          closeModal();
        } else if (searchRef.current && document.activeElement === searchRef.current) {
          searchRef.current.blur();
        }
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [selectedEntry]);

  // ── Modal body scroll lock (with scrollbar width compensation) ──
  useEffect(() => {
    if (selectedEntry) {
      const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;
      document.body.style.overflow = 'hidden';
      document.body.style.paddingRight = `${scrollbarWidth}px`;
    } else {
      document.body.style.overflow = '';
      document.body.style.paddingRight = '';
    }
    return () => {
      document.body.style.overflow = '';
      document.body.style.paddingRight = '';
    };
  }, [selectedEntry]);

  // ── Modal actions ──
  const openModal = useCallback((entry: HelpEntry) => {
    setSelectedEntry(entry);
    setModalDragY(0);
    setIsModalClosing(false);
    setIsModalOpening(true);
    // Allow the opening class to apply first, then remove it to trigger transition
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        setIsModalOpening(false);
      });
    });
  }, []);

  const closeModal = useCallback(() => {
    setIsModalClosing(true);
    setTimeout(() => {
      setSelectedEntry(null);
      setIsModalClosing(false);
      setModalDragY(0);
    }, 400);
  }, []);

  // ── Touch drag for mobile bottom sheet ──
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    touchStartY.current = e.touches[0]!.clientY;
  }, []);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    const diff = e.touches[0]!.clientY - touchStartY.current;
    if (diff > 0) setModalDragY(diff);
  }, []);

  const handleTouchEnd = useCallback(() => {
    if (modalDragY > 80) {
      closeModal();
    } else {
      setModalDragY(0);
    }
  }, [modalDragY, closeModal]);

  // ── Toggle category collapse (mobile) ──
  const toggleCategory = useCallback((cat: string) => {
    setCollapsedCategories(prev => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat);
      else next.add(cat);
      return next;
    });
  }, []);

  // ── Render ──
  return (
    <div className="min-h-[100dvh] relative" style={{ background: 'var(--color-background)', color: 'var(--color-text-primary)' }}>
      {/* Background ambiance */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none" aria-hidden="true">
        <div
          className="absolute rounded-full"
          style={{
            top: '-10%', left: '-5%', width: 400, height: 400,
            background: 'color-mix(in srgb, var(--color-primary) 4%, transparent)', filter: 'blur(100px)',
          }}
        />
        <div
          className="absolute rounded-full"
          style={{
            bottom: '-10%', right: '-5%', width: 500, height: 500,
            background: 'color-mix(in srgb, var(--color-primary) 3%, transparent)', filter: 'blur(100px)',
          }}
        />
      </div>

      {/* Content */}
      <div className="relative z-10 max-w-5xl mx-auto px-4 py-8 md:py-12">
        {/* Header */}
        <div className="text-center mb-6">
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight" style={{ color: 'var(--color-text-primary)' }}>
            {t('help.title')}
          </h1>
          <p className="text-sm mt-1" style={{ color: 'var(--color-text-secondary)' }}>
            {t('help.searchPlaceholder').replace('...', '').replace('\u2026', '')}
          </p>
        </div>

        {/* Search bar */}
        <div className="relative max-w-md mx-auto mb-8 md:mb-10">
          <div className="absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none">
            <Icon name="search" size={16} className="text-[var(--color-text-secondary)]" />
          </div>
          <input
            ref={searchRef}
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            onFocus={() => setSearchFocused(true)}
            onBlur={() => setSearchFocused(false)}
            placeholder={t('help.searchPlaceholder')}
            className="w-full rounded-xl pl-10 pr-4 py-3 text-sm focus:outline-none transition-all duration-300"
            style={{
              ...SEARCH_INPUT_STYLE,
              ...(searchFocused ? SEARCH_INPUT_FOCUS : {}),
              color: 'var(--color-text-primary)',
            }}
            aria-label={t('help.searchPlaceholder')}
          />
          {/* Keyboard shortcut hint (desktop only) */}
          <div className="absolute right-3 top-1/2 -translate-y-1/2 hidden md:flex items-center gap-1">
            <kbd
              className="px-1.5 py-0.5 rounded text-[10px]"
              style={{ ...KBD_STYLE, color: 'var(--color-text-secondary)' }}
            >
              /
            </kbd>
          </div>
        </div>

        {/* Card grid by category */}
        {hasResults ? (
          <div className="space-y-8">
            {Object.entries(filteredCategories).map(([category, entries]) => {
              const catInfo = getCategoryInfo(category);
              const isCollapsed = collapsedCategories.has(category);

              return (
                <section key={category} aria-labelledby={`cat-${category}`}>
                  {/* Category header */}
                  <button
                    type="button"
                    id={`cat-${category}`}
                    className="flex items-center gap-2 mb-4 group cursor-pointer md:cursor-default"
                    onClick={() => toggleCategory(category)}
                    aria-expanded={!isCollapsed}
                  >
                    <div
                      className="w-8 h-8 rounded-lg flex items-center justify-center"
                      style={ICON_BOX_STYLE}
                    >
                      <Icon name={catInfo.icon} size={16} className="text-[var(--color-primary)]" />
                    </div>
                    <h2 className="text-sm font-semibold group-hover:opacity-100 transition-colors" style={{ color: 'var(--color-text-secondary)' }}>
                      {t(catInfo.labelKey)}
                    </h2>
                    <span className="text-xs ml-1" style={{ color: 'var(--color-text-secondary)', opacity: 0.5 }}>
                      {entries.length}
                    </span>
                    {/* Collapse arrow (mobile only) */}
                    <div className="ml-auto md:hidden">
                      <Icon
                        name={isCollapsed ? 'chevron-down' : 'chevron-up'}
                        size={14}
                        className="text-[var(--color-text-secondary)]"
                      />
                    </div>
                  </button>

                  {/* Cards grid */}
                  {!isCollapsed && (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 md:gap-4">
                      {entries.map((entry, index) => (
                        <HelpCard
                          key={entry.id}
                          entry={entry}
                          index={index}
                          lang={lang}
                          isHovered={hoveredCard === entry.id}
                          isActive={activeCard === entry.id}
                          onHover={() => setHoveredCard(entry.id)}
                          onLeave={() => setHoveredCard(null)}
                          onActivate={() => setActiveCard(entry.id)}
                          onDeactivate={() => setActiveCard(null)}
                          onClick={() => openModal(entry)}
                        />
                      ))}
                    </div>
                  )}
                </section>
              );
            })}
          </div>
        ) : (
          /* Empty state */
          <div className="flex flex-col items-center justify-center py-20">
            <div
              className="w-16 h-16 rounded-2xl flex items-center justify-center mb-4"
              style={{
                background: 'color-mix(in srgb, var(--color-surface) 60%, transparent)',
                border: '1px solid var(--color-border)',
              }}
            >
              <Icon name="search-x" size={28} className="text-[var(--color-text-secondary)]" />
            </div>
            <p className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>{t('help.noResults')}</p>
            <button
              type="button"
              onClick={() => { setQuery(''); searchRef.current?.focus(); }}
              className="mt-3 text-sm transition-opacity hover:opacity-80"
              style={{ color: 'var(--color-primary)' }}
            >
              {t('help.clearSearch')}
            </button>
          </div>
        )}

        {/* Footer hint */}
        <div className="mt-12 text-center">
          <p className="text-xs" style={{ color: 'var(--color-text-secondary)', opacity: 0.4 }}>
            Press <kbd className="px-1 rounded text-[10px]" style={KBD_STYLE}>/</kbd> to search
          </p>
        </div>
      </div>

      {/* Modal / Bottom Sheet */}
      {selectedEntry && (
        <DetailModal
          entry={selectedEntry}
          lang={lang}
          onClose={closeModal}
          isClosing={isModalClosing}
          isOpening={isModalOpening}
          dragY={modalDragY}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          modalRef={modalRef}
        />
      )}
    </div>
  );
}

// ── Help Card Sub-component ────────────────────────────────────────

interface HelpCardProps {
  entry: HelpEntry;
  index: number;
  lang: Lang;
  isHovered: boolean;
  isActive: boolean;
  onHover: () => void;
  onLeave: () => void;
  onActivate: () => void;
  onDeactivate: () => void;
  onClick: () => void;
}

function HelpCard({
  entry, index, lang,
  isHovered, isActive,
  onHover, onLeave, onActivate, onDeactivate, onClick,
}: HelpCardProps) {
  const { t } = useI18n();
  const isPwaOnly = entry.platforms.length === 1 && entry.platforms[0] === 'pwa';
  const content = getContent(entry, lang);

  return (
    <div
      role="button"
      tabIndex={0}
      className="help-glass-card rounded-2xl p-5 cursor-pointer group focus:outline-none focus:ring-0"
      style={{
        ...GLASS_CARD_BASE,
        animation: `helpCardEnter 0.5s ease-out ${index * 0.05}s forwards`,
        opacity: 0,
        transform: isHovered ? 'translateY(-2px)' : isActive ? 'scale(0.98)' : 'none',
      }}
      onClick={onClick}
      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(); } }}
      onMouseEnter={onHover}
      onMouseLeave={onLeave}
      onMouseDown={onActivate}
      onMouseUp={onDeactivate}
      aria-label={`${content.title} \u2014 ${content.summary}`}
    >
      <div className="flex items-start gap-4">
        {/* Icon box */}
        <div
          className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0 transition-transform duration-300"
          style={{
            ...ICON_BOX_STYLE,
            transform: isHovered ? 'scale(1.1)' : 'none',
          }}
        >
          <Icon name={entry.icon} size={20} className="text-[var(--color-primary)]" />
        </div>

        {/* Content */}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 mb-1">
            <h3
              className="font-semibold text-[15px] transition-colors"
              style={{ color: isHovered ? 'var(--color-primary)' : 'var(--color-text-primary)' }}
            >
              {content.title}
            </h3>
            {isPwaOnly && (
              <span
                className="text-[10px] px-1.5 py-0.5 rounded font-medium"
                style={{
                  background: 'color-mix(in srgb, var(--color-primary) 15%, transparent)',
                  color: 'var(--color-primary)',
                  border: '1px solid color-mix(in srgb, var(--color-primary) 25%, transparent)',
                }}
              >
                {t('help.platform.pwa')}
              </span>
            )}
          </div>
          <p className="text-sm leading-relaxed line-clamp-2" style={{ color: 'var(--color-text-secondary)' }}>
            {content.summary}
          </p>
        </div>

        {/* Chevron (appears on hover) */}
        <div
          className="flex-shrink-0 self-center transition-all duration-300"
          style={{
            opacity: isHovered ? 1 : 0,
            transform: isHovered ? 'translateX(0)' : 'translateX(-8px)',
          }}
        >
          <Icon name="chevron-right" size={16} className="text-[var(--color-text-secondary)]" />
        </div>
      </div>
    </div>
  );
}

// ── Simple Markdown renderer ────────────────────────────────────────

/** Convert basic markdown to React elements. Supports: **bold**, `- lists`, `code`, `[links](url)` */
function renderMarkdown(text: string): React.ReactNode[] {
  const lines = text.split('\n');
  const elements: React.ReactNode[] = [];
  let listItems: React.ReactNode[] = [];
  let inCodeBlock = false;
  let codeLines: string[] = [];

  const flushList = () => {
    if (listItems.length > 0) {
      elements.push(
        <ul key={`list-${elements.length}`} className="list-disc list-inside space-y-1 mb-4" style={{ color: 'var(--color-text-secondary)' }}>
          {listItems}
        </ul>
      );
      listItems = [];
    }
  };

  const flushCodeBlock = () => {
    if (codeLines.length > 0) {
      elements.push(
        <pre key={`code-${elements.length}`} className="mb-4 p-3 rounded-lg text-sm overflow-x-auto" style={{ background: 'color-mix(in srgb, var(--color-surface) 60%, transparent)', border: '1px solid var(--color-border)' }}>
          <code style={{ color: 'var(--color-text-primary)' }}>{codeLines.join('\n')}</code>
        </pre>
      );
      codeLines = [];
    }
  };

  const renderInline = (line: string): React.ReactNode => {
    // Split by **bold**, `code`, and [text](url)
    const parts: React.ReactNode[] = [];
    let remaining = line;
    let key = 0;
    while (remaining.length > 0) {
      const boldMatch = remaining.match(/\*\*(.+?)\*\*/);
      const codeMatch = remaining.match(/`(.+?)`/);
      const linkMatch = remaining.match(/\[([^\]]+)\]\(([^)]+)\)/);

      let firstMatch: { type: 'bold' | 'code' | 'link'; index: number; full: string; content: string; url?: string } | null = null;

      if (boldMatch && boldMatch.index !== undefined) {
        firstMatch = { type: 'bold', index: boldMatch.index, full: boldMatch[0], content: boldMatch[1]! };
      }
      if (codeMatch && codeMatch.index !== undefined) {
        if (!firstMatch || codeMatch.index < firstMatch.index) {
          firstMatch = { type: 'code', index: codeMatch.index, full: codeMatch[0], content: codeMatch[1]! };
        }
      }
      if (linkMatch && linkMatch.index !== undefined) {
        if (!firstMatch || linkMatch.index < firstMatch.index) {
          firstMatch = { type: 'link', index: linkMatch.index, full: linkMatch[0], content: linkMatch[1]!, url: linkMatch[2]! };
        }
      }

      if (!firstMatch) {
        parts.push(remaining);
        break;
      }

      if (firstMatch.index > 0) {
        parts.push(remaining.slice(0, firstMatch.index));
      }

      if (firstMatch.type === 'bold') {
        parts.push(<strong key={key++} className="font-semibold" style={{ color: 'var(--color-text-primary)' }}>{firstMatch.content}</strong>);
      } else if (firstMatch.type === 'link') {
        parts.push(
          <a
            key={key++}
            href={firstMatch.url}
            target="_blank"
            rel="noopener noreferrer"
            className="underline transition-opacity hover:opacity-80"
            style={{ color: 'var(--color-primary)' }}
          >
            {firstMatch.content}
          </a>
        );
      } else {
        parts.push(
          <code key={key++} className="px-1.5 py-0.5 rounded text-[13px]" style={{ background: 'color-mix(in srgb, var(--color-surface) 80%, transparent)', color: 'var(--color-primary)' }}>
            {firstMatch.content}
          </code>
        );
      }

      remaining = remaining.slice(firstMatch.index + firstMatch.full.length);
    }
    return parts.length === 1 ? parts[0] : <>{parts}</>;
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;

    // Code block toggle
    if (line.startsWith('```')) {
      if (inCodeBlock) {
        flushCodeBlock();
        inCodeBlock = false;
      } else {
        flushList();
        inCodeBlock = true;
      }
      continue;
    }

    if (inCodeBlock) {
      codeLines.push(line);
      continue;
    }

    // List item
    if (line.startsWith('- ')) {
      listItems.push(<li key={`li-${i}`}>{renderInline(line.slice(2))}</li>);
      continue;
    }

    // Numbered list
    const numberedMatch = line.match(/^(\d+)\.\s/);
    if (numberedMatch) {
      flushList();
      // Collect consecutive numbered items
      const numItems: React.ReactNode[] = [];
      let j = i;
      while (j < lines.length) {
        const nm = lines[j]!.match(/^(\d+)\.\s(.+)/);
        if (!nm) break;
        numItems.push(<li key={`oli-${j}`}>{renderInline(nm[2]!)}</li>);
        j++;
      }
      elements.push(
        <ol key={`ol-${elements.length}`} className="list-decimal list-inside space-y-1 mb-4" style={{ color: 'var(--color-text-secondary)' }}>
          {numItems}
        </ol>
      );
      i = j - 1; // skip consumed lines
      continue;
    }

    // Empty line = flush list
    if (line.trim() === '') {
      flushList();
      continue;
    }

    // Normal paragraph
    flushList();
    elements.push(
      <p key={`p-${elements.length}`} className="leading-relaxed mb-3 text-[15px]" style={{ color: 'var(--color-text-secondary)' }}>
        {renderInline(line)}
      </p>
    );
  }

  flushList();
  flushCodeBlock();

  return elements;
}

// ── Detail Modal Sub-component ─────────────────────────────────────

interface DetailModalProps {
  entry: HelpEntry;
  lang: Lang;
  onClose: () => void;
  isClosing: boolean;
  isOpening: boolean;
  dragY: number;
  onTouchStart: (e: React.TouchEvent) => void;
  onTouchMove: (e: React.TouchEvent) => void;
  onTouchEnd: () => void;
  modalRef: React.RefObject<HTMLDivElement>;
}

function DetailModal({
  entry, lang, onClose, isClosing, isOpening, dragY,
  onTouchStart, onTouchMove, onTouchEnd, modalRef,
}: DetailModalProps) {
  const { t } = useI18n();
  const isPwaOnly = entry.platforms.length === 1 && entry.platforms[0] === 'pwa';
  const content = getContent(entry, lang);

  return (
    <div
      className={`help-modal-overlay fixed inset-0 z-50 flex items-end md:items-center justify-center ${isClosing ? 'closing' : ''}`}
      style={{
        background: 'color-mix(in srgb, var(--color-background) 70%, transparent)',
        backdropFilter: 'blur(4px)',
      }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="help-modal-title"
    >
      <div
        ref={modalRef}
        className={`help-modal-sheet w-full md:w-[640px] md:max-h-[80vh] max-h-[85vh] overflow-hidden flex flex-col ${isOpening ? 'opening' : ''} ${isClosing ? 'closing' : ''} ${dragY > 0 ? 'dragging' : ''}`}
        style={{
          background: 'var(--color-background)',
          border: '1px solid var(--color-border)',
          borderRadius: '1.5rem 1.5rem 0 0',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)',
          transform: dragY > 0 ? `translateY(${dragY}px)` : undefined,
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Mobile drag handle */}
        <div
          className="md:hidden w-full pt-3 pb-1 flex justify-center cursor-grab active:cursor-grabbing"
          onTouchStart={onTouchStart}
          onTouchMove={onTouchMove}
          onTouchEnd={onTouchEnd}
        >
          <div
            className="w-10 h-1 rounded-full"
            style={{ background: 'var(--color-border)' }}
          />
        </div>

        {/* Modal header */}
        <div
          className="px-6 pt-2 md:pt-6 pb-4 flex items-center justify-between flex-shrink-0"
          style={{ borderBottom: '1px solid var(--color-border)' }}
        >
          <div className="flex items-center gap-3">
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center"
              style={ICON_BOX_STYLE}
            >
              <Icon name={entry.icon} size={20} className="text-[var(--color-primary)]" />
            </div>
            <div>
              <h2 id="help-modal-title" className="text-lg font-semibold" style={{ color: 'var(--color-text-primary)' }}>
                {content.title}
              </h2>
              {isPwaOnly && (
                <span
                  className="text-[10px] px-1.5 py-0.5 rounded font-medium mt-0.5 inline-block"
                  style={{
                    background: 'color-mix(in srgb, var(--color-primary) 15%, transparent)',
                    color: 'var(--color-primary)',
                    border: '1px solid color-mix(in srgb, var(--color-primary) 25%, transparent)',
                  }}
                >
                  {t('help.platform.pwa')}
                </span>
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center transition-colors focus:outline-none focus:ring-0"
            style={{
              background: 'color-mix(in srgb, var(--color-surface) 60%, transparent)',
              border: '1px solid var(--color-border)',
            }}
            aria-label={t('help.done')}
          >
            <Icon name="x" size={16} className="text-[var(--color-text-secondary)]" />
          </button>
        </div>

        {/* Modal content */}
        <div className="px-6 py-6 overflow-y-auto help-modal-content flex-1 min-h-0">
          {/* Detail as markdown */}
          <div className="mb-6">
            {renderMarkdown(content.detail)}
          </div>

          {/* Tips */}
          <div className="space-y-2">
            {content.tips.map((tip, i) => (
              <div
                key={i}
                className="flex items-center gap-3 p-3 rounded-xl transition-all duration-200 hover:translate-x-1"
                style={TIP_ITEM_STYLE}
                onMouseEnter={e => {
                  (e.currentTarget as HTMLElement).style.background = 'color-mix(in srgb, var(--color-surface) 80%, transparent)';
                }}
                onMouseLeave={e => {
                  (e.currentTarget as HTMLElement).style.background = 'color-mix(in srgb, var(--color-surface) 60%, transparent)';
                }}
              >
                <div
                  className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                  style={{ background: 'color-mix(in srgb, var(--color-primary) 10%, transparent)' }}
                >
                  <Icon name={tip.icon} size={16} className="text-[var(--color-primary)]" />
                </div>
                <span className="text-sm" style={{ color: 'var(--color-text-primary)' }}>{tip.text}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Modal footer */}
        <div
          className="px-6 py-4 flex-shrink-0"
          style={{
            borderTop: '1px solid var(--color-border)',
            background: 'color-mix(in srgb, var(--color-surface) 40%, transparent)',
          }}
        >
          <button
            type="button"
            onClick={onClose}
            className="w-full py-2.5 rounded-xl text-sm font-medium text-white flex items-center justify-center gap-2 transition-opacity hover:opacity-90 focus:outline-none focus:ring-0"
            style={{
              background: 'var(--color-primary)',
            }}
          >
            {t('help.done')}
          </button>
        </div>
      </div>
    </div>
  );
}
