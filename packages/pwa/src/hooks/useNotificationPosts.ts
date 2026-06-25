import { useEffect, useMemo, useRef, useState } from 'react';
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

/**
 * Build a stable cache key from the sorted unique reasonSubject URIs.
 * Changing the order or identity of the `groups` array must not change the key
 * when the same URIs are referenced.
 */
export function buildStableKey(groups: NotifGroup[], retryCount = 0): string {
  const subjects = groups
    .map((g) => g.reasonSubject)
    .filter((s): s is string => typeof s === 'string' && s.length > 0);
  const unique = Array.from(new Set(subjects)).sort();
  if (unique.length === 0) return '';
  return `${unique.join('|')}::retry=${retryCount}`;
}

export interface UseNotificationPostsResult {
  posts: Map<string, PostView>;
  loading: boolean;
  error: string | null;
  retry: () => void;
}

/**
 * 批量拉取通知组中需要预览的目标帖文。
 *
 * - 只收集存在 reasonSubject 的组
 * - 去重并按 25 个 URI 每批调用 client.getPosts
 * - 用排序后的唯一 URI 集合做稳定缓存键，避免数组引用抖动导致重复请求
 * - 通过单调递增 request id 忽略过期响应，避免旧 effect 把 loading 卡死
 */
export function useNotificationPosts(
  client: BskyClient | null,
  groups: NotifGroup[],
): UseNotificationPostsResult {
  const [posts, setPosts] = useState<Map<string, PostView>>(new Map());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);
  const requestIdRef = useRef(0);

  const stableKey = useMemo(() => buildStableKey(groups, retryCount), [groups, retryCount]);

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
      return;
    }

    const requested = new Set(unique);
    const requestId = ++requestIdRef.current;

    setLoading(true);
    setError(null);

    async function load(c: BskyClient) {
      try {
        const next = new Map<string, PostView>();
        for (let i = 0; i < unique.length; i += CHUNK_SIZE) {
          const chunk = unique.slice(i, i + CHUNK_SIZE);
          const res = await c.getPosts(chunk);
          for (const post of res.posts) {
            // Defensive: only keep posts whose URI was actually requested.
            if (requested.has(post.uri)) {
              next.set(post.uri, post);
            }
          }
        }
        if (requestIdRef.current === requestId) {
          setPosts(next);
        }
      } catch (e) {
        if (requestIdRef.current === requestId) {
          setError(e instanceof Error ? e.message : String(e));
        }
      } finally {
        // Always run finally, but only update loading for the current in-flight
        // request so a stale response cannot flip loading back to false early.
        if (requestIdRef.current === requestId) {
          setLoading(false);
        }
      }
    }

    void load(activeClient);

    return () => {
      // Invalidate this request's callbacks when the effect is cleaned up
      // (e.g. groups change, retry fires, or the component unmounts).
      ++requestIdRef.current;
    };
  }, [client, stableKey]);

  const retry = useMemo(
    () => () => {
      setRetryCount((c) => c + 1);
    },
    [],
  );

  return { posts, loading, error, retry };
}
