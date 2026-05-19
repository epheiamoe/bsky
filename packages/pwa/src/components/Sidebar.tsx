import React from 'react';
import { useI18n } from '@bsky/app';
import type { AppView } from '@bsky/app';
import type { BskyClient } from '@bsky/core';
import { Icon } from './Icon.js';
import type { IconName } from './Icon.js';

interface SidebarProps {
  currentView: AppView;
  goTo: (v: AppView, replace?: boolean) => void;
  client: BskyClient;
  notifCount?: number;
  draftCount?: number;
  dmCount?: number;
  onLogout: () => void;
}

const SIDEBAR_TABS = [
  { icon: 'home' as IconName, key: 'nav.feed', type: 'feed' as const, needsHandle: false },
  { icon: 'bell' as IconName, key: 'nav.notifications', type: 'notifications' as const, needsHandle: false },
  { icon: 'message-square' as IconName, key: 'nav.dm', type: 'dm' as const, needsHandle: false },
  { icon: 'compass' as IconName, key: 'nav.search', type: 'search' as const, needsHandle: false },
  { icon: 'bookmark' as IconName, key: 'nav.bookmarks', type: 'bookmarks' as const, needsHandle: false },
  { icon: 'list' as IconName, key: 'nav.lists', type: 'lists' as const, needsHandle: false },
  { icon: 'at-sign' as IconName, key: 'nav.profile', type: 'profile' as const, needsHandle: true },
  { icon: 'astroid-as-AI-Button' as IconName, key: 'nav.aiChat', type: 'aiChat' as const, needsHandle: false },
  { icon: 'pen-line' as IconName, key: 'nav.compose', type: 'compose' as const, needsHandle: false },
  { icon: 'flask-conical' as IconName, key: 'nav.atplay', type: 'atplay' as const, needsHandle: false },
] as const;

export function Sidebar({ currentView, goTo, client, notifCount, draftCount, dmCount, onLogout }: SidebarProps) {
  const { t } = useI18n();
  const handle = client.isAuthenticated() ? client.getHandle() : null;

  return (
    <nav className="flex flex-col py-4 px-3 gap-1 min-h-0 flex-1" aria-label="Main">
      <div className="flex-1 overflow-y-auto min-h-0 space-y-1">
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
              aria-current={isActive ? 'page' : undefined}
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
              {tab.type === 'dm' && dmCount != null && dmCount > 0 && (
                <span className="bg-primary text-white text-xs font-bold rounded-full px-1.5 py-0.5 min-w-[20px] text-center leading-none">
                  {dmCount > 99 ? '99+' : dmCount}
                </span>
              )}
            </button>
          );
        })}
      </div>
      <div className="pt-3 border-t border-border space-y-1">
        <button
          onClick={() => goTo({ type: 'settings' } as AppView)}
          className={`flex items-center gap-3 px-4 py-3 rounded-lg text-sm transition-colors text-left w-full border-l-2 ${
            currentView.type === 'settings'
              ? 'bg-primary/10 text-primary font-semibold border-primary'
              : 'text-text-secondary hover:bg-surface border-transparent'
          }`}
          aria-current={currentView.type === 'settings' ? 'page' : undefined}
        >
          <Icon name="settings" size={20} className="mr-2" />
          <span>{t('nav.settings')}</span>
        </button>
        <button
          onClick={() => goTo({ type: 'components' } as unknown as AppView)}
          className={`flex items-center gap-3 px-4 py-3 rounded-lg text-sm transition-colors text-left w-full border-l-2 ${
            currentView.type === 'components'
              ? 'bg-primary/10 text-primary font-semibold border-primary'
              : 'text-text-secondary hover:bg-surface border-transparent'
          }`}
        >
          <Icon name="component" size={20} className="mr-2" />
          <span>{t('nav.components')}</span>
        </button>
        <button
          onClick={() => goTo({ type: 'about' })}
          className="flex items-center gap-3 px-4 py-3 rounded-lg text-sm transition-colors text-left w-full border-l-2 text-text-secondary hover:bg-surface border-transparent"
        >
          <Icon name="badge-question-mark" size={20} className="mr-2" />
          <span>{t('nav.about')}</span>
        </button>
        <button
          onClick={onLogout}
          className="flex items-center gap-3 px-4 py-3 rounded-lg text-sm transition-colors text-left w-full border-l-2 text-text-secondary hover:text-red-500 border-transparent hover:bg-surface"
        >
          <Icon name="log-out" size={20} className="mr-2" />
          <span>{t('settings.logout')}</span>
        </button>
      </div>
    </nav>
  );
}
