import { useState, useCallback } from 'react';
import type { BskyClient } from '@bsky/core';
import type { PostView, ProfileViewBasic, FeedGeneratorView } from '@bsky/core';
import { readCache, writeCache } from '../stores/cache';

export type SearchTab = 'top' | 'latest' | 'users' | 'feeds';

export interface SearchState {
  query: string;
  tab: SearchTab;
  posts: PostView[];
  users: ProfileViewBasic[];
  feeds: FeedGeneratorView[];
  loading: boolean;
  search: (q: string, tab: SearchTab) => Promise<void>;
  setTab: (t: SearchTab) => void;
}

function searchCacheKey(q: string, t: SearchTab): string {
  return `search-${q}-${t}`;
}

interface SearchCache {
  posts: PostView[];
  users: ProfileViewBasic[];
  feeds: FeedGeneratorView[];
}

export function useSearch(client: BskyClient | null, initialTab?: SearchTab, initialQuery?: string): SearchState {
  const ck = initialQuery ? searchCacheKey(initialQuery, initialTab ?? 'top') : '';
  const cached = ck ? readCache<SearchCache>(ck) : undefined;
  const [query, setQuery] = useState(initialQuery ?? '');
  const [tab, setTab] = useState<SearchTab>(initialTab ?? 'top');
  const [posts, setPosts] = useState<PostView[]>(cached?.posts ?? []);
  const [users, setUsers] = useState<ProfileViewBasic[]>(cached?.users ?? []);
  const [feeds, setFeeds] = useState<FeedGeneratorView[]>(cached?.feeds ?? []);
  const [loading, setLoading] = useState(false);

  const search = useCallback(async (q: string, t: SearchTab, silent = false) => {
    if (!client || !q.trim()) return;
    if (!silent) setLoading(true);
    setQuery(q);
    setTab(t);
    try {
      if (t === 'top' || t === 'latest') {
        const res = await client.searchPosts({ q, limit: 25, sort: t === 'latest' ? 'latest' : undefined });
        writeCache(searchCacheKey(q, t), { posts: res.posts, users: [], feeds: [] });
        setPosts(res.posts);
      } else if (t === 'users') {
        const res = await client.searchActors({ q, limit: 25 });
        writeCache(searchCacheKey(q, t), { posts: [], users: res.actors, feeds: [] });
        setUsers(res.actors);
      } else if (t === 'feeds') {
        const res = await client.getPopularFeedGenerators(25);
        const qLower = q.toLowerCase();
        const matches = res.feeds.filter(f =>
          f.displayName.toLowerCase().includes(qLower) ||
          f.description?.toLowerCase().includes(qLower) ||
          f.creator?.handle?.toLowerCase().includes(qLower)
        ).slice(0, 25);
        writeCache(searchCacheKey(q, t), { posts: [], users: [], feeds: matches });
        setFeeds(matches);
      }
    } catch (e) {
      console.error('Search error:', e);
    } finally {
      if (!silent) setLoading(false);
    }
  }, [client]);

  return { query, tab, posts, users, feeds, loading, search, setTab };
}
