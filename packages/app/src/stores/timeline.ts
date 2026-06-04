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

    async load(client, feedUri) {
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
          store.posts = res.feed.map(f => f.post);
          store.cursor = res.cursor;
          store.error = null;
          store.loading = false;
          store._notify();
          return;
        } catch (e) {
          if (attempt === 0) {
            // First load may race with JWT refresh; retry once after auth settles
            await new Promise(r => setTimeout(r, 1500));
            continue;
          }
          store.error = e instanceof Error ? e.message : String(e);
        }
      }
      store.loading = false;
      store._notify();
    },

    async loadMore(client, feedUri) {
      if (!store.cursor || store.loading) return;
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
          store.posts = [...store.posts, ...res.feed.map(f => f.post)];
          store.cursor = res.cursor;
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
      store.loading = false;
      store._notify();
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
