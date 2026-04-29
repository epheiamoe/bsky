import React from 'react';
import type { AppView } from '@bsky/app';

interface SidebarProps {
  currentView: AppView;
  goTo: (v: AppView) => void;
  notifCount?: number;
}

const SIDEBAR_TABS = [
  { emoji: '📋', label: '时间线', type: 'feed' as const },
  { emoji: '🔔', label: '通知', type: 'notifications' as const },
  { emoji: '🔍', label: '搜索', type: 'search' as const },
  { emoji: '🔖', label: '书签', type: 'bookmarks' as const },
  { emoji: '🤖', label: 'AI 对话', type: 'aiChat' as const },
  { emoji: '✏️', label: '发帖', type: 'compose' as const },
];

export function Sidebar({ currentView, goTo, notifCount }: SidebarProps) {
  return (
    <nav className="flex flex-col py-4 px-3 gap-1">
      {SIDEBAR_TABS.map((tab) => {
        const isActive = currentView.type === tab.type;
        return (
          <button
            key={tab.type}
            onClick={() => goTo({ type: tab.type })}
            className={`flex items-center gap-3 px-4 py-3 rounded-lg text-sm transition-colors text-left w-full border-l-2 ${
              isActive
                ? 'bg-primary/10 text-primary font-semibold border-primary'
                : 'text-text-secondary hover:bg-surface border-transparent'
            }`}
          >
            <span className="text-lg w-6 text-center leading-none">{tab.emoji}</span>
            <span className="flex-1">{tab.label}</span>
            {tab.type === 'notifications' && notifCount != null && notifCount > 0 && (
              <span className="bg-primary text-white text-xs font-bold rounded-full px-1.5 py-0.5 min-w-[20px] text-center leading-none">
                {notifCount > 99 ? '99+' : notifCount}
              </span>
            )}
          </button>
        );
      })}
    </nav>
  );
}
