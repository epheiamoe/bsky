import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth, useTimeline, useI18n, useDrafts } from '@bsky/app';
import type { AppView } from '@bsky/app';
import type { PostView } from '@bsky/core';
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
  const timeline = useTimeline(client);
  const { drafts } = useDrafts();
  const { t } = useI18n();
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [appConfig, setAppConfig] = useState<AppConfig>(getAppConfig);
  const feedScrollIndexRef = useRef(0);

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

  // ── Force logout when auth error (session expired after sleep) ──
  useEffect(() => {
    if (authError && isLoggedIn) {
      clearSession();
      setIsLoggedIn(false);
    }
  }, [authError, isLoggedIn]);

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
        <p className="text-text-secondary text-lg animate-pulse">🦋 {t('login.connecting')}</p>
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
        return (
          <FeedTimeline
            goTo={goTo}
            posts={timeline.posts}
            loading={timeline.loading}
            cursor={timeline.cursor}
            error={timeline.error}
            loadMore={timeline.loadMore}
            refresh={timeline.refresh}
            initialScrollIndex={feedScrollIndexRef.current}
            onFirstVisibleIndexChange={(idx) => { feedScrollIndexRef.current = idx; }}
          />
        );
      case 'thread':
        return (
          <ThreadView
            client={client}
            uri={(currentView as { uri: string }).uri}
            goBack={goBack}
            goTo={goTo}
            aiConfig={appConfig.aiConfig}
            targetLang={appConfig.targetLang}
            translateMode={appConfig.translateMode}
          />
        );
      case 'compose':
        return (
          <ComposePage
            client={client}
            replyTo={(currentView as { replyTo?: string }).replyTo}
            quoteUri={(currentView as { quoteUri?: string }).quoteUri}
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
        return <NotifsPage client={client} goBack={goBack} goTo={goTo} />;
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
        return <div className="p-6 text-text-secondary">{t('common.unknownPage')}</div>;
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
      draftCount={drafts.length}
    >
      {renderView()}
    </Layout>
  );
}
