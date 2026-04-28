import React, { useState, useEffect, useMemo } from 'react';
import { Box, Text, useInput } from 'ink';
import { useAIChat, useChatHistory, getDefaultStorage } from '@bsky/app';
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
  const [showHistory, setShowHistory] = useState(!contextUri);
  const { messages, loading, guidingQuestions, send } = useAIChat(client, aiConfig, contextUri, { chatId, storage });
  const { conversations, deleteConversation, refresh: refreshHistory } = useChatHistory(storage);
  const [input, setInput] = useState('');
  const [historyIdx, setHistoryIdx] = useState(0);

  useEffect(() => { if (messages.length > 0) setShowHistory(false); }, [messages]);

  const handleSend = () => { if (input.trim() && !loading) { void send(input.trim()); setInput(''); } };

  // ── Viewport: pre-compute message lines ──
  const allMessageLines = useMemo(() => {
    const lines: string[] = [];
    const maxChars = Math.max(30, cols - 4);
    for (const msg of messages) {
      if (msg.role === 'tool_call') {
        lines.push(`🔧 使用了 ${msg.toolName ?? ''}`);
      } else if (msg.role === 'tool_result') {
        // Wrap long tool results
        const prefix = '  ⮡  ';
        let remaining = prefix + msg.content;
        while (remaining.length > 0) {
          if (remaining.length <= maxChars) { lines.push(remaining); break; }
          lines.push(remaining.slice(0, maxChars));
          remaining = remaining.slice(maxChars);
        }
      } else {
        // User/assistant message - wrap to width
        const prefix = msg.role === 'user' ? '▸ ' : '🤖 ';
        let remaining = prefix + msg.content;
        while (remaining.length > 0) {
          if (remaining.length <= maxChars) { lines.push(remaining); break; }
          // Try to break at space near maxChars
          let bp = maxChars;
          for (let j = maxChars; j > maxChars - 30 && j > 0; j--) {
            if (remaining[j] === ' ') { bp = j + 1; break; }
          }
          lines.push(remaining.slice(0, bp));
          remaining = remaining.slice(bp);
        }
      }
      // Blank separator between messages
      lines.push('');
    }
    if (loading) lines.push('... AI 思考中 ...');
    return lines;
  }, [messages, loading, cols]);

  // Viewport range
  const maxVisible = Math.max(10, rows - 6);
  const viewStart = Math.max(0, allMessageLines.length - maxVisible);
  const visibleLines = allMessageLines.slice(viewStart, viewStart + maxVisible);

  // History keyboard
  useInput((input, key) => {
    if (!showHistory) return;
    if (key.escape) { goBack(); return; }
    if (key.upArrow) { setHistoryIdx(i => Math.max(0, i - 1)); return; }
    if (key.downArrow) { setHistoryIdx(i => Math.min(conversations.length - 1, i + 1)); return; }
    if (input === 'n' || input === 'N') { setChatId(undefined); setShowHistory(false); return; }
    if (input === 'l' || input === 'L') { const c = conversations[historyIdx]; if (c) { setChatId(c.id); setShowHistory(false); } return; }
    if (input === 'd' || input === 'D') { const c = conversations[historyIdx]; if (c) { void deleteConversation(c.id); } return; }
  });

  // History view
  if (showHistory && conversations.length > 0 && messages.length === 0) {
    return (
      <Box flexDirection="column" width={cols} borderStyle="single" borderColor="magenta" paddingX={1}>
        <Box height={1}><Text bold color="magentaBright">🤖 AI 对话历史</Text><Text dimColor> Esc 返回 ↑↓:选 N:新建 L:加载 D:删除</Text></Box>
        <Box flexDirection="column" flexGrow={1}>
          {conversations.map((c, i) => (
            <Box key={c.id} height={1}>
              <Text color={i === historyIdx ? 'cyanBright' : undefined}>{i === historyIdx ? '▸' : ' '}</Text>
              <Text dimColor>{' '}{new Date(c.updatedAt).toLocaleDateString('zh-CN')}</Text>
              <Text>{' '}</Text>
              <Text color="yellow">{c.title.slice(0, 50)}</Text>
              <Text dimColor>{' ('}{c.messageCount} msg)</Text>
            </Box>
          ))}
        </Box>
        <Box marginTop={1}><Text dimColor>历史在 ~/.bsky-tui/chats/</Text></Box>
      </Box>
    );
  }

  // Chat view
  return (
    <Box flexDirection="column" width={cols} borderStyle="single" borderColor={focused ? 'magentaBright' : 'magenta'} paddingX={1}>
      <Box height={1}>
        <Text bold color={focused ? 'magentaBright' : 'magenta'}>🤖 AI 对话{focused ? ' [聚焦]' : ''}</Text>
        <Text dimColor> Esc 返回</Text>
      </Box>
      {guidingQuestions.length > 0 && messages.length === 0 && (
        <Box flexDirection="column" marginTop={0}>
          <Text dimColor>快速提问：</Text>
          {guidingQuestions.map((q, i) => <Text key={i} color="cyan">{'  '}[{i + 1}] {q}</Text>)}
        </Box>
      )}
      {/* Messages as flat Text lines — no Box nesting */}
      <Box flexDirection="column" flexGrow={1} marginTop={0}>
        {allMessageLines.length > maxVisible && (
          <Text dimColor color="cyan">{`↑ ${allMessageLines.length - maxVisible} 行在上方`}</Text>
        )}
        {visibleLines.map((line, i) => (
          <Text key={viewStart + i} dimColor={line.startsWith('  ⮡') || line.startsWith('🔧')}>
            {line || ' '}
          </Text>
        ))}
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
