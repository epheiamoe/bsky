import { parseBskyAppUrl, bskyUrlToAppView, isBskyAppUrl, normalizeBskyInput } from '@bsky/app';
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
 * Parse a redirect path like /i/bsky.app/profile/xxx into redirect info.
 * Delegates to normalizeBskyInput() for all format handling (bare domains,
 * /i/ redirects, bluesky:// scheme, AT URIs, etc.).
 */
export function parseRedirectPath(pathname: string): RedirectInfo | null {
  if (!pathname.startsWith('/i/')) return null;

  const pathAfterI = pathname.slice(3); // remove /i/
  if (!pathAfterI) return null;

  // Delegate to normalizeBskyInput for all format handling
  const normalized = normalizeBskyInput(pathAfterI);
  if (!normalized) return null;

  // Handle AT URIs directly
  if (normalized.startsWith('at://')) {
    return parseAtUriToRedirectInfo(normalized);
  }

  // Parse as bsky.app URL
  const info = parseBskyAppUrl(normalized);
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
    type: info.type as RedirectInfo['type'],
  };
}

/**
 * Parse an AT URI into RedirectInfo.
 * Supports at://{authority}/{collection}/{rkey} format.
 */
function parseAtUriToRedirectInfo(atUri: string): RedirectInfo | null {
  // at://{authority}/{collection}/{rkey}
  const match = atUri.match(/^at:\/\/([^/]+)\/([^/]+)\/([^/]+)$/);
  if (!match) return null;
  const [, authority, collection, rkey] = match;

  if (collection === 'app.bsky.feed.post') {
    return {
      target: `#/thread?uri=${encodeURIComponent(atUri)}`,
      needsResolution: false,
      did: authority?.startsWith('did:') ? authority : undefined,
      handle: authority?.startsWith('did:') ? undefined : authority,
      rkey,
      type: 'post',
    };
  }
  if (collection === 'app.bsky.feed.generator') {
    return {
      target: `#/feed?feed=${encodeURIComponent(atUri)}`,
      needsResolution: false,
      did: authority?.startsWith('did:') ? authority : undefined,
      rkey,
      type: 'feed',
    };
  }
  if (collection === 'app.bsky.graph.list') {
    return {
      target: `#/list?uri=${encodeURIComponent(atUri)}`,
      needsResolution: false,
      did: authority?.startsWith('did:') ? authority : undefined,
      rkey,
      type: 'list',
    };
  }
  return null;
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
    case 'compose': {
      const text = (view as { initialText?: string }).initialText;
      let url = '#/compose';
      if (text) url += `?text=${encodeURIComponent(text)}`;
      return url;
    }
    case 'dm':
      return '#/dm';
    case 'notifications':
      return '#/notifications';
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
