import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useAuth, useTimeline, useI18n, useDrafts, usePostActions, registerWidget, setDraftStorageFactory, setChatStorageFactory, useConvoList } from '@bsky/app';
import type { AppView, SearchTab } from '@bsky/app';
import type { PostView, AIConfig } from '@bsky/core';
import { getSession, saveSession, clearSession } from './hooks/useSessionPersistence.js';
import { getAppConfig, type AppConfig } from './hooks/useAppConfig.js';
import { getFeedConfig, setLastFeedUri, seedPostViewers, getAIChatSessionId } from '@bsky/app';
import { getProviderById, getModelInfo } from '@bsky/core';
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
import { ListsPage } from './components/ListsPage.js';
import { ListDetailPage } from './components/ListDetailPage.js';
import { DraftsPage } from './components/DraftsPage.js';
import { ConvoListPage } from './components/ConvoListPage.js';
import { DMChatPage } from './components/DMChatPage.js';
import { ComponentsPage } from './components/ComponentsPage.js';
import { IndexedDBDraftStorage } from './services/indexeddb-draft-storage.js';
import { IndexedDBChatStorage } from './services/indexeddb-chat-storage.js';
import { PolishWidget } from './components/widgets/PolishWidget.js';
import { SuggestedFollowsWidget } from './components/widgets/SuggestedFollowsWidget.js';
import { SuggestedFeedsWidget } from './components/widgets/SuggestedFeedsWidget.js';
import { TrendsWidget } from './components/widgets/TrendsWidget.js';
import { AIChatWidget, AIChatHeaderButtons } from './components/widgets/AIChatWidget.js';
import { AboutPage } from './components/AboutPage.js';
import { AtPlayPage } from './components/AtPlayPage.js';
import { AtPlaySocialCircle } from './components/AtPlaySocialCircle.js';
import { Icon } from './components/Icon.js';
import { WelcomeCard } from './components/WelcomeCard.js';
import { ProfilePreviewWidget } from './components/widgets/ProfilePreviewWidget.js';

