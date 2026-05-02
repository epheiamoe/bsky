import { useState, useCallback } from 'react';
import type { BskyClient } from '@bsky/core';
import type { PostView, ProfileViewBasic, FeedGeneratorView } from '@bsky/core';

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

export function useSearch(client: BskyClient | null, initialTab?: SearchTab): SearchState {
  const [query, setQuery] = useState('');
  const [tab, setTab] = useState<SearchTab>(initialTab ?? 'top');
  const [posts, setPosts] = useState<PostView[]>([]);
  const [users, setUsers] = useState<ProfileViewBasic[]>([]);
  const [feeds, setFeeds] = useState<FeedGeneratorView[]>([]);
  const [loading, setLoading] = useState(false);

  const search = useCallback(async (q: string, t: SearchTab) => {
    if (!client || !q.trim()) return;
    setQuery(q);
    setTab(t);
    setLoading(true);
    try {
      if (t === 'top' || t === 'latest') {
        const res = await client.searchPosts({ q, limit: 25, sort: t === 'latest' ? 'latest' : undefined });
        setPosts(res.posts);
      } else if (t === 'users') {
        const res = await client.searchActors({ q, limit: 25 });
        setUsers(res.actors);
      } else if (t === 'feeds') {
        const res = await client.getPopularFeedGenerators(25);
        // Client-side filter for feed name matching query
        const qLower = q.toLowerCase();
        const matches = res.feeds.filter(f =>
          f.displayName.toLowerCase().includes(qLower) ||
          f.description?.toLowerCase().includes(qLower) ||
          f.creator?.handle?.toLowerCase().includes(qLower)
        ).slice(0, 25);
        setFeeds(matches);
      }
    } catch (e) {
      console.error('Search error:', e);
    } finally {
      setLoading(false);
    }
  }, [client]);

  return { query, tab, posts, users, feeds, loading, search, setTab };
}
