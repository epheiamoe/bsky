import { useEffect, useRef, useState } from 'react';
import type { BskyClient, PostView } from '@bsky/core';
import type { NotifGroup } from './useNotificationGroups.js';

const CHUNK_SIZE = 25;

export function chunkUris(uris: string[], size = CHUNK_SIZE): string[][] {
  const chunks: string[][] = [];
  for (let i = 0; i < uris.length; i += size) {
    chunks.push(uris.slice(i, i + size));
  }
  return chunks;
}

export interface UseNotificationPostsResult {
  posts: Map<string, PostView>;
  loading: boolean;
  error: string | null;
}

/**
 * 批量拉取通知组中需要预览的目标帖文。
 *
 * - 只收集存在 reasonSubject 的组
 * - 去重并按 25 个 URI 每批调用 client.getPosts
 * - 用组 key 集合做缓存键，避免重复请求
 */
export function useNotificationPosts(
  client: BskyClient | null,
  groups: NotifGroup[],
): UseNotificationPostsResult {
  const [posts, setPosts] = useState<Map<string, PostView>>(new Map());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fetchedKeyRef = useRef('');

  useEffect(() => {
    const activeClient = client;
    if (!activeClient) return;

    const subjects = groups
      .map((g) => g.reasonSubject)
      .filter((s): s is string => typeof s === 'string' && s.length > 0);
    const unique = Array.from(new Set(subjects));

    if (unique.length === 0) {
      setPosts(new Map());
      setLoading(false);
      setError(null);
      fetchedKeyRef.current = '';
      return;
    }

    const key = unique.sort().join('|');
    if (key === fetchedKeyRef.current) return;
    fetchedKeyRef.current = key;

    let cancelled = false;

    async function load(c: BskyClient) {
      setLoading(true);
      setError(null);
      try {
        const next = new Map<string, PostView>();
        for (let i = 0; i < unique.length; i += CHUNK_SIZE) {
          const chunk = unique.slice(i, i + CHUNK_SIZE);
          const res = await c.getPosts(chunk);
          for (const post of res.posts) {
            next.set(post.uri, post);
          }
        }
        if (!cancelled) setPosts(next);
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : String(e));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load(activeClient);
    return () => {
      cancelled = true;
    };
  }, [client, groups]);

  return { posts, loading, error };
}
