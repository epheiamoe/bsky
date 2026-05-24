import { useState, useEffect, useCallback } from 'react';
import type { AppView } from '@bsky/app';
import { getFeedConfig, getLastFeedUri } from '@bsky/app';
import { BUILTIN_FEEDS } from '@bsky/core';

/**
 * Hash-based navigation for PWA static hosting.
 * Uses history.pushState + popstate for reliable back/forward.
 *
 * Hash formats:
 *   #/feed / #/feed?feed=at://... / #/feed?feed=following / #/feed?feed=discover
 *   #/thread?uri=at://...
 *   #/profile?actor=did:plc:...
 *   #/notifications
 *   #/search / #/search?q=...
 *   #/bookmarks
 *   #/drafts
 *   #/settings
 *   #/compose / #/compose?replyTo=at://...
 *   #/ai / #/ai?context=at://...
 */
export function useHashRouter() {
  const [currentView, setCurrentView] = useState<AppView>(() => parseHash());
  const [canGoBack, setCanGoBack] = useState(() => {
    return window.history.length > 1 && window.location.hash !== '#/feed' && !!window.location.hash;
  });

  useEffect(() => {
    // Redirect bare /feed to default feed if configured
    const raw = window.location.hash.replace(/^#/, '');
    if (!raw || raw === '/' || raw === '/feed' || raw === '') {
      const defFeed = getFeedConfig().defaultFeedUri ?? BUILTIN_FEEDS.following;
      window.history.replaceState(null, '', `#/feed?feed=${encodeURIComponent(defFeed)}`);
    }

    const handler = () => {
      const view = parseHash();
      setCurrentView(view);
      const hash = window.location.hash;
      setCanGoBack(hash !== '#/feed' && hash !== '' && hash !== '#/');
    };

    window.addEventListener('popstate', handler);
    return () => window.removeEventListener('popstate', handler);
  }, []);

  const goTo = useCallback((view: AppView, replace?: boolean) => {
    // Bare feed navigation → resolve to last active or default feed
    if (view.type === 'feed' && !view.feedUri) {
      const resolved = getLastFeedUri() ?? getFeedConfig().defaultFeedUri ?? BUILTIN_FEEDS.following;
      if (resolved) {
        view = { type: 'feed', feedUri: resolved };
      }
    }
    const hash = encodeView(view);
    if (replace) {
      window.history.replaceState(null, '', hash);
      setCanGoBack(false);
    } else {
      window.history.pushState(null, '', hash);
      setCanGoBack(true);
    }
    setCurrentView(view);
  }, []);

  const goBack = useCallback(() => {
    if (window.location.hash && window.location.hash !== '#/feed') {
      window.history.back();
    }
  }, []);

  const goHome = useCallback(() => {
    const defFeed = getFeedConfig().defaultFeedUri ?? BUILTIN_FEEDS.following;
    window.history.pushState(null, '', `#/feed?feed=${encodeURIComponent(defFeed)}`);
    setCurrentView({ type: 'feed', feedUri: defFeed });
    setCanGoBack(false);
  }, []);

  return { currentView, canGoBack, goTo, goBack, goHome };
}

function parseHash(): AppView {
  const raw = window.location.hash.replace(/^#/, '');
  if (!raw) return { type: 'feed' };

  const [path, queryString] = raw.split('?');
  const params = new URLSearchParams(queryString || '');

  switch (path) {
    case '/': case '/feed': case '': {
      const feedUri = params.get('feed');
      if (feedUri) return { type: 'feed', feedUri: decodeURIComponent(feedUri) };
      try {
        const defFeed = getFeedConfig().defaultFeedUri ?? BUILTIN_FEEDS.following;
        if (defFeed) return { type: 'feed', feedUri: defFeed };
      } catch {}
      return { type: 'feed', feedUri: BUILTIN_FEEDS.following };
    }
    case '/thread': {
      const uri = params.get('uri');
      return uri ? { type: 'thread', uri: decodeURIComponent(uri) } : { type: 'feed' };
    }
    case '/profile': {
      const actor = params.get('actor');
      if (!actor) return { type: 'feed' };
      const view: AppView = { type: 'profile', actor: decodeURIComponent(actor) };
      const tab = params.get('tab');
      if (tab) (view as { profileTab?: string }).profileTab = decodeURIComponent(tab);
      return view;
    }
    case '/notifications':
      return { type: 'notifications' };
    case '/search': {
      const q = params.get('q');
      const tab = params.get('tab');
      const view: AppView = q ? { type: 'search', query: decodeURIComponent(q) } : { type: 'search' };
      if (tab) (view as { searchTab?: string }).searchTab = decodeURIComponent(tab);
      return view;
    }
    case '/bookmarks':
      return { type: 'bookmarks' };
    case '/lists': {
      const actor = params.get('actor');
      return actor ? { type: 'lists', actor: decodeURIComponent(actor) } : { type: 'lists' };
    }
    case '/list': {
      const uri = params.get('uri');
      if (!uri) return { type: 'lists' };
      const tab = params.get('tab') as 'posts' | 'members' | undefined;
      return tab ? { type: 'listDetail', uri: decodeURIComponent(uri), tab } : { type: 'listDetail', uri: decodeURIComponent(uri) };
    }
    case '/drafts':
      return { type: 'drafts' };
    case '/settings':
      return { type: 'settings' };
    case '/dm': {
      const conv = params.get('conv');
      if (conv) return { type: 'dmChat', conversationId: decodeURIComponent(conv) };
      return { type: 'dm' };
    }
    case '/components':
      return { type: 'components' };
    case '/diagnostic':
      return { type: 'diagnostic' };
    case '/about':
      return { type: 'about' };
    case '/atplay':
      return { type: 'atplay' };
    case '/atplay/social-circle':
      return { type: 'atplaySocialCircle' };
    case '/compose': {
      const replyTo = params.get('replyTo');
      const quoteUri = params.get('quoteUri');
      const draftId = params.get('draftId');
      const view: AppView = { type: 'compose' };
      if (replyTo) (view as { replyTo?: string }).replyTo = decodeURIComponent(replyTo);
      if (quoteUri) (view as { quoteUri?: string }).quoteUri = decodeURIComponent(quoteUri);
      if (draftId) (view as { draftId?: string }).draftId = decodeURIComponent(draftId);
      return view;
    }
    case '/ai': {
      const session = params.get('session');
      const post = params.get('post');
      const profile = params.get('profile');
      if (session) {
        const view: AppView = { type: 'aiChat', sessionId: decodeURIComponent(session) };
        if (post) (view as { contextPost?: string }).contextPost = decodeURIComponent(post);
        if (profile) (view as { contextProfile?: string }).contextProfile = decodeURIComponent(profile);
        return view;
      }
      const context = params.get('context');
      return context ? { type: 'aiChat', contextUri: decodeURIComponent(context) } : { type: 'aiChat' };
    }
    default:
      return { type: 'feed' };
  }
}

function encodeView(view: AppView): string {
  switch (view.type) {
    case 'feed':
      if (view.feedUri) {
        return `#/feed?feed=${encodeURIComponent(view.feedUri)}`;
      }
      return '#/feed';
    case 'thread':
      return `#/thread?uri=${encodeURIComponent(view.uri)}`;
    case 'profile': {
      const tab = (view as { profileTab?: string }).profileTab;
      let url = `#/profile?actor=${encodeURIComponent(view.actor)}`;
      if (tab) url += `&tab=${encodeURIComponent(tab)}`;
      return url;
    }
    case 'notifications':
      return '#/notifications';
    case 'search': {
      const base = '#/search';
      const params = new URLSearchParams();
      if (view.query) params.set('q', encodeURIComponent(view.query));
      const tab = (view as { searchTab?: string }).searchTab;
      if (tab) params.set('tab', encodeURIComponent(tab));
      const qs = params.toString();
      return qs ? `${base}?${qs}` : base;
    }
    case 'bookmarks':
      return '#/bookmarks';
    case 'lists': {
      const actor = (view as { actor?: string }).actor;
      return actor ? `#/lists?actor=${encodeURIComponent(actor)}` : '#/lists';
    }
    case 'listDetail': {
      const tab = (view as { tab?: string }).tab;
      let url = `#/list?uri=${encodeURIComponent(view.uri)}`;
      if (tab) url += `&tab=${encodeURIComponent(tab)}`;
      return url;
    }
    case 'drafts':
      return '#/drafts';
    case 'settings':
      return '#/settings';
    case 'dm': {
      const conv = (view as { conversationId?: string }).conversationId;
      return conv ? `#/dm?conv=${encodeURIComponent(conv)}` : '#/dm';
    }
    case 'dmChat':
      return `#/dm?conv=${encodeURIComponent(view.conversationId)}`;
    case 'components':
      return '#/components';
    case 'diagnostic':
      return '#/diagnostic';
    case 'about':
      return '#/about';
    case 'atplay':
      return '#/atplay';
    case 'atplaySocialCircle':
      return '#/atplay/social-circle';
    case 'compose': {
      const params = new URLSearchParams();
      if (view.replyTo) params.set('replyTo', encodeURIComponent(view.replyTo));
      if (view.quoteUri) params.set('quoteUri', encodeURIComponent(view.quoteUri));
      const dId = (view as { draftId?: string }).draftId;
      if (dId) params.set('draftId', encodeURIComponent(dId));
      const qs = params.toString();
      return qs ? `#/compose?${qs}` : '#/compose';
    }
    case 'aiChat': {
      if (view.sessionId) {
        const post = (view as { contextPost?: string }).contextPost;
        const profile = (view as { contextProfile?: string }).contextProfile;
        let url = `#/ai?session=${encodeURIComponent(view.sessionId)}`;
        if (post) url += `&post=${encodeURIComponent(post)}`;
        if (profile) url += `&profile=${encodeURIComponent(profile)}`;
        return url;
      }
      const base = '#/ai';
      return view.contextUri ? `${base}?context=${encodeURIComponent(view.contextUri)}` : base;
    }
    default:
      return '#/feed';
  }
}
