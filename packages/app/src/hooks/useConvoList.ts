import { useState, useCallback, useEffect } from 'react';
import type { BskyClient, ConvoView, ConvoListResponse } from '@bsky/core';

const POLL_INTERVAL = 30000;

// Module-level setter for optimistic unread clear (called by DMChatPage after markRead)
let _clearUnread: ((convoId: string) => void) | null = null;

/** Called after reading a conversation to immediately clear the badge */
export function markConvoRead(convoId: string): void {
  _clearUnread?.(convoId);
}

export function useConvoList(client: BskyClient | null) {
  const [convos, setConvos] = useState<ConvoView[]>([]);
  const [cursor, setCursor] = useState<string>();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Register the optimistic clear setter
  useEffect(() => {
    _clearUnread = (id: string) => {
      setConvos(prev => prev.map(c => c.id === id ? { ...c, unreadCount: 0 } : c));
    };
    return () => { _clearUnread = null; };
  }, []);

  const load = useCallback(async (reset = false) => {
    if (!client) return;
    setLoading(true);
    setError(null);
    try {
      const res: ConvoListResponse = await client.listConvos(30, reset ? undefined : cursor);
      setConvos(reset ? res.convos : prev => [...prev, ...res.convos]);
      setCursor(res.cursor);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [client, cursor]);

  const refresh = useCallback(async () => {
    if (!client) return;
    setLoading(true);
    setError(null);
    try {
      const res: ConvoListResponse = await client.listConvos(30);
      setConvos(res.convos);
      setCursor(res.cursor);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [client]);

  // Silent poll — no loading indicator
  const silentPoll = useCallback(async () => {
    if (!client) return;
    try {
      const res: ConvoListResponse = await client.listConvos(30);
      setConvos(res.convos);
      setCursor(res.cursor);
    } catch { /* silent poll — ignore errors */ }
  }, [client]);

  useEffect(() => {
    if (!client) return;
    const iv = setInterval(silentPoll, POLL_INTERVAL);
    return () => clearInterval(iv);
  }, [silentPoll, client]);

  return { convos, cursor, loading, error, load, refresh };
}
