import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Box, Text, useInput } from 'ink';
import { useAIChat, useChatHistory, getDefaultStorage, useI18n } from '@bsky/app';
import type { BskyClient, AIConfig } from '@bsky/core';
import { wrapLines } from '../utils/text.js';
import { renderMarkdown } from '../utils/markdown.js';
import Spinner from 'ink-spinner';
import TextInput from 'ink-text-input';
import clipboard from 'clipboardy';

interface AIChatViewProps {
  client: BskyClient | null;
  aiConfig: AIConfig;
  sessionId?: string;
  contextPost?: string;
  contextProfile?: string;
  contextUri?: string;
  goTo: (v: any) => void;
  goBack: () => void;
  cols: number;
  rows: number;
  focused: boolean;
  userHandle?: string;
  locale?: string;
}

type PickMode = { type: 'copy' | 'edit'; buffer: string } | null;

export function AIChatView({ client, aiConfig, sessionId, contextPost, contextProfile, contextUri, goTo, goBack, cols, rows, focused, userHandle, locale: uiLocale }: AIChatViewProps) {
  const storage = getDefaultStorage();
  const [showHistory, setShowHistory] = useState(!contextUri && !sessionId);
  const isProfile = contextUri && !contextUri.startsWith('at://');
  const profileContext = contextProfile ?? (isProfile ? contextUri : undefined);
  const postContext = contextPost ?? (isProfile ? undefined : contextUri);
  const { messages, loading, guidingQuestions, send, pendingConfirmation, confirmAction, rejectAction, undoLastMessage, edit, editByIndex } = useAIChat(client, aiConfig, postContext, { chatId: sessionId, storage, userHandle, environment: 'tui', locale: uiLocale, contextProfile: profileContext, stream: true });
  const { conversations, deleteConversation } = useChatHistory(storage);
  const [input, setInput] = useState('');
  const [historyIdx, setHistoryIdx] = useState(0);
  const [scrollOffset, setScrollOffset] = useState(0);
  const [pickMode, setPickMode] = useState<PickMode>(null);
  const [lastCopied, setLastCopied] = useState(false);
  const prevMsgCount = useRef(0);
  const wasAtBottom = useRef(true);
  const { t, locale } = useI18n();
  const dateLocale = locale === 'zh' ? 'zh-CN' : locale === 'ja' ? 'ja-JP' : 'en-US';

  useEffect(() => { if (messages.length > 0) setShowHistory(false); }, [messages]);

  // Auto-clear "Copied" toast
  useEffect(() => { if (lastCopied) { const t = setTimeout(() => setLastCopied(false), 1500); return () => clearTimeout(t); } }, [lastCopied]);

  const handleSend = () => { if (input.trim() && !loading) { void send(input.trim()); setInput(''); } };

  const assistantMessages = useMemo(() => messages.filter(m => m.role === 'assistant'), [messages]);
  const userMessages = useMemo(() => messages.filter(m => m.role === 'user'), [messages]);

  // ── CJK-safe viewport with conditional auto-scroll ──
  const maxCols = Math.max(20, cols - 6);
  const baseMaxVisible = Math.max(10, rows - 6);
  const maxVisible = pickMode ? baseMaxVisible - Math.min(assistantMessages.length + 2, rows - 2) - 2 : baseMaxVisible;

  const allMessageLines = useMemo((): Array<string | React.ReactNode> => {
    const lines: Array<string | React.ReactNode> = [];
    for (const msg of messages) {
      const isError = (msg as any).isError === true;
      if (isError) {
        lines.push(<Text key={`err-${lines.length}`} color="red">❌ {msg.content}</Text>);
        continue;
      }
      if (msg.role === 'tool_call') {
        lines.push(`\u{1f527} ${t('ai.toolUsed')} ${msg.toolName ?? ''}`);
      } else if (msg.role === 'tool_result') {
        for (const l of wrapLines(msg.content, maxCols, 4)) {
          lines.push(`  \u21a1  ${l}`);
        }
      } else if (msg.role === 'thinking') {
        const prefix = '| Thinking: ';
        const contPrefix = '|           ';
        const innerWidth = Math.max(1, maxCols - 13);
        const wrapped = wrapLines(msg.content, innerWidth, 0);
        for (let i = 0; i < wrapped.length; i++) {
          const p = i === 0 ? prefix : contPrefix;
          lines.push(<Text key={`think-${lines.length}`} color="gray" dimColor>{p + wrapped[i]}</Text>);
        }
      } else if (msg.role === 'user') {
        for (const l of wrapLines(msg.content, maxCols, 2)) {
          lines.push('\u25b8 ' + l);
        }
      } else {
        lines.push(<Text key={`ml-${lines.length}`} color="cyan">🤖</Text>);
        const elements = renderMarkdown(msg.content);
        for (const el of elements) {
          lines.push(el);
        }
      }
      lines.push(' ');
    }
    if (loading) lines.push('... ' + t('ai.thinking'));
    return lines;
  }, [messages, loading, maxCols, t]);

  // Only auto-scroll to bottom if user was already at bottom
  const totalMsgCount = useMemo(() => messages.length, [messages]);
  useEffect(() => {
    if (totalMsgCount > prevMsgCount.current) {
      if (wasAtBottom.current) setScrollOffset(0);
    }
    prevMsgCount.current = totalMsgCount;
  }, [totalMsgCount]);

  useEffect(() => {
    wasAtBottom.current = scrollOffset === 0;
  }, [scrollOffset]);

  const viewStart = Math.max(0, allMessageLines.length - maxVisible - scrollOffset);
  const visibleLines = allMessageLines.slice(viewStart, viewStart + maxVisible);
  const canScrollUp = viewStart > 0;
  const canScrollDown = viewStart + maxVisible < allMessageLines.length;

  // Pick mode handlers
  const handlePickConfirm = () => {
    if (!pickMode) return;
    const idx = parseInt(pickMode.buffer, 10);
    if (isNaN(idx) || idx < 1) { setPickMode(null); return; }
    const i = idx - 1;

    if (pickMode.type === 'copy') {
      const target = assistantMessages[i];
      if (target) {
        try { clipboard.writeSync(target.content); setLastCopied(true); } catch (e) {}
      }
    } else if (pickMode.type === 'edit') {
      const target = userMessages[i];
      if (target) {
        const text = editByIndex(i);
        if (text) setInput(text);
      }
    }
    setPickMode(null);
  };

  // Main chat keys
  useInput((input, key) => {
    if (showHistory) return;

    if (pickMode) {
      if (key.escape) { setPickMode(null); return; }
      if (key.return) { handlePickConfirm(); return; }
      if (key.backspace || key.delete) {
        setPickMode(prev => prev ? { ...prev, buffer: prev.buffer.slice(0, -1) } : null);
        return;
      }
      if (/^[0-9]$/.test(input)) {
        setPickMode(prev => prev ? { ...prev, buffer: prev.buffer + input } : null);
        return;
      }
      return;
    }

    // Confirmation dialog active — only Y/N/Esc
    if (pendingConfirmation) {
      if (input === 'y' || input === 'Y' || key.return) { confirmAction(); return; }
      if (input === 'n' || input === 'N' || key.escape) { rejectAction(); return; }
      return;
    }
    // User is typing in the input box — let TextInput handle it
    if (focused) return;

    if (!loading) {
      if (input === 'a' || input === 'A') {
        if (assistantMessages.length > 0) setPickMode({ type: 'copy', buffer: '' });
        return;
      }
      if (input === 'r' || input === 'R') {
        if (userMessages.length > 0) setPickMode({ type: 'edit', buffer: '' });
        return;
      }
      if (input === 't' || input === 'T') {
        const transcript = messages
          .filter(m => m.role === 'user' || m.role === 'assistant')
          .map(m => `[${m.role === 'user' ? '▸' : '🤖'}] ${m.content}`)
          .join('\n\n');
        try { clipboard.writeSync(transcript); setLastCopied(true); } catch (e) {}
        return;
      }
    }
    const page = Math.floor(maxVisible * 0.7);
    if (key.pageUp) { setScrollOffset(s => Math.min(allMessageLines.length - maxVisible, s + page)); return; }
    if (key.pageDown) { setScrollOffset(s => Math.max(0, s - page)); return; }
    if (!focused) {
      if (key.upArrow) { setScrollOffset(s => Math.min(allMessageLines.length - maxVisible, s + 3)); return; }
      if (key.downArrow) { setScrollOffset(s => Math.max(0, s - 3)); return; }
    }
  });

  // History keyboard
  useInput((input, key) => {
    if (!showHistory) return;
    if (key.escape) { goBack(); return; }
    if (key.upArrow) { setHistoryIdx(i => Math.max(0, i - 1)); return; }
    if (key.downArrow) { setHistoryIdx(i => Math.min(conversations.length - 1, i + 1)); return; }
    if (input === 'n' || input === 'N') {
      goTo({ type: 'aiChat', sessionId: crypto.randomUUID() });
      setShowHistory(false);
      return;
    }
    if (input === 'l' || input === 'L') {
      const c = conversations[historyIdx];
      if (c) {
        goTo({ type: 'aiChat', sessionId: c.id });
        setShowHistory(false);
      }
      return;
    }
    if (input === 'd' || input === 'D') { const c = conversations[historyIdx]; if (c) { void deleteConversation(c.id); } return; }
  });

  // History view
  if (showHistory && conversations.length > 0 && messages.length === 0) {
    return (
      <Box flexDirection="column" width={cols} borderStyle="single" borderColor="magenta" paddingX={1}>
        <Box height={1}><Text bold color="magentaBright">{'🤖 '}{t('ai.history')}</Text><Text dimColor>{' '}{t('keys.aiHistory')}</Text></Box>
        <Box flexDirection="column" flexGrow={1}>
          {conversations.map((c, i) => (
            <Box key={c.id} height={1}>
              <Text color={i === historyIdx ? 'cyanBright' : undefined}>{i === historyIdx ? '▸' : ' '}</Text>
              <Text dimColor>{' '}{new Date(c.updatedAt).toLocaleDateString(dateLocale)}</Text>
              <Text>{' '}</Text>
              <Text color="yellow">{c.title.slice(0, 50)}</Text>
              <Text dimColor>{' ('}{c.messageCount} msg)</Text>
            </Box>
          ))}
        </Box>
        <Box marginTop={1}><Text dimColor>{t('ai.historyPath')}</Text></Box>
      </Box>
    );
  }

  return (
    <Box flexDirection="column" width={cols} borderStyle="single" borderColor={focused ? 'magentaBright' : 'magenta'} paddingX={1}>
      <Box height={1}>
        <Text bold color={focused ? 'magentaBright' : 'magenta'}>{'🤖 '}{t('ai.title')}{focused ? ' ' + t('ai.focused') : ''}</Text>
        <Text dimColor>{' '}{
          pickMode
            ? (pickMode.type === 'copy' ? t('ai.pickCopy') : t('ai.pickEdit')) + ` [${pickMode.buffer || '?'}]`
            : pendingConfirmation
              ? 'Y:确认 N:取消'
              : t('keys.aiChat') + ' a:复制 r:编辑 t:全部复制'
        }</Text>
      </Box>
      {lastCopied && <Box height={1}><Text color="green" bold>{'📋 '}{t('ai.copied')}</Text></Box>}
      {guidingQuestions.length > 0 && messages.length === 0 && (
        <Box flexDirection="column" marginTop={0}>
          <Text dimColor>{t('ai.quickQuestions')}</Text>
          {guidingQuestions.map((q, i) => <Text key={i} color="cyan">{'  '}[{i + 1}] {q}</Text>)}
        </Box>
      )}
      {/* ── Write confirmation banner ── */}
      {pendingConfirmation && (
        <Box flexDirection="column" borderStyle="double" borderColor="yellow" paddingX={1} marginTop={0}>
          <Text bold color="yellow">{'⚠ '}{t('ai.toolUsed')}: {pendingConfirmation.description}</Text>
          <Box><Text color="green">[Y/Enter] {t('action.confirm')}</Text><Text>{'  '}</Text><Text color="red">[N/Esc] {t('action.cancel')}</Text></Box>
        </Box>
      )}
      <Box flexDirection="column" flexGrow={1} marginTop={0}>
        {canScrollUp && (
          <Text dimColor color="cyan">{'↑ '}{t('ai.scrollAbove', { n: viewStart })}</Text>
        )}
        {visibleLines.map((line, i) => {
          if (typeof line === 'string') {
            return <Text key={viewStart + i} dimColor={line.startsWith('  ⮡') || line.startsWith('🔧')}>{line || ' '}</Text>;
          }
          return <React.Fragment key={viewStart + i}>{line}</React.Fragment>;
        })}
        {!canScrollDown && !canScrollUp && allMessageLines.length <= maxVisible && <Box flexGrow={1} />}
        {canScrollDown && (
          <Text dimColor color="cyan">{'↓ '}{t('ai.scrollBelow', { n: allMessageLines.length - viewStart - maxVisible })}</Text>
        )}
      </Box>
      {/* ── Pick mode overlay ── */}
      {pickMode && (
        <Box flexDirection="column" borderStyle="single" borderColor={focused ? 'magentaBright' : 'cyan'} paddingX={1} marginTop={0}>
          <Text dimColor>{pickMode.type === 'copy' ? t('ai.pickCopy') : t('ai.pickEdit')} — Esc:{t('action.cancel')}</Text>
          {(pickMode.type === 'copy' ? assistantMessages : userMessages).map((m, i) => {
            const preview = m.content.slice(0, 40).replace(/\n/g, ' ');
            const num = String(i + 1);
            const highlighted = pickMode.buffer === num;
            return (
              <Text key={i} color={highlighted ? 'cyan' : undefined}>
                {highlighted ? '▸' : ' '}[{num}] {preview}{m.content.length > 40 ? '…' : ''}
              </Text>
            );
          })}
        </Box>
      )}
      <Box borderStyle="single" borderColor={focused ? 'magentaBright' : 'gray'} height={1}>
        <Text color={focused ? 'yellow' : 'gray'}>{focused ? '▸ ' : '· '}</Text>
        {focused ? (
          <TextInput value={input} onChange={setInput} onSubmit={handleSend} placeholder={t('ai.placeholder')} />
        ) : (
          <Text dimColor>{t('ai.tabFocus')}</Text>
        )}
      </Box>
    </Box>
  );
}
