import React from 'react';
import { Box, Text } from 'ink';
import type { BskyClient } from '@bsky/core';
import { useI18n } from '@bsky/app';

interface PolishWidgetProps {
  client: BskyClient | null;
  onClose: () => void;
  cols: number;
}

export function PolishWidget({ client, onClose, cols }: PolishWidgetProps) {
  const { t } = useI18n();
  const widgetW = Math.floor(cols * 0.75);

  return (
    <Box flexDirection="column" width={widgetW}>
      <Text bold color="cyan">{t('widget.polishTitle')}</Text>
      <Text dimColor>{t('widget.polishDesc')}</Text>
      <Box flexDirection="column" marginTop={1}>
        <Text dimColor>{t('widget.polishComposeOnly')}</Text>
        <Text dimColor>{t('widget.polishHint')}</Text>
      </Box>
    </Box>
  );
}
