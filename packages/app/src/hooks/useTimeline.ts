import { useState, useEffect, useCallback, useRef } from 'react';
import { createTimelineStore } from '../stores/timeline.js';
import type { TimelineStore } from '../stores/timeline.js';
import type { BskyClient } from '@bsky/core';

export function useTimeline(client: BskyClient | null) {
  const [store] = useState(() => createTimelineStore());
  const [, force] = useState(0);
  const tick = useCallback(() => force(n => n + 1), []);
  const loaded = useRef(false);

  useEffect(() => {
    if (client && !loaded.current) {
      loaded.current = true;
      store.load(client);
    }
  }, [client, store]);

  useEffect(() => store.subscribe(tick), [store, tick]);

  return {
    posts: store.posts,
    loading: store.loading,
    cursor: store.cursor,
    error: store.error,
    loadMore: client ? () => store.loadMore(client) : undefined,
    refresh: client ? () => store.refresh(client) : undefined,
  };
}
