import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';
import { useNotifications } from '@bsky/app';
import type { BskyClient } from '@bsky/core';
import type { AppView } from '@bsky/app';

interface NotifViewProps {
  client: BskyClient | null;
  goBack: () => void;
  goTo: (v: AppView) => void;
  cols: number;
}

export function NotifView({ client, goBack, goTo, cols }: NotifViewProps) {
  const { notifications, loading, refresh } = useNotifications(client);
  const [cursorIdx, setCursorIdx] = useState(0);

  useInput((input, key) => {
    if (key.escape) { goBack(); return; }
    if (key.upArrow || input === 'k') { setCursorIdx(i => Math.max(0, i - 1)); return; }
    if (key.downArrow || input === 'j') { setCursorIdx(i => Math.min(notifications.length - 1, i + 1)); return; }
    if (input === 'r' || input === 'R') { void refresh(); return; }
    if (key.return) {
      const n = notifications[cursorIdx];
      if (n?.reasonSubject) {
        goTo({ type: 'thread', uri: n.reasonSubject });
      }
      return;
    }
  });

  if (loading) {
    return <Box width={cols} borderStyle="single" borderColor="gray" paddingX={1}><Text dimColor>加载通知...</Text></Box>;
  }

  return (
    <Box flexDirection="column" width={cols} borderStyle="single" borderColor="gray" paddingX={1}>
      <Box height={1}>
        <Text bold>🔔 通知</Text>
        <Text dimColor>{' ('}{notifications.length}{' 条) ↑↓/jk:导航 Enter:查看帖子 R:刷新'}</Text>
      </Box>
      {notifications.length === 0 && <Text dimColor>暂无通知</Text>}
      {notifications.map((n, i) => {
        const isSel = i === cursorIdx;
        const preview = getNotificationPreview(n);
        return (
          <Box key={i} flexDirection="column">
            <Box height={1}>
              <Text
                backgroundColor={isSel ? '#1e40af' : undefined}
                color={isSel ? 'cyanBright' : n.isRead ? undefined : 'cyan'}
              >
                {isSel ? '▶' : ' '}{n.isRead ? '○' : '●'}
              </Text>
              <Text color="green" backgroundColor={isSel ? '#1e40af' : undefined}> {n.author?.handle ?? ''}</Text>
              <Text backgroundColor={isSel ? '#1e40af' : undefined}> {reasonLabel(n.reason)}</Text>
              <Text dimColor backgroundColor={isSel ? '#1e40af' : undefined}>{' · '}{n.indexedAt ? new Date(n.indexedAt).toLocaleString('zh-CN') : ''}</Text>
            </Box>
            {preview && (
              <Box height={1}>
                <Text dimColor>  {preview}</Text>
              </Box>
            )}
          </Box>
        );
      })}
    </Box>
  );
}

function getNotificationPreview(n: { reason?: string; reasonSubject?: string }): string | null {
  // TUI can't fetch the post text without an API call, but we can show the reason
  // For now, show a hint that Enter will open the post
  if (n.reasonSubject) return '↳ 按 Enter 查看帖子';
  return null;
}

function reasonLabel(reason: string): string {
  const labels: Record<string, string> = {
    like: '赞了你的帖子', repost: '转发了你的帖子', follow: '关注了你',
    mention: '提到了你', reply: '回复了你', quote: '引用了你的帖子',
  };
  return labels[reason] ?? reason;
}
