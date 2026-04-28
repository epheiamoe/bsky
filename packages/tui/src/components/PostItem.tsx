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
  const displayName = post.author.displayName || post.author.handle;
  const handle = post.author.handle;
  const bg = isSelected ? '#1e40af' : undefined;
  const fg = isSelected ? 'cyanBright' : 'green';
  const text = isCompact ? post.record.text.replace(/\n/g, ' ') : post.record.text;
  const time = post.indexedAt ? new Date(post.indexedAt).toLocaleString('zh-CN', {
    month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
  }) : '';

  return (
    <Box flexDirection="column" width={width}>
      <Box>
        <Text backgroundColor={bg} bold color={fg}>{displayName}</Text>
        <Text backgroundColor={bg} dimColor>{' @'}{handle}</Text>
        <Text backgroundColor={bg} dimColor>{' ['}{index}{']'}</Text>
      </Box>
      <Box>
        <Text>{text}</Text>
      </Box>
      <Box>
        <Text dimColor>♥ {post.likeCount ?? 0}  ♺ {post.repostCount ?? 0}  💬 {post.replyCount ?? 0}</Text>
        {time ? <Text dimColor>{' · '}{time}</Text> : null}
      </Box>
    </Box>
  );
}

export function PostSkeleton() {
  return (
    <Box flexDirection="column">
      <Box><Text dimColor>─────</Text></Box>
      <Box><Text dimColor>Loading...</Text></Box>
      <Box><Text dimColor>─────</Text></Box>
    </Box>
  );
}
