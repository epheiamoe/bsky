import React, { useState, useEffect } from 'react';
import { Box, Text } from 'ink';
import TextInput from 'ink-text-input';
import { useCompose } from '@bsky/app';
import type { BskyClient } from '@bsky/core';

interface ComposeViewProps {
  client: BskyClient | null;
  replyTo?: string;
  goBack: () => void;
  cols: number;
}

export function ComposeView({ client, replyTo, goBack, cols }: ComposeViewProps) {
  const { draft, setDraft, submitting, error, submit } = useCompose(client, goBack);

  useEffect(() => {
    const onData = (data: Buffer) => {
      for (const ch of data.toString()) {
        if (ch === '\x1b') goBack();
      }
    };
    process.stdin.on('data', onData);
    return () => { process.stdin.off('data', onData); };
  }, [goBack]);

  const remaining = 300 - draft.length;
  const counterColor = remaining < 20 ? 'red' : remaining < 50 ? 'yellow' : undefined;

  return (
    <Box flexDirection="column" width={cols} borderStyle="single" borderColor="yellow" paddingX={2} paddingY={1}>
      <Box height={1}>
        <Text bold color="yellow">✏️ {replyTo ? '回复' : '发帖'}</Text>
        <Text dimColor>{' Enter 发送 · Esc 取消 · 最多 300 字符'}</Text>
      </Box>

      {replyTo && (
        <Box marginTop={0}>
          <Text dimColor>回复: </Text>
          <Text color="blue">{replyTo}</Text>
        </Box>
      )}

      <Box borderStyle="single" borderColor="gray" padding={1} marginTop={0}>
        <TextInput
          value={draft}
          onChange={setDraft}
          onSubmit={() => {
            if (draft.trim()) { void submit(draft.trim(), replyTo); }
          }}
          placeholder={replyTo ? '想回复什么...' : '此刻的想法...'}
        />
      </Box>

      <Box height={1}>
        <Text color={counterColor}>{draft.length}/300</Text>
        {draft.length > 280 && <Text color="yellow"> ⚠ 接近上限</Text>}
        {submitting && <Text color="cyan"> 发送中...</Text>}
        {error && <Text color="red">{' '}{error}</Text>}
      </Box>
    </Box>
  );
}