export function App() {
  // Register storage factories (browser: IndexedDB)
  setDraftStorageFactory(() => new IndexedDBDraftStorage());
  setChatStorageFactory(() => new IndexedDBChatStorage());

  const { currentView, canGoBack, goTo, goBack, goHome } = useHashRouter();
  const { client, loading: authLoading, error: authError, login, session, restoreSession } = useAuth();
  const feedUri = currentView.type === 'feed' ? ((currentView as { feedUri?: string }).feedUri ?? getFeedConfig().defaultFeedUri ?? undefined) : undefined;
  const timeline = useTimeline(client, feedUri);
  const postActions = usePostActions(client);
  // Seed timeline posts into global like/repost state
  useEffect(() => { if (timeline.posts.length > 0) seedPostViewers(timeline.posts as any[]); }, [timeline.posts]);
  const { drafts } = useDrafts(client);
  const { convos } = useConvoList(client);
  const dmCount = convos.reduce((sum, c) => sum + c.unreadCount, 0);
  const { t } = useI18n();
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [showWelcome, setShowWelcome] = useState(() => !localStorage.getItem('bsky_welcomed'));
  const [appConfig, setAppConfig] = useState<AppConfig>(getAppConfig);
  const feedScrollTopRef = useRef(0);

  // Resolve full AIConfig for a scenario model string ("provider/model" or just "model" or "")
  const resolveScenarioConfig = useCallback((scenarioModel: string): AIConfig => {
    if (!scenarioModel || !scenarioModel.includes('/')) {
      return { ...appConfig.aiConfig };
    }
    const [providerId, model] = scenarioModel.split('/');
    if (!providerId || !model) return { ...appConfig.aiConfig };
    const provider = getProviderById(providerId);
    const modelInfo = provider ? getModelInfo(providerId, model) : undefined;
    return {
      ...appConfig.aiConfig,
      baseUrl: provider?.baseUrl || appConfig.aiConfig.baseUrl,
      model,
      apiKey: appConfig.apiKeys?.[providerId] || appConfig.aiConfig.apiKey,
      provider: provider?.id,
      reasoningStyle: provider?.reasoningStyle,
      thinkingEnabled: modelInfo?.thinking ?? appConfig.aiConfig.thinkingEnabled ?? true,
      visionEnabled: modelInfo?.vision ?? appConfig.aiConfig.visionEnabled ?? false,
    };
  }, [appConfig]);

  const scenarioModels = useMemo(() => ({
    aiChat: resolveScenarioConfig(appConfig.scenarioModels?.aiChat || ''),
    translate: resolveScenarioConfig(appConfig.scenarioModels?.translate || ''),
    polish: resolveScenarioConfig(appConfig.scenarioModels?.polish || ''),
  }), [resolveScenarioConfig, appConfig.scenarioModels]);

  const effectiveAiConfig = useMemo(() => ({
    ...scenarioModels.aiChat,
  }), [scenarioModels.aiChat]);

  // ── Register widgets ──
  useEffect(() => {
    registerWidget({
      id: 'polish',
      titleKey: 'action.polish',
      icon: 'file-text',
      views: ['compose'],
      defaultOpen: true,
    }, (props) => React.createElement(PolishWidget, props));
    registerWidget({
      id: 'profilePreview',
      titleKey: 'widget.profilePreview',
      icon: 'at-sign',
      views: ['thread'],
      defaultOpen: true,
    }, (props) => React.createElement(ProfilePreviewWidget, props));
    registerWidget({
      id: 'suggestedFollows',
      titleKey: 'widget.suggestedFollows',
      icon: 'compass',
      views: [],
      defaultOpen: false,
    }, (props) => React.createElement(SuggestedFollowsWidget, props));
    registerWidget({
      id: 'suggestedFeeds',
      titleKey: 'widget.suggestedFeeds',
      icon: 'home',
      views: [],
      defaultOpen: false,
    }, (props) => React.createElement(SuggestedFeedsWidget, props));
    registerWidget({
      id: 'trends',
      titleKey: 'widget.trends',
      icon: 'bell',
      views: [],
      defaultOpen: false,
    }, (props) => React.createElement(TrendsWidget, props));
    registerWidget({
      id: 'aiChat',
      titleKey: 'ai.widgetTitle',
      icon: 'astroid-as-AI-Button',
      views: [],
      defaultOpen: false,
      headerButtons: AIChatHeaderButtons,
    }, (props) => React.createElement(AIChatWidget, props));
  }, []);

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

  // ── Track last non-AI view for /view context ──
  const [viewContext, setViewContext] = useState<AppView | null>(null);
  useEffect(() => {
    if (currentView.type !== 'aiChat' && currentView.type !== 'components') {
      setViewContext(currentView);
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
      }, saved.pdsUrl ?? 'https://bsky.social');
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
        pdsUrl: client.pdsUrl,
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

  const handleLogin = useCallback(async (handle: string, password: string, pdsUrl?: string) => {
    await login(handle, password, pdsUrl);
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
      <div className="flex flex-col items-center justify-center min-h-screen bg-white dark:bg-[#0A0A0A] gap-3">
        <Icon name="astroid-as-AI-Button" size={32} className="text-primary" />
        <p className="text-text-secondary text-sm animate-pulse">{t('login.connecting')}</p>
      </div>
    );
  }

  // ── Not logged in ──
  if (!isLoggedIn || !client) {
    return <LoginPage onLogin={handleLogin} error={authError} />;
  }

  if (showWelcome) {
    return (
      <WelcomeCard
        onGoToSettings={() => {
          localStorage.setItem('bsky_welcomed', '1');
          setShowWelcome(false);
        }}
        onSkip={() => {
          localStorage.setItem('bsky_welcomed', '1');
          setShowWelcome(false);
        }}
      />
    );
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
            initialScrollTop={feedScrollTopRef.current}
            onScrollTopChange={(top) => { feedScrollTopRef.current = top; }}
            feedUri={(currentView as { feedUri?: string }).feedUri}
            client={client}
            isLiked={postActions.isLiked}
            isReposted={postActions.isReposted}
            likePost={postActions.likePost}
            repostPost={postActions.repostPost}
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
            translateConfig={scenarioModels.translate}
          />
        );
      case 'compose':
        return (
          <ComposePage
            client={client}
            replyTo={(currentView as { replyTo?: string }).replyTo}
            quoteUri={(currentView as { quoteUri?: string }).quoteUri}
            draftId={(currentView as { draftId?: string }).draftId}
            initialText={(currentView as { initialText?: string }).initialText}
            goBack={goBack}
            goHome={goHome}
            goTo={goTo}
            polishConfig={scenarioModels.polish}
          />
        );
      case 'profile':
        return (
          <ProfilePage
            client={client}
            actor={(currentView as { actor: string }).actor}
            initialTab={(currentView as { profileTab?: string }).profileTab}
            goBack={goBack}
            goTo={goTo}
            aiConfig={effectiveAiConfig}
            targetLang={appConfig.targetLang}
            translateMode={appConfig.translateMode}
            translateConfig={scenarioModels.translate}
          />
        );
      case 'notifications':
        return <NotifsPage client={client} goBack={goBack} goTo={goTo} />;
      case 'search':
        return (
          <SearchPage
            client={client}
            initialQuery={(currentView as { query?: string }).query}
            initialTab={(currentView as { searchTab?: SearchTab }).searchTab}
            goBack={goBack}
            goTo={goTo}
          />
        );
      case 'aiChat': {
        const sessionId = (currentView as { sessionId?: string }).sessionId || getAIChatSessionId() || undefined;
        return (
          <AIChatPage
            client={client}
            aiConfig={effectiveAiConfig}
            sessionId={sessionId}
            contextPost={(currentView as { contextPost?: string }).contextPost}
            contextProfile={(currentView as { contextProfile?: string }).contextProfile}
            contextUri={(currentView as { contextUri?: string }).contextUri}
            goTo={goTo}
            goBack={goBack}
          />
        );
      }
      case 'bookmarks':
        return <BookmarkPage client={client} goBack={goBack} goTo={goTo} />;
      case 'lists':
        return <ListsPage client={client} goBack={goBack} goTo={goTo} actor={(currentView as { actor?: string }).actor} />;
      case 'listDetail':
        return <ListDetailPage client={client} listUri={(currentView as { uri: string }).uri} goBack={goBack} goTo={goTo} initialTab={(currentView as { tab?: 'posts' | 'members' }).tab} />;
      case 'drafts':
        return <DraftsPage client={client} goBack={goBack} goTo={goTo} />;
      case 'dm':
        return <ConvoListPage client={client} goBack={goBack} goTo={goTo} />;
      case 'dmChat':
        return <DMChatPage client={client} conversationId={(currentView as { conversationId: string }).conversationId} goBack={goBack} goTo={goTo} />;
      case 'components':
        return <ComponentsPage goBack={goBack} goTo={goTo} client={client} />;
      case 'about':
        return <AboutPage goBack={goBack} />;
      case 'atplay':
        return <AtPlayPage client={client} goBack={goBack} goTo={goTo} />;
      case 'atplaySocialCircle':
        return <AtPlaySocialCircle client={client} goBack={goBack} goTo={goTo} />;
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
      draftCount={drafts.filter(d => d.syncStatus !== 'synced').length}
      dmCount={dmCount}
      polishConfig={scenarioModels.polish}
      aiConfig={effectiveAiConfig}
    >
      {renderView()}
    </Layout>
  );
}
