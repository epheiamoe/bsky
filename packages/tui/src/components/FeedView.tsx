import React, { useState, useEffect } from 'react';
import { Box, Text } from 'ink';
import { useTimeline } from '@bsky/app';
import type { AppView } from '@bsky/app';
import type { BskyClient } from '@bsky/core';
import { PostList } from './PostList.jsx';

interface FeedViewProps {
  client: BskyClient | null;
  goTo: (v: AppView) => void;
  cols: number;
  rows: number;
  isRawModeSupported: boolean;
}

export function FeedView({ client, goTo, cols, rows, isRawModeSupported }: FeedViewProps) {
  const { posts, loading, cursor, loadMore, refresh } = useTimeline(client);
  const [selectedIndex, setSelectedIndex] = useState(0);

  useEffect(() => {
    if (!isRawModeSupported) return;
    let escSeq = '';
    const onData = (data: Buffer) => {
      for (const ch of data.toString()) {
        if (escSeq) {
          escSeq += ch;
          if (escSeq.startsWith('\x1b[') && escSeq.length >= 3) {
            if (ch === 'A') { setSelectedIndex(i => Math.max(0, i - 1)); escSeq = ''; continue; }
            if (ch === 'B') { setSelectedIndex(i => Math.min(posts.length - 1, i + 1)); escSeq = ''; continue; }
            if (ch >= '0' && ch <= '9' || ch === ';') continue;
            escSeq = '';
          }
          if (escSeq.length > 6) escSeq = '';
          continue;
        }
        if (ch === '\x1b') { escSeq = '\x1b'; continue; }
        const key = ch.toLowerCase();
        if (ch === '\r' || ch === '\n') {
          const p = posts[selectedIndex];
          if (p) goTo({ type: 'detail', uri: p.uri });
          continue;
        }
        if (key === 'j') { setSelectedIndex(i => Math.min(posts.length - 1, i + 1)); continue; }
        if (key === 'k') { setSelectedIndex(i => Math.max(0, i - 1)); continue; }
        if (key === 'm' && loadMore) { void loadMore(); continue; }
        if (key === 'r' && refresh) { void refresh(); continue; }
      }
    };
    process.stdin.on('data', onData);
    return () => { process.stdin.off('data', onData); };
  }, [posts.length, selectedIndex, loadMore, refresh, isRawModeSupported]);

  return (
    <Box flexDirection="column" width={cols} borderStyle="single" borderColor="gray" paddingX={1}>
      <Box height={1}>
        <Text bold>📋 时间线</Text>
        <Text dimColor>{' ↑↓/jk:导航 Enter:详情 m:更多 r:刷新'}</Text>
      </Box>
      <PostList posts={posts} loading={loading} cursor={cursor} selectedIndex={selectedIndex} focusedPanel="main" showAIPanel={false} width={cols - 4} height={rows - 5} />
    </Box>
  );
}
