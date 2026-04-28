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

export function PostList({ posts, loading, selectedIndex, width }: PostListProps) {
  return (
    <Box flexDirection="column" flexGrow={1}>
      {posts.length === 0 && !loading && (
        <Text dimColor>没有帖子。按 Enter 查看帖子。</Text>
      )}
      {posts.map((post, i) => (
        <Box key={post.uri}>
          <PostItem
            post={post}
            isSelected={i === selectedIndex}
            index={i}
            width={width}
          />
        </Box>
      ))}
      {loading && posts.length === 0 && (
        <PostSkeleton />
      )}
      {loading && posts.length > 0 && (
        <Text color="yellow">⏳ 加载更多...</Text>
      )}
    </Box>
  );
}
