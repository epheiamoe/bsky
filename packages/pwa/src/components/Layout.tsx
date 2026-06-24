import React, { useState, useEffect, useCallback, useRef } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useI18n } from '@bsky/app';
import type { AppView } from '@bsky/app';
import { initEnabledWidgets, getEnabledWidgetIds, toggleWidget, disableWidget, setWidgetToggleCallback, getWidgetsForView } from '@bsky/app';
import type { AIConfig, BskyClient } from '@bsky/core';
import type { AppConfig } from '../hooks/useAppConfig.js';
import { saveAppConfig } from '../hooks/useAppConfig.js';
import { Sidebar } from './Sidebar';
import { WidgetPanel } from './WidgetPanel.js';
import { MobileTabBar } from './MobileTabBar.js';
import { Icon } from './Icon.js';

const TAB_PAGES = new Set(['feed', 'search', 'aiChat', 'profile']);

export const MobileHeaderCtx = React.createContext<{
  onSidebarOpen: () => void;
  tabBarHidden: boolean;
  setTabBarHidden: (v: boolean) => void;
  dmCount: number;
  notifCount: number;
}>({ onSidebarOpen: () => {}, tabBarHidden: false, setTabBarHidden: () => {}, dmCount: 0, notifCount: 0 });

interface LayoutProps {
  currentView: AppView;
  canGoBack: boolean;
  goBack: () => void;
  goHome: () => void;
  goTo: (v: AppView, replace?: boolean) => void;
  client: BskyClient;
  onLogout: () => void;
  children: React.ReactNode;
  config: AppConfig;
  onConfigChange: (config: AppConfig) => void;
  onRelogin: (handle: string, password: string) => Promise<void>;
  draftCount?: number;
  dmCount?: number;
  notifCount?: number;
  polishConfig?: AIConfig;
  userDisplayName?: string;
  composeDraft?: string;
  onComposeDraftChange?: (text: string) => void;
  aiConfig?: AIConfig;
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
  draftCount,
  dmCount,
  notifCount,
  polishConfig,
  composeDraft,
  onComposeDraftChange,
  aiConfig,
  userDisplayName,
}: LayoutProps) {
  const { t } = useI18n();
  const [dark, setDark] = useState(() => {
    if (typeof document === 'undefined') return false;
    return document.documentElement.classList.contains('dark');
  });
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Widget state — module-level + local reactive counter
  const [widgetTick, setWidgetTick] = useState(0);
  const enabledIds = getEnabledWidgetIds();

  // Init widget state from config on mount. If empty, enable all default-open widgets.
  useEffect(() => {
    const existing = config.enabledWidgets || [];
    if (existing.length > 0) {
      initEnabledWidgets(existing);
    } else {
      // Auto-enable widgets with defaultOpen: true
      const allWidgets = getWidgetsForView(currentView.type);
      const defaultIds = allWidgets.filter(w => w.defaultOpen).map(w => w.id);
      initEnabledWidgets(defaultIds);
      // Persist the auto-enablement
      if (defaultIds.length > 0) {
        const updated = { ...config, enabledWidgets: defaultIds };
        saveAppConfig(updated);
        onConfigChange(updated);
      }
    }
    setWidgetTick(t => t + 1);
  }, []);

  // Register widget toggle persistence callback (for non-Layout toggleWidget calls)
  useEffect(() => {
    setWidgetToggleCallback((id: string) => {
      const updated = { ...config, enabledWidgets: getEnabledWidgetIds() };
      saveAppConfig(updated);
      onConfigChange(updated);
    });
    return () => setWidgetToggleCallback(null);
  }, [config, onConfigChange]);

  // Disable aiChat widget when entering the full AI chat page; restore on exit
  const widgetOrderRef = useRef<string[]>([]);
  useEffect(() => {
    if (currentView.type === 'aiChat') {
      const current = getEnabledWidgetIds();
      if (current.includes('aiChat')) {
        widgetOrderRef.current = current;
        disableWidget('aiChat');
        setWidgetTick(t => t + 1);
      }
    } else if (widgetOrderRef.current.length > 0) {
      initEnabledWidgets(widgetOrderRef.current);
      widgetOrderRef.current = [];
      setWidgetTick(t => t + 1);
    }
  }, [currentView.type]);

  const handleToggleWidget = useCallback((id: string) => {
    toggleWidget(id);
    setWidgetTick(t => t + 1);
    // Persist to AppConfig and localStorage
    const updated = { ...config, enabledWidgets: getEnabledWidgetIds() };
    saveAppConfig(updated);
    onConfigChange(updated);
  }, [config, onConfigChange]);

  const handleReorderWidget = useCallback((fromIdx: number, toIdx: number) => {
    const ids = getEnabledWidgetIds();
    const [moved] = ids.splice(fromIdx, 1);
    ids.splice(toIdx, 0, moved);
    initEnabledWidgets(ids);
    const updated = { ...config, enabledWidgets: ids };
    saveAppConfig(updated);
    onConfigChange(updated);
    setWidgetTick(t => t + 1);
  }, [config, onConfigChange]);

  const authenticated = client.isAuthenticated();
  const handle = authenticated ? client.getHandle() : null;
  const isTabPage = TAB_PAGES.has(currentView.type);
  const [tabBarHidden, setTabBarHidden] = useState(false);

  // Auto-hide tab bar when keyboard is open (input/textarea focused)
  useEffect(() => {
    const onFocusIn = (e: FocusEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') {
        setTabBarHidden(true);
      }
    };
    const onFocusOut = () => {
      // Delay to let the new focus settle before deciding
      setTimeout(() => {
        const active = document.activeElement;
        const tag = active?.tagName;
        if (tag !== 'INPUT' && tag !== 'TEXTAREA') {
          setTabBarHidden(false);
        }
      }, 100);
    };
    document.addEventListener('focusin', onFocusIn);
    document.addEventListener('focusout', onFocusOut);
    return () => {
      document.removeEventListener('focusin', onFocusIn);
      document.removeEventListener('focusout', onFocusOut);
    };
  }, []);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark);
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', dark ? '#000000' : '#FFFFFF');
  }, [dark]);

  const toggleDark = useCallback(() => setDark((d) => !d), []);

  // Widget context for the right panel
  const widgetContext = {
    composeDraft,
    onComposeDraftChange,
    polishConfig,
    aiConfig,
    viewType: currentView.type,
    client,
    goTo,
    threadUri: currentView.type === 'thread' ? (currentView as { uri?: string }).uri : undefined,
    userHandle: client?.getHandle?.(),
    userDisplayName,
  };

  return (
    <div className="min-h-[100dvh] bg-background text-text-primary font-sans">
      {/* Screen reader announcement region for view transitions and AI agents */}
      <div aria-live="polite" className="sr-only" aria-atomic="true" />
      {/* ── Header — hidden on mobile for tab pages ── */}
      <header className={`sticky top-0 z-50 h-12 flex items-center px-4 bg-white/80 dark:bg-[#0A0A0A]/80 backdrop-blur-md border-b border-border ${isTabPage ? 'hidden md:flex' : ''}`} aria-label={t('a11y.mainNav')}>
        <div className="flex items-center gap-3 w-full">
          {/* Hamburger (mobile) */}
          <button
            onClick={() => setSidebarOpen(true)}
            className="md:hidden text-text-secondary hover:text-text-primary transition-colors p-1 -ml-1 text-lg leading-none"
            aria-label={notifCount ? t('nav.menuUnread', { n: notifCount }) : t('nav.menu')}
          >
            <span className="relative inline-flex">
              <Icon name="menu" size={20} />
              {notifCount != null && notifCount > 0 && (
                <span
                  className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-primary"
                  aria-hidden="true"
                />
              )}
            </span>
          </button>

          {canGoBack && (
            <button
              onClick={goBack}
              className="text-text-secondary hover:text-text-primary transition-colors p-1 -ml-1 hidden md:block"
              aria-label={t('nav.back')}
            >
              <Icon name="arrow-big-left" size={20} />
            </button>
          )}
          <span className="text-lg leading-none"><Icon name="astroid-as-AI-Button" size={20} /></span>
          <span className="font-semibold text-text-primary text-sm">Bluesky</span>
          {handle && (
            <span className="text-text-secondary text-xs hidden sm:inline">@{handle}</span>
          )}
          <span className="flex items-center gap-1 flex-shrink-0">
            <span
              className={`w-2 h-2 rounded-full ${
                authenticated ? 'bg-green-500' : 'bg-gray-400'
              }`}
              aria-hidden="true"
            />
            <span className="text-[10px] text-text-secondary hidden sm:inline">
              {authenticated ? t('status.connected') : t('status.disconnected')}
            </span>
          </span>
          <div className="ml-auto flex items-center gap-2">
            <button
              onClick={toggleDark}
              className="text-text-secondary hover:text-text-primary transition-colors p-1"
              aria-label={dark ? t('theme.switchLight') : t('theme.switchDark')}
            >
              <Icon name={dark ? 'sun' : 'moon'} size={18} />
            </button>
          </div>
        </div>
      </header>

      {/* ── Mobile sidebar overlay with slide animation ── */}
      <AnimatePresence>
        {sidebarOpen && (
          <motion.div
            key="mobile-sidebar"
            className="fixed inset-0 z-[60] md:hidden"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
          >
            <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setSidebarOpen(false)} />
            <motion.div
              className="absolute left-0 top-0 h-full w-64 bg-background border-r border-border shadow-lg flex flex-col"
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              onClick={e => e.stopPropagation()}
            >
              <Sidebar
                currentView={currentView}
                goTo={(v, replace) => { goTo(v, replace); setSidebarOpen(false); }}
                client={client}
                notifCount={notifCount}
                draftCount={draftCount}
                dmCount={dmCount}
                onLogout={() => { onLogout(); setSidebarOpen(false); }}
              />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="flex">
        {/* Desktop sidebar */}
        <aside className="hidden md:flex flex-col w-sidebar h-[calc(100dvh-3rem)] sticky top-12 border-r border-border flex-shrink-0 overflow-hidden" aria-label={t('a11y.sidebar')}>
          <Sidebar currentView={currentView} goTo={goTo} client={client} notifCount={notifCount} draftCount={draftCount} dmCount={dmCount} onLogout={onLogout} />
        </aside>

        <MobileHeaderCtx.Provider value={{ onSidebarOpen: () => setSidebarOpen(true), tabBarHidden, setTabBarHidden, dmCount: dmCount ?? 0, notifCount: notifCount ?? 0 }}>
        <main id="main-content" tabIndex={-1} className={`flex-1 max-w-content mx-auto w-full pt-[env(safe-area-inset-top)] ${isTabPage ? '' : 'min-h-[calc(100dvh-3rem)]'}`}>
          {children}
        </main>
        </MobileHeaderCtx.Provider>

        <aside className="hidden lg:flex flex-col w-right-panel h-[calc(100dvh-3rem)] sticky top-12 border-l border-border flex-shrink-0" aria-label={t('a11y.widgetPanel')}>
          <WidgetPanel
            viewType={currentView.type}
            enabledIds={enabledIds}
            context={widgetContext}
            onCloseWidget={handleToggleWidget}
            onReorderWidget={handleReorderWidget}
            goTo={goTo}
          />
        </aside>
      </div>

      {/* ── Mobile tab bar ── */}
      {isTabPage && (
        <div className="md:hidden fixed bottom-0 left-0 right-0 z-50">
          <MobileTabBar currentView={currentView} handle={handle} goTo={goTo} hidden={tabBarHidden} />
        </div>
      )}
    </div>
  );
}
