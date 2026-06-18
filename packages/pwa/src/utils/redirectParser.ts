import { parseBskyAppUrl, bskyUrlToAppView, isBskyAppUrl } from '@bsky/app';
import type { AppView } from '@bsky/app';

export interface RedirectInfo {
  target: string;  // hash URL like #/profile?actor=xxx
  needsResolution: boolean;  // if handle needs DID resolution for posts/lists/feeds
  handle?: string;
  did?: string;
  rkey?: string;
  type: 'profile' | 'post' | 'search' | 'feed' | 'list' | 'unknown';
}

/**
 * Parse a redirect path like /i/bsky.app/profile/xxx into redirect info
 */
export function parseRedirectPath(pathname: string): RedirectInfo | null {
  if (!pathname.startsWith('/i/')) return null;

  const path = pathname.slice(3); // remove /i/
  const [domain, ...segments] = path.split('/').filter(Boolean);

  if (!domain) return null;

  // Currently only support bsky.app
  if (domain !== 'bsky.app') {
    // Future: support other clients like graysky.app, klearsky, etc.
    return null;
  }

  // Reconstruct the bsky.app URL
  const bskyUrl = `https://${domain}/${segments.join('/')}`;
  const info = parseBskyAppUrl(bskyUrl);
  if (!info) return null;

  const appView = bskyUrlToAppView(info);
  if (!appView) return null;

  // Determine if we need DID resolution
  // Posts/lists/feeds under a handle (not DID) need resolution
  let needsResolution = false;
  if (info.type === 'post' && info.handleOrDid && !info.handleOrDid.startsWith('did:')) {
    needsResolution = true;
  } else if (info.type === 'list' && info.handleOrDid && !info.handleOrDid.startsWith('did:')) {
    needsResolution = true;
  } else if (info.type === 'feed' && info.handleOrDid && !info.handleOrDid.startsWith('did:') && !info.feedUri) {
    needsResolution = true;
  }

  return {
    target: appViewToHash(appView),
    needsResolution,
    handle: info.handleOrDid && !info.handleOrDid.startsWith('did:') ? info.handleOrDid : undefined,
    did: info.handleOrDid?.startsWith('did:') ? info.handleOrDid : undefined,
    rkey: info.rkey || info.listRkey || info.feedRkey,
    type: info.type,
  };
}

/**
 * Convert AppView to hash URL string
 */
function appViewToHash(view: AppView): string {
  switch (view.type) {
    case 'profile': {
      const tab = (view as { profileTab?: string }).profileTab;
      let url = `#/profile?actor=${encodeURIComponent(view.actor)}`;
      if (tab) url += `&tab=${encodeURIComponent(tab)}`;
      return url;
    }
    case 'thread':
      return `#/thread?uri=${encodeURIComponent(view.uri)}`;
    case 'search': {
      const q = (view as { query?: string }).query;
      const tab = (view as { searchTab?: string }).searchTab;
      let url = '#/search';
      const params: string[] = [];
      if (q) params.push(`q=${encodeURIComponent(q)}`);
      if (tab) params.push(`tab=${encodeURIComponent(tab)}`);
      if (params.length) url += '?' + params.join('&');
      return url;
    }
    case 'feed': {
      const feedUri = (view as { feedUri?: string }).feedUri;
      return feedUri ? `#/feed?feed=${encodeURIComponent(feedUri)}` : '#/feed';
    }
    case 'listDetail': {
      const uri = (view as { uri: string }).uri;
      return `#/list?uri=${encodeURIComponent(uri)}`;
    }
    default:
      return '#/';
  }
}

/**
 * Build an AT URI from handle + rkey (requires DID resolution first)
 */
export function buildPostAtUri(did: string, rkey: string): string {
  return `at://${did}/app.bsky.feed.post/${rkey}`;
}

/**
 * Build a feed AT URI from DID + rkey
 */
export function buildFeedAtUri(did: string, rkey: string): string {
  return `at://${did}/app.bsky.feed.generator/${rkey}`;
}

/**
 * Build a list AT URI from DID + rkey
 */
export function buildListAtUri(did: string, rkey: string): string {
  return `at://${did}/app.bsky.graph.list/${rkey}`;
}

export { isBskyAppUrl, parseBskyAppUrl, bskyUrlToAppView };
