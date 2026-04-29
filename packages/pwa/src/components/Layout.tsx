import React, { useState, useEffect, useCallback } from 'react';
import { useI18n } from '@bsky/app';
import type { AppView } from '@bsky/app';
import type { BskyClient } from '@bsky/core';
import type { AppConfig } from '../hooks/useAppConfig.js';
import { Sidebar } from './Sidebar';
import { SettingsModal } from './SettingsModal';

interface LayoutProps {
  currentView: AppView;
  canGoBack: boolean;
  goBack: () => void;
  goHome: () => void;
  goTo: (v: AppView) => void;
  client: BskyClient;
  onLogout: () => void;
  children: React.ReactNode;
  config: AppConfig;
  onConfigChange: (config: AppConfig) => void;
  onRelogin: (handle: string, password: string) => Promise<void>;
}

export function Layout({
  currentView,
  canGoBack,
  goBack,
  goHome,
  goTo,
  client,
  onLogout,
  children,
  config,
  onConfigChange,
  onRelogin,
}: LayoutProps) {
  const { t } = useI18n();
  const [dark, setDark] = useState(() => {
    if (typeof document === 'undefined') return false;
    return document.documentElement.classList.contains('dark');
  });
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const authenticated = client.isAuthenticated();
  const handle = authenticated ? client.getHandle() : null;

  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark);
  }, [dark]);

  const toggleDark = useCallback(() => setDark((d) => !d), []);

  return (
    <div className="min-h-screen bg-white dark:bg-[#0A0A0A] text-text-primary font-sans">
      {/* ── Header ── */}
      <header className="sticky top-0 z-50 h-12 flex items-center px-4 bg-white/80 dark:bg-[#0A0A0A]/80 backdrop-blur-md border-b border-border">
        <div className="flex items-center gap-3 w-full">
          {/* Hamburger (mobile) */}
          <button
            onClick={() => setSidebarOpen(true)}
            className="md:hidden text-text-secondary hover:text-text-primary transition-colors p-1 -ml-1 text-lg leading-none"
            aria-label={t('nav.menu')}
          >
            ☰
          </button>

          {canGoBack && (
            <button
              onClick={goBack}
              className="text-text-secondary hover:text-text-primary transition-colors p-1 -ml-1 text-lg leading-none hidden md:block"
              aria-label={t('nav.back')}
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
            title={authenticated ? t('status.connected') : t('status.disconnected')}
          />
          <div className="ml-auto flex items-center gap-2">
            <button
              onClick={() => setSettingsOpen(true)}
              className="text-text-secondary hover:text-text-primary transition-colors p-1 text-sm leading-none"
              aria-label={t('nav.settings')}
            >
              ⚙️
            </button>
            <button
              onClick={toggleDark}
              className="text-text-secondary hover:text-text-primary transition-colors p-1 text-sm leading-none"
              aria-label={dark ? t('theme.switchLight') : t('theme.switchDark')}
            >
              {dark ? '☀️' : '🌙'}
            </button>
            <button
              onClick={onLogout}
              className="text-text-secondary hover:text-red-500 transition-colors text-xs px-2 py-1 rounded-lg hover:bg-surface hidden md:block"
            >
              {t('settings.logout')}
            </button>
          </div>
        </div>
      </header>

      {/* ── Mobile sidebar overlay ── */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-[60] md:hidden">
          <div className="absolute inset-0 bg-black/40" onClick={() => setSidebarOpen(false)} />
          <div className="relative w-64 h-full bg-white dark:bg-[#0A0A0A] border-r border-border shadow-lg">
            <Sidebar
              currentView={currentView}
              goTo={(v) => { goTo(v); setSidebarOpen(false); }}
              client={client}
            />
            <div className="absolute bottom-0 left-0 right-0 border-t border-border p-3">
              <button
                onClick={() => { onLogout(); setSidebarOpen(false); }}
                className="w-full text-left text-sm text-text-secondary hover:text-red-500 transition-colors px-4 py-2 rounded-lg hover:bg-surface"
              >
                {t('settings.logout')}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="flex">
        {/* Desktop sidebar */}
        <aside className="hidden md:flex flex-col w-sidebar h-[calc(100vh-3rem)] sticky top-12 border-r border-border flex-shrink-0">
          <Sidebar currentView={currentView} goTo={goTo} client={client} />
        </aside>

        <main className="flex-1 max-w-content mx-auto w-full min-h-[calc(100vh-3rem)]">
          {children}
        </main>

        <aside className="hidden lg:flex flex-col w-right-panel h-[calc(100vh-3rem)] sticky top-12 border-l border-border flex-shrink-0 p-4">
          <div className="text-text-secondary text-sm">
            <p className="text-lg mb-2">🤖</p>
            <p className="font-semibold text-text-primary mb-1">{t('layout.aiSuggestions')}</p>
            <p className="text-xs">(TODO)</p>
          </div>
        </aside>
      </div>

      <SettingsModal
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        config={config}
        onConfigChange={onConfigChange}
        onRelogin={onRelogin}
        onLogout={onLogout}
      />
    </div>
  );
}
