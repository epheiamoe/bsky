import React, { useCallback, useRef } from 'react';
import { useI18n } from '@bsky/app';

export type NotifTab = 'all' | 'mentions';

interface NotifTabsProps {
  activeTab: NotifTab;
  onChange: (tab: NotifTab) => void;
}

export function NotifTabs({ activeTab, onChange }: NotifTabsProps) {
  const { t } = useI18n();
  const refs = useRef<Map<NotifTab, HTMLButtonElement | null>>(new Map());

  const tabs: { id: NotifTab; label: string }[] = [
    { id: 'all', label: t('notifications.tab.all') },
    { id: 'mentions', label: t('notifications.tab.mentions') },
  ];

  const focusTab = useCallback((tabId: NotifTab) => {
    refs.current.get(tabId)?.focus();
  }, []);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    const currentIndex = tabs.findIndex((t) => t.id === activeTab);
    let nextIndex = currentIndex;
    if (e.key === 'ArrowLeft') {
      e.preventDefault();
      nextIndex = currentIndex <= 0 ? tabs.length - 1 : currentIndex - 1;
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      nextIndex = currentIndex >= tabs.length - 1 ? 0 : currentIndex + 1;
    } else {
      return;
    }
    const nextTab = tabs[nextIndex]!;
    onChange(nextTab.id);
    focusTab(nextTab.id);
  }, [activeTab, tabs, onChange, focusTab]);

  return (
    <div
      role="tablist"
      aria-label={t('notifications.title')}
      className="flex border-b border-border"
      onKeyDown={handleKeyDown}
    >
      {tabs.map((tab) => {
        const isActive = activeTab === tab.id;
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={isActive}
            tabIndex={isActive ? 0 : -1}
            onClick={() => onChange(tab.id)}
            ref={(el) => refs.current.set(tab.id, el)}
            className={`flex-1 py-3 text-sm font-medium text-center transition-colors relative focus:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
              isActive ? 'text-primary' : 'text-text-secondary hover:text-text-primary'
            }`}
          >
            {tab.label}
            {isActive && (
              <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary rounded-t-full" />
            )}
          </button>
        );
      })}
    </div>
  );
}
