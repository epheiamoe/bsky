import React, { useState, useMemo, useCallback } from 'react';
import {
  COMMON_LANGUAGE_CODES,
  SUPPORTED_LANGUAGES,
  getLanguageName,
} from '@bsky/core';
import { useI18n } from '@bsky/app';
import { Icon } from './Icon.js';
import { Modal } from './Modal.js';

interface LanguageSelectorProps {
  open: boolean;
  selectedCodes: string[];
  onChange: (codes: string[]) => void;
  onClose: () => void;
  locale?: string;
}

export function LanguageSelector({
  open,
  selectedCodes,
  onChange,
  onClose,
  locale,
}: LanguageSelectorProps) {
  const { t } = useI18n();
  const [searchQuery, setSearchQuery] = useState('');
  const [showAll, setShowAll] = useState(false);

  const selectedSet = useMemo(
    () => new Set(selectedCodes),
    [selectedCodes]
  );

  const isSelected = useCallback(
    (code: string) => selectedSet.has(code),
    [selectedSet]
  );

  const canSelectMore = selectedCodes.length < 3;

  const toggleLanguage = useCallback(
    (code: string) => {
      if (isSelected(code)) {
        onChange(selectedCodes.filter(c => c !== code));
      } else if (canSelectMore) {
        onChange([...selectedCodes, code]);
      }
    },
    [isSelected, canSelectMore, selectedCodes, onChange]
  );

  const removeLanguage = useCallback(
    (code: string) => {
      onChange(selectedCodes.filter(c => c !== code));
    },
    [selectedCodes, onChange]
  );

  // Build language items with display names
  const allLanguages = useMemo(() => {
    return SUPPORTED_LANGUAGES.map(lang => ({
      code: lang.code,
      name: getLanguageName(lang.code, locale),
    }));
  }, [locale]);

  const commonLanguages = useMemo(() => {
    return allLanguages.filter(lang => COMMON_LANGUAGE_CODES.includes(lang.code));
  }, [allLanguages]);

  // Filter languages based on search query
  const filteredCommon = useMemo(() => {
    if (!searchQuery.trim()) return commonLanguages;
    const q = searchQuery.toLowerCase();
    return commonLanguages.filter(
      lang =>
        lang.code.toLowerCase().includes(q) ||
        lang.name.toLowerCase().includes(q)
    );
  }, [commonLanguages, searchQuery]);

  const filteredAll = useMemo(() => {
    if (!searchQuery.trim()) return allLanguages;
    const q = searchQuery.toLowerCase();
    return allLanguages.filter(
      lang =>
        lang.code.toLowerCase().includes(q) ||
        lang.name.toLowerCase().includes(q)
    );
  }, [allLanguages, searchQuery]);

  const hasSearch = searchQuery.trim().length > 0;
  const displayLanguages = hasSearch
    ? filteredAll
    : showAll
      ? filteredAll
      : filteredCommon;

  return (
    <Modal variant="bottom-sheet" open={open} onClose={onClose}>
      <div
        className="bg-background rounded-t-2xl border-t border-x border-border shadow-2xl w-full max-w-lg max-h-[70vh] flex flex-col mx-auto"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
          <h2 className="text-sm font-semibold text-text-primary">
            {t('language.title')}
          </h2>
          <button
            onClick={onClose}
            className="text-text-secondary hover:text-text-primary transition-colors"
            aria-label={t('a11y.close')}
          >
            <Icon name="x" size={18} />
          </button>
        </div>

        {/* Search */}
        <div className="px-4 py-3 border-b border-border shrink-0">
          <div className="relative">
            <div className="absolute left-3 top-1/2 -translate-y-1/2 text-text-secondary">
              <Icon name="search" size={16} />
            </div>
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder={t('language.searchPlaceholder')}
              className="w-full pl-9 pr-3 py-2 rounded-lg border border-border bg-white dark:bg-[#1A1A1A] text-text-primary placeholder:text-text-secondary/60 focus:outline-none focus:ring-2 focus:ring-primary text-sm"
              aria-label={t('language.searchPlaceholder')}
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-text-secondary hover:text-text-primary"
                aria-label={t('action.clear')}
              >
                <Icon name="x" size={14} />
              </button>
            )}
          </div>
        </div>

        {/* Language List */}
        <div className="flex-1 overflow-y-auto px-4 py-3">
          {!hasSearch && !showAll && (
            <div className="mb-2">
              <h3 className="text-xs font-medium text-text-secondary uppercase tracking-wider mb-2">
                {t('language.commonLanguages')}
              </h3>
            </div>
          )}

          {!hasSearch && showAll && (
            <div className="mb-2">
              <h3 className="text-xs font-medium text-text-secondary uppercase tracking-wider mb-2">
                {t('language.allLanguages')}
              </h3>
            </div>
          )}

          <div className="grid grid-cols-2 gap-2">
            {displayLanguages.map(lang => {
              const selected = isSelected(lang.code);
              return (
                <button
                  key={lang.code}
                  onClick={() => toggleLanguage(lang.code)}
                  disabled={!selected && !canSelectMore}
                  className={`
                    flex items-center gap-2 px-3 py-2.5 rounded-xl text-sm text-left transition-all
                    ${selected
                      ? 'bg-primary/15 ring-2 ring-primary text-primary'
                      : 'hover:bg-surface-hover text-text-primary'
                    }
                    ${!selected && !canSelectMore ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'}
                  `}
                  aria-pressed={selected}
                  aria-label={`${lang.name} (${lang.code})${selected ? ', selected' : ''}`}
                >
                  <span className="text-xs font-mono text-text-secondary/70 shrink-0">
                    {lang.code}
                  </span>
                  <span className="truncate">{lang.name}</span>
                  {selected && (
                    <span className="ml-auto shrink-0">
                      <Icon name="check" size={14} className="text-primary" />
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Show More Button */}
          {!hasSearch && !showAll && (
            <button
              onClick={() => setShowAll(true)}
              className="w-full mt-3 py-2.5 text-sm text-primary font-medium hover:bg-primary/5 rounded-xl transition-colors"
            >
              {t('language.showMore')}
            </button>
          )}

          {displayLanguages.length === 0 && (
            <p className="text-text-secondary text-sm text-center py-8">
              {t('status.noResults')}
            </p>
          )}
        </div>

        {/* Selected Tags Footer */}
        {selectedCodes.length > 0 && (
          <div className="px-4 py-3 border-t border-border shrink-0 bg-surface/50">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-text-secondary">
                {t('language.selected', { n: selectedCodes.length })}
              </span>
              {!canSelectMore && (
                <span className="text-xs text-text-secondary">
                  {t('language.maxReached')}
                </span>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              {selectedCodes.map(code => (
                <button
                  key={code}
                  onClick={() => removeLanguage(code)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-primary/10 text-primary text-sm font-medium hover:bg-primary/20 transition-colors"
                  aria-label={`Remove ${getLanguageName(code, locale)}`}
                >
                  <span>{getLanguageName(code, locale)}</span>
                  <span className="inline-flex items-center justify-center">
                    <Icon name="x" size={12} />
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}
