import React, { useState } from 'react';
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
  const [localLikeCounts, setLocalLikeCounts] = useState<Record<string, number>>({});

  const focusedUri = focused?.uri;
  const isTheme = focused?.isRoot && focused?.depth === 0;
  const focusedDepth = focused?.depth ?? 0;

  // Filter: theme posts are those ABOVE the focused post (exclude focused itself)
  const themeLines = flatLines.filter(l => l.depth < 0 || (l.depth === 0 && l.isRoot && l.uri !== focusedUri));
  // Reply lines: depth > 0 and depth <= focusedDepth + 1, excluding the focused post
  const replyLines = flatLines.filter(l =>
    l.uri && l.depth > 0 && l.depth <= focusedDepth + 1 && l.uri !== focusedUri
  );

  const handleLike = async (postUri: string, rkey: string) => {
    if (isLiked(postUri)) return;
    setLocalLikeCounts(prev => ({ ...prev, [rkey]: (prev[rkey] ?? 0) + 1 }));
    await likePost(postUri);
  };

  const handleRepost = async (uri: string) => {
    await repostPost(uri);
    setConfirmRepost(null);
  };

  useInput((input, key) => {
    if (key.upArrow) { up(); return; }
    if (key.downArrow) { down(); return; }

    const k = input;

    if (confirmRepost) {
      if (k === 'y' || k === 'Y') { void handleRepost(confirmRepost.uri); return; }
      if (k === 'n' || k === 'N') { setConfirmRepost(null); return; }
      return;
    }

    if (key.return) {
      if (focused?.uri) refreshThread(focused.uri);
      return;
    }

    if (k === 'h' || k === 'H') { if (themeUri) refreshThread(themeUri); return; }
    if (k === 'l' || k === 'L') { if (focused?.uri) void handleLike(focused.uri, focused.rkey); return; }
    // r: repost (lowercase), c: comment/reply
    if (k === 'r') { if (focused?.uri) setConfirmRepost({ uri: focused.uri, handle: focused.handle }); return; }
    if (k === 'c' || k === 'C') { if (focused?.uri) goTo({ type: 'compose', replyTo: focused.uri }); return; }
    if (k === 'j') { down(); return; }
    if (k === 'k') { up(); return; }
  });

  if (loading && flatLines.length === 0) {
    return (
      <Box width={cols} borderStyle="single" borderColor="gray" paddingX={1}>
        <Text dimColor>加载讨论串...</Text>
      </Box>
    );
  }

  const getLikeCount = (line: FlatLine) => {
    const extra = localLikeCounts[line.rkey] ?? 0;
    return line.likeCount + extra;
  };

  const getRepostCount = (line: FlatLine) => {
    const liked = isLiked(line.uri) ? 1 : 0;
    return line.repostCount + (isReposted(line.uri) ? 1 : 0);
  };

  return (
    <Box flexDirection="column" width={cols} borderStyle="single" borderColor="gray" paddingX={1}>
      {/* Header */}
      <Box>
        <Text bold color="cyan">
          🧵 讨论 - {isTheme ? '主题帖' : '回复'}
        </Text>
      </Box>

      {/* Theme posts (above current, excluding focused) */}
      {themeLines.length > 0 && (
        <Box flexDirection="column" marginTop={0}>
          <Box><Text dimColor>── 讨论源 ──</Text></Box>
          {themeLines.map((line, i) => {
            const isFocused = line.uri === focusedUri;
            const lc = getLikeCount(line);
            return (
              <Box key={i} flexDirection="column" marginBottom={0}>
                <Box>
                  <Text backgroundColor={isFocused ? '#1e40af' : undefined} bold>{line.displayName}</Text>
                  <Text dimColor>{' @'}{line.handle}</Text>
                </Box>
                <Box>
                  <Text backgroundColor={isFocused ? '#1e40af' : undefined}>{line.text}</Text>
                </Box>
                <Box>
                  <Text dimColor>♥ {lc}  ♺ {line.repostCount}  💬 {line.replyCount}</Text>
                  {line.indexedAt && <Text dimColor>{' · '}{new Date(line.indexedAt).toLocaleString('zh-CN', { month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit' })}</Text>}
                </Box>
              </Box>
            );
          })}
        </Box>
      )}

      {/* Current focused post */}
      {focused && (
        <Box flexDirection="column" marginTop={0}>
          <Box><Text dimColor>{isTheme ? '── 主题帖 ──' : '── 当前帖子 ──'}</Text></Box>
          <Box>
            <Text backgroundColor="#1e40af" color="cyanBright" bold>{focused.displayName}</Text>
            <Text backgroundColor="#1e40af" dimColor>{' @'}{focused.handle}</Text>
          </Box>
          <Box>
            <Text backgroundColor="#1e40af">{focused.text}</Text>
          </Box>
          <Box>
            <Text dimColor>♥ {getLikeCount(focused)}  ♺ {getRepostCount(focused)}  💬 {focused.replyCount}</Text>
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
            return <Box key={i}><Text dimColor>{'  '}{line.text}</Text></Box>;
          }
          const isFocused = line.uri === focusedUri;
          const indent = '  '.repeat(Math.min(line.depth - 1, 3));
          const lc = getLikeCount(line);
          return (
            <Box key={i} flexDirection="column" marginBottom={0}>
              <Box>
                <Text dimColor>{indent}↳ </Text>
                <Text backgroundColor={isFocused ? '#1e40af' : undefined} bold={isFocused}>{line.displayName}</Text>
                <Text dimColor>{' @'}{line.handle}</Text>
                {line.hasReplies && <Text color="cyan">{' [+]'}</Text>}
              </Box>
              <Box>
                <Text dimColor>{indent}{'  '}</Text>
                <Text backgroundColor={isFocused ? '#1e40af' : undefined}>{line.text.replace(/\n/g, ' ').slice(0, 200)}</Text>
              </Box>
              <Box>
                <Text dimColor>{indent}{'  '}</Text>
                <Text dimColor>♥ {lc}  ♺ {line.repostCount}  💬 {line.replyCount}</Text>
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
    </Box>
  );
}
