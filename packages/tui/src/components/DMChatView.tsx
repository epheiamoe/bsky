import React, { useState, useEffect, useRef } from 'react';
import { Box, Text, useInput } from 'ink';
import TextInput from 'ink-text-input';
import type { ChatMessage } from '@bsky/app';
import { useChatMessages, useI18n, getDmEmojiConfig } from '@bsky/app';
import type { BskyClient } from '@bsky/core';

interface DMChatViewProps {
  client: BskyClient;
  conversationId: string;
  goBack: () => void;
  cols: number;
}

export function DMChatView({ client, conversationId, goBack, cols }: DMChatViewProps) {
  const { t } = useI18n();
  const { messages, convo, loading, error, loadConvo, sendMessage, toggleReaction } = useChatMessages(client);
  const [input, setInput] = useState('');
  const [reactMode, setReactMode] = useState(false);
  const did = client.getDID();
  const emojis = getDmEmojiConfig();

  useEffect(() => { loadConvo(conversationId, true); }, [conversationId]);

  const rows = process.stdout.rows || 24;
  const availableRows = rows - (reactMode ? 9 : 6);

  const handleSend = async () => {
    const text = input.trim();
    if (!text) return;
    setInput('');
    await sendMessage(text);
  };

  useInput((_input, key) => {
    if (reactMode) {
      const n = parseInt(_input, 10);
      if (!isNaN(n) && n >= 1 && n <= emojis.length) {
        // React to the last message with selected emoji
        const lastMsg = [...messages].reverse().find(m => 'text' in m) as ChatMessage | undefined;
        if (lastMsg) {
          const emoji = emojis[n - 1]!;
          const hasMy = (lastMsg.reactions || []).some(r => r.sender.did === did && r.value === emoji);
          toggleReaction(lastMsg.id, emoji, hasMy);
        }
        setReactMode(false);
      } else {
        setReactMode(false);
      }
      return;
    }
    if (_input === 'e' && !key.ctrl && !key.meta) {
      setReactMode(true);
      return;
    }
  });

  const getMemberName = () => {
    if (!convo) return '';
    const members = convo.members || [];
    const other = members.find(m => m.did !== did) ?? members[0];
    return other?.displayName || other?.handle || '';
  };

  // Flatten messages into display lines
  const allLines: Array<{ text: string; color?: string; isOwn: boolean }> = [];
  for (const msg of messages) {
    if (!msg || !('text' in msg)) continue;
    const msgView = msg as ChatMessage;
    const own = msgView.sender.did === did;
    const sender = own ? 'you' : getMemberName().slice(0, 12);
    const prefix = own ? '  ' : '';
    const fullText = `${prefix}${sender}: ${msgView.text}`;
    const wrapped = wrapText(fullText, cols - 4);
    for (const line of wrapped) {
      allLines.push({ text: line, color: own ? 'cyan' : undefined, isOwn: own });
    }
    // Show reactions
    const reacts = msgView.reactions || [];
    if (reacts.length > 0) {
      const grouped: Record<string, number> = {};
      for (const r of reacts) grouped[r.value] = (grouped[r.value] || 0) + 1;
      const reactStr = Object.entries(grouped).map(([v, c]) => `${v}${c > 1 ? `${c}` : ''}`).join(' ');
      allLines.push({ text: `     ${reactStr}`, isOwn: false });
    }
  }

  const visibleLines = allLines.slice(Math.max(0, allLines.length - availableRows));

  return (
    <Box flexDirection="column" width={cols} borderStyle="single" borderColor="green" paddingX={1}>
      <Box height={1}>
        <Text bold color="green">💬 {getMemberName()}</Text>
        <Text dimColor> [Esc] {t('common.back')}</Text>
      </Box>

      {loading && <Text dimColor>{t('status.loading')}</Text>}
      {error && <Text color="red">{error}</Text>}

      {allLines.length > availableRows && (
        <Text dimColor>↑ {allLines.length - availableRows} lines</Text>
      )}

      <Box flexDirection="column" height={availableRows}>
        {visibleLines.map((line, i) => (
          <Box key={i} height={1}>
            <Text color={line.color}>{line.text}</Text>
          </Box>
        ))}
      </Box>

      {reactMode && (
        <Box height={2} flexDirection="column">
          <Text color="yellow">Select emoji to react to last message:</Text>
          <Text>
            {emojis.map((e, i) => `${i + 1}:${e}  `).join('')}
          </Text>
        </Box>
      )}

      <Box height={1}>
        <Text color="yellow">▸ </Text>
        <TextInput
          value={input}
          onChange={setInput}
          onSubmit={handleSend}
          placeholder={t('dm.placeholder')}
        />
      </Box>
    </Box>
  );
}

function wrapText(text: string, maxWidth: number): string[] {
  if (text.length <= maxWidth) return [text];
  const lines: string[] = [];
  let remaining = text;
  while (remaining.length > 0) {
    if (remaining.length <= maxWidth) {
      lines.push(remaining);
      break;
    }
    let breakAt = maxWidth;
    const lastSpace = remaining.lastIndexOf(' ', maxWidth);
    if (lastSpace > maxWidth / 2) breakAt = lastSpace;
    lines.push(remaining.slice(0, breakAt));
    remaining = remaining.slice(breakAt).trimStart();
  }
  return lines;
}
