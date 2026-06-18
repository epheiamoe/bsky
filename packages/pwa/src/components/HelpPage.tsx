import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useI18n } from '@bsky/app';
import { getHelpCategories, getCategoryInfo, type HelpEntry, type Platform } from '@bsky/app';
import { Icon } from './Icon.js';

// ── Glass card styles (matching example HTML) ──────────────────────

const GLASS_CARD_BASE: React.CSSProperties = {
  background: 'rgba(24, 24, 27, 0.5)',
  backdropFilter: 'blur(16px)',
  border: '1px solid rgba(255, 255, 255, 0.06)',
  boxShadow: '0 0 0 1px rgba(255,255,255,0.02) inset, 0 4px 24px rgba(0,0,0,0.2)',
};

const GLASS_CARD_HOVER: React.CSSProperties = {
  background: 'rgba(24, 24, 27, 0.7)',
  borderColor: 'rgba(255, 255, 255, 0.12)',
  boxShadow: '0 0 0 1px rgba(255,255,255,0.03) inset, 0 12px 40px rgba(0,0,0,0.3)',
};

const SEARCH_INPUT_STYLE: React.CSSProperties = {
  background: 'rgba(255, 255, 255, 0.03)',
  border: '1px solid rgba(255, 255, 255, 0.08)',
};

const SEARCH_INPUT_FOCUS: React.CSSProperties = {
  background: 'rgba(255, 255, 255, 0.06)',
  borderColor: 'rgba(59, 130, 246, 0.4)',
  boxShadow: '0 0 0 3px rgba(59, 130, 246, 0.1)',
};

const ICON_BOX_STYLE: React.CSSProperties = {
  background: 'linear-gradient(135deg, rgba(59, 130, 246, 0.15) 0%, rgba(96, 165, 250, 0.05) 100%)',
  border: '1px solid rgba(59, 130, 246, 0.15)',
};

const KBD_STYLE: React.CSSProperties = {
  background: 'rgba(255, 255, 255, 0.05)',
  border: '1px solid rgba(255, 255, 255, 0.1)',
  boxShadow: '0 2px 0 rgba(255, 255, 255, 0.03)',
};

