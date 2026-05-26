import { useState, useEffect, useCallback, useRef } from 'react';
import { BskyClient } from '@bsky/core';
import type { ThreadViewPost, NotFoundPost as NFP, PostView, ThreadgateRule, ListViewBasic, Label } from '@bsky/core';
import { extractImages, extractVideo, extractExternalLink, extractQuotedPost } from '../utils/extractEmbeds.js';
import { isPostLiked, isPostReposted, likePost, repostPost, seedPostViewers } from './usePostActions.js';

export interface FlatLine {
  depth: number;
  uri: string;
  cid: string;
  rkey: string;
  text: string;
  handle: string;
  displayName: string;
  authorAvatar?: string;
  hasReplies: boolean;
  imageDetails: Array<{ url: string; alt: string }>;
  externalLink: { uri: string; title: string; description: string } | null;
  hasVideo: boolean;
  videoThumbnailUrl?: string;
  videoPlaylistUrl?: string;
  videoAlt?: string;
  videoAspectRatio?: { width: number; height: number };
  quotedPost?: {
    uri: string;
    cid: string;
    text: string;
    handle: string;
    displayName: string;
    authorAvatar?: string;
    imageDetails: Array<{ url: string; alt: string }>;
    externalLink: { uri: string; title: string; description: string } | null;
  };
  isRoot: boolean;
  isTruncation: boolean;
  likeCount: number;
  repostCount: number;
  replyCount: number;
  indexedAt: string;
  threadgate?: {
    rules: ThreadgateRule[];
    listInfo?: Array<{ uri: string; name: string }>;
    allowQuote?: boolean;
  };
  /** [v0.15.0] Labels attached to this post for moderation rendering */
  labels?: Label[];
}

const INITIAL_SIBLINGS = 5;

