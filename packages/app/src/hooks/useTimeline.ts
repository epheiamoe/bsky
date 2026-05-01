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

  // Reload when feed changes
  useEffect(() => {
    if (feedUri !== lastFeed.current) {
      lastFeed.current = feedUri;
      store.posts = [];
      store.cursor = undefined;
      store.error = null;
      loaded.current = false;
      store._notify();
    }
  }, [feedUri, store]);

  useEffect(() => {
    if (client && !loaded.current) {
      loaded.current = true;
      store.load(client, feedUri);
    }
  }, [client, store, feedUri]);

  useEffect(() => store.subscribe(tick), [store, tick]);

  return {
    posts: store.posts,
    loading: store.loading,
    cursor: store.cursor,
    error: store.error,
    loadMore: client ? () => store.loadMore(client, feedUri) : undefined,
    refresh: client ? () => store.refresh(client, feedUri) : undefined,
  };
}
