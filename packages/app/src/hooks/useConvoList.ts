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

  reset() {
    this.entries.clear();
    this.emit();
  }

  private emit() {
    for (const listener of this.listeners) {
      listener();
    }
  }

  // Broadcast raw convos to every subscribed instance so shared initial loads
  // (or future module-level updates) can update all hooks at once.
  setRawConvos(raw: ConvoView[]) {
    for (const listener of this.listeners) {
      // We attach a hidden payload to the listener call so instances can receive
      // the raw list directly without exposing module internals publicly.
      (listener as (() => void) & { __rawConvos?: ConvoView[] }).__rawConvos = raw;
      listener();
    }
  }
}

const convoUnreadStore = new ConvoUnreadStore();

// Module-level state for shared initial load. The lock ensures multiple
// useConvoList instances issue only one listConvos request per client.
let initialLoadPromise: Promise<void> | null = null;
let initialLoadDone = false;
let currentClient: BskyClient | null = null;

/** Reset module-level state (useful for tests or after logout). */
export function __resetConvoStore(): void {
  convoUnreadStore.reset();
  initialLoadPromise = null;
  initialLoadDone = false;
  currentClient = null;
}

/**
 * Detect client changes and reset shared load state. Prevents the next
 * authenticated user from seeing the previous user's conversation list
 * until a fresh fetch completes.
 */
function setClient(client: BskyClient | null): void {
  if (client !== currentClient) {
    currentClient = client;
    initialLoadPromise = null;
    initialLoadDone = false;
    // Broadcast an empty list so all hook instances drop stale convos.
    convoUnreadStore.setRawConvos([]);
  }
}

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
    const listener = applyOverlay as (() => void) & { __rawConvos?: ConvoView[] };
    const raw = listener.__rawConvos;
    if (raw) {
      rawConvosRef.current = raw;
      delete listener.__rawConvos;
    }
    setConvos(convoUnreadStore.apply(rawConvosRef.current));
  }, []);

  const setRawConvos = useCallback((next: ConvoView[] | ((prev: ConvoView[]) => ConvoView[])) => {
    const prev = rawConvosRef.current;
    rawConvosRef.current = typeof next === 'function' ? (next as (prev: ConvoView[]) => ConvoView[])(prev) : next;
    applyOverlay();
  }, [applyOverlay]);

  // Publish raw convo setter to the store so the shared initial load can update
  // every instance's raw list directly.
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

  // Shared initial load: the first useConvoList instance with a valid client
  // performs the fetch and every instance gets the same result via the Store.
  useEffect(() => {
    setClient(client);
    if (!client || initialLoadDone) return;
    initialLoadDone = true;
    initialLoadPromise = (async () => {
      try {
        const res: ConvoListResponse = await client.listConvos(30);
        // Use the store as a broadcast channel for raw convos. Each instance
        // will apply its own overlay via the subscription.
        convoUnreadStore.setRawConvos(res.convos);
      } catch { /* ignore initial load errors; rely on silentPoll */ }
    })();
  }, [client]);

  return { convos, cursor, loading, error, load, refresh };
}
