import React from 'react';
import { useI18n } from '@bsky/app';
import type { AppView } from '@bsky/app';
import type { BskyClient } from '@bsky/core';

interface SidebarProps {
  currentView: AppView;
  goTo: (v: AppView) => void;
  client: BskyClient;
  notifCount?: number;
  draftCount?: number;
}

const SIDEBAR_TABS = [
  { emoji: '📋', key: 'nav.feed', type: 'feed' as const, needsHandle: false },
  { emoji: '🔔', key: 'nav.notifications', type: 'notifications' as const, needsHandle: false },
  { emoji: '🔍', key: 'nav.search', type: 'search' as const, needsHandle: false },
  { emoji: '🔖', key: 'nav.bookmarks', type: 'bookmarks' as const, needsHandle: false },
  { emoji: '👤', key: 'nav.profile', type: 'profile' as const, needsHandle: true },
  { emoji: '🤖', key: 'nav.aiChat', type: 'aiChat' as const, needsHandle: false },
  { emoji: '✏️', key: 'nav.compose', type: 'compose' as const, needsHandle: false },
] as const;

export function Sidebar({ currentView, goTo, client, notifCount, draftCount }: SidebarProps) {
  const { t } = useI18n();
  const handle = client.isAuthenticated() ? client.getHandle() : null;

  return (
    <nav className="flex flex-col py-4 px-3 gap-1">
      {SIDEBAR_TABS.map((tab) => {
        const isActive = tab.type === 'profile'
          ? currentView.type === 'profile'
          : currentView.type === tab.type;
        return (
          <button
            key={tab.type}
            onClick={() => {
              if (tab.type === 'profile' && handle) {
                goTo({ type: 'profile', actor: handle });
              } else {
                goTo({ type: tab.type } as AppView);
              }
            }}
            className={`flex items-center gap-3 px-4 py-3 rounded-lg text-sm transition-colors text-left w-full border-l-2 ${
              isActive
                ? 'bg-primary/10 text-primary font-semibold border-primary'
                : 'text-text-secondary hover:bg-surface border-transparent'
            }`}
          >
            <span className="text-lg w-6 text-center leading-none">{tab.emoji}</span>
            <span className="flex-1">{t(tab.key)}</span>
            {tab.type === 'notifications' && notifCount != null && notifCount > 0 && (
              <span className="bg-primary text-white text-xs font-bold rounded-full px-1.5 py-0.5 min-w-[20px] text-center leading-none">
                {notifCount > 99 ? '99+' : notifCount}
              </span>
            )}
            {tab.type === 'compose' && draftCount != null && draftCount > 0 && (
              <span className="bg-yellow-500 text-white text-xs font-bold rounded-full px-1.5 py-0.5 min-w-[20px] text-center leading-none">
                {draftCount > 99 ? '99+' : draftCount}
              </span>
            )}
          </button>
        );
      })}
    </nav>
  );
}
