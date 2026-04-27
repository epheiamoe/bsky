import React from 'react';
import { Box, Text } from 'ink';
import type { PostView } from '@bsky/core';
import { PostItem, PostSkeleton } from './PostItem.js';

export interface PostListProps {
  posts: PostView[];
  loading: boolean;
  cursor?: string;
  selectedIndex: number;
  focusedPanel: string;
  showAIPanel: boolean;
  width: number;
  height: number;
}

export function PostList({
  posts, loading, cursor, selectedIndex, focusedPanel, showAIPanel, width, height,
}: PostListProps) {
  const maxVisible = Math.max(1, height - 3);
  const totalPages = Math.max(1, Math.ceil(posts.length / maxVisible));
  const currentPage = Math.floor(selectedIndex / maxVisible) + 1;
  const startIdx = (currentPage - 1) * maxVisible;
  const visiblePosts = posts.slice(startIdx, startIdx + maxVisible);

  // Scrollbar
  const barLen = Math.max(1, Math.floor((maxVisible / Math.max(1, posts.length)) * maxVisible));
  const barPos = Math.min(maxVisible - barLen, Math.floor((startIdx / Math.max(1, posts.length)) * maxVisible));
  const scrollBar = '█'.repeat(barLen).padStart(barPos + barLen, '░').padEnd(maxVisible, '░');

  return (
    <Box flexDirection="row" width={width} flexGrow={1}>
      {/* Post content */}
      <Box flexDirection="column" flexGrow={1}>
        {posts.length === 0 && !loading && (
          <Text dimColor>没有帖子。按 a 打开 AI 面板，或按 Ctrl+G。</Text>
        )}
        {visiblePosts.map((post) => {
          const globalIdx = posts.indexOf(post);
          return (
            <PostItem
              key={post.uri}
              post={post}
              isSelected={globalIdx === selectedIndex}
              index={globalIdx}
              width={width - 3}
            />
          );
        })}
        {loading && posts.length === 0 && <PostSkeleton width={width - 3} />}
        {loading && posts.length > 0 && (
          <Box height={1}>
            <Text color="yellow">⏳ 加载更多...</Text>
          </Box>
        )}
      </Box>

      {/* Scrollbar */}
      <Box flexDirection="column" width={1} marginLeft={0}>
        {scrollBar.split('').map((ch, i) => (
          <Text key={i} color={ch === '█' ? 'cyan' : 'gray'} dimColor={ch !== '█'}>
            {ch}
          </Text>
        ))}
      </Box>
    </Box>
  );
}
