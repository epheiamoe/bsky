import { useState, useEffect, useCallback } from 'react';
import { BskyClient } from '@bsky/core';
import type { ListView } from '@bsky/core';
import { readCache, writeCache, hasCache } from '../stores/cache';

const CACHE_KEY = 'subscribed-lists';

interface SubscribedListsCache {
  lists: ListView[];
  timestamp: number;
}

export function useSubscribedLists(client: BskyClient | null) {
  const cached = readCache<SubscribedListsCache>(CACHE_KEY);
  const [lists, setLists] = useState<ListView[]>(cached?.lists ?? []);
  const [loading, setLoading] = useState(!hasCache(CACHE_KEY));
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (retried = false, silent = false) => {
    if (!client) return;
    if (!silent) setLoading(true);
    setError(null);
    try {
      const res = await client.getSubscribedLists(50);
      writeCache(CACHE_KEY, { lists: res, timestamp: Date.now() });
      setLists(res);
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

  const subscribe = useCallback(async (listUri: string) => {
    if (!client) return false;
    try {
      await client.subscribeToList(listUri);
      await load(false, true);
      return true;
    } catch (e) {
      console.error('Subscribe to list error:', e);
      return false;
    }
  }, [client, load]);

  const unsubscribe = useCallback(async (listUri: string) => {
    if (!client) return false;
    try {
      await client.unsubscribeFromList(listUri);
      setLists(prev => prev.filter(l => l.uri !== listUri));
      const current = readCache<SubscribedListsCache>(CACHE_KEY);
      if (current) {
        writeCache(CACHE_KEY, { ...current, lists: current.lists.filter(l => l.uri !== listUri) });
      }
      return true;
    } catch (e) {
      console.error('Unsubscribe from list error:', e);
      return false;
    }
  }, [client]);

  const isSubscribed = useCallback((listUri: string) => {
    return lists.some(l => l.uri === listUri);
  }, [lists]);

  return { lists, loading, error, subscribe, unsubscribe, isSubscribed, refresh: load };
}
