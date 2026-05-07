import { useState, useEffect, useCallback } from 'react';
import { BskyClient } from '@bsky/core';
import type { PostView, ListView, ListItemView } from '@bsky/core';

export function useListDetail(client: BskyClient | null, listUri: string) {
  const [list, setList] = useState<ListView | null>(null);
  const [members, setMembers] = useState<ListItemView[]>([]);
  const [membersCursor, setMembersCursor] = useState<string | undefined>();
  const [feed, setFeed] = useState<PostView[]>([]);
  const [feedCursor, setFeedCursor] = useState<string | undefined>();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isMuted, setIsMuted] = useState(false);

  const load = useCallback(async (retried = false) => {
    if (!client || !listUri) return;
    setLoading(true);
    setError(null);
    try {
      const [listRes, feedRes] = await Promise.all([
        client.getList(listUri, 50),
        client.getListFeed(listUri, 20),
      ]);
      setList(listRes.list);
      setMembers(listRes.items);
      setMembersCursor(listRes.cursor);
      setFeed(feedRes.feed.map(f => (f as any).post ?? f));
      setFeedCursor(feedRes.cursor);
      setIsMuted(!!listRes.list.viewer?.muted);
    } catch (e) {
      if (!retried) {
        await new Promise(r => setTimeout(r, 1500));
        return load(true);
      }
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [client, listUri]);

  useEffect(() => { void load(); }, [load]);

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
    } catch (e) { console.error('Remove member error:', e); }
  }, [client]);

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
    refresh: load,
  };
}
