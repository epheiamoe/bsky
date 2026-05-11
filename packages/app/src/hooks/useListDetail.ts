import { useState, useEffect, useCallback } from 'react';
import { BskyClient } from '@bsky/core';
import type { PostView, ListView, ListItemView } from '@bsky/core';
import { readCache, writeCache, hasCache } from '../stores/cache';

function detailCacheKey(listUri: string): string {
  return `listDetail-${listUri}`;
}

interface ListDetailCache {
  list: ListView | null;
  members: ListItemView[];
  membersCursor?: string;
  feed: PostView[];
  feedCursor?: string;
  isMuted: boolean;
}

export function useListDetail(client: BskyClient | null, listUri: string) {
  const ck = detailCacheKey(listUri);
  const cached = readCache<ListDetailCache>(ck);
  const [list, setList] = useState<ListView | null>(cached?.list ?? null);
  const [members, setMembers] = useState<ListItemView[]>(cached?.members ?? []);
  const [membersCursor, setMembersCursor] = useState<string | undefined>(cached?.membersCursor);
  const [feed, setFeed] = useState<PostView[]>(cached?.feed ?? []);
  const [feedCursor, setFeedCursor] = useState<string | undefined>(cached?.feedCursor);
  const [loading, setLoading] = useState(!hasCache(ck));
  const [error, setError] = useState<string | null>(null);
  const [isMuted, setIsMuted] = useState(cached?.isMuted ?? false);

  const load = useCallback(async (retried = false, silent = false) => {
    if (!client || !listUri) return;
    if (!silent) setLoading(true);
    setError(null);
    try {
      const [listRes, feedRes] = await Promise.all([
        client.getList(listUri, 50),
        client.getListFeed(listUri, 20),
      ]);
      const newFeed = feedRes.feed.map(f => (f as any).post ?? f);
      writeCache(ck, {
        list: listRes.list,
        members: listRes.items,
        membersCursor: listRes.cursor,
        feed: newFeed,
        feedCursor: feedRes.cursor,
        isMuted: !!listRes.list.viewer?.muted,
      });
      setList(listRes.list);
      setMembers(listRes.items);
      setMembersCursor(listRes.cursor);
      setFeed(newFeed);
      setFeedCursor(feedRes.cursor);
      setIsMuted(!!listRes.list.viewer?.muted);
    } catch (e) {
      if (!retried) {
        await new Promise(r => setTimeout(r, 1500));
        return load(true, silent);
      }
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      if (!silent) setLoading(false);
    }
  }, [client, listUri]);

  useEffect(() => { void load(false, hasCache(ck)); }, [load]);

  const loadMoreMembers = useCallback(async () => {
    if (!client || !listUri || !membersCursor) return;
    try {
      const res = await client.getList(listUri, 50, membersCursor);
      setMembers(prev => [...prev, ...res.items]);
      setMembersCursor(res.cursor);
    } catch (e) { console.error('Load more members error:', e); }
  }, [client, listUri, membersCursor]);

  const loadMoreFeed = useCallback(async () => {
    if (!client || !listUri || !feedCursor) return;
    try {
      const res = await client.getListFeed(listUri, 20, feedCursor);
      const newPosts = res.feed.map(f => (f as any).post ?? f);
      setFeed(prev => [...prev, ...newPosts]);
      setFeedCursor(res.cursor);
    } catch (e) { console.error('Load more feed error:', e); }
  }, [client, listUri, feedCursor]);

  const toggleMute = useCallback(async () => {
    if (!client || !listUri) return;
    try {
      if (isMuted) {
        await client.unmuteActorList(listUri);
        setIsMuted(false);
      } else {
        await client.muteActorList(listUri);
        setIsMuted(true);
      }
    } catch (e) { console.error('Toggle mute error:', e); }
  }, [client, listUri, isMuted]);

  const addMember = useCallback(async (subjectDid: string) => {
    if (!client || !listUri) return;
    try {
      await client.addListItem(listUri, subjectDid);
      await load();
    } catch (e) { console.error('Add member error:', e); }
  }, [client, listUri, load]);

  const removeMember = useCallback(async (itemUri: string) => {
    if (!client) return;
    try {
      await client.removeListItem(itemUri);
      setMembers(prev => prev.filter(m => m.uri !== itemUri));
      setList(prev => prev ? { ...prev, listItemCount: Math.max(0, (prev.listItemCount ?? 1) - 1) } : prev);
    } catch (e) { console.error('Remove member error:', e); }
  }, [client]);

  const updateListInfo = useCallback(async (params: { name?: string; description?: string }): Promise<void> => {
    if (!client || !listUri) return;
    try {
      await client.updateList(listUri, params);
      setList(prev => prev ? { ...prev, name: params.name ?? prev.name, description: params.description !== undefined ? params.description : prev.description } : prev);
    } catch (e) { console.error('Update list error:', e); }
  }, [client, listUri]);

  const deleteList = useCallback(async (): Promise<void> => {
    if (!client || !listUri) return;
    try { await client.deleteList(listUri); } catch (e) { console.error('Delete list error:', e); }
  }, [client, listUri]);

  return {
    list,
    loading,
    error,
    members,
    membersCursor,
    loadMoreMembers,
    feed,
    feedCursor,
    loadMoreFeed,
    isMuted,
    toggleMute,
    addMember,
    removeMember,
    updateListInfo,
    deleteList,
    refresh: load,
  };
}
