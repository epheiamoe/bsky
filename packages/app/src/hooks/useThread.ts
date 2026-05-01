import { useState, useEffect, useCallback, useRef } from 'react';
import { BskyClient } from '@bsky/core';
import type { ThreadViewPost, NotFoundPost as NFP, PostView } from '@bsky/core';
import { getCdnImageUrl } from '../utils/imageUrl.js';

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
  mediaTags: string[];
  imageUrls: string[];
  externalLink: { uri: string; title: string; description: string } | null;
  quotedPost?: {
    uri: string;
    cid: string;
    text: string;
    handle: string;
    displayName: string;
    authorAvatar?: string;
    mediaTags: string[];
    imageUrls: string[];
    externalLink: { uri: string; title: string; description: string } | null;
  };
  isRoot: boolean;
  isTruncation: boolean;
  likeCount: number;
  repostCount: number;
  replyCount: number;
  indexedAt: string;
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
  const [likedUris, setLikedUris] = useState<Set<string>>(new Set());
  const [repostedUris, setRepostedUris] = useState<Set<string>>(new Set());
  const [maxSiblings, setMaxSiblings] = useState(INITIAL_SIBLINGS);
  const loadedUri = useRef('');

  const loadThread = useCallback(async () => {
    if (!client || !uri) return;
    if (uri === loadedUri.current) return;
    loadedUri.current = uri;
    setLoading(true);
    setMaxSiblings(INITIAL_SIBLINGS);

    try {
      setError(null);
      const res = await client.getPostThread(uri, 5, 80);

      // Seed like/repost state from API viewer data
      const liked = new Set<string>();
      const reposted = new Set<string>();
      const lines = flattenThreadTree(res.thread, INITIAL_SIBLINGS, (post) => {
        if (post.viewer?.like) liked.add(post.uri);
        if (post.viewer?.repost) reposted.add(post.uri);
      });
      setLikedUris(liked);
      setRepostedUris(reposted);

      setFlatLines(lines);
      const rootIdx = lines.findIndex(l => l.isRoot);
      setFocusedIndex(rootIdx >= 0 ? rootIdx : 0);
      if (!themeUri) setThemeUri(uri);
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
    flatLines, loading, error, focusedIndex, themeUri,
    focused: focusedLine,
    expandReplies,
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
      mediaTags: getMediaTags(post),
      imageUrls: getImageUrls(post),
      externalLink: getExternalLink(post),
      quotedPost: getQuotedPost(post),
      isRoot,
      isTruncation: false,
      likeCount: post.likeCount ?? 0,
      repostCount: post.repostCount ?? 0,
      replyCount: post.replyCount ?? 0,
      indexedAt: post.indexedAt ?? '',
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
          hasReplies: false, mediaTags: [], imageUrls: [], externalLink: null, quotedPost: undefined,
          isRoot: false, isTruncation: true,
          likeCount: 0, repostCount: 0, replyCount: 0, indexedAt: '',
        });
      }
    }
  }

  walk(thread, 0);
  return lines;
}

