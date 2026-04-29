import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@bsky/app';
import type { AppView } from '@bsky/app';
import { getSession, saveSession, clearSession } from './hooks/useSessionPersistence.js';
import { getAppConfig, type AppConfig } from './hooks/useAppConfig.js';
import { useHashRouter } from './hooks/useHashRouter.js';
import { Layout } from './components/Layout.js';
import { LoginPage } from './components/LoginPage.js';
import { FeedTimeline } from './components/FeedTimeline.js';
import { ThreadView } from './components/ThreadView.js';
import { ComposePage } from './components/ComposePage.js';
import { AIChatPage } from './components/AIChatPage.js';
import { ProfilePage } from './components/ProfilePage.js';
import { SearchPage } from './components/SearchPage.js';
import { NotifsPage } from './components/NotifsPage.js';
import { BookmarkPage } from './components/BookmarkPage.js';

export function App() {
  const { currentView, canGoBack, goTo, goBack, goHome } = useHashRouter();
  const { client, loading: authLoading, error: authError, login, session, restoreSession } = useAuth();
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [appConfig, setAppConfig] = useState<AppConfig>(getAppConfig);

  // ── Sync dark mode on mount ──
  useEffect(() => {
    document.documentElement.classList.toggle('dark', getAppConfig().darkMode);
  }, []);

  // ── Restore session from localStorage on mount ──
  useEffect(() => {
    const saved = getSession();
    if (saved && !client) {
      restoreSession({
        accessJwt: saved.accessJwt,
        refreshJwt: saved.refreshJwt,
        handle: saved.handle,
        did: saved.did,
      });
      setIsLoggedIn(true);
    }
  }, []);

  // ── Save session when login succeeds ──
  useEffect(() => {
    if (session && client?.isAuthenticated()) {
      saveSession({
        accessJwt: session.accessJwt,
        refreshJwt: session.refreshJwt,
        handle: session.handle,
        did: session.did,
      });
      setIsLoggedIn(true);
    }
  }, [session, client]);

  const handleLogin = useCallback(async (handle: string, password: string) => {
    await login(handle, password);
  }, [login]);

  const handleLogout = useCallback(() => {
    clearSession();
    setIsLoggedIn(false);
    goHome();
  }, [goHome]);

  const handleRelogin = useCallback(async (handle: string, password: string) => {
    clearSession();
    try {
      await login(handle, password);
    } catch {
      // will be caught by caller
    }
  }, [login]);

  // ── Loading ──
  if (authLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-white dark:bg-[#0A0A0A]">
        <p className="text-text-secondary text-lg animate-pulse">🦋 正在连接 Bluesky…</p>
      </div>
    );
  }

  // ── Not logged in ──
  if (!isLoggedIn || !client) {
    return <LoginPage onLogin={handleLogin} error={authError} />;
  }

  // ── Render current view ──
  const renderView = () => {
    switch (currentView.type) {
      case 'feed':
        return <FeedTimeline client={client} goTo={goTo} />;
      case 'thread':
        return (
          <ThreadView
            client={client}
            uri={(currentView as { uri: string }).uri}
            goBack={goBack}
            goTo={goTo}
          />
        );
      case 'compose':
        return (
          <ComposePage
            client={client}
            replyTo={(currentView as { replyTo?: string }).replyTo}
            goBack={goBack}
            goHome={goHome}
          />
        );
      case 'profile':
        return (
          <ProfilePage
            client={client}
            actor={(currentView as { actor: string }).actor}
            goBack={goBack}
            goTo={goTo}
          />
        );
      case 'notifications':
        return <NotifsPage client={client} goBack={goBack} />;
      case 'search':
        return (
          <SearchPage
            client={client}
            initialQuery={(currentView as { query?: string }).query}
            goBack={goBack}
            goTo={goTo}
          />
        );
      case 'aiChat':
        return (
          <AIChatPage
            client={client}
            aiConfig={appConfig.aiConfig}
            contextUri={(currentView as { contextUri?: string }).contextUri}
            goBack={goBack}
          />
        );
      case 'bookmarks':
        return <BookmarkPage client={client} goBack={goBack} goTo={goTo} />;
      default:
        return <div className="p-6 text-text-secondary">未知页面</div>;
    }
  };

  return (
    <Layout
      currentView={currentView}
      canGoBack={canGoBack}
      goBack={goBack}
      goHome={goHome}
      goTo={goTo}
      client={client}
      onLogout={handleLogout}
      config={appConfig}
      onConfigChange={setAppConfig}
      onRelogin={handleRelogin}
    >
      {renderView()}
    </Layout>
  );
}
