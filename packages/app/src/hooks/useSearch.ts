import { useState, useEffect, useCallback } from 'react';
import { BskyClient } from '@bsky/core';
import type { PostView } from '@bsky/core';

export function useSearch(client: BskyClient | null) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<PostView[]>([]);
  const [loading, setLoading] = useState(false);

  const search = useCallback(async (q: string) => {
    if (!client || !q.trim()) return;
    setQuery(q);
    setLoading(true);
    try {
      const res = await client.searchPosts({ q, limit: 25, sort: 'latest' });
      setResults(res.posts);
    } catch (e) {
      console.error('Search error:', e);
    } finally {
      setLoading(false);
    }
  }, [client]);

  return { query, results, loading, search };
}
