import { useState, useEffect, useCallback } from 'react';
import { BskyClient } from '@bsky/core';
import type { Notification } from '@bsky/core';
import { readCache, writeCache, hasCache } from '../stores/cache';

const CACHE_KEY = 'notifications';

interface NotifCache {
  notifications: Notification[];
  unreadCount: number;
}

export function useNotifications(client: BskyClient | null) {
  const cached = readCache<NotifCache>(CACHE_KEY);
  const [notifications, setNotifications] = useState<Notification[]>(cached?.notifications ?? []);
  const [loading, setLoading] = useState(!hasCache(CACHE_KEY));
  const [unreadCount, setUnreadCount] = useState(cached?.unreadCount ?? 0);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (retried = false, silent = false) => {
    if (!client) return;
    if (!silent) setLoading(true);
    setError(null);
    try {
      const res = await client.listNotifications(30);
      const notifs = res.notifications as Notification[];
      const unread = notifs.filter(n => !n.isRead).length;
      writeCache(CACHE_KEY, { notifications: notifs, unreadCount: unread });
      setNotifications(notifs);
      setUnreadCount(unread);
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

  return { notifications, loading, unreadCount, error, refresh: load };
}
