import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useAuth, useTimeline, useI18n, useDrafts, usePostActions, registerWidget, setDraftStorageFactory, initChatService, useConvoList, setWorkspaceStorageFactory } from '@bsky/app';
import type { AppView, SearchTab } from '@bsky/app';
import type { PostView, AIConfig } from '@bsky/core';
import { BskyClient } from '@bsky/core';
import { getSession, saveSession, clearSession } from './hooks/useSessionPersistence.js';
import { getAppConfig, type AppConfig } from './hooks/useAppConfig.js';
import { useModerationConfig } from './hooks/useModerationConfig.js';
import { getFeedConfig, setLastFeedUri, seedPostViewers, getAIChatSessionId, saveFeedScrollTop, getFeedScrollTop } from '@bsky/app';
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
import { IndexedDBWorkspaceStorage } from './services/indexeddb-workspace-storage.js';
import { PolishWidget } from './components/widgets/PolishWidget.js';
import { SuggestedFollowsWidget } from './components/widgets/SuggestedFollowsWidget.js';
import { SuggestedFeedsWidget } from './components/widgets/SuggestedFeedsWidget.js';
import { TrendsWidget } from './components/widgets/TrendsWidget.js';
import { AIChatWidget, AIChatHeaderButtons } from './components/widgets/AIChatWidget.js';
import { AboutPage } from './components/AboutPage.js';
import { DiagnosticPage } from './components/DiagnosticPage.js';
import { AtPlayPage } from './components/AtPlayPage.js';
import { AtPlaySocialCircle } from './components/AtPlaySocialCircle.js';
import { SettingsPage } from './components/SettingsPage.js';
import { Icon } from './components/Icon.js';
import { AIGuidance } from './components/AIGuidance.js';
import { WelcomeCard } from './components/WelcomeCard.js';
import { ProfilePreviewWidget } from './components/widgets/ProfilePreviewWidget.js';
import { RedirectPage } from './components/RedirectPage.js';

