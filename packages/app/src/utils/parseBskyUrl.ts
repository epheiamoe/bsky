import type { AppView } from '../state/navigation.js';

export interface BskyUrlInfo {
  type: 'profile' | 'post' | 'search' | 'feed' | 'list' | 'hashtag' | 'intent' | 'messages' | 'notifications' | 'unknown';
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
  /** Hashtag tag (for hashtag type) */
  tag?: string;
  /** Compose text (for intent type) */
  text?: string;
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
 * Normalize raw user input into a standard bsky.app URL or AT URI.
 * Handles bare domains, /i/ redirects, bluesky:// scheme, http→https, etc.
 * Returns null if the input cannot be normalized to a bsky resource.
 */
export function normalizeBskyInput(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  // AT URI — return as-is
  if (trimmed.startsWith('at://')) return trimmed;

  // /i/ redirect prefix (Twitter-style redirects that wrap bsky URLs)
  if (trimmed.startsWith('/i/')) {
    const rest = trimmed.slice(3);
    if (!rest) return null;

    // /i/https://bsky.app/xxx → strip /i/, force https
    if (rest.startsWith('https://') || rest.startsWith('http://')) {
      const stripped = rest.startsWith('http://') ? 'https://' + rest.slice(7) : rest;
      return stripped;
    }

    // /i/bsky/xxx → https://bsky.app/xxx
    if (rest.startsWith('bsky/')) return 'https://bsky.app/' + rest.slice(5);

    // /i/bsky.app/xxx → https://bsky.app/xxx
    if (rest.startsWith('bsky.app/') || rest.startsWith('www.bsky.app/'))
      return 'https://' + rest;

    // Non-bsky domain inside /i/ — not a bsky resource
    return null;
  }

  // bluesky:// custom scheme
  if (trimmed.startsWith('bluesky://')) {
    const rest = trimmed.slice('bluesky://'.length);
    return 'https://bsky.app/' + rest;
  }

  // Bare domain (no protocol)
  if (trimmed.startsWith('bsky.app/') || trimmed.startsWith('www.bsky.app/'))
    return 'https://' + trimmed;

  // Case-insensitive bare domain (e.g. BSKY.APP/...)
  const lower = trimmed.toLowerCase();
  if (lower.startsWith('bsky.app/') || lower.startsWith('www.bsky.app/'))
    return 'https://' + lower;

  // Full URL with protocol
  if (trimmed.startsWith('https://') || trimmed.startsWith('http://')) {
    try {
      const parsed = new URL(trimmed.startsWith('http://') ? 'https://' + trimmed.slice(7) : trimmed);
      if (parsed.hostname === 'bsky.app' || parsed.hostname === 'www.bsky.app')
        return parsed.toString();
    } catch {
      // Invalid URL
    }
    return null;
  }

  return null;
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
 * - /hashtag/{tag}
 * - /intent/compose?text={text}
 * - /messages
 * - /notifications
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

    // /hashtag/{tag}
    if (segments[0] === 'hashtag' && segments.length >= 2) {
      return {
        type: 'hashtag',
        tag: decodeURIComponent(segments[1]!),
        rawUrl: url,
        path,
      };
    }

    // /intent/compose?text={text}
    if (segments[0] === 'intent' && segments[1] === 'compose') {
      return {
        type: 'intent',
        text: parsed.searchParams.get('text') || undefined,
        rawUrl: url,
        path,
      };
    }

    // /messages
    if (segments[0] === 'messages') {
      return {
        type: 'messages',
        rawUrl: url,
        path,
      };
    }

    // /notifications
    if (segments[0] === 'notifications') {
      return {
        type: 'notifications',
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
    case 'hashtag': {
      if (!info.tag) return { type: 'search' };
      return { type: 'search', query: '#' + info.tag, searchTab: 'top' };
    }
    case 'intent': {
      return { type: 'compose', initialText: info.text };
    }
    case 'messages': {
      return { type: 'dm' };
    }
    case 'notifications': {
      return { type: 'notifications' };
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
    case 'hashtag': return t('link.type.hashtag');
    case 'intent': return t('link.type.intent');
    case 'messages': return t('link.type.messages');
    case 'notifications': return t('link.type.notifications');
    default: return t('link.type.unknown');
  }
}
