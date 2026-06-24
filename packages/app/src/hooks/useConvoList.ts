import { useState, useCallback, useEffect, useRef } from 'react';
import type { BskyClient, ConvoView, ConvoListResponse } from '@bsky/core';

const POLL_INTERVAL = 30000;
const UNREAD_TTL_MS = 60000;

interface UnreadOverlay {
  unreadCount: number;
  expiresAt: number;
}

/**
 * Module-level optimistic overlay store for DM unread counts.
 *
 * Problem: when a user opens a DM, the conversation list (and global DM badge)
 * should immediately reflect zero unread, even before the next server refresh.
 * The previous singleton setter only worked for a single `useConvoList` instance.
 * This store lets every hook instance subscribe and apply the same overlay.
 *
 * Entries carry a TTL so that new messages arriving after the overlay expires
 * are not permanently masked. Once an entry expires, the next server response
 * is trusted again.
 */
class ConvoUnreadStore {
  private entries = new Map<string, UnreadOverlay>();
  private listeners = new Set<() => void>();

  markRead(convoId: string) {
    this.entries.set(convoId, { unreadCount: 0, expiresAt: Date.now() + UNREAD_TTL_MS });
    this.emit();
  }

  /** Returns a set of convo IDs that should currently be forced to 0 unread. */
  getActiveIds(): Set<string> {
    const now = Date.now();
    const active = new Set<string>();
    for (const [id, entry] of this.entries) {
      if (entry.expiresAt > now) {
        active.add(id);
      } else {
        this.entries.delete(id);
      }
    }
    return active;
  }

  apply(raw: ConvoView[]): ConvoView[] {
    const active = this.getActiveIds();
    if (active.size === 0) return raw;
    return raw.map(c => active.has(c.id) ? { ...c, unreadCount: 0 } : c);
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  }

  private emit() {
    for (const listener of this.listeners) {
      listener();
    }
  }
}

const convoUnreadStore = new ConvoUnreadStore();

/** Called after reading a conversation to immediately clear the badge across all subscribers. */
export function markConvoRead(convoId: string): void {
  convoUnreadStore.markRead(convoId);
}

export function useConvoList(client: BskyClient | null) {
  // We keep raw server convos in a ref and derive the displayed list from it
  // so that the optimistic unread overlay can be re-applied whenever the store
  // changes or a new server response arrives.
  const rawConvosRef = useRef<ConvoView[]>([]);
  const [convos, setConvos] = useState<ConvoView[]>([]);
  const [cursor, setCursor] = useState<string>();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const applyOverlay = useCallback(() => {
    setConvos(convoUnreadStore.apply(rawConvosRef.current));
  }, []);

  const setRawConvos = useCallback((next: ConvoView[] | ((prev: ConvoView[]) => ConvoView[])) => {
    const prev = rawConvosRef.current;
    rawConvosRef.current = typeof next === 'function' ? (next as (prev: ConvoView[]) => ConvoView[])(prev) : next;
    applyOverlay();
  }, [applyOverlay]);

  useEffect(() => {
    return convoUnreadStore.subscribe(applyOverlay);
  }, [applyOverlay]);

  const load = useCallback(async (reset = false) => {
    if (!client) return;
    setLoading(true);
    setError(null);
    try {
      const res: ConvoListResponse = await client.listConvos(30, reset ? undefined : cursor);
      setRawConvos(reset ? res.convos : prev => [...prev, ...res.convos]);
      setCursor(res.cursor);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [client, cursor, setRawConvos]);

  const refresh = useCallback(async () => {
    if (!client) return;
    setLoading(true);
    setError(null);
    try {
      const res: ConvoListResponse = await client.listConvos(30);
      setRawConvos(res.convos);
      setCursor(res.cursor);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [client, setRawConvos]);

  // Silent poll — no loading indicator
  const silentPoll = useCallback(async () => {
    if (!client) return;
    try {
      const res: ConvoListResponse = await client.listConvos(30);
      setRawConvos(res.convos);
      setCursor(res.cursor);
    } catch { /* silent poll — ignore errors */ }
  }, [client, setRawConvos]);

  useEffect(() => {
    if (!client) return;
    const iv = setInterval(silentPoll, POLL_INTERVAL);
    return () => clearInterval(iv);
  }, [silentPoll, client]);

  return { convos, cursor, loading, error, load, refresh };
}