export function useThread(
  client: BskyClient | null,
  uri: string | undefined,
) {
  const [flatLines, setFlatLines] = useState<FlatLine[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [focusedIndex, setFocusedIndex] = useState(0);
  const [themeUri, setThemeUri] = useState<string | undefined>(uri);
  const [sync, setSync] = useState(0);
  const [maxSiblings, setMaxSiblings] = useState(INITIAL_SIBLINGS);
  const [threadgate, setThreadgate] = useState<FlatLine['threadgate'] | undefined>(undefined);
  const loadedUri = useRef('');
  const postViewsRef = useRef<Map<string, PostView>>(new Map());

  const loadThread = useCallback(async () => {
    if (!client || !uri) return;
    if (uri === loadedUri.current) return;
    loadedUri.current = uri;
    setLoading(true);
    setMaxSiblings(INITIAL_SIBLINGS);

    try {
      setError(null);
      const res = await client.getPostThread(uri, 5, 80);

      // Seed like/repost state from API viewer data (shared module-level)
      const posts: any[] = [];
      const lines = flattenThreadTree(res.thread, INITIAL_SIBLINGS, (post) => { posts.push(post); });
      seedPostViewers(posts);
      setSync(n => n + 1);

      // Store PostViews for info modal lookup
      const map = new Map<string, PostView>();
      for (const p of posts) map.set(p.uri, p);
      postViewsRef.current = map;

      setFlatLines(lines);
      const rootIdx = lines.findIndex(l => l.isRoot);
      setFocusedIndex(rootIdx >= 0 ? rootIdx : 0);
      if (!themeUri) setThemeUri(uri);
      // Parse threadgate
      const tg = res.threadgate;
      if (tg?.record) {
        const listInfo: Array<{ uri: string; name: string }> | undefined = tg.lists?.map(l => ({ uri: l.uri, name: l.name }));
        setThreadgate({ 
          rules: tg.record.allow ?? [], 
          listInfo,
          allowQuote: tg.record.allowQuote !== false // default true
        });
      } else {
        setThreadgate(undefined);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      console.error('Thread load error:', e);
    } finally {
      setLoading(false);
    }
  }, [client, uri, themeUri]);

  useEffect(() => { void loadThread(); }, [loadThread]);

  const expandReplies = useCallback(() => {
    if (!client || !uri) return;
    setMaxSiblings(prev => prev + 10);
  }, [client, uri]);

  // Re-flatten when maxSiblings increases
  useEffect(() => {
    if (maxSiblings <= INITIAL_SIBLINGS) return;
    (async () => {
      if (!client || !uri) return;
      try {
        const res = await client.getPostThread(uri, 5, 80);
        const lines = flattenThreadTree(res.thread, maxSiblings);
        setFlatLines(lines);
      } catch (e) {
        console.error('Expand replies error:', e);
      }
    })();
  }, [maxSiblings, client, uri]);

  const likePostFn = useCallback(async (postUri: string) => {
    await likePost(client, postUri);
    setSync(n => n + 1);
  }, [client]);

  const repostPostFn = useCallback(async (postUri: string): Promise<boolean> => {
    await repostPost(client, postUri);
    setSync(n => n + 1);
    return isPostReposted(postUri);
  }, [client]);

  const focusedLine = flatLines[focusedIndex];

  return {
    flatLines, loading, error, focusedIndex, themeUri,
    focused: focusedLine,
    threadgate,
    expandReplies,
    likePost: likePostFn,
    repostPost: repostPostFn,
    isLiked: isPostLiked,
    isReposted: isPostReposted,
    getPostView: (u: string): PostView | undefined => postViewsRef.current.get(u),
  };
}

function uriToParts(uri: string) {
  const m = uri.match(/^at:\/\/(did:plc:[^/]+)\/([^/]+)\/([^/]+)$/);
  if (!m) throw new Error(`Invalid URI: ${uri}`);
  return { did: m[1]!, collection: m[2]!, rkey: m[3]! };
}

function flattenThreadTree(thread: ThreadViewPost | NFP, maxSiblings = 5, onPost?: (post: PostView) => void): FlatLine[] {
  const lines: FlatLine[] = [];
  const visitedUris = new Set<string>();

  function walk(node: ThreadViewPost | NFP, d: number) {
    if (node.$type !== 'app.bsky.feed.defs#threadViewPost') return;
    const post = node.post as PostView;

    onPost?.(post);

    if (visitedUris.has(post.uri)) return;
    visitedUris.add(post.uri);

    if (node.parent && node.parent.$type === 'app.bsky.feed.defs#threadViewPost') {
      walk(node.parent, d - 1);
    }

    const rkey = post.uri.split('/').pop() ?? '';
    const isRoot = d === 0;
    const vid = extractVideo(post);

    lines.push({
      depth: d,
      uri: post.uri,
      cid: post.cid,
      rkey,
      text: post.record.text,
      handle: post.author.handle,
      displayName: post.author.displayName ?? post.author.handle,
      authorAvatar: post.author.avatar,
      hasReplies: !!node.replies && node.replies.length > 0,
      imageDetails: extractImages(post),
      externalLink: extractExternalLink(post),
      quotedPost: extractQuotedPost(post) ?? undefined,
      hasVideo: vid !== null,
      videoThumbnailUrl: vid?.thumbnailUrl,
      videoPlaylistUrl: vid?.playlistUrl,
      videoAlt: vid?.alt,
      videoAspectRatio: vid?.aspectRatio,
      isRoot,
      isTruncation: false,
      likeCount: post.likeCount ?? 0,
      repostCount: post.repostCount ?? 0,
      replyCount: post.replyCount ?? 0,
      indexedAt: post.indexedAt ?? '',
      labels: (post as any).labels,
    });

    if (node.replies && d >= 0) {
      const sortedReplies = [...node.replies]
        .filter((r): r is ThreadViewPost => r.$type === 'app.bsky.feed.defs#threadViewPost')
        .sort((a, b) => new Date(a.post.indexedAt ?? '').getTime() - new Date(b.post.indexedAt ?? '').getTime());

      const visible = Math.min(sortedReplies.length, maxSiblings);
      for (const reply of sortedReplies.slice(0, visible)) {
        walk(reply, d + 1);
      }
      if (sortedReplies.length > maxSiblings) {
        const remaining = sortedReplies.length - maxSiblings;
        lines.push({
          depth: d + 1, uri: '', cid: '', rkey: '',
          text: `（还有 ${remaining} 条回复未显示）`,
          handle: '', displayName: '', authorAvatar: undefined,
          hasReplies: false, imageDetails: [], externalLink: null, quotedPost: undefined,
          hasVideo: false,
          isRoot: false, isTruncation: true,
          likeCount: 0, repostCount: 0, replyCount: 0, indexedAt: '',
        });
      }
    }
  }

  walk(thread, 0);
  return lines;
}
