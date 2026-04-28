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

  const text = isCompact
    ? record.text.replace(/\n/g, ' ')
    : record.text;

  const time = post.indexedAt ? new Date(post.indexedAt).toLocaleString('zh-CN', {
    month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
  }) : '';

  return (
    <Box flexDirection="column" width={width} marginBottom={1}>
      {/* Author line */}
      <Box>
        <Text backgroundColor={bg} bold color={isSelected ? 'cyanBright' : 'green'}>
          {displayName}
        </Text>
        <Text backgroundColor={bg} dimColor>
          {' @'}{handle}
        </Text>
        <Text backgroundColor={bg} dimColor>
          {' '}[{index}]
        </Text>
      </Box>
      {/* Text — no gutter, natural wrap */}
      <Box>
        <Text backgroundColor={bg}>
          {text}
        </Text>
      </Box>
      {/* Stats */}
      <Box>
        <Text dimColor>
          ♥ {post.likeCount ?? 0}  ♺ {post.repostCount ?? 0}  💬 {post.replyCount ?? 0}
        </Text>
        {time ? <Text dimColor>{' · '}{time}</Text> : null}
      </Box>
    </Box>
  );
}

export function PostSkeleton() {
  return (
    <Box flexDirection="column" marginBottom={1}>
      <Text dimColor>─────────</Text>
      <Text dimColor>Loading...</Text>
      <Text dimColor>─────────</Text>
    </Box>
  );
}
