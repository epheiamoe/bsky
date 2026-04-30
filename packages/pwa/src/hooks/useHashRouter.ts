import { useState, useEffect, useCallback } from 'react';
import type { AppView } from '@bsky/app';

/**
 * Hash-based navigation for PWA static hosting.
 * Uses history.pushState + popstate for reliable back/forward.
 *
 * Hash formats:
 *   #/feed
 *   #/thread?uri=at://...
 *   #/profile?actor=did:plc:...
 *   #/notifications
 *   #/search / #/search?q=...
 *   #/bookmarks
 *   #/compose / #/compose?replyTo=at://...
 *   #/ai / #/ai?context=at://...
 */
export function useHashRouter() {
  const [currentView, setCurrentView] = useState<AppView>(() => parseHash());
  const [canGoBack, setCanGoBack] = useState(() => {
    return window.history.length > 1 && window.location.hash !== '#/feed' && !!window.location.hash;
  });

  useEffect(() => {
    // Set initial history state
    if (!window.location.hash || window.location.hash === '#/' || window.location.hash === '#/feed') {
      window.history.replaceState(null, '', '#/feed');
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

  const goTo = useCallback((view: AppView) => {
    const hash = encodeView(view);
    window.history.pushState(null, '', hash);
    setCurrentView(view);
    setCanGoBack(true);
  }, []);

  const goBack = useCallback(() => {
    if (window.location.hash && window.location.hash !== '#/feed') {
      window.history.back();
    }
  }, []);

  const goHome = useCallback(() => {
    window.history.pushState(null, '', '#/feed');
    setCurrentView({ type: 'feed' });
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
    case '/': case '/feed': case '':
      return { type: 'feed' };
    case '/thread': {
      const uri = params.get('uri');
      return uri ? { type: 'thread', uri: decodeURIComponent(uri) } : { type: 'feed' };
    }
    case '/profile': {
      const actor = params.get('actor');
      return actor ? { type: 'profile', actor: decodeURIComponent(actor) } : { type: 'feed' };
    }
    case '/notifications':
      return { type: 'notifications' };
    case '/search': {
      const q = params.get('q');
      return q ? { type: 'search', query: decodeURIComponent(q) } : { type: 'search' };
    }
    case '/bookmarks':
      return { type: 'bookmarks' };
    case '/compose': {
      const replyTo = params.get('replyTo');
      const quoteUri = params.get('quoteUri');
      const view: AppView = { type: 'compose' };
      if (replyTo) (view as { replyTo?: string }).replyTo = decodeURIComponent(replyTo);
      if (quoteUri) (view as { quoteUri?: string }).quoteUri = decodeURIComponent(quoteUri);
      return view;
    }
    case '/ai': {
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
      return '#/feed';
    case 'thread':
      return `#/thread?uri=${encodeURIComponent(view.uri)}`;
    case 'profile':
      return `#/profile?actor=${encodeURIComponent(view.actor)}`;
    case 'notifications':
      return '#/notifications';
    case 'search': {
      const base = '#/search';
      return view.query ? `${base}?q=${encodeURIComponent(view.query)}` : base;
    }
    case 'bookmarks':
      return '#/bookmarks';
    case 'compose': {
      const params = new URLSearchParams();
      if (view.replyTo) params.set('replyTo', encodeURIComponent(view.replyTo));
      if (view.quoteUri) params.set('quoteUri', encodeURIComponent(view.quoteUri));
      const qs = params.toString();
      return qs ? `#/compose?${qs}` : '#/compose';
    }
    case 'aiChat': {
      const base = '#/ai';
      return view.contextUri ? `${base}?context=${encodeURIComponent(view.contextUri)}` : base;
    }
    default:
      return '#/feed';
  }
}
