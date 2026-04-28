import { useState, useEffect, useCallback } from 'react';
import { BskyClient } from '@bsky/core';
import type { PostView, GetBookmarksResponse } from '@bsky/core';

export function useBookmarks(client: BskyClient | null) {
  const [bookmarks, setBookmarks] = useState<PostView[]>([]);
  const [loading, setLoading] = useState(false);
  const [cursor, setCursor] = useState<string | undefined>();
  const [bookmarkedUris, setBookmarkedUris] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    if (!client) return;
    setLoading(true);
    try {
      const res = await client.getBookmarks(50);
      setBookmarks(res.bookmarks.map(b => b.item));
      setCursor(res.cursor);
      setBookmarkedUris(new Set(res.bookmarks.map(b => b.subject.uri)));
    } catch (e) {
      console.error('Bookmarks error:', e);
    } finally {
      setLoading(false);
    }
  }, [client]);

  useEffect(() => { void load(); }, [load]);

  const isBookmarked = useCallback((uri: string) => bookmarkedUris.has(uri), [bookmarkedUris]);

  const addBookmark = useCallback(async (uri: string, cid: string) => {
    if (!client || bookmarkedUris.has(uri)) return;
    try {
      await client.createBookmark(uri, cid);
      setBookmarkedUris(prev => { prev.add(uri); return new Set(prev); });
    } catch (e) { console.error('Bookmark add error:', e); }
  }, [client, bookmarkedUris]);

  const removeBookmark = useCallback(async (uri: string) => {
    if (!client || !bookmarkedUris.has(uri)) return;
    try {
      await client.deleteBookmark(uri);
      setBookmarkedUris(prev => { prev.delete(uri); return new Set(prev); });
      setBookmarks(prev => prev.filter(p => p.uri !== uri));
    } catch (e) { console.error('Bookmark remove error:', e); }
  }, [client, bookmarkedUris]);

  const toggleBookmark = useCallback(async (uri: string, cid: string) => {
    if (bookmarkedUris.has(uri)) await removeBookmark(uri);
    else await addBookmark(uri, cid);
  }, [bookmarkedUris, addBookmark, removeBookmark]);

  return { bookmarks, loading, isBookmarked, addBookmark, removeBookmark, toggleBookmark, refresh: load };
}
