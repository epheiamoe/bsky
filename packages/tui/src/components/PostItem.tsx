import React from 'react';
import { Text } from 'ink';
import type { PostView } from '@bsky/core';

export interface PostItemProps {
  post: PostView;
  isSelected: boolean;
  index: number;
  width: number;
}

export function PostItem({ post, isSelected, index, width }: PostItemProps) {
  const name = post.author.displayName || post.author.handle;
  const handle = post.author.handle;
  const text = post.record.text.replace(/\n/g, ' ');
  const time = post.indexedAt ? new Date(post.indexedAt).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }) : '';

  const authorLine = `${name} @${handle} [${index}]`;
  const statsLine = `♥ ${post.likeCount ?? 0} ♺ ${post.repostCount ?? 0} 💬 ${post.replyCount ?? 0}${time ? ' · ' + time : ''}`;

  // Estimate lines: name/handle/idx + text + stats. Add 1 for margin.
  const textLines = Math.max(1, Math.ceil(text.length / (width || 60)));
  const height = 3 + textLines; // author(1) + text(N) + stats(1) + margin(1)

  // Build text as single string with newlines
  const content = `${authorLine}\n${text}\n${statsLine}`;

  return (
    <Text color={isSelected ? 'cyanBright' : undefined} dimColor={!isSelected}>
      {content}
    </Text>
  );
}

export function PostSkeleton() {
  return <Text dimColor>{'─────\nLoading...\n─────'}</Text>;
}
