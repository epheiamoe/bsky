import React from 'react';
import { Box, Text } from 'ink';
import type { PostView } from '@bsky/core';
import { PostItem, PostSkeleton } from './PostItem.js';

export interface PostListProps {
  posts: PostView[];
  loading: boolean;
  cursor?: string;
  selectedIndex: number;
  width: number;
}

export function PostList({ posts, loading, cursor, selectedIndex, width }: PostListProps) {
  return (
    <Box flexDirection="column" flexGrow={1}>
      {posts.length === 0 && !loading && (
        <Text dimColor>没有帖子。按 Enter 选中，按 a 打开 AI 面板。</Text>
      )}
      {posts.map((post, i) => (
        <PostItem
          key={post.uri}
          post={post}
          isSelected={i === selectedIndex}
          index={i}
          width={width - 1}
        />
      ))}
      {loading && posts.length === 0 && <PostSkeleton width={width - 1} />}
      {loading && posts.length > 0 && (
        <Box><Text color="yellow">⏳ 加载更多...</Text></Box>
      )}
    </Box>
  );
}
