import React, { useState, useEffect } from 'react';
import { Box, Text } from 'ink';
import { useAIChat, useChatHistory, getDefaultStorage } from '@bsky/app';
import type { AppView } from '@bsky/app';
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
  const storage = getDefaultStorage();
  const [chatId, setChatId] = useState<string | undefined>();
  const [showHistory, setShowHistory] = useState(true);
  const { messages, loading, guidingQuestions, send, chatId: currentChatId } = useAIChat(
    client, aiConfig, contextUri, { chatId, storage },
  );
  const { conversations, deleteConversation, refresh: refreshHistory } = useChatHistory(storage);
  const [input, setInput] = useState('');

  // Keep showHistory in sync - hide when conversation has messages
  useEffect(() => {
    if (messages.length > 0) setShowHistory(false);
  }, [messages]);

  const handleSend = () => {
    if (input.trim() && !loading) {
      void send(input.trim());
      setInput('');
    }
  };

  const loadConversation = (id: string) => {
    setChatId(id);
    setShowHistory(false);
  };

  const newConversation = () => {
    setChatId(undefined);
    setShowHistory(false);
  };

  if (showHistory && conversations.length > 0 && messages.length === 0) {
    return (
      <Box flexDirection="column" width={cols} borderStyle="single" borderColor="magenta" paddingX={1}>
        <Box height={1}><Text bold color="magentaBright">🤖 AI 对话历史</Text><Text dimColor> Esc 返回</Text></Box>
        <Box height={1}>
          <Text color="cyan">[N] 新建对话</Text><Text>  </Text>
        </Box>
        <Box flexDirection="column" flexGrow={1} marginTop={0}>
          {conversations.map((c) => (
            <Box key={c.id} height={1}>
              <Text dimColor>{new Date(c.updatedAt).toLocaleDateString('zh-CN')}</Text>
              <Text>{' '}</Text>
              <Text color="yellow">{c.title.slice(0, 50)}</Text>
              <Text dimColor>{' ('}{c.messageCount} msg)</Text>
              <Text color="cyan">{' [L]'}</Text>
              <Text color="red">{' [D]'}</Text>
            </Box>
          ))}
        </Box>
        <Box marginTop={1}><Text dimColor>历史保存在 ~/.bsky-tui/chats/ 目录</Text></Box>
      </Box>
    );
  }

  return (
    <Box flexDirection="column" width={cols} borderStyle="single" borderColor={focused ? 'magentaBright' : 'magenta'} paddingX={1}>
      <Box height={1}>
        <Text bold color={focused ? 'magentaBright' : 'magenta'}>🤖 AI 对话{focused ? ' [聚焦]' : ''}</Text>
        <Text dimColor> Esc 返回  Esc 2x 退出</Text>
      </Box>

      {guidingQuestions.length > 0 && messages.length === 0 && (
        <Box flexDirection="column" marginTop={0}>
          <Text dimColor>快速提问：</Text>
          {guidingQuestions.map((q, i) => <Text key={i} color="cyan">{'  '}[{i + 1}] {q}</Text>)}
        </Box>
      )}

      <Box flexDirection="column" flexGrow={1} marginTop={0}>
        {messages.map((msg, i) => {
          if (msg.role === 'tool_call') {
            return (
              <Box key={i} flexDirection="column" marginBottom={1}>
                <Text color="cyan" dimColor>🔧 使用了 {msg.toolName ?? ''}</Text>
              </Box>
            );
          }
          if (msg.role === 'tool_result') {
            return (
              <Box key={i} flexDirection="column" marginBottom={1}>
                <Text color="cyan" dimColor>  ⮡  {msg.content}</Text>
              </Box>
            );
          }
          return (
            <Box key={i} flexDirection="column" marginBottom={1}>
              <Text color={msg.role === 'user' ? 'green' : 'yellow'}>
                {msg.role === 'user' ? '▸ ' : '🤖 '}{msg.content}
              </Text>
            </Box>
          );
        })}
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
