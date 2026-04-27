import { useState, useEffect, useCallback } from 'react';
import { BskyClient } from '@bsky/core';
import type { Notification } from '@bsky/core';

export function useNotifications(client: BskyClient | null) {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);

  const load = useCallback(async () => {
    if (!client) return;
    setLoading(true);
    try {
      const res = await client.listNotifications(30);
      setNotifications(res.notifications as Notification[]);
      setUnreadCount(res.notifications.filter(n => !(n as Notification).isRead).length);
    } catch (e) {
      console.error('Notifications error:', e);
    } finally {
      setLoading(false);
    }
  }, [client]);

  useEffect(() => { void load(); }, [load]);

  return { notifications, loading, unreadCount, refresh: load };
}
