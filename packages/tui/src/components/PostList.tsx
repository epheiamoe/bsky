import React, { useMemo } from 'react';
import { Box, Text } from 'ink';
import type { PostView } from '@bsky/core';
import { useI18n } from '@bsky/app';
import { postToLines, PostListItem, PostSkeleton } from './PostItem.js';
import type { PostLine } from './PostItem.js';

export interface PostListProps {
  posts: PostView[];
  loading: boolean;
  cursor?: string;
  selectedIndex: number;
  width: number;
  height: number;
}

export function PostList({ posts, loading, selectedIndex, width, height }: PostListProps) {
  const { t, locale } = useI18n();

  // Pre-compute all lines for all posts
  const allLines = useMemo(() => {
    const lines: PostLine[] = [];
    for (let i = 0; i < posts.length; i++) {
      const postLines = postToLines(posts[i]!, i, i === selectedIndex, width, t, locale);
      for (const l of postLines) lines.push(l);
    }
    return lines;
  }, [posts, selectedIndex, width, t, locale]);

  // Find which range of lines is visible. selectedIndex should be centered.
  const visibleLines = height - 4; // header + margins
  const selectedLineStart = allLines.findIndex(
    l => l.text.includes(`[${selectedIndex}]`) && l.isName
  );
  const viewStart = Math.max(0, Math.min(
    allLines.length - visibleLines,
    (selectedLineStart >= 0 ? selectedLineStart : 0) - Math.floor(visibleLines / 3)
  ));
  const visibleSlice = allLines.slice(viewStart, viewStart + visibleLines);

  // Scroll indicators
  const hasAbove = viewStart > 0;
  const hasBelow = viewStart + visibleLines < allLines.length;
  const scrollPct = allLines.length > 0
    ? Math.round((viewStart / Math.max(1, allLines.length - visibleLines)) * 100)
    : 0;

  return (
    <Box flexDirection="column" flexGrow={1}>
      {posts.length === 0 && !loading && (
        <Text dimColor>{t('status.noPosts')}</Text>
      )}
      {hasAbove && (
        <Text dimColor color="cyan">{`▲ ${scrollPct}% (${selectedIndex + 1}/${posts.length})`}</Text>
      )}
      {visibleSlice.map((line, i) => (
        <PostListItem key={`${viewStart + i}`} line={line} />
      ))}
      {hasBelow && (
        <Text dimColor color="cyan">{`▼ ${100 - scrollPct}%`}</Text>
      )}
      {loading && posts.length === 0 && <PostSkeleton t={t} />}
      {loading && posts.length > 0 && (
        <Text color="yellow">{'⏳ '}{t('action.loading')}</Text>
      )}
    </Box>
  );
}
