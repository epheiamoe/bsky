import React from 'react';
import { useI18n } from '@bsky/app';
import type { AppView } from '@bsky/app';
import type { BskyClient } from '@bsky/core';
import { Icon } from './Icon.js';
import type { IconName } from './Icon.js';

interface SidebarProps {
  currentView: AppView;
  goTo: (v: AppView) => void;
  client: BskyClient;
  notifCount?: number;
  draftCount?: number;
}

const SIDEBAR_TABS = [
  { icon: 'home' as IconName, key: 'nav.feed', type: 'feed' as const, needsHandle: false },
  { icon: 'bell' as IconName, key: 'nav.notifications', type: 'notifications' as const, needsHandle: false },
  { icon: 'compass' as IconName, key: 'nav.search', type: 'search' as const, needsHandle: false },
  { icon: 'bookmark' as IconName, key: 'nav.bookmarks', type: 'bookmarks' as const, needsHandle: false },
  { icon: 'at-sign' as IconName, key: 'nav.profile', type: 'profile' as const, needsHandle: true },
  { icon: 'astroid-as-AI-Button' as IconName, key: 'nav.aiChat', type: 'aiChat' as const, needsHandle: false },
  { icon: 'pen-line' as IconName, key: 'nav.compose', type: 'compose' as const, needsHandle: false },
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
            <Icon name={tab.icon} size={20} className="mr-2" />
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
