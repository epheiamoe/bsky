import { BskyClient, createTools } from '@bsky/core';
import type { PostView, ToolDescriptor } from '@bsky/core';
import type { AppView } from '../state/navigation.js';

export interface TimelineStore {
  posts: PostView[];
  loading: boolean;
  cursor: string | undefined;
  error: string | null;

  load(client: BskyClient): Promise<void>;
  loadMore(client: BskyClient): Promise<void>;
  refresh(client: BskyClient): Promise<void>;

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

    async load(client) {
      store.loading = true;
      store._notify();
      try {
        const res = await client.getTimeline(20);
        store.posts = res.feed.map(f => f.post);
        store.cursor = res.cursor;
      } catch (e) {
        store.error = e instanceof Error ? e.message : String(e);
      } finally {
        store.loading = false;
        store._notify();
      }
    },

    async loadMore(client) {
      if (!store.cursor || store.loading) return;
      store.loading = true;
      store._notify();
      try {
        const res = await client.getTimeline(20, store.cursor);
        store.posts = [...store.posts, ...res.feed.map(f => f.post)];
        store.cursor = res.cursor;
      } catch (e) {
        store.error = e instanceof Error ? e.message : String(e);
      } finally {
        store.loading = false;
        store._notify();
      }
    },

    async refresh(client) {
      store.cursor = undefined;
      store.posts = [];
      await store.load(client);
    },

    _notify() { if (store.listener) store.listener(); },
    subscribe(fn) {
      store.listener = fn;
      return () => { store.listener = null; };
    },
  };
  return store;
}
