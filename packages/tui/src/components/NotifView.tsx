import React, { useEffect } from 'react';
import { Box, Text } from 'ink';
import { useNotifications } from '@bsky/app';
import type { BskyClient } from '@bsky/core';

interface NotifViewProps {
  client: BskyClient | null;
  goBack: () => void;
  cols: number;
}

export function NotifView({ client, goBack, cols }: NotifViewProps) {
  const { notifications, loading, refresh } = useNotifications(client);

  useEffect(() => {
    const onData = (data: Buffer) => {
      for (const ch of data.toString()) {
        if (ch === '\x1b') goBack();
        if (ch.toLowerCase() === 'r') refresh;
      }
    };
    process.stdin.on('data', onData);
    return () => { process.stdin.off('data', onData); };
  }, [goBack, refresh]);

  if (loading) {
    return <Box width={cols} borderStyle="single" borderColor="gray" paddingX={1}><Text dimColor>加载通知...</Text></Box>;
  }

  return (
    <Box flexDirection="column" width={cols} borderStyle="single" borderColor="gray" paddingX={1}>
      <Box height={1}>
        <Text bold>🔔 通知</Text>
        <Text dimColor>{' ('}{notifications.length}{' 条) Esc 返回  R 刷新'}</Text>
      </Box>
      {notifications.length === 0 && <Text dimColor>暂无通知</Text>}
      {notifications.map((n, i) => (
        <Box key={i} height={1}>
          <Text color={n.isRead ? undefined : 'cyan'}>
            {n.isRead ? '○' : '●'}
          </Text>
          <Text color="green">{' '}{n.author?.handle ?? ''}</Text>
          <Text>{' '}{reasonLabel(n.reason)}</Text>
          <Text dimColor>{' · '}{n.indexedAt ? new Date(n.indexedAt).toLocaleString('zh-CN') : ''}</Text>
        </Box>
      ))}
    </Box>
  );
}

function reasonLabel(reason: string): string {
  const labels: Record<string, string> = {
    like: '赞了你的帖子', repost: '转发了你的帖子', follow: '关注了你',
    mention: '提到了你', reply: '回复了你', quote: '引用了你的帖子',
  };
  return labels[reason] ?? reason;
}
