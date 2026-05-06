import React from 'react';
import { Box, Text } from 'ink';
import type { ConvoView } from '@bsky/core';
import type { UseI18nReturn } from '@bsky/app';

interface DMListViewProps {
  convos: ConvoView[];
  loading: boolean;
  error: string | null;
  selectedIndex: number;
  width: number;
  height: number;
  currentDid: string;
  t: UseI18nReturn['t'];
}

export function DMListView({ convos, loading, error, selectedIndex, width, height, currentDid, t }: DMListViewProps) {
  if (loading) return <Text dimColor>{t('status.loading')}</Text>;
  if (error) return <Text color="red">{error}</Text>;
  if (convos.length === 0) return <Text dimColor>{t('dm.empty')}</Text>;

  const cols = process.stdout.columns || 80;

  return (
    <Box flexDirection="column">
      {convos.slice(0, height).map((convo, i) => {
        const isSel = i === selectedIndex;
        const members = convo.members || [];
        const other = members.find(m => m.did !== currentDid) ?? members[0];
        const name = other?.displayName || other?.handle || '?';
        const lastMsg = convo.lastMessage && 'text' in convo.lastMessage
          ? convo.lastMessage.text.slice(0, cols - name.length - 20)
          : '';
        const unread = convo.unreadCount > 0 ? ` ${convo.unreadCount}` : '';

        return (
          <Box key={convo.id} height={1}>
            <Text backgroundColor={isSel ? '#1e40af' : undefined} color={isSel ? 'cyanBright' : undefined}>
              {isSel ? '▶' : ' '}{' '}
              <Text color={isSel ? 'cyanBright' : undefined}>{name.slice(0, 20)}</Text>
              <Text dimColor={!isSel}>{lastMsg ? `: ${lastMsg}` : ''}</Text>
              {unread && <Text color="yellow">{unread}</Text>}
            </Text>
          </Box>
        );
      })}
    </Box>
  );
}
