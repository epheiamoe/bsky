import { useState, useEffect, useCallback } from 'react';
import { BskyClient } from '@bsky/core';
import type { Notification } from '@bsky/core';

export function useNotifications(client: BskyClient | null) {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (retried = false) => {
    if (!client) return;
    setLoading(true);
    setError(null);
    try {
      const res = await client.listNotifications(30);
      setNotifications(res.notifications as Notification[]);
      setUnreadCount(res.notifications.filter(n => !(n as Notification).isRead).length);
    } catch (e) {
      if (!retried) {
        await new Promise(r => setTimeout(r, 1500));
        return load(true);
      }
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [client]);

  useEffect(() => { void load(); }, [load]);

  return { notifications, loading, unreadCount, error, refresh: load };
}
