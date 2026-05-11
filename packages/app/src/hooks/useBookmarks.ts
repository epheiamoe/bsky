import { useState, useEffect, useCallback } from 'react';
import { BskyClient } from '@bsky/core';
import type { PostView, GetBookmarksResponse } from '@bsky/core';
import { readCache, writeCache, hasCache } from '../stores/cache';

const CACHE_KEY = 'bookmarks';

interface BookmarkCache {
  bookmarks: PostView[];
  bookmarkedUris: string[];
  cursor?: string;
}

export function useBookmarks(client: BskyClient | null) {
  const cached = readCache<BookmarkCache>(CACHE_KEY);
  const [bookmarks, setBookmarks] = useState<PostView[]>(cached?.bookmarks ?? []);
  const [loading, setLoading] = useState(!hasCache(CACHE_KEY));
  const [cursor, setCursor] = useState<string | undefined>(cached?.cursor);
  const [bookmarkedUris, setBookmarkedUris] = useState<Set<string>>(new Set(cached?.bookmarkedUris ?? []));
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (retried = false, silent = false) => {
    if (!client) return;
    if (!silent) setLoading(true);
    setError(null);
    try {
      const res = await client.getBookmarks(50);
      const newBookmarks = res.bookmarks.map(b => b.item);
      const newUris = res.bookmarks.map(b => b.subject.uri);
      writeCache(CACHE_KEY, { bookmarks: newBookmarks, bookmarkedUris: newUris, cursor: res.cursor });
      setBookmarks(newBookmarks);
      setCursor(res.cursor);
      setBookmarkedUris(new Set(newUris));
    } catch (e) {
      if (!retried) {
        await new Promise(r => setTimeout(r, 1500));
        return load(true, silent);
      }
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      if (!silent) setLoading(false);
    }
  }, [client]);

  useEffect(() => { void load(false, hasCache(CACHE_KEY)); }, [load]);

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

  return { bookmarks, loading, error, isBookmarked, addBookmark, removeBookmark, toggleBookmark, refresh: load };
}
