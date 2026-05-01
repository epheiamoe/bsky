import type { BskyClient } from '@bsky/core';
import type { PostView } from '@bsky/core';

export interface TimelineStore {
  posts: PostView[];
  loading: boolean;
  cursor: string | undefined;
  error: string | null;

  load(client: BskyClient, feedUri?: string): Promise<void>;
  loadMore(client: BskyClient, feedUri?: string): Promise<void>;
  refresh(client: BskyClient, feedUri?: string): Promise<void>;

  _notify(): void;
  subscribe(fn: () => void): () => void;
  listener: (() => void) | null;
}

export function createTimelineStore(): TimelineStore {
  const store: TimelineStore = {
    posts: [],
    loading: false,
    cursor: undefined,
    error: null,
    listener: null,

    async load(client, feedUri) {
      store.loading = true;
      store._notify();
      try {
        const res = feedUri ? await client.getFeed(feedUri, 20) : await client.getTimeline(20);
        store.posts = res.feed.map(f => f.post);
        store.cursor = res.cursor;
        store.error = null;
      } catch (e) {
        store.error = e instanceof Error ? e.message : String(e);
      } finally {
        store.loading = false;
        store._notify();
      }
    },

    async loadMore(client, feedUri) {
      if (!store.cursor || store.loading) return;
      store.loading = true;
      store._notify();
      try {
        const res = feedUri ? await client.getFeed(feedUri, 20, store.cursor) : await client.getTimeline(20, store.cursor);
        store.posts = [...store.posts, ...res.feed.map(f => f.post)];
        store.cursor = res.cursor;
        store.error = null;
      } catch (e) {
        store.error = e instanceof Error ? e.message : String(e);
      } finally {
        store.loading = false;
        store._notify();
      }
    },

    async refresh(client, feedUri) {
      store.cursor = undefined;
      store.posts = [];
      await store.load(client, feedUri);
    },

    _notify() { if (store.listener) store.listener(); },
    subscribe(fn) {
      store.listener = fn;
      return () => { store.listener = null; };
    },
  };
  return store;
}
