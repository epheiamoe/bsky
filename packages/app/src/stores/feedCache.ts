import type { PostView } from '@bsky/core';

interface FeedCacheEntry {
  posts: PostView[];
  cursor?: string;
  scrollTop: number;
  totalLoaded: number;
}

// Module-level per-feed cache (survives component mount/unmount).
const _caches = new Map<string, FeedCacheEntry>();

const DEFAULT_LIMIT = 1000;
const TRIM_BATCH = 25; // When limit exceeded, remove this many oldest posts.

function getKey(feedUri?: string): string {
  return feedUri ?? 'following';
}

export function getFeedCache(feedUri?: string): Readonly<FeedCacheEntry> | undefined {
  return _caches.get(getKey(feedUri));
}

/** Overwrite the entire cache for a feed (used on initial load / refresh). */
export function setFeedCache(feedUri: string | undefined, posts: PostView[], cursor?: string): void {
  const key = getKey(feedUri);
  _caches.set(key, { posts: [...posts], cursor, scrollTop: 0, totalLoaded: posts.length });
}

/** Append posts to a feed cache with sliding-window trim. */
export function appendToFeedCache(
  feedUri: string | undefined,
  posts: PostView[],
  cursor: string | undefined,
  limit: number = DEFAULT_LIMIT,
): { posts: PostView[]; cursor?: string; trimmed: number } {
  const key = getKey(feedUri);
  const existing = _caches.get(key);

  if (!existing) {
    const entry: FeedCacheEntry = {
      posts: [...posts],
      cursor,
      scrollTop: 0,
      totalLoaded: posts.length,
    };
    _caches.set(key, entry);
    return { posts: entry.posts, cursor, trimmed: 0 };
  }

  const combined = [...existing.posts, ...posts];
  let trimmed = 0;

  // Strict limit enforcement: remove all excess posts.
  if (combined.length > limit) {
    trimmed = combined.length - limit;
    combined.splice(0, trimmed);
  }

  existing.posts = combined;
  existing.cursor = cursor;
  existing.totalLoaded += posts.length;

  return { posts: existing.posts, cursor: existing.cursor, trimmed };
}

export function saveFeedScrollTop(feedUri: string | undefined, scrollTop: number): void {
  const key = getKey(feedUri);
  const existing = _caches.get(key);
  if (existing) {
    existing.scrollTop = scrollTop;
  }
}

export function getFeedScrollTop(feedUri: string | undefined): number {
  return _caches.get(getKey(feedUri))?.scrollTop ?? 0;
}

export function clearFeedCache(feedUri?: string): void {
  if (feedUri) {
    _caches.delete(getKey(feedUri));
  } else {
    _caches.clear();
  }
}

/** Check whether a feed has reached its cache limit. */
export function isFeedCacheFull(feedUri: string | undefined, limit: number = DEFAULT_LIMIT): boolean {
  const entry = _caches.get(getKey(feedUri));
  return entry ? entry.posts.length >= limit : false;
}

export function getFeedCacheSize(feedUri?: string): number {
  return _caches.get(getKey(feedUri))?.posts.length ?? 0;
}
