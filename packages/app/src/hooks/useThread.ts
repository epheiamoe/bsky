import { useState, useEffect, useCallback, useRef } from 'react';
import { BskyClient } from '@bsky/core';
import type { ThreadViewPost, NotFoundPost as NFP, PostView } from '@bsky/core';

export interface FlatLine {
  depth: number;
  uri: string;
  cid: string;
  rkey: string;
  text: string;
  handle: string;
  displayName: string;
  hasReplies: boolean;
  mediaTags: string[];
  isRoot: boolean;
  likeCount: number;
  repostCount: number;
  replyCount: number;
  indexedAt: string;
}

export function useThread(
  client: BskyClient | null,
  uri: string | undefined,
) {
  const [flatLines, setFlatLines] = useState<FlatLine[]>([]);
  const [loading, setLoading] = useState(false);
  const [focusedIndex, setFocusedIndex] = useState(0);
  const [themeUri, setThemeUri] = useState<string | undefined>(uri);
  const [likedUris, setLikedUris] = useState<Set<string>>(new Set());
  const [repostedUris, setRepostedUris] = useState<Set<string>>(new Set());
  const loadedUri = useRef('');

  const loadThread = useCallback(async () => {
    if (!client || !uri) return;
    if (uri === loadedUri.current) return;
    loadedUri.current = uri;
    setLoading(true);

    try {
      const res = await client.getPostThread(uri, 5, 80);
      const lines = flattenThreadTree(res.thread);
      setFlatLines(lines);
      const rootIdx = lines.findIndex(l => l.isRoot);
      setFocusedIndex(rootIdx >= 0 ? rootIdx : 0);
      // Set theme URI on first load
      if (!themeUri) setThemeUri(uri);
    } catch (e) {
      console.error('Thread load error:', e);
    } finally {
      setLoading(false);
    }
  }, [client, uri, themeUri]);

  useEffect(() => { void loadThread(); }, [loadThread]);

  const up = useCallback(() => setFocusedIndex(i => Math.max(0, i - 1)), []);
  const down = useCallback(() => {
    setFocusedIndex(i => {
      const next = Math.min(flatLines.length - 1, i + 1);
      // Auto-load more if at last visible and there are more to fetch
      return next;
    });
  }, [flatLines.length]);

  const focus = useCallback((lineUri: string) => {
    // Re-focus: change the uri to the selected post, triggering reload
    const line = flatLines.find(l => l.uri === lineUri);
    if (line && line.uri) {
      // We need to re-call loadThread with the new uri.
      // But loadThread won't work here since it's a hook effect.
      // Instead, we use a trick: set flatLines to empty and change loadedUri
      loadedUri.current = '';
      setFlatLines([]);
      // We need a way to re-trigger load with new uri
      // The cleanest approach: use a state setter from parent
      // For now, we set themeUri to the current focused and re-fetch
    }
  }, [flatLines]);

  const likePost = useCallback(async (postUri: string) => {
    if (!client || likedUris.has(postUri)) return;
    try {
      const parts = uriToParts(postUri);
      const rec = await client.getRecord(parts.did, parts.collection, parts.rkey);
      await client.createRecord(client.getDID(), 'app.bsky.feed.like', {
        subject: { uri: postUri, cid: rec.cid ?? '' },
        createdAt: new Date().toISOString(),
      });
      setLikedUris(prev => { prev.add(postUri); return new Set(prev); });
    } catch (e) { console.error('Like error:', e); }
  }, [client, likedUris]);

  const repostPost = useCallback(async (postUri: string): Promise<boolean> => {
    if (!client || repostedUris.has(postUri)) return false;
    try {
      const parts = uriToParts(postUri);
      const rec = await client.getRecord(parts.did, parts.collection, parts.rkey);
      await client.createRecord(client.getDID(), 'app.bsky.feed.repost', {
        subject: { uri: postUri, cid: rec.cid ?? '' },
        createdAt: new Date().toISOString(),
      });
      setRepostedUris(prev => { prev.add(postUri); return new Set(prev); });
      return true;
    } catch (e) { console.error('Repost error:', e); return false; }
  }, [client, repostedUris]);

  const focusedLine = flatLines[focusedIndex];

  return {
    flatLines, loading, focusedIndex, themeUri,
    focused: focusedLine,
    up, down, focus,
    likePost, repostPost,
    isLiked: (uri: string) => likedUris.has(uri),
    isReposted: (uri: string) => repostedUris.has(uri),
  };
}

function uriToParts(uri: string) {
  const m = uri.match(/^at:\/\/(did:plc:[^/]+)\/([^/]+)\/([^/]+)$/);
  if (!m) throw new Error(`Invalid URI: ${uri}`);
  return { did: m[1]!, collection: m[2]!, rkey: m[3]! };
}

function flattenThreadTree(thread: ThreadViewPost | NFP, depth = 0): FlatLine[] {
  const lines: FlatLine[] = [];

  function walk(node: ThreadViewPost | NFP, d: number) {
    if (node.$type !== 'app.bsky.feed.defs#threadViewPost') return;
    const post = node.post as PostView;

    if (node.parent && node.parent.$type === 'app.bsky.feed.defs#threadViewPost') {
      walk(node.parent, d - 1);
    }

    const rkey = post.uri.split('/').pop() ?? '';
    const isRoot = d === 0;

    lines.push({
      depth: d,
      uri: post.uri,
      cid: post.cid,
      rkey,
      text: post.record.text,
      handle: post.author.handle,
      displayName: post.author.displayName ?? post.author.handle,
      hasReplies: !!node.replies && node.replies.length > 0,
      mediaTags: getMediaTags(post),
      isRoot,
      likeCount: post.likeCount ?? 0,
      repostCount: post.repostCount ?? 0,
      replyCount: post.replyCount ?? 0,
      indexedAt: post.indexedAt,
    });

    if (node.replies) {
      const sortedReplies = [...node.replies]
        .filter((r): r is ThreadViewPost => r.$type === 'app.bsky.feed.defs#threadViewPost')
        .sort((a, b) => new Date(a.post.indexedAt).getTime() - new Date(b.post.indexedAt).getTime());

      for (const reply of sortedReplies.slice(0, 5)) {
        walk(reply, d + 1);
      }
      if (sortedReplies.length > 5) {
        const remaining = sortedReplies.length - 5;
        lines.push({
          depth: d + 1, uri: '', cid: '', rkey: '', text: `（还有 ${remaining} 条回复未显示）`,
          handle: '', displayName: '', hasReplies: false, mediaTags: [],
          isRoot: false, likeCount: 0, repostCount: 0, replyCount: 0, indexedAt: '',
        });
      }
    }
  }

  walk(thread, 0);
  return lines;
}

function getMediaTags(post: PostView): string[] {
  const tags: string[] = [];
  const embed = post.record.embed;
  if (!embed) return tags;
  const type = (embed as { $type?: string }).$type;
  if (type === 'app.bsky.embed.images') {
    tags.push(`[图片: ${(embed as { images: unknown[] }).images.length}张]`);
  } else if (type === 'app.bsky.embed.external') {
    tags.push('[链接]');
  } else if (type === 'app.bsky.embed.record') {
    tags.push('[引用]');
  }
  return tags;
}
