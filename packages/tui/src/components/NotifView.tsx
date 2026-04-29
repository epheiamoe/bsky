import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';
import { useNotifications, useI18n } from '@bsky/app';
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
  const { t, locale } = useI18n();
  const dateLocale = locale === 'zh' ? 'zh-CN' : locale === 'ja' ? 'ja-JP' : 'en-US';

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
    return <Box width={cols} borderStyle="single" borderColor="gray" paddingX={1}><Text dimColor>{t('status.loading')}</Text></Box>;
  }

  return (
    <Box flexDirection="column" width={cols} borderStyle="single" borderColor="gray" paddingX={1}>
      <Box height={1}>
        <Text bold>{'🔔 '}{t('notifications.title')}</Text>
        <Text dimColor>{' ('}{notifications.length}{t('notifications.count')}{') '}{t('keys.notifications')}</Text>
      </Box>
      {notifications.length === 0 && <Text dimColor>{t('notifications.empty')}</Text>}
      {notifications.map((n, i) => {
        const isSel = i === cursorIdx;
        const preview = getNotificationPreview(n, t);
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
              <Text backgroundColor={isSel ? '#1e40af' : undefined}> {reasonLabel(n.reason, t)}</Text>
              <Text dimColor backgroundColor={isSel ? '#1e40af' : undefined}>{' · '}{n.indexedAt ? new Date(n.indexedAt).toLocaleString(dateLocale) : ''}</Text>
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

function getNotificationPreview(n: { reason?: string; reasonSubject?: string }, t: (k: string) => string): string | null {
  if (n.reasonSubject) return '↳ ' + t('notifications.viewPostHint');
  return null;
}

function reasonLabel(reason: string, t: (k: string) => string): string {
  const key = 'notifications.reason.' + reason;
  const label = t(key);
  return label !== key ? label : reason;
}
