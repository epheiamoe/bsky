import React from 'react';
import { Text } from 'ink';
import type { PostView } from '@bsky/core';
import { wrapLines } from '../utils/text.js';

export interface PostLine {
  text: string;
  isSelected: boolean;
  isName: boolean;
}

export function postToLines(post: PostView, index: number, isSelected: boolean, cols: number): PostLine[] {
  const lines: PostLine[] = [];
  const name = post.author.displayName || post.author.handle;
  const text = post.record.text.replace(/\n/g, ' ');
  const time = post.indexedAt ? new Date(post.indexedAt).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }) : '';

  // Author line
  lines.push({ text: `${name} @${post.author.handle} [${index}]`, isSelected, isName: true });

  // Text lines — CJK-aware wrapping
  const maxCols = Math.max(20, cols - 4);
  for (const l of wrapLines(text, maxCols)) {
    lines.push({ text: l, isSelected, isName: false });
  }

  // Stats line
  lines.push({ text: `♥ ${post.likeCount ?? 0} ♺ ${post.repostCount ?? 0} 💬 ${post.replyCount ?? 0}${time ? ' · ' + time : ''}`, isSelected, isName: false });

  // Blank separator
  lines.push({ text: '', isSelected: false, isName: false });

  return lines;
}

export interface PostListItemProps {
  line: PostLine;
}

export function PostListItem({ line }: PostListItemProps) {
  if (!line.text) return <Text> </Text>;
  return (
    <Text color={line.isSelected ? 'cyanBright' : line.isName ? 'green' : undefined} bold={line.isSelected && line.isName} dimColor={!line.isSelected && !line.isName}>
      {line.text}
    </Text>
  );
}

export function PostSkeleton() {
  return (
    <>
      <Text dimColor>─────</Text>
      <Text dimColor>Loading...</Text>
      <Text dimColor>─────</Text>
    </>
  );
}
