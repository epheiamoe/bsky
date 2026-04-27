import React, { useState, useEffect } from 'react';
import { Box, Text } from 'ink';
import type { AIAssistant } from '@bsky/core';
import Spinner from 'ink-spinner';
import TextInput from 'ink-text-input';

export interface AIPanelProps {
  visible: boolean;
  assistant: AIAssistant | null;
  postContext?: string;
  onClose: () => void;
  onToggle?: () => void;
  focused: boolean;
  width: number;
}

interface AIMessage {
  role: 'user' | 'assistant';
  content: string;
}

export function AIPanel({ visible, assistant, postContext, onClose, focused, width }: AIPanelProps) {
  const [messages, setMessages] = useState<AIMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [guidingQuestions, setGuidingQuestions] = useState<string[]>([]);

  useEffect(() => {
    if (visible && postContext && guidingQuestions.length === 0 && messages.length === 0) {
      setGuidingQuestions(['总结这个讨论', '查看作者动态', '分析帖子情绪']);
    }
  }, [visible, postContext]);

  if (!visible) return null;

  const handleSend = async () => {
    if (!input.trim() || !assistant || loading) return;
    const userMsg = input.trim();
    setMessages(prev => [...prev, { role: 'user', content: userMsg }]);
    setInput('');
    setGuidingQuestions([]);
    setLoading(true);

    try {
      if (postContext && messages.length === 0) {
        assistant.addSystemMessage(
          `你是一个深度集成 Bluesky 的终端助手。用户正在查看帖子 ${postContext}，如果需要请用工具获取上下文。回答简练，适合终端显示。`
        );
      }
      const result = await assistant.sendMessage(userMsg);
      setMessages(prev => [...prev, { role: 'assistant', content: result.content }]);
    } catch (err) {
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: `Error: ${err instanceof Error ? err.message : String(err)}`,
      }]);
    } finally {
      setLoading(false);
    }
  };

  const borderColor = focused ? 'magentaBright' : 'magenta';

  return (
    <Box flexDirection="column" width={width} borderStyle="single" borderColor={borderColor} paddingX={1}>
      {/* Header */}
      <Box height={1}>
        <Text bold color={focused ? 'magentaBright' : 'magenta'}>
          {focused ? '🤖 AI [聚焦中]' : '🤖 AI'}
        </Text>
        <Text dimColor> [Esc 返回主面板 · Tab 切换焦点]</Text>
      </Box>

      {/* Guiding questions */}
      {guidingQuestions.length > 0 && (
        <Box flexDirection="column" marginTop={0}>
          <Text dimColor>快速提问：</Text>
          {guidingQuestions.map((q, i) => (
            <Text key={i} color="cyan">
              {'  '}[{i + 1}] {q}
            </Text>
          ))}
        </Box>
      )}

      {/* Messages */}
      <Box flexDirection="column" flexGrow={1} marginTop={0}>
        {messages.slice(-8).map((msg, i) => (
          <Box key={i} flexDirection="column" marginBottom={0}>
            <Text color={msg.role === 'user' ? 'green' : 'yellow'}>
              {msg.role === 'user' ? '▸ ' : '🤖 '}
              {msg.content.slice(0, width - 4)}
            </Text>
          </Box>
        ))}
        {loading && (
          <Box height={1}>
            <Text color="cyan">
              <Spinner type="dots" />
              {' AI 思考中...'}
            </Text>
          </Box>
        )}
      </Box>

      {/* Input — only active when focused */}
      <Box borderStyle="single" borderColor={focused ? 'magentaBright' : 'gray'} height={1}>
        <Text color={focused ? 'yellow' : 'gray'}>
          {focused ? '▸ ' : '· '}
        </Text>
        {focused ? (
          <TextInput
            value={input}
            onChange={setInput}
            onSubmit={handleSend}
            placeholder="输入消息，Enter 发送..."
          />
        ) : (
          <Text dimColor>按 Tab 聚焦此处输入</Text>
        )}
      </Box>
    </Box>
  );
}