export function App() {
  // Register storage factories (browser: IndexedDB)
  setDraftStorageFactory(() => new IndexedDBDraftStorage());
  setWorkspaceStorageFactory(() => new IndexedDBWorkspaceStorage());

  // Initialize ChatService once (idempotent — only first call sets storage)
  useEffect(() => {
    initChatService(new IndexedDBChatStorage());
  }, []);

  // Set build metadata for error logging
  BskyClient.commitHash = typeof __COMMIT_HASH__ !== 'undefined' ? __COMMIT_HASH__ : '(dev)';
  BskyClient.buildTime = typeof __BUILD_TIME__ !== 'undefined' ? __BUILD_TIME__ : '(dev)';

  const { currentView, canGoBack, goTo, goBack, goHome } = useHashRouter();

  // Handle /i/ redirect paths (e.g. /i/bsky.app/profile/xxx)
  const [redirectPath, setRedirectPath] = useState<string | null>(() => {
    const pathname = window.location.pathname;
    return pathname.startsWith('/i/') ? pathname : null;
  });

  const { client, loading: authLoading, error: authError, errorLog, login, session, restoreSession, profile } = useAuth();
  const [appConfig, setAppConfig] = useState<AppConfig>(getAppConfig);
  const feedUri = currentView.type === 'feed' ? ((currentView as { feedUri?: string }).feedUri ?? getFeedConfig().defaultFeedUri ?? undefined) : undefined;
  const timeline = useTimeline(client, feedUri, appConfig.feedCacheLimit);
  const postActions = usePostActions(client);
  // Seed timeline posts into global like/repost state
  useEffect(() => { if (timeline.posts.length > 0) seedPostViewers(timeline.posts as any[]); }, [timeline.posts]);
  const { drafts } = useDrafts(client);
  const { convos } = useConvoList(client);
  const dmCount = convos.reduce((sum, c) => sum + c.unreadCount, 0);
  const { t } = useI18n();
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [showWelcome, setShowWelcome] = useState(() => !localStorage.getItem('bsky_welcomed_v2'));
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const moderationConfigState = useModerationConfig();
  const profileScrollTopRef = useRef(0);
  const notifsScrollTopRef = useRef(0);
  const searchScrollTopRef = useRef(0);
  const bookmarksScrollTopRef = useRef(0);
  const listsScrollTopRef = useRef(0);
  const listDetailFeedScrollTopRef = useRef(0);
  const listDetailMemberScrollTopRef = useRef(0);

  // Listen for PWA update notifications
  useEffect(() => {
    const handler = () => setUpdateAvailable(true);
    window.addEventListener('pwa-update-available', handler);
    return () => window.removeEventListener('pwa-update-available', handler);
  }, []);

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
      apiType: provider?.apiType,
      thinkingEnabled: modelInfo?.thinking ?? appConfig.aiConfig.thinkingEnabled ?? true,
      visionEnabled: modelInfo?.vision ?? appConfig.aiConfig.visionEnabled ?? false,
    };
  }, [appConfig]);

  const scenarioModels = useMemo(() => ({
    aiChat: resolveScenarioConfig(appConfig.scenarioModels?.aiChat || ''),
    translate: resolveScenarioConfig(appConfig.scenarioModels?.translate || ''),
    polish: resolveScenarioConfig(appConfig.scenarioModels?.polish || ''),
    imageDescription: appConfig.scenarioModels?.imageDescription
      ? resolveScenarioConfig(appConfig.scenarioModels.imageDescription)
      : undefined,
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

  // ── Sync dark mode + CVD mode + lang + theme-color ──
  useEffect(() => {
    document.documentElement.classList.toggle('dark', appConfig.darkMode);
    document.documentElement.classList.toggle('cvd', appConfig.cvdMode);
    document.documentElement.lang = appConfig.targetLang || 'en';
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', appConfig.darkMode ? '#000000' : '#FFFFFF');
  }, [appConfig.darkMode, appConfig.cvdMode, appConfig.targetLang]);

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

  // ── Update page title based on current view ──
  useEffect(() => {
    const base = 'Bluesky Client';
    switch (currentView.type) {
      case 'feed': document.title = `${base} — Feed`; break;
      case 'thread': document.title = `${base} — Thread`; break;
      case 'profile': document.title = `${base} — Profile`; break;
      case 'search': document.title = `${base} — Search`; break;
      case 'notifications': document.title = `${base} — Notifications`; break;
      case 'bookmarks': document.title = `${base} — Bookmarks`; break;
      case 'aiChat': document.title = `${base} — AI Chat`; break;
      case 'compose': document.title = `${base} — Compose`; break;
      case 'drafts': document.title = `${base} — Drafts`; break;
      case 'lists': document.title = `${base} — Lists`; break;
      case 'about': document.title = `${base} — About`; break;
      case 'diagnostic': document.title = `${base} — Diagnostic`; break;
      case 'components': document.title = `${base} — Components`; break;
      case 'atplay': document.title = `${base} — AT Play`; break;
      default: document.title = base;
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
    if (session && client?.isAuthenticated() && profile) {
      const cs = client.session;
      if (cs) {
        saveSession({
          accessJwt: cs.accessJwt,
          refreshJwt: cs.refreshJwt,
          handle: cs.handle,
          did: cs.did,
          pdsUrl: client.pdsUrl,
        });
      }
      setIsLoggedIn(true);
    }
  }, [session, client, profile]);

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

  // ── Redirect page handler ──
  // Must be checked BEFORE auth/welcome states so /i/ links work even when not logged in
  if (redirectPath) {
    return (
      <RedirectPage
        pathname={redirectPath}
        client={client}
        onNavigate={(view) => {
          setRedirectPath(null);
          goTo(view, true);
        }}
      />
    );
  }

  // ── Loading ──
  if (authLoading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[100dvh] bg-background gap-3">
        <Icon name="astroid-as-AI-Button" size={32} className="text-primary" />
        <p className="text-text-secondary text-sm animate-pulse">{t('login.connecting')}</p>
      </div>
    );
  }

  // ── Not logged in ──
  if (!isLoggedIn || !client) {
    return (
      <LoginPage onLogin={handleLogin} error={authError} errorLog={errorLog} footer={<AIGuidance />} />
    );
  }

  if (showWelcome) {
    return (
      <WelcomeCard
        config={appConfig}
        onConfigChange={setAppConfig}
        moderationConfig={moderationConfigState.config}
        onModerationConfigChange={moderationConfigState.updateConfig}
        onGoToSettings={() => {
          localStorage.setItem('bsky_welcomed_v2', '1');
          setShowWelcome(false);
          goTo({ type: 'settings' }, true);
        }}
        onSkip={() => {
          localStorage.setItem('bsky_welcomed_v2', '1');
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
            key={feedUri ?? 'following'}
            goTo={goTo}
            posts={timeline.posts}
            loading={timeline.loading}
            cursor={timeline.cursor}
            error={timeline.error}
            loadMore={timeline.loadMore}
            refresh={timeline.refresh}
            initialScrollTop={getFeedScrollTop(feedUri) ?? 0}
            onScrollTopChange={(top) => { saveFeedScrollTop(feedUri, top); }}
            feedUri={feedUri}
            client={client}
            isLiked={postActions.isLiked}
            isReposted={postActions.isReposted}
            likePost={postActions.likePost}
            repostPost={postActions.repostPost}
            imageDescConfig={scenarioModels.imageDescription}
            imageDescLang={appConfig.targetLang}
            singleImageFill={appConfig.singleImageFill}
            previewLines={appConfig.postPreviewLines}
            quotedPreviewLines={appConfig.quotedPreviewLines}
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
            imageDescConfig={scenarioModels.imageDescription}
            imageDescLang={appConfig.targetLang}
            singleImageFill={appConfig.singleImageFill}
            threadPreviewLines={appConfig.threadPreviewLines}
            quotedPostPreviewLines={appConfig.quotedPreviewLines}
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
            imageDescConfig={scenarioModels.imageDescription}
            imageDescLang={appConfig.targetLang}
            singleImageFill={appConfig.singleImageFill}
            initialScrollTop={profileScrollTopRef.current}
            onScrollTopChange={(top) => { profileScrollTopRef.current = top; }}
            previewLines={appConfig.postPreviewLines}
            quotedPreviewLines={appConfig.quotedPreviewLines}
          />
        );
      case 'notifications':
        return (
          <NotifsPage
            client={client} goBack={goBack} goTo={goTo}
            initialScrollTop={notifsScrollTopRef.current}
            onScrollTopChange={(top) => { notifsScrollTopRef.current = top; }}
          />
        );
      case 'search':
        return (
          <SearchPage
            client={client}
            initialQuery={(currentView as { query?: string }).query}
            initialTab={(currentView as { searchTab?: SearchTab }).searchTab}
            goBack={goBack}
            goTo={goTo}
            initialScrollTop={searchScrollTopRef.current}
            onScrollTopChange={(top) => { searchScrollTopRef.current = top; }}
            imageDescConfig={scenarioModels.imageDescription}
            imageDescLang={appConfig.targetLang}
            singleImageFill={appConfig.singleImageFill}
            previewLines={appConfig.postPreviewLines}
            quotedPreviewLines={appConfig.quotedPreviewLines}
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
            userDisplayName={profile?.displayName}
          />
        );
      }
      case 'bookmarks':
        return (
          <BookmarkPage
            client={client} goBack={goBack} goTo={goTo}
            initialScrollTop={bookmarksScrollTopRef.current}
            onScrollTopChange={(top) => { bookmarksScrollTopRef.current = top; }}
            imageDescConfig={scenarioModels.imageDescription}
            imageDescLang={appConfig.targetLang}
            singleImageFill={appConfig.singleImageFill}
            previewLines={appConfig.postPreviewLines}
            quotedPreviewLines={appConfig.quotedPreviewLines}
          />
        );
      case 'lists':
        return (
          <ListsPage
            client={client} goBack={goBack} goTo={goTo} actor={(currentView as { actor?: string }).actor}
            initialScrollTop={listsScrollTopRef.current}
            onScrollTopChange={(top) => { listsScrollTopRef.current = top; }}
          />
        );
      case 'listDetail':
        return (
          <ListDetailPage
            client={client} listUri={(currentView as { uri: string }).uri} goBack={goBack} goTo={goTo} initialTab={(currentView as { tab?: 'posts' | 'members' }).tab}
            initialScrollTop={listDetailFeedScrollTopRef.current}
            onScrollTopChange={(top) => { listDetailFeedScrollTopRef.current = top; }}
            membersScrollTop={listDetailMemberScrollTopRef.current}
            onMembersScrollTop={(top) => { listDetailMemberScrollTopRef.current = top; }}
            previewLines={appConfig.postPreviewLines}
            quotedPreviewLines={appConfig.quotedPreviewLines}
          />
        );
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
      case 'diagnostic':
        return <DiagnosticPage client={client} goBack={goBack} posts={timeline.posts} />;
      case 'atplay':
        return <AtPlayPage client={client} goBack={goBack} goTo={goTo} />;
      case 'atplaySocialCircle':
        return <AtPlaySocialCircle client={client} goBack={goBack} goTo={goTo} />;
      case 'settings':
        return (
          <SettingsPage
            config={appConfig}
            onConfigChange={setAppConfig}
            onRelogin={handleRelogin}
            onLogout={handleLogout}
            onRestartWelcome={() => {
              localStorage.removeItem('bsky_welcomed_v2');
              setShowWelcome(true);
            }}
            client={client}
            moderationConfig={moderationConfigState.config}
            moderationSyncState={moderationConfigState.syncState}
            onModerationConfigChange={moderationConfigState.updateConfig}
            onSyncFromPDS={() => moderationConfigState.syncFromPDS(client)}
            onSaveToPDS={() => moderationConfigState.saveToPDS(client)}
          />
        );
      default:
        return <div className="p-6 text-text-secondary">{t('common.unknownPage')}</div>;
    }
  };

  return (
    <>
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
      userDisplayName={profile?.displayName}
    >
      {renderView()}
    </Layout>
    {updateAvailable && (
      <div role="status" className="fixed bottom-4 right-4 z-[9999] bg-green-500 text-white text-sm px-4 py-3 rounded-xl shadow-xl flex items-center gap-3 animate-slideUp">
        <span>{t('about.updateAvailable')}</span>
        <button
          onClick={() => window.location.reload()}
          className="bg-white/20 hover:bg-white/30 px-3 py-1 rounded-lg text-xs font-semibold transition-colors"
        >
          {t('about.updateNow')}
        </button>
        <button
          onClick={() => setUpdateAvailable(false)}
          className="text-white/60 hover:text-white transition-colors text-lg leading-none"
          aria-label="Dismiss"
        >
          ×
        </button>
      </div>
    )}
    </>
  );
}
