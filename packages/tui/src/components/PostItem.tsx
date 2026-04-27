import React from 'react';
import { Box, Text } from 'ink';
import type { PostView } from '@bsky/core';

export interface PostItemProps {
  post: PostView;
  isSelected: boolean;
  index: number;
  width: number;
}

function visibleLen(s: string): number {
  let len = 0;
  for (const ch of s) {
    const cp = ch.codePointAt(0)!;
    if (cp >= 0x4e00 && cp <= 0x9fff || cp >= 0x3000 && cp <= 0x303f ||
        cp >= 0xff00 && cp <= 0xffef || cp >= 0x1f300 && cp <= 0x1f9ff) {
      len += 2;
    } else {
      len += 1;
    }
  }
  return len;
}

function truncateToWidth(s: string, maxW: number): string {
  let len = 0;
  let result = '';
  for (const ch of s) {
    const cp = ch.codePointAt(0)!;
    const w = (cp >= 0x4e00 && cp <= 0x9fff || cp >= 0x3000 && cp <= 0x303f ||
               cp >= 0xff00 && cp <= 0xffef || cp >= 0x1f300 && cp <= 0x1f9ff) ? 2 : 1;
    if (len + w > maxW) { result += '…'; break; }
    result += ch;
    len += w;
  }
  return result;
}

export function PostItem({ post, isSelected, index, width }: PostItemProps) {
  const record = post.record;
  const displayName = post.author.displayName || post.author.handle;
  const handle = post.author.handle;
  const avatar = displayName.slice(0, 1);

  const maxTextW = width - 6;
  const text = truncateToWidth(record.text, maxTextW);

  const stats = `${post.likeCount ?? 0} ♥  ${post.repostCount ?? 0} ♺  ${post.replyCount ?? 0} 💬`;
  const time = post.indexedAt ? new Date(post.indexedAt).toLocaleString('zh-CN', {
    month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
  }) : '';

  // Gutter line
  const gutter = isSelected ? '▐' : '│';

  return (
    <Box flexDirection="column" height={3} width={width}>
      <Box>
        <Text color={isSelected ? 'cyanBright' : 'blue'}>
          {gutter}
        </Text>
        <Text backgroundColor={isSelected ? '#1e40af' : undefined} color={isSelected ? 'cyanBright' : 'green'} bold>
          {avatar}
        </Text>
        <Text backgroundColor={isSelected ? '#1e40af' : undefined} color={isSelected ? 'cyanBright' : 'green'} bold>
          {' '}{truncateToWidth(displayName, 16)}
        </Text>
        <Text backgroundColor={isSelected ? '#1e40af' : undefined} dimColor>
          {' @'}{handle}
        </Text>
        <Text backgroundColor={isSelected ? '#1e40af' : undefined} dimColor>
          {' '}[{index}]
        </Text>
      </Box>
      <Box>
        <Text color={isSelected ? 'cyanBright' : 'blue'}>
          {gutter}
        </Text>
        <Text backgroundColor={isSelected ? '#1e40af' : undefined}>
          {' '}{text}
        </Text>
      </Box>
      <Box>
        <Text color={isSelected ? 'cyanBright' : 'blue'}>
          {gutter}
        </Text>
        <Text dimColor>{' '}{stats}</Text>
        <Text dimColor>{' · '}{time}</Text>
      </Box>
    </Box>
  );
}

export function PostSkeleton({ width }: { width: number }) {
  return (
    <Box flexDirection="column" height={3} width={width}>
      <Text dimColor>│ ────────</Text>
      <Text dimColor>│ Loading...</Text>
      <Text dimColor>│ ────────</Text>
    </Box>
  );
}
