import React, { useState, useEffect } from 'react';
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
  isBookmarked: (uri: string) => boolean;
  toggleBookmark: (uri: string, cid: string) => Promise<void>;
}

export function UnifiedThreadView({ client, uri, goBack, goTo, refreshThread, cols, isBookmarked, toggleBookmark }: UnifiedThreadViewProps) {
  const { flatLines, loading, focusedIndex, focused, themeUri, likePost, repostPost, isLiked, isReposted } = useThread(client, uri);

  // Cursor = arrow movement target (highlighted in replies); focused = current post (only changes on Enter/h)
  const [cursorIndex, setCursorIndex] = useState(0);
  useEffect(() => { setCursorIndex(focusedIndex); }, [focusedIndex]);

  const [confirmRepost, setConfirmRepost] = useState<{ uri: string; handle: string } | null>(null);
  const [localLikeCounts, setLocalLikeCounts] = useState<Record<string, number>>({});
  const [yankedUri, setYankedUri] = useState<string | null>(null);

  const focusedUri = focused?.uri;
  const isTheme = focused?.isRoot && focused?.depth === 0;
  const focusedDepth = focused?.depth ?? 0;
  const cursorLine = flatLines[cursorIndex];

  // Theme posts = above focused, excluding focused itself
  const themeLines = flatLines.filter(l => l.depth < 0 || (l.depth === 0 && l.isRoot && l.uri !== focusedUri));
  // Replies = replies to focused (depth <= focusedDepth+1), excluding focused
  const replyLines = flatLines.filter(l => l.uri && l.depth > 0 && l.depth <= focusedDepth + 1 && l.uri !== focusedUri);

  const handleLike = async (uri: string, rkey: string) => {
    if (isLiked(uri)) return;
    setLocalLikeCounts(prev => ({ ...prev, [rkey]: (prev[rkey] ?? 0) + 1 }));
    await likePost(uri);
  };

  useInput((input, key) => {
    if (confirmRepost) {
      if (input === 'y' || input === 'Y') { void repostPost(confirmRepost.uri); setConfirmRepost(null); return; }
      if (input === 'n' || input === 'N') { setConfirmRepost(null); return; }
      return;
    }

    // Arrows/jk move cursor (highlight) only — don't change current post
    if (key.upArrow || input === 'k' || input === 'K') { setCursorIndex(i => Math.max(0, i - 1)); return; }
    if (key.downArrow || input === 'j' || input === 'J') { setCursorIndex(i => Math.min(flatLines.length - 1, i + 1)); return; }

    // Enter: make cursor line the NEW current post (full refocus)
    if (key.return && cursorLine?.uri) { refreshThread(cursorLine.uri); return; }

    // h: go back to theme post
    if ((input === 'h' || input === 'H') && themeUri) { refreshThread(themeUri); return; }

    // Actions on cursor line
    if (cursorLine?.uri) {
      if (input === 'l' || input === 'L') { void handleLike(cursorLine.uri, cursorLine.rkey); return; }
      if (input === 'r') { setConfirmRepost({ uri: cursorLine.uri, handle: cursorLine.handle }); return; }
      if (input === 'c' || input === 'C') { goTo({ type: 'compose', replyTo: cursorLine.uri }); return; }
      if (input === 'v') { void toggleBookmark(cursorLine.uri, cursorLine.cid); return; }
      if (input === 'y') {
        const rkey = cursorLine.uri.split('/').pop() ?? '';
        const url = `@${cursorLine.handle} ${cursorLine.uri} https://bsky.app/profile/${cursorLine.handle}/post/${rkey}`;
        setYankedUri(url);
        // Also write to stderr so it survives TUI exit
        process.stderr.write(`\n📋 ${url}\n`);
        setTimeout(() => setYankedUri(null), 5000);
        return;
      }
    }
  });

  if (loading && flatLines.length === 0) return <Box width={cols} borderStyle="single" borderColor="gray" paddingX={1}><Text dimColor>加载讨论串...</Text></Box>;

  const glc = (l: FlatLine) => l.likeCount + (localLikeCounts[l.rkey] ?? 0);

  return (
    <Box flexDirection="column" width={cols} borderStyle="single" borderColor="gray" paddingX={1}>
      <Box><Text bold color="cyan">🧵 讨论 - {isTheme ? '主题帖' : '回复'}</Text></Box>

      {/* ── Theme posts ── */}
      {themeLines.length > 0 && (
        <Box flexDirection="column" marginTop={0}>
          <Box><Text dimColor>── 讨论源 ──</Text></Box>
          {themeLines.map((line, i) => (
            <Box key={i} flexDirection="column" marginBottom={0}>
              <Box><Text>{line.displayName}</Text><Text dimColor>{' @'}{line.handle}</Text></Box>
              <Box><Text>{line.text}</Text></Box>
              <Box><Text dimColor>♥ {glc(line)}  ♺ {line.repostCount}  💬 {line.replyCount}</Text></Box>
            </Box>
          ))}
        </Box>
      )}

      {/* ── Current focused post ── */}
      {focused && (
        <Box flexDirection="column" marginTop={0}>
          <Box><Text dimColor>{isTheme ? '── 主题帖 ──' : '── 当前帖子 ──'}</Text></Box>
          <Box><Text backgroundColor="#1e40af" color="cyanBright" bold>{focused.displayName}</Text><Text backgroundColor="#1e40af" dimColor>{' @'}{focused.handle}</Text></Box>
          <Box><Text backgroundColor="#1e40af">{focused.text}</Text></Box>
          <Box>
            <Text dimColor>♥ {glc(focused)}  ♺ {focused.repostCount + (isReposted(focused.uri) ? 1 : 0)}  💬 {focused.replyCount}</Text>
            {isBookmarked(focused.uri) && <Text color="yellow">{'  🔖 已收藏'}</Text>}
            {focused.indexedAt && <Text dimColor>{' · '}{new Date(focused.indexedAt).toLocaleString('zh-CN', { month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit' })}</Text>}
          </Box>
        </Box>
      )}

      {/* ── Replies ── */}
      <Box flexDirection="column" marginTop={0}>
        <Box><Text dimColor>── 回复 ──</Text></Box>
        {replyLines.length === 0 && <Box><Text dimColor>  没有回复</Text></Box>}
        {replyLines.map((line, i) => {
          if (!line.uri) return <Box key={i}><Text dimColor>{'  '}{line.text}</Text></Box>;
          const isCursor = line.uri === cursorLine?.uri;
          const indent = '  '.repeat(Math.min(line.depth - 1, 3));
          return (
            <Box key={i} flexDirection="column" marginBottom={0}>
              <Box>
                <Text dimColor>{indent}↳ </Text>
                <Text backgroundColor={isCursor ? '#0e4a6e' : undefined} bold={isCursor}>{line.displayName}</Text>
                <Text dimColor>{' @'}{line.handle}</Text>
                <Text dimColor>{isCursor ? ' ← 光标' : ''}</Text>
                {line.hasReplies && <Text color="cyan">{' [+]'}</Text>}
              </Box>
              <Box><Text dimColor>{indent}{'  '}</Text><Text backgroundColor={isCursor ? '#0e4a6e' : undefined}>{line.text.replace(/\n/g, ' ').slice(0, 200)}</Text></Box>
              <Box><Text dimColor>{indent}{'  '}</Text><Text dimColor>♥ {glc(line)}  ♺ {line.repostCount}  💬 {line.replyCount}</Text></Box>
            </Box>
          );
        })}
      </Box>

      {/* ── Repost confirm ── */}
      {confirmRepost && (
        <Box flexDirection="column" borderStyle="double" borderColor="yellow" paddingX={1} marginTop={0}>
          <Text bold color="yellow">⚠ 确认转发 @{confirmRepost.handle} 的回复？</Text>
          <Box><Text color="green">[Y] 确认转发</Text><Text>{'  '}</Text><Text color="red">[N] 取消</Text></Box>
        </Box>
      )}

      {/* ── Yanked URI ── */}
      {yankedUri && (
        <Box flexDirection="column" borderStyle="single" borderColor="cyan" paddingX={1} marginTop={0}>
          <Text color="cyan" bold>📋 已复制到 stderr + 下方：</Text>
          <Text color="white">{yankedUri}</Text>
        </Box>
      )}
    </Box>
  );
}