const TIP_ITEM_STYLE: React.CSSProperties = {
  background: 'rgba(255, 255, 255, 0.03)',
  border: '1px solid rgba(255, 255, 255, 0.06)',
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
      .help-modal-sheet.closing {
        transform: translateY(20px) scale(0.96) !important;
        opacity: 0 !important;
      }
    }

    /* Hide scrollbar */
    .help-modal-content::-webkit-scrollbar { display: none; }
    .help-modal-content { -ms-overflow-style: none; scrollbar-width: none; }
  `;
  document.head.appendChild(style);
}

// ── Component ──────────────────────────────────────────────────────

interface HelpPageProps {
  goBack: () => void;
}

export function HelpPage({ goBack }: HelpPageProps) {
  const { t } = useI18n();

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

  // Inject styles on mount
  useEffect(() => { ensureStyles(); }, []);

  // ── Data ──
  const categories = useMemo(() => getHelpCategories('pwa' as Platform), []);

  // ── Search (by translated text, not i18n keys) ──
  const filteredCategories = useMemo(() => {
    const lowerQuery = query.toLowerCase().trim();
    if (!lowerQuery) return categories;

    const terms = lowerQuery.split(/\s+/).filter(Boolean);
    const result: Record<string, HelpEntry[]> = {};

    for (const [cat, entries] of Object.entries(categories)) {
      const matched = entries.filter(entry => {
        const title = t(entry.titleKey).toLowerCase();
        const summary = t(entry.summaryKey).toLowerCase();
        const detail = t(entry.detailKey).toLowerCase();
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
  }, [query, categories, t]);

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

  // ── Modal body scroll lock ──
  useEffect(() => {
    if (selectedEntry) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => { document.body.style.overflow = ''; };
  }, [selectedEntry]);

  // ── Modal actions ──
  const openModal = useCallback((entry: HelpEntry) => {
    setSelectedEntry(entry);
    setModalDragY(0);
    setIsModalClosing(false);
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
    <div className="min-h-[100dvh] relative" style={{ background: '#09090b', color: '#e4e4e7' }}>
      {/* Background ambiance */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none" aria-hidden="true">
        <div
          className="absolute rounded-full"
          style={{
            top: '-10%', left: '-5%', width: 400, height: 400,
            background: 'rgba(59, 130, 246, 0.04)', filter: 'blur(100px)',
          }}
        />
        <div
          className="absolute rounded-full"
          style={{
            bottom: '-10%', right: '-5%', width: 500, height: 500,
            background: 'rgba(99, 102, 241, 0.04)', filter: 'blur(100px)',
          }}
        />
      </div>

      {/* Content */}
      <div className="relative z-10 max-w-5xl mx-auto px-4 py-8 md:py-12">
        {/* Header with back button */}
        <div className="flex items-center mb-6">
          <button
            type="button"
            onClick={goBack}
            className="mr-3 w-8 h-8 rounded-lg flex items-center justify-center transition-colors"
            style={{
              background: 'rgba(255, 255, 255, 0.05)',
              border: '1px solid rgba(255, 255, 255, 0.08)',
            }}
            aria-label={t('nav.back')}
          >
            <Icon name="arrow-big-left" size={16} className="text-zinc-400" />
          </button>
          <div className="flex-1 text-center">
            <h1 className="text-2xl md:text-3xl font-bold text-white tracking-tight">
              {t('help.title')}
            </h1>
            <p className="text-sm text-zinc-500 mt-1">
              {t('help.searchPlaceholder').replace('...', '').replace('\u2026', '')}
            </p>
          </div>
          <div className="w-8" /> {/* Spacer for centering */}
        </div>

        {/* Search bar */}
        <div className="relative max-w-md mx-auto mb-8 md:mb-10">
          <div className="absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none">
            <Icon name="search" size={16} className="text-zinc-500" />
          </div>
          <input
            ref={searchRef}
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            onFocus={() => setSearchFocused(true)}
            onBlur={() => setSearchFocused(false)}
            placeholder={t('help.searchPlaceholder')}
            className="w-full rounded-xl pl-10 pr-4 py-3 text-sm text-white placeholder-zinc-600 focus:outline-none transition-all duration-300"
            style={{
              ...SEARCH_INPUT_STYLE,
              ...(searchFocused ? SEARCH_INPUT_FOCUS : {}),
            }}
            aria-label={t('help.searchPlaceholder')}
          />
          {/* Keyboard shortcut hint (desktop only) */}
          <div className="absolute right-3 top-1/2 -translate-y-1/2 hidden md:flex items-center gap-1">
            <kbd
              className="px-1.5 py-0.5 rounded text-[10px] text-zinc-500"
              style={KBD_STYLE}
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
                      <Icon name={catInfo.icon} size={16} className="text-blue-400" />
                    </div>
                    <h2 className="text-sm font-semibold text-zinc-300 group-hover:text-white transition-colors">
                      {t(catInfo.labelKey)}
                    </h2>
                    <span className="text-xs text-zinc-600 ml-1">
                      {entries.length}
                    </span>
                    {/* Collapse arrow (mobile only) */}
                    <div className="ml-auto md:hidden">
                      <Icon
                        name={isCollapsed ? 'chevron-down' : 'chevron-up'}
                        size={14}
                        className="text-zinc-600"
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
                          t={t}
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
                background: 'rgba(255, 255, 255, 0.03)',
                border: '1px solid rgba(255, 255, 255, 0.06)',
              }}
            >
              <Icon name="search-x" size={28} className="text-zinc-600" />
            </div>
            <p className="text-zinc-500 text-sm">{t('help.noResults')}</p>
            <button
              type="button"
              onClick={() => { setQuery(''); searchRef.current?.focus(); }}
              className="mt-3 text-sm text-blue-400 hover:text-blue-300 transition-colors"
            >
              {t('help.clearSearch')}
            </button>
          </div>
        )}

        {/* Footer hint */}
        <div className="mt-12 text-center">
          <p className="text-xs text-zinc-700">
            Press <kbd className="px-1 rounded text-[10px]" style={KBD_STYLE}>/</kbd> to search
          </p>
        </div>
      </div>

      {/* Modal / Bottom Sheet */}
      {selectedEntry && (
        <DetailModal
          entry={selectedEntry}
          t={t}
          onClose={closeModal}
          isClosing={isModalClosing}
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
  t: (key: string) => string;
  isHovered: boolean;
  isActive: boolean;
  onHover: () => void;
  onLeave: () => void;
  onActivate: () => void;
  onDeactivate: () => void;
  onClick: () => void;
}

function HelpCard({
  entry, index, t,
  isHovered, isActive,
  onHover, onLeave, onActivate, onDeactivate, onClick,
}: HelpCardProps) {
  const isPwaOnly = entry.platforms.length === 1 && entry.platforms[0] === 'pwa';

  return (
    <div
      role="button"
      tabIndex={0}
      className="rounded-2xl p-5 cursor-pointer group"
      style={{
        ...GLASS_CARD_BASE,
        ...(isHovered ? GLASS_CARD_HOVER : {}),
        animation: `helpCardEnter 0.5s ease-out ${index * 0.05}s forwards`,
        opacity: 0,
        transition: 'all 0.4s cubic-bezier(0.4, 0, 0.2, 1)',
        transform: isHovered ? 'translateY(-2px)' : isActive ? 'scale(0.98)' : 'none',
      }}
      onClick={onClick}
      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(); } }}
      onMouseEnter={onHover}
      onMouseLeave={onLeave}
      onMouseDown={onActivate}
      onMouseUp={onDeactivate}
      aria-label={`${t(entry.titleKey)} \u2014 ${t(entry.summaryKey)}`}
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
          <Icon name={entry.icon} size={20} className="text-blue-400" />
        </div>

        {/* Content */}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 mb-1">
            <h3
              className="font-semibold text-[15px] transition-colors"
              style={{ color: isHovered ? '#93c5fd' : '#ffffff' }}
            >
              {t(entry.titleKey)}
            </h3>
            {isPwaOnly && (
              <span
                className="text-[10px] px-1.5 py-0.5 rounded font-medium"
                style={{
                  background: 'rgba(59, 130, 246, 0.15)',
                  color: '#60a5fa',
                  border: '1px solid rgba(59, 130, 246, 0.2)',
                }}
              >
                {t('help.platform.pwa')}
              </span>
            )}
          </div>
          <p className="text-zinc-500 text-sm leading-relaxed line-clamp-2">
            {t(entry.summaryKey)}
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
          <Icon name="chevron-right" size={16} className="text-zinc-500" />
        </div>
      </div>
    </div>
  );
}

// ── Detail Modal Sub-component ─────────────────────────────────────

interface DetailModalProps {
  entry: HelpEntry;
  t: (key: string) => string;
  onClose: () => void;
  isClosing: boolean;
  dragY: number;
  onTouchStart: (e: React.TouchEvent) => void;
  onTouchMove: (e: React.TouchEvent) => void;
  onTouchEnd: () => void;
  modalRef: React.RefObject<HTMLDivElement>;
}

function DetailModal({
  entry, t, onClose, isClosing, dragY,
  onTouchStart, onTouchMove, onTouchEnd, modalRef,
}: DetailModalProps) {
  const isPwaOnly = entry.platforms.length === 1 && entry.platforms[0] === 'pwa';

  return (
    <div
      className={`help-modal-overlay fixed inset-0 z-50 flex items-end md:items-center justify-center ${isClosing ? 'closing' : ''}`}
      style={{
        background: 'rgba(0, 0, 0, 0.7)',
        backdropFilter: 'blur(4px)',
      }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="help-modal-title"
    >
      <div
        ref={modalRef}
        className={`help-modal-sheet w-full md:w-[640px] md:max-h-[80vh] overflow-hidden flex flex-col ${isClosing ? 'closing' : ''} ${dragY > 0 ? 'dragging' : ''}`}
        style={{
          background: '#131316',
          border: '1px solid rgba(255, 255, 255, 0.08)',
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
            style={{ background: 'rgba(255, 255, 255, 0.2)' }}
          />
        </div>

        {/* Modal header */}
        <div
          className="px-6 pt-2 md:pt-6 pb-4 flex items-center justify-between"
          style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.06)' }}
        >
          <div className="flex items-center gap-3">
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center"
              style={ICON_BOX_STYLE}
            >
              <Icon name={entry.icon} size={20} className="text-blue-400" />
            </div>
            <div>
              <h2 id="help-modal-title" className="text-lg font-semibold text-white">
                {t(entry.titleKey)}
              </h2>
              {isPwaOnly && (
                <span
                  className="text-[10px] px-1.5 py-0.5 rounded font-medium mt-0.5 inline-block"
                  style={{
                    background: 'rgba(59, 130, 246, 0.15)',
                    color: '#60a5fa',
                    border: '1px solid rgba(59, 130, 246, 0.2)',
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
            className="w-8 h-8 rounded-lg flex items-center justify-center transition-colors"
            style={{
              background: 'rgba(255, 255, 255, 0.05)',
              border: '1px solid rgba(255, 255, 255, 0.08)',
            }}
            aria-label={t('help.done')}
          >
            <Icon name="x" size={16} className="text-zinc-400" />
          </button>
        </div>

        {/* Modal content */}
        <div className="px-6 py-6 overflow-y-auto help-modal-content">
          <p className="text-zinc-400 leading-relaxed mb-6 text-[15px]">
            {t(entry.detailKey)}
          </p>

          {/* Tips */}
          <div className="space-y-2">
            {entry.tips.map((tip, i) => (
              <div
                key={i}
                className="flex items-center gap-3 p-3 rounded-xl transition-all duration-200 hover:translate-x-1"
                style={TIP_ITEM_STYLE}
                onMouseEnter={e => {
                  (e.currentTarget as HTMLElement).style.background = 'rgba(255, 255, 255, 0.05)';
                }}
                onMouseLeave={e => {
                  (e.currentTarget as HTMLElement).style.background = 'rgba(255, 255, 255, 0.03)';
                }}
              >
                <div
                  className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                  style={{ background: 'rgba(59, 130, 246, 0.1)' }}
                >
                  <Icon name={tip.icon} size={16} className="text-blue-400" />
                </div>
                <span className="text-sm text-zinc-300">{t(tip.textKey)}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Modal footer */}
        <div
          className="px-6 py-4"
          style={{
            borderTop: '1px solid rgba(255, 255, 255, 0.06)',
            background: 'rgba(255, 255, 255, 0.02)',
          }}
        >
          <button
            type="button"
            onClick={onClose}
            className="w-full py-2.5 rounded-xl text-sm font-medium text-white flex items-center justify-center gap-2 transition-opacity hover:opacity-90"
            style={{
              background: 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)',
            }}
          >
            {t('help.done')}
          </button>
        </div>
      </div>
    </div>
  );
}
