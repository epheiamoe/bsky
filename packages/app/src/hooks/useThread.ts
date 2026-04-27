import { useState, useEffect, useCallback, useRef } from 'react';
import { BskyClient, createTools } from '@bsky/core';
import type { ThreadViewPost, NotFoundPost as NFP, PostView } from '@bsky/core';
import type { AppView } from '../state/navigation.js';

export interface FlatLine {
  depth: number;
  uri: string;
  rkey: string;
  text: string;
  handle: string;
  displayName: string;
  hasReplies: boolean;
  mediaTags: string[];
  isRoot: boolean;
}

export function useThread(
  client: BskyClient | null,
  uri: string | undefined,
  goTo: (v: AppView) => void,
) {
  const [flatLines, setFlatLines] = useState<FlatLine[]>([]);
  const [loading, setLoading] = useState(false);
  const [focusedIndex, setFocusedIndex] = useState(0);
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

      // Find root line and focus it
      const rootIdx = lines.findIndex(l => l.isRoot);
      setFocusedIndex(rootIdx >= 0 ? rootIdx : 0);
    } catch (e) {
      console.error('Thread load error:', e);
    } finally {
      setLoading(false);
    }
  }, [client, uri]);

  useEffect(() => { void loadThread(); }, [loadThread]);

  const up = useCallback(() => {
    setFocusedIndex(i => Math.max(0, i - 1));
  }, []);

  const down = useCallback(() => {
    setFocusedIndex(i => Math.min(flatLines.length - 1, i + 1));
  }, [flatLines.length]);

  const focus = useCallback((lineUri: string) => {
    goTo({ type: 'detail', uri: lineUri });
  }, [goTo]);

  const replyToFocused = useCallback(() => {
    const line = flatLines[focusedIndex];
    if (line) {
      goTo({ type: 'compose', replyTo: line.uri });
    }
  }, [flatLines, focusedIndex, goTo]);

  return {
    flatLines,
    loading,
    focusedIndex,
    up,
    down,
    focus,
    replyToFocused,
  };
}

function flattenThreadTree(thread: ThreadViewPost | NFP, depth = 0): FlatLine[] {
  const lines: FlatLine[] = [];

  function walk(node: ThreadViewPost | NFP, d: number) {
    if (node.$type !== 'app.bsky.feed.defs#threadViewPost') return;
    const post = node.post as PostView;

    // Walk parent chain first
    if (node.parent && node.parent.$type === 'app.bsky.feed.defs#threadViewPost') {
      walk(node.parent, d - 1);
    }

    const rkey = post.uri.split('/').pop() ?? '';
    const isRoot = d === 0;

    lines.push({
      depth: d,
      uri: post.uri,
      rkey,
      text: post.record.text.slice(0, 200),
      handle: post.author.handle,
      displayName: post.author.displayName ?? post.author.handle,
      hasReplies: !!node.replies && node.replies.length > 0,
      mediaTags: getMediaTags(post),
      isRoot,
    });

    // Walk replies
    if (node.replies) {
      const sortedReplies = [...node.replies]
        .filter((r): r is ThreadViewPost => r.$type === 'app.bsky.feed.defs#threadViewPost')
        .sort((a, b) => new Date(a.post.indexedAt).getTime() - new Date(b.post.indexedAt).getTime());

      for (const reply of sortedReplies.slice(0, 5)) {
        walk(reply, d + 1);
      }
      if (sortedReplies.length > 5) {
        lines.push({
          depth: d + 1,
          uri: '',
          rkey: '',
          text: `（还有 ${sortedReplies.length - 5} 条折叠回复）`,
          handle: '',
          displayName: '',
          hasReplies: false,
          mediaTags: [],
          isRoot: false,
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
    const count = (embed as { images: unknown[] }).images.length;
    tags.push(`[图片: ${count}张]`);
  } else if (type === 'app.bsky.embed.external') {
    tags.push('[链接]');
  } else if (type === 'app.bsky.embed.record') {
    tags.push('[引用]');
  }
  return tags;
}
