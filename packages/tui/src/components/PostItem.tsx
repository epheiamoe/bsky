import React from 'react';
import { Box, Text } from 'ink';
import type { PostView } from '@bsky/core';

export interface PostItemProps {
  post: PostView;
  isSelected: boolean;
  index: number;
  width: number;
  isCompact?: boolean;
}

export function PostItem({ post, isSelected, index, width, isCompact }: PostItemProps) {
  const record = post.record;
  const displayName = post.author.displayName || post.author.handle;
  const handle = post.author.handle;
  const bg = isSelected ? '#1e40af' : undefined;
  const fg = isSelected ? 'cyanBright' : undefined;
  const gutter = isSelected ? '▐' : '│';
  const gc = isSelected ? 'cyanBright' : 'blue';

  const stats = isCompact
    ? `${post.likeCount ?? 0}♥ ${post.repostCount ?? 0}♺ ${post.replyCount ?? 0}💬`
    : `♥ ${post.likeCount ?? 0}  ♺ ${post.repostCount ?? 0}  💬 ${post.replyCount ?? 0}`;
  const time = post.indexedAt ? new Date(post.indexedAt).toLocaleString('zh-CN', {
    month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
  }) : '';

  return (
    <Box flexDirection="column" width={width}>
      {/* Author + index */}
      <Box>
        <Text color={gc}>{gutter}</Text>
        <Text backgroundColor={bg} color={fg} bold>{displayName}</Text>
        <Text backgroundColor={bg} dimColor>{' @'}{handle}</Text>
        {index >= 0 && <Text backgroundColor={bg} dimColor>{' ['}{index}{']'}</Text>}
      </Box>
      {/* Text */}
      <Box>
        <Text color={gc}>{gutter}</Text>
        <Box flexDirection="column" flexGrow={1}>
          <Text backgroundColor={bg}>
            {isCompact ? record.text.slice(0, 120).replace(/\n/g, ' ') : record.text}
          </Text>
        </Box>
      </Box>
      {/* Stats + time */}
      <Box>
        <Text color={gc}>{gutter}</Text>
        <Text dimColor>{' '}{stats}</Text>
        <Text dimColor>{' · '}{time}</Text>
      </Box>
    </Box>
  );
}

export function PostSkeleton({ width }: { width: number }) {
  return (
    <Box flexDirection="column" width={width}>
      <Text dimColor>│ ────────</Text>
      <Text dimColor>│ Loading...</Text>
      <Text dimColor>│ ────────</Text>
    </Box>
  );
}
