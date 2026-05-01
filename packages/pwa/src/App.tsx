import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useAuth, useTimeline, useI18n, useDrafts } from '@bsky/app';
import type { AppView } from '@bsky/app';
import type { PostView } from '@bsky/core';
import { getSession, saveSession, clearSession } from './hooks/useSessionPersistence.js';
import { getAppConfig, type AppConfig } from './hooks/useAppConfig.js';
import { getFeedConfig, setLastFeedUri } from '@bsky/app';
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
  const feedUri = currentView.type === 'feed' ? ((currentView as { feedUri?: string }).feedUri ?? getFeedConfig().defaultFeedUri ?? undefined) : undefined;
  const timeline = useTimeline(client, feedUri);
  const { drafts } = useDrafts();
  const { t } = useI18n();
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [appConfig, setAppConfig] = useState<AppConfig>(getAppConfig);
  const feedScrollIndexRef = useRef(0);

  const effectiveAiConfig = useMemo(() => ({
    ...appConfig.aiConfig,
    thinkingEnabled: appConfig.thinkingEnabled,
    visionEnabled: appConfig.visionEnabled,
  }), [appConfig.aiConfig, appConfig.thinkingEnabled, appConfig.visionEnabled]);

  // ── Sync dark mode on mount ──
  useEffect(() => {
    document.documentElement.classList.toggle('dark', getAppConfig().darkMode);
  }, []);

  // ── Track last active feed URI for sidebar/home navigation ──
  useEffect(() => {
    if (currentView.type === 'feed') {
      const uri = (currentView as { feedUri?: string }).feedUri;
      if (uri) setLastFeedUri(uri);
    }
  }, [currentView]);

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
            feedUri={(currentView as { feedUri?: string }).feedUri}
            client={client}
          />
        );
      case 'thread':
        return (
          <ThreadView
            client={client}
            uri={(currentView as { uri: string }).uri}
            goBack={goBack}
            goTo={goTo}
            aiConfig={effectiveAiConfig}
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
            aiConfig={effectiveAiConfig}
            targetLang={appConfig.targetLang}
            translateMode={appConfig.translateMode}
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
            aiConfig={effectiveAiConfig}
            sessionId={(currentView as { sessionId?: string }).sessionId}
            contextPost={(currentView as { contextPost?: string }).contextPost}
            contextProfile={(currentView as { contextProfile?: string }).contextProfile}
            contextUri={(currentView as { contextUri?: string }).contextUri}
            goTo={goTo}
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