function getQuotedPost(post: PostView): FlatLine['quotedPost'] {
  // Read from the API-resolved top-level embed (has full author/value/embeds),
  // NOT from post.record.embed (stored format with only uri+cid)
  const embed = (post as any).embed as {
    $type?: string;
    record?: {
      uri?: string;
      cid?: string;
      author?: { did?: string; handle?: string; displayName?: string; avatar?: string };
      value?: { text?: string; createdAt?: string };
      embeds?: Array<{
        $type?: string;
        images?: Array<{ image: { ref: { $link: string }; mimeType: string }; alt: string }>;
        external?: { uri: string; title: string; description: string };
      }>;
    };
    media?: Record<string, unknown>;
  } | undefined;

  if (!embed) return undefined;

  const isRecord = embed.$type === 'app.bsky.embed.record#view' || embed.$type === 'app.bsky.embed.record';
  const isRecordWithMedia = embed.$type === 'app.bsky.embed.recordWithMedia#view' || embed.$type === 'app.bsky.embed.recordWithMedia';
  if (!isRecord && !isRecordWithMedia) return undefined;

  // For resolved #view format, record is always single-nested
  const rec = embed.record;
  if (!rec?.uri) return undefined;

  const quotedMediaTags: string[] = [];
  const quotedImageUrls: string[] = [];
  let quotedExternalLink: FlatLine['externalLink'] | null = null;

  if (rec.embeds?.[0]) {
    const e = rec.embeds[0]!;
    if ((e.$type === 'app.bsky.embed.images#view' || e.$type === 'app.bsky.embed.images') && e.images) {
      const count = e.images.length;
      quotedMediaTags.push(count === 1 ? '🖼 图片' : `🖼 ${count}张图片`);
      const did = rec.author?.did ?? '';
      for (const img of e.images) {
        quotedImageUrls.push(getCdnImageUrl(did, img.image.ref.$link, img.image.mimeType));
      }
    } else if ((e.$type === 'app.bsky.embed.external#view' || e.$type === 'app.bsky.embed.external') && e.external) {
      quotedMediaTags.push('🔗 链接');
      quotedExternalLink = { uri: e.external.uri, title: e.external.title, description: e.external.description };
    }
  }

  return {
    uri: rec.uri,
    cid: rec.cid ?? '',
    text: rec.value?.text ?? '',
    handle: rec.author?.handle ?? '',
    displayName: rec.author?.displayName ?? rec.author?.handle ?? '',
    authorAvatar: rec.author?.avatar,
    mediaTags: quotedMediaTags,
    imageUrls: quotedImageUrls,
    externalLink: quotedExternalLink,
  };
}

function getMediaTags(post: PostView): string[] {
  const tags: string[] = [];
  const embed = post.record.embed as { $type?: string; images?: Array<{ image: { ref: { $link: string }; mimeType: string }; alt: string }>; media?: { $type?: string; images?: Array<{ image: { ref: { $link: string }; mimeType: string }; alt: string }> } } | undefined;
  if (!embed) return tags;

  if (embed.$type === 'app.bsky.embed.images') {
    const count = embed.images?.length ?? 0;
    tags.push(count === 1 ? '🖼 图片' : `🖼 ${count}张图片`);
  } else if (embed.$type === 'app.bsky.embed.external') {
    tags.push('🔗 链接');
  } else if (embed.$type === 'app.bsky.embed.record') {
    tags.push('📌 引用');
  } else if (embed.$type === 'app.bsky.embed.recordWithMedia') {
    tags.push('📌🖼 引用+图片');
  }

  return tags;
}

function getImageUrls(post: PostView): string[] {
  const urls: string[] = [];
  const embed = post.record.embed as {
    $type?: string;
    images?: Array<{ image: { ref: { $link: string }; mimeType: string }; alt: string }>;
    media?: { $type?: string; images?: Array<{ image: { ref: { $link: string }; mimeType: string }; alt: string }> };
  } | undefined;

  const collect = (e: typeof embed) => {
    if (!e) return;
    if (e.$type === 'app.bsky.embed.images' && e.images) {
      for (const img of e.images) {
        urls.push(getCdnImageUrl(post.author.did, img.image.ref.$link, img.image.mimeType));
      }
    } else if (e.$type === 'app.bsky.embed.recordWithMedia' && e.media) {
      collect(e.media);
    }
  };
  collect(embed);
  return urls;
}

function getExternalLink(post: PostView): FlatLine['externalLink'] {
  const embed = post.record.embed as {
    $type?: string;
    external?: { uri: string; title: string; description: string };
  } | undefined;
  if (embed?.$type === 'app.bsky.embed.external' && embed.external) {
    return {
      uri: embed.external.uri,
      title: embed.external.title,
      description: embed.external.description,
    };
  }
  return null;
}
