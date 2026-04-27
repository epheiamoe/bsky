import React, { useState, useEffect } from 'react';
import { Box, Text } from 'ink';
import { useAIChat } from '@bsky/app';
import type { BskyClient, AIConfig } from '@bsky/core';
import Spinner from 'ink-spinner';
import TextInput from 'ink-text-input';

interface AIChatViewProps {
  client: BskyClient | null;
  aiConfig: AIConfig;
  contextUri?: string;
  goBack: () => void;
  cols: number;
  rows: number;
  focused: boolean;
}

export function AIChatView({ client, aiConfig, contextUri, goBack, cols, rows, focused }: AIChatViewProps) {
  const { messages, loading, guidingQuestions, send } = useAIChat(client, aiConfig, contextUri);
  const [input, setInput] = useState('');

  useEffect(() => {
    const onData = (data: Buffer) => {
      for (const ch of data.toString()) {
        if (ch === '\x1b') { goBack(); return; }
      }
    };
    process.stdin.on('data', onData);
    return () => { process.stdin.off('data', onData); };
  }, [goBack]);

  const handleSend = () => {
    if (input.trim() && !loading) {
      void send(input.trim());
      setInput('');
    }
  };

  return (
    <Box flexDirection="column" width={cols} borderStyle="single" borderColor={focused ? 'magentaBright' : 'magenta'} paddingX={1}>
      <Box height={1}>
        <Text bold color={focused ? 'magentaBright' : 'magenta'}>
          🤖 AI 对话 {focused ? '[聚焦]' : ''}
        </Text>
        <Text dimColor> Esc 返回</Text>
      </Box>

      {guidingQuestions.length > 0 && messages.length === 0 && (
        <Box flexDirection="column" marginTop={0}>
          <Text dimColor>快速提问：</Text>
          {guidingQuestions.map((q, i) => (
            <Text key={i} color="cyan">{'  '}[{i + 1}] {q}</Text>
          ))}
        </Box>
      )}

      <Box flexDirection="column" flexGrow={1} marginTop={0}>
        {messages.slice(-10).map((msg, i) => (
          <Box key={i} flexDirection="column" marginBottom={0}>
            <Text color={msg.role === 'user' ? 'green' : 'yellow'}>
              {msg.role === 'user' ? '▸ ' : '🤖 '}
              {msg.content.slice(0, cols - 4)}
            </Text>
          </Box>
        ))}
        {loading && (
          <Box height={1}>
            <Text color="cyan"><Spinner type="dots" />{' AI 思考中...'}</Text>
          </Box>
        )}
      </Box>

      <Box borderStyle="single" borderColor={focused ? 'magentaBright' : 'gray'} height={1}>
        <Text color={focused ? 'yellow' : 'gray'}>{focused ? '▸ ' : '· '}</Text>
        {focused ? (
          <TextInput value={input} onChange={setInput} onSubmit={handleSend} placeholder="输入消息，Enter 发送..." />
        ) : (
          <Text dimColor>按 Tab 聚焦此处输入</Text>
        )}
      </Box>
    </Box>
  );
}
