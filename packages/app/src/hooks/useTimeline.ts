import { useState, useEffect, useCallback, useRef } from 'react';
import { createTimelineStore } from '../stores/timeline.js';
import type { TimelineStore } from '../stores/timeline.js';
import type { BskyClient } from '@bsky/core';
import { getFeedCache } from '../stores/feedCache.js';

export function useTimeline(client: BskyClient | null, feedUri?: string, cacheLimit = 1000) {
  const [store] = useState(() => createTimelineStore());
  const [, force] = useState(0);
  const tick = useCallback(() => force(n => n + 1), []);
  const loaded = useRef(false);
  const lastFeed = useRef<string | undefined>(feedUri);
  const lastGoodFeed = useRef<string | undefined>(undefined);

  const effFeedUri = feedUri ?? lastGoodFeed.current;
  if (feedUri !== undefined) lastGoodFeed.current = feedUri;
  if (lastFeed.current === undefined && effFeedUri !== undefined) {
    lastFeed.current = effFeedUri;
  }

  // Feed change: restore from cache if available, otherwise reset and load.
  useEffect(() => {
    if (effFeedUri !== lastFeed.current) {
      lastFeed.current = effFeedUri;
      store._activeLoadUri = effFeedUri;

      const cached = getFeedCache(effFeedUri);
      if (cached && cached.posts.length > 0) {
        // Instant restore from cache — no loading flash.
        store.posts = cached.posts;
        store.cursor = cached.cursor;
        store.error = null;
        store.loading = false;
        loaded.current = true;
        store._notify();
      } else {
        store.posts = [];
        store.cursor = undefined;
        store.error = null;
        loaded.current = false;
        store._notify();
      }
    }
  }, [effFeedUri, store]);

  // Trigger API load only when no cache is available.
  useEffect(() => {
    if (client && !loaded.current) {
      loaded.current = true;
      store.load(client, effFeedUri, cacheLimit);
    }
  }, [client, store, effFeedUri, cacheLimit]);

  useEffect(() => store.subscribe(tick), [store, tick]);

  const loadMore = useCallback(async () => {
    if (client) await store.loadMore(client, effFeedUri, cacheLimit);
  }, [client, store, effFeedUri, cacheLimit]);

  const refresh = useCallback(async () => {
    if (client) await store.refresh(client, effFeedUri, cacheLimit);
  }, [client, store, effFeedUri, cacheLimit]);

  return {
    posts: store.posts,
    loading: store.loading,
    cursor: store.cursor,
    error: store.error,
    loadMore,
    refresh,
  };
}
