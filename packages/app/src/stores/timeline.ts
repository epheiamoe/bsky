import type { BskyClient } from '@bsky/core';
import type { PostView } from '@bsky/core';
import {
  getFeedCache,
  setFeedCache,
  appendToFeedCache,
  saveFeedScrollTop,
} from './feedCache.js';

export interface TimelineStore {
  posts: PostView[];
  loading: boolean;
  cursor: string | undefined;
  error: string | null;
  /** URI of the feed currently being loaded; used to discard stale responses. */
  _activeLoadUri?: string;

  load(client: BskyClient, feedUri?: string, cacheLimit?: number): Promise<void>;
  loadMore(client: BskyClient, feedUri?: string, cacheLimit?: number): Promise<void>;
  refresh(client: BskyClient, feedUri?: string, cacheLimit?: number): Promise<void>;

  _notify(): void;
  subscribe(fn: () => void): () => void;
  listener: (() => void) | null;
}

function shouldUseTimeline(feedUri?: string): boolean {
  if (!feedUri) return true;
  // Following is the home timeline (not a separate feed generator)
  if (feedUri === 'at://did:plc:z72i7hdynmk6r22z27h6tvur/app.bsky.feed.generator/following') return true;
  return false;
}

function isListUri(uri: string): boolean {
  return uri.includes('app.bsky.graph.list');
}

export function createTimelineStore(): TimelineStore {
  const store: TimelineStore = {
    posts: [],
    loading: false,
    cursor: undefined,
    error: null,
    listener: null,

    async load(client, feedUri, cacheLimit = 1000) {
      const targetUri = feedUri;
      store._activeLoadUri = targetUri;

      // 1. Try to restore from cache instantly (no loading flash).
      const cached = getFeedCache(feedUri);
      if (cached && cached.posts.length > 0) {
        store.posts = cached.posts;
        store.cursor = cached.cursor;
        store.error = null;
        store.loading = false;
        store._notify();
        return;
      }

      // 2. No cache — load from API.
      store.loading = true;
      store._notify();

      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          let res: { feed: Array<{ post: PostView }>; cursor?: string };
          if (shouldUseTimeline(feedUri)) {
            res = await client.getTimeline(20);
          } else if (feedUri && isListUri(feedUri)) {
            res = await client.getListFeed(feedUri, 20);
          } else {
            res = await client.getFeed(feedUri!, 20);
          }

          if (store._activeLoadUri !== targetUri) return;

          setFeedCache(feedUri, res.feed.map(f => f.post), res.cursor);
          const updated = getFeedCache(feedUri)!;
          store.posts = updated.posts;
          store.cursor = updated.cursor;
          store.error = null;
          store.loading = false;
          store._notify();
          return;
        } catch (e) {
          if (attempt === 0) {
            await new Promise(r => setTimeout(r, 1500));
            continue;
          }
          store.error = e instanceof Error ? e.message : String(e);
        }
      }

      if (store._activeLoadUri === targetUri) {
        store.loading = false;
        store._notify();
      }
    },

    async loadMore(client, feedUri, cacheLimit = 1000) {
      if (!store.cursor || store.loading) return;

      const targetUri = feedUri;
      store._activeLoadUri = targetUri;
      store.loading = true;
      store._notify();

      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          let res: { feed: Array<{ post: PostView }>; cursor?: string };
          if (shouldUseTimeline(feedUri)) {
            res = await client.getTimeline(20, store.cursor);
          } else if (feedUri && isListUri(feedUri)) {
            res = await client.getListFeed(feedUri, 20, store.cursor);
          } else {
            res = await client.getFeed(feedUri!, 20, store.cursor);
          }

          if (store._activeLoadUri !== targetUri) return;

          const { posts, cursor } = appendToFeedCache(feedUri, res.feed.map(f => f.post), res.cursor, cacheLimit);
          store.posts = posts;
          store.cursor = cursor;
          store.error = null;
          store.loading = false;
          store._notify();
          return;
        } catch (e) {
          if (attempt === 0) {
            await new Promise(r => setTimeout(r, 1500));
            continue;
          }
          store.error = e instanceof Error ? e.message : String(e);
        }
      }

      if (store._activeLoadUri === targetUri) {
        store.loading = false;
        store._notify();
      }
    },

    async refresh(client, feedUri, cacheLimit = 1000) {
      store.cursor = undefined;
      store.posts = [];
      await store.load(client, feedUri, cacheLimit);
    },

    _notify() { if (store.listener) store.listener(); },
    subscribe(fn) {
      store.listener = fn;
      return () => { store.listener = null; };
    },
  };
  return store;
}
