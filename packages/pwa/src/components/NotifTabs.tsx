import React from 'react';
import { useI18n } from '@bsky/app';

export type NotifTab = 'all' | 'mentions';

interface NotifTabsProps {
  activeTab: NotifTab;
  onChange: (tab: NotifTab) => void;
}

export function NotifTabs({ activeTab, onChange }: NotifTabsProps) {
  const { t } = useI18n();

  const tabs: { id: NotifTab; label: string }[] = [
    { id: 'all', label: t('notifications.tab.all') },
    { id: 'mentions', label: t('notifications.tab.mentions') },
  ];

  return (
    <div
      role="tablist"
      aria-label={t('notifications.title')}
      className="flex border-b border-border"
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
