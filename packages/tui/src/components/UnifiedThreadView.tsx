import React, { useState, useCallback } from 'react';
import { Box, Text, useInput } from 'ink';
import { useThread } from '@bsky/app';
import type { BskyClient } from '@bsky/core';
import type { FlatLine } from '@bsky/app';

interface UnifiedThreadViewProps {
  client: BskyClient | null;
  uri: string;
  goBack: () => void;
  goTo: (v: { type: string; replyTo?: string }) => void;
  refreshThread: (newUri: string) => void;
  cols: number;
}

export function UnifiedThreadView({ client, uri, goBack, goTo, refreshThread, cols }: UnifiedThreadViewProps) {
  const {
    flatLines, loading, focusedIndex, themeUri,
    focused, up, down,
    likePost, repostPost, isLiked, isReposted,
  } = useThread(client, uri);

  const [confirmRepost, setConfirmRepost] = useState<{ uri: string; handle: string } | null>(null);

  const focusedUri = focused?.uri;

  // Keyboard
  useInput((input, key) => {
    if (key.upArrow) { up(); return; }
    if (key.downArrow) { down(); return; }

    const k = input; // preserve case

    if (confirmRepost) {
      if (k === 'y' || k === 'Y') { void repostPost(confirmRepost.uri); setConfirmRepost(null); return; }
      if (k === 'n' || k === 'N') { setConfirmRepost(null); return; }
      return;
    }

    if (key.return) {
      if (focused?.uri) refreshThread(focused.uri);
      return;
    }

    if (k === 'h' || k === 'H') { if (themeUri) refreshThread(themeUri); return; }
    if (k === 'l' || k === 'L') { if (focused?.uri) void likePost(focused.uri); return; }
    if (k === 'r') { if (focused?.uri) setConfirmRepost({ uri: focused.uri, handle: focused.handle }); return; }
    if (k === 'R') { if (focused?.uri) goTo({ type: 'compose', replyTo: focused.uri }); return; }
    if (k === 'c') { if (focused?.uri) goTo({ type: 'compose', replyTo: focused.uri }); return; }
    if (k === 'j') { down(); return; }
    if (k === 'k') { up(); return; }
  });

  // Filter sections
  const currentDepth = focused?.depth ?? 0;
  const isTheme = focused?.isRoot && focused?.depth === 0;

  // Filter sections
  const themeLines = flatLines.filter(l => l.depth < 0 || (l.depth === 0 && l.isRoot));
  const replyLines = flatLines.filter(l => l.depth > 0 && l.depth <= currentDepth + 1);

  if (loading && flatLines.length === 0) {
    return (
      <Box width={cols} borderStyle="single" borderColor="gray" paddingX={1}>
        <Text dimColor>加载讨论串...</Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column" width={cols} borderStyle="single" borderColor="gray" paddingX={1}>
      {/* Header */}
      <Box>
        <Text bold color="cyan">
          🧵 讨论 - {isTheme ? '主题帖' : '回复'}
        </Text>
        <Text dimColor> Esc:返回</Text>
      </Box>

      {/* Theme posts (above current) */}
      {themeLines.length > 0 && (
        <Box flexDirection="column" marginTop={0}>
          <Box><Text dimColor>── 主题帖 ──</Text></Box>
          {themeLines.map((line, i) => {
            const isFocused = line.uri === focusedUri;
            return (
              <Box key={i} flexDirection="column" marginBottom={0}>
                <Box>
                  <Text color="gray">│ </Text>
                  <Text backgroundColor={isFocused ? '#1e40af' : undefined} bold={isFocused}>{line.displayName}</Text>
                  <Text dimColor>{' @'}{line.handle}</Text>
                  {line.mediaTags.length > 0 && <Text dimColor>{' '}{line.mediaTags.join(' ')}</Text>}
                </Box>
                <Box>
                  <Text color="gray">│ </Text>
                  <Text backgroundColor={isFocused ? '#1e40af' : undefined}>
                    {isFocused || !line.isRoot ? line.text : line.text}
                  </Text>
                </Box>
                <Box>
                  <Text color="gray">│ </Text>
                  <Text dimColor>♥ {line.likeCount}  ♺ {line.repostCount}  💬 {line.replyCount}</Text>
                  {line.indexedAt && <Text dimColor>{' · '}{new Date(line.indexedAt).toLocaleString('zh-CN', { month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit' })}</Text>}
                </Box>
              </Box>
            );
          })}
        </Box>
      )}

      {/* Current post (focused) */}
      {focused && (
        <Box flexDirection="column" marginTop={0}>
          <Box><Text dimColor>{isTheme ? '── 主题帖 ──' : '── 当前帖子 ──'}</Text></Box>
          <Box>
            <Text color="cyanBright">▐ </Text>
            <Text backgroundColor="#1e40af" color="cyanBright" bold>{focused.displayName}</Text>
            <Text backgroundColor="#1e40af" dimColor>{' @'}{focused.handle}</Text>
            {focused.mediaTags.length > 0 && <Text dimColor>{' '}{focused.mediaTags.join(' ')}</Text>}
          </Box>
          <Box>
            <Text color="cyanBright">▐ </Text>
            <Text backgroundColor="#1e40af">{focused.text}</Text>
          </Box>
          <Box>
            <Text color="cyanBright">▐ </Text>
            <Text dimColor>♥ {focused.likeCount}  ♺ {focused.repostCount}  💬 {focused.replyCount}</Text>
            {focused.indexedAt && <Text dimColor>{' · '}{new Date(focused.indexedAt).toLocaleString('zh-CN', { month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit' })}</Text>}
          </Box>
        </Box>
      )}

      {/* Replies */}
      <Box flexDirection="column" marginTop={0}>
        <Box><Text dimColor>── 回复 ──</Text></Box>
        {replyLines.length === 0 && <Box><Text dimColor>  没有回复</Text></Box>}
        {replyLines.map((line, i) => {
          if (!line.uri) {
            // Placeholder line
            return <Box key={i}><Text dimColor>{'  '}{line.text}</Text></Box>;
          }
          const isFocused = line.uri === focusedUri;
          const indent = '  '.repeat(Math.min(line.depth - 1, 3));
          const arrow = '↳ ';
          return (
            <Box key={i} flexDirection="column" marginBottom={0}>
              <Box>
                <Text color="gray">{indent}{'│ '}</Text>
                <Text backgroundColor={isFocused ? '#1e40af' : undefined} bold={isFocused}>{line.displayName}</Text>
                <Text dimColor>{' @'}{line.handle}</Text>
                {line.hasReplies && <Text color="cyan">{' [+]'}</Text>}
              </Box>
              <Box>
                <Text color="gray">{indent}{'│ '}</Text>
                <Text backgroundColor={isFocused ? '#1e40af' : undefined}>{line.text}</Text>
              </Box>
              <Box>
                <Text color="gray">{indent}{'│ '}</Text>
                <Text dimColor>♥ {line.likeCount}  ♺ {line.repostCount}  💬 {line.replyCount}</Text>
              </Box>
            </Box>
          );
        })}
      </Box>

      {/* Repost confirmation */}
      {confirmRepost && (
        <Box flexDirection="column" borderStyle="double" borderColor="yellow" paddingX={1} marginTop={0}>
          <Text bold color="yellow">⚠ 确认转发 @{confirmRepost.handle} 的回复？</Text>
          <Box><Text color="green">[Y] 确认转发</Text><Text>{'  '}</Text><Text color="red">[N] 取消</Text></Box>
        </Box>
      )}

      {/* Footer */}
      <Box marginTop={1}>
        <Text dimColor>
          h:回到主题帖 ↑↓/jk:移动 Enter:聚焦 R:回复 l:赞 r:转发
          {confirmRepost && <Text color="yellow">{' Y/N:确认/取消'}</Text>}
        </Text>
      </Box>
    </Box>
  );
}
