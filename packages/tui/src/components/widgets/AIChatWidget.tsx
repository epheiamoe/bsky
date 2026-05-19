import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';
import TextInput from 'ink-text-input';
import type { BskyClient } from '@bsky/core';
import { useI18n } from '@bsky/app';

interface AIChatWidgetProps {
  client: BskyClient | null;
  goTo: (v: any) => void;
  onClose: () => void;
  cols: number;
  rows: number;
}

export function AIChatWidget({ client, goTo, onClose, cols, rows }: AIChatWidgetProps) {
  const [quickInput, setQuickInput] = useState('');
  const { t } = useI18n();
  const widgetW = Math.floor(cols * 0.75);

  useInput((input, key) => {
    if (key.escape) {
      onClose();
      return;
    }
  });

  return (
    <Box flexDirection="column" width={widgetW}>
      <Text bold color="cyan">{t('widget.aiChatTitle')}</Text>
      <Text dimColor>{t('widget.aiChatDesc')}</Text>
      <Box flexDirection="column" marginTop={1}>
        <Text color="green">{'▸ [Enter] ' + t('widget.openAIChat')}</Text>
        <Text dimColor>{'  ' + t('widget.startNewChat')}</Text>
      </Box>
      <Box flexDirection="column" marginTop={1} borderStyle="single" borderColor="gray" paddingX={1}>
        <Text dimColor>{t('widget.quickMessage')}</Text>
        <Box height={1}>
          <TextInput
            value={quickInput}
            onChange={setQuickInput}
            onSubmit={(value) => {
              if (value.trim()) {
                goTo({ type: 'aiChat', sessionId: crypto.randomUUID(), contextPost: undefined });
                onClose();
              }
            }}
          />
        </Box>
      </Box>
    </Box>
  );
}
