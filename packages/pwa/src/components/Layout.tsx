import React, { useState, useEffect, useCallback } from 'react';
import type { AppView } from '@bsky/app';
import type { BskyClient } from '@bsky/core';
import { Sidebar } from './Sidebar';

interface LayoutProps {
  currentView: AppView;
  canGoBack: boolean;
  goBack: () => void;
  goHome: () => void;
  goTo: (v: AppView) => void;
  client: BskyClient;
  onLogout: () => void;
  children: React.ReactNode;
}

const MOBILE_TABS = [
  { emoji: '🏠', type: 'feed' as const, label: '首页' },
  { emoji: '🔍', type: 'search' as const, label: '搜索' },
  { emoji: '🔔', type: 'notifications' as const, label: '通知' },
  { emoji: '👤', type: 'profile' as const, label: '我' },
];

export function Layout({
  currentView,
  canGoBack,
  goBack,
  goHome,
  goTo,
  client,
  onLogout,
  children,
}: LayoutProps) {
  const [dark, setDark] = useState(() => {
    if (typeof document === 'undefined') return false;
    return document.documentElement.classList.contains('dark');
  });

  const authenticated = client.isAuthenticated();
  const handle = authenticated ? client.getHandle() : null;

  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark);
  }, [dark]);

  const toggleDark = useCallback(() => setDark((d) => !d), []);

  const handleMobileTab = (tab: (typeof MOBILE_TABS)[number]) => {
    switch (tab.type) {
      case 'feed': goHome(); break;
      case 'search': goTo({ type: 'search' }); break;
      case 'notifications': goTo({ type: 'notifications' }); break;
      case 'profile': if (handle) goTo({ type: 'profile', actor: handle }); break;
    }
  };

  return (
    <div className="min-h-screen bg-white dark:bg-[#0A0A0A] text-text-primary font-sans">
      <header className="sticky top-0 z-50 h-12 flex items-center px-4 bg-white/80 dark:bg-[#0A0A0A]/80 backdrop-blur-md border-b border-border">
        <div className="flex items-center gap-3 w-full">
          {canGoBack && (
            <button
              onClick={goBack}
              className="text-text-secondary hover:text-text-primary transition-colors p-1 -ml-1 text-lg leading-none"
              aria-label="返回"
            >
              ←
            </button>
          )}
          <span className="text-lg leading-none">🦋</span>
          <span className="font-semibold text-text-primary text-sm">Bluesky</span>
          {handle && (
            <span className="text-text-secondary text-xs hidden sm:inline">@{handle}</span>
          )}
          <span
            className={`w-2 h-2 rounded-full flex-shrink-0 ${
              authenticated ? 'bg-green-500' : 'bg-gray-400'
            }`}
            title={authenticated ? '已连接' : '未连接'}
          />
          <div className="ml-auto flex items-center gap-2">
            <button
              onClick={toggleDark}
              className="text-text-secondary hover:text-text-primary transition-colors p-1 text-sm leading-none"
              aria-label={dark ? '切换亮色模式' : '切换暗色模式'}
            >
              {dark ? '☀️' : '🌙'}
            </button>
            <button
              onClick={onLogout}
              className="text-text-secondary hover:text-red-500 transition-colors text-xs px-2 py-1 rounded-lg hover:bg-surface"
            >
              退出
            </button>
          </div>
        </div>
      </header>

      <div className="flex">
        <aside className="hidden md:flex flex-col w-sidebar h-[calc(100vh-3rem)] sticky top-12 border-r border-border flex-shrink-0">
          <Sidebar currentView={currentView} goTo={goTo} />
        </aside>

        <main className="flex-1 max-w-content mx-auto w-full min-h-[calc(100vh-3rem)] pb-14 md:pb-0">
          {children}
        </main>

        <aside className="hidden lg:flex flex-col w-right-panel h-[calc(100vh-3rem)] sticky top-12 border-l border-border flex-shrink-0 p-4">
          <div className="text-text-secondary text-sm">
            <p className="text-lg mb-2">🤖</p>
            <p className="font-semibold text-text-primary mb-1">AI 建议</p>
            <p className="text-xs">(TODO)</p>
          </div>
        </aside>
      </div>

      <nav className="fixed bottom-0 left-0 right-0 md:hidden bg-white dark:bg-[#0A0A0A] border-t border-border z-50 safe-area-inset-bottom">
        <div className="flex items-center justify-around h-14">
          {MOBILE_TABS.map((tab) => {
            const isActive =
              tab.type === 'profile'
                ? currentView.type === 'profile'
                : currentView.type === tab.type;
            return (
              <button
                key={tab.type}
                onClick={() => handleMobileTab(tab)}
                className={`flex flex-col items-center justify-center gap-0.5 w-full h-full transition-colors ${
                  isActive
                    ? 'text-primary'
                    : 'text-text-secondary hover:text-text-primary'
                }`}
              >
                <span className="text-xl leading-none">{tab.emoji}</span>
                <span className="text-[10px] leading-none">{tab.label}</span>
              </button>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
