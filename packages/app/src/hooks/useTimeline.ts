import { useState, useEffect, useCallback, useRef } from 'react';
import { createTimelineStore } from '../stores/timeline.js';
import type { TimelineStore } from '../stores/timeline.js';
import type { BskyClient } from '@bsky/core';

export function useTimeline(client: BskyClient | null, feedUri?: string) {
  const [store] = useState(() => createTimelineStore());
  const [, force] = useState(0);
  const tick = useCallback(() => force(n => n + 1), []);
  const loaded = useRef(false);
  const lastFeed = useRef<string | undefined>(feedUri);
  // Keep last known good feedUri so navigations away/back don't trigger resets
  const lastGoodFeed = useRef<string | undefined>(undefined);

  const effFeedUri = feedUri ?? lastGoodFeed.current;
  if (feedUri !== undefined) lastGoodFeed.current = feedUri;

  // Reload when feed changes (only when consumer passes a new non-undefined URI)
  useEffect(() => {
    if (effFeedUri !== lastFeed.current) {
      lastFeed.current = effFeedUri;
      store.posts = [];
      store.cursor = undefined;
      store.error = null;
      loaded.current = false;
      store._notify();
    }
  }, [effFeedUri, store]);

  useEffect(() => {
    if (client && !loaded.current) {
      loaded.current = true;
      store.load(client, effFeedUri);
    }
  }, [client, store, effFeedUri]);

  useEffect(() => store.subscribe(tick), [store, tick]);

  return {
    posts: store.posts,
    loading: store.loading,
    cursor: store.cursor,
    error: store.error,
    loadMore: client ? () => store.loadMore(client, effFeedUri) : undefined,
    refresh: client ? () => store.refresh(client, effFeedUri) : undefined,
  };
}
