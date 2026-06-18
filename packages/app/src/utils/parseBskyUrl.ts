import type { AppView } from '../state/navigation.js';

export interface BskyUrlInfo {
  type: 'profile' | 'post' | 'search' | 'feed' | 'list' | 'unknown';
  /** Handle or DID from the URL */
  handleOrDid?: string;
  /** Post rkey (for post type) */
  rkey?: string;
  /** Feed rkey (for feed type when under profile) */
  feedRkey?: string;
  /** List rkey (for list type) */
  listRkey?: string;
  /** Search query */
  query?: string;
  /** Full AT URI for feed (when using /feed/{did}/{rkey} format) */
  feedUri?: string;
  /** The raw URL that was parsed */
  rawUrl: string;
  /** The path segments */
  path: string;
}

/**
 * Check if a URL is a bsky.app link
 */
export function isBskyAppUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.hostname === 'bsky.app' || parsed.hostname === 'www.bsky.app';
  } catch {
    return false;
  }
}

/**
 * Parse a bsky.app URL into structured info
 * Supports:
 * - /profile/{handle}
 * - /profile/{handle}/post/{rkey}
 * - /profile/{handle}/lists/{rkey}
 * - /profile/{handle}/feed/{rkey}
 * - /search?q={query}
 * - /feed/{did}/{rkey}
 */
export function parseBskyAppUrl(url: string): BskyUrlInfo | null {
  if (!isBskyAppUrl(url)) return null;

  try {
    const parsed = new URL(url);
    const path = parsed.pathname;
    const segments = path.split('/').filter(Boolean);

    // /profile/{handleOrDid}
    if (segments[0] === 'profile' && segments.length >= 2) {
      const handleOrDid = decodeURIComponent(segments[1]!);

      // /profile/{handleOrDid}/post/{rkey}
      if (segments[2] === 'post' && segments.length >= 4) {
        return {
          type: 'post',
          handleOrDid,
          rkey: decodeURIComponent(segments[3]!),
          rawUrl: url,
          path,
        };
      }

      // /profile/{handleOrDid}/lists/{rkey}
      if (segments[2] === 'lists' && segments.length >= 4) {
        return {
          type: 'list',
          handleOrDid,
          listRkey: decodeURIComponent(segments[3]!),
          rawUrl: url,
          path,
        };
      }

      // /profile/{handleOrDid}/feed/{rkey}
      if (segments[2] === 'feed' && segments.length >= 4) {
        return {
          type: 'feed',
          handleOrDid,
          feedRkey: decodeURIComponent(segments[3]!),
          rawUrl: url,
          path,
        };
      }

      // /profile/{handleOrDid} (profile page)
      return {
        type: 'profile',
        handleOrDid,
        rawUrl: url,
        path,
      };
    }

    // /search?q={query}
    if (segments[0] === 'search') {
      return {
        type: 'search',
        query: parsed.searchParams.get('q') || undefined,
        rawUrl: url,
        path,
      };
    }

    // /feed/{did}/{rkey}
    if (segments[0] === 'feed' && segments.length >= 3) {
      const did = decodeURIComponent(segments[1]!);
      const rkey = decodeURIComponent(segments[2]!);
      return {
        type: 'feed',
        handleOrDid: did,
        feedRkey: rkey,
        feedUri: `at://${did}/app.bsky.feed.generator/${rkey}`,
        rawUrl: url,
        path,
      };
    }

    return {
      type: 'unknown',
      rawUrl: url,
      path,
    };
  } catch {
    return null;
  }
}

/**
 * Convert parsed bsky.app URL info to an internal AppView
 * Note: For posts, this returns a profile view if handle is used (not DID).
 * The caller should resolve handle to DID if needed for post/thread views.
 */
export function bskyUrlToAppView(info: BskyUrlInfo): AppView | null {
  switch (info.type) {
    case 'profile': {
      if (!info.handleOrDid) return null;
      return { type: 'profile', actor: info.handleOrDid, profileTab: 'posts' };
    }
    case 'post': {
      // If we have a DID, we can construct the AT URI directly
      if (info.handleOrDid?.startsWith('did:')) {
        const uri = `at://${info.handleOrDid}/app.bsky.feed.post/${info.rkey}`;
        return { type: 'thread', uri };
      }
      // If it's a handle, we need to resolve it first - return profile for now
      return { type: 'profile', actor: info.handleOrDid!, profileTab: 'posts' };
    }
    case 'list': {
      if (!info.handleOrDid || !info.listRkey) return null;
      // If DID, construct AT URI; if handle, pass handle (ListDetailPage can resolve)
      if (info.handleOrDid.startsWith('did:')) {
        const uri = `at://${info.handleOrDid}/app.bsky.graph.list/${info.listRkey}`;
        return { type: 'listDetail', uri };
      }
      // For handle, we construct an AT URI with handle - ListDetailPage should resolve
      const uri = `at://${info.handleOrDid}/app.bsky.graph.list/${info.listRkey}`;
      return { type: 'listDetail', uri };
    }
    case 'feed': {
      if (info.feedUri) {
        return { type: 'feed', feedUri: info.feedUri };
      }
      if (info.handleOrDid && info.feedRkey) {
        if (info.handleOrDid.startsWith('did:')) {
          const uri = `at://${info.handleOrDid}/app.bsky.feed.generator/${info.feedRkey}`;
          return { type: 'feed', feedUri: uri };
        }
        // For handle, return search or profile as fallback
        return { type: 'profile', actor: info.handleOrDid, profileTab: 'posts' };
      }
      return null;
    }
    case 'search': {
      if (!info.query) return { type: 'search' };
      return { type: 'search', query: info.query, searchTab: 'top' };
    }
    default:
      return null;
  }
}

/**
 * Get a human-readable label for a bsky.app URL type
 */
export function getBskyUrlTypeLabel(type: BskyUrlInfo['type'], t: (key: string) => string): string {
  switch (type) {
    case 'profile': return t('link.type.profile');
    case 'post': return t('link.type.post');
    case 'search': return t('link.type.search');
    case 'feed': return t('link.type.feed');
    case 'list': return t('link.type.list');
    default: return t('link.type.unknown');
  }
}
