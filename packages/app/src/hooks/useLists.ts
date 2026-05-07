import { useState, useEffect, useCallback } from 'react';
import { BskyClient } from '@bsky/core';
import type { ListView, ListPurpose } from '@bsky/core';

export function useLists(client: BskyClient | null, actor?: string) {
  const [lists, setLists] = useState<ListView[]>([]);
  const [loading, setLoading] = useState(false);
  const [cursor, setCursor] = useState<string | undefined>();
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (retried = false) => {
    if (!client) return;
    if (!actor && !client.isAuthenticated()) return;
    const target = actor ?? client.getHandle();
    setLoading(true);
    setError(null);
    try {
      const res = await client.getLists(target, 50, undefined, undefined);
      setLists(res.lists);
      setCursor(res.cursor);
    } catch (e) {
      if (!retried) {
        await new Promise(r => setTimeout(r, 1500));
        return load(true);
      }
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [client, actor]);

  useEffect(() => { void load(); }, [load]);

  const createList = useCallback(async (name: string, purpose: ListPurpose, description?: string): Promise<ListView | null> => {
    if (!client) return null;
    try {
      const result = await client.createList(name, purpose, description);
      const list: ListView = {
        uri: result.uri,
        cid: result.cid,
        name,
        purpose,
        description,
        creator: { did: client.getDID(), handle: client.getHandle() },
        listItemCount: 0,
        indexedAt: new Date().toISOString(),
      };
      setLists(prev => [list, ...prev]);
      return list;
    } catch (e) {
      console.error('Create list error:', e);
      return null;
    }
  }, [client]);

  const deleteList = useCallback(async (uri: string) => {
    if (!client) return;
    try {
      await client.deleteList(uri);
      setLists(prev => prev.filter(l => l.uri !== uri));
    } catch (e) { console.error('Delete list error:', e); }
  }, [client]);

  const updateListInfo = useCallback(async (uri: string, params: { name?: string; description?: string }): Promise<void> => {
    if (!client) return;
    try {
      await client.updateList(uri, params);
      setLists(prev => prev.map(l => {
        if (l.uri !== uri) return l;
        return {
          ...l,
          name: params.name ?? l.name,
          description: params.description !== undefined ? params.description : l.description,
        };
      }));
    } catch (e) { console.error('Update list error:', e); }
  }, [client]);

  return { lists, loading, error, createList, deleteList, updateListInfo, refresh: load };
}
