import React, { useState, useEffect } from 'react';
import { Box, Text } from 'ink';
import { useThread } from '@bsky/app';
import type { AppView } from '@bsky/app';
import type { BskyClient } from '@bsky/core';

interface ThreadViewProps {
  client: BskyClient | null;
  uri: string;
  goTo: (v: AppView) => void;
  goBack: () => void;
  cols: number;
  rows: number;
}

export function ThreadView({ client, uri, goTo, goBack, cols, rows }: ThreadViewProps) {
  const { flatLines, loading, focusedIndex, up, down, focus, replyToFocused } = useThread(client, uri, goTo);

  // Keyboard
  useEffect(() => {
    let escSeq = '';
    const onData = (data: Buffer) => {
      for (const ch of data.toString()) {
        if (escSeq) {
          escSeq += ch;
          if (escSeq.startsWith('\x1b[') && escSeq.length >= 3) {
            if (ch === 'A') { up(); escSeq = ''; continue; }
            if (ch === 'B') { down(); escSeq = ''; continue; }
            if (ch >= '0' && ch <= '9' || ch === ';') continue;
            escSeq = '';
          }
          if (escSeq.length > 6) escSeq = '';
          continue;
        }
        if (ch === '\x1b') { escSeq = '\x1b'; goBack(); continue; }
        const k = ch.toLowerCase();
        if (ch === '\r' || ch === '\n') {
          const line = flatLines[focusedIndex];
          if (line?.uri) focus(line.uri);
          continue;
        }
        if (k === 'j') { down(); continue; }
        if (k === 'k') { up(); continue; }
        if (k === 'r') { replyToFocused(); continue; }
      }
    };
    process.stdin.on('data', onData);
    return () => { process.stdin.off('data', onData); };
  }, [up, down, focus, replyToFocused, goBack, flatLines, focusedIndex]);

  // Pagination: visible window
  const visibleLines = Math.max(5, rows - 5);
  const startIdx = Math.floor(focusedIndex / visibleLines) * visibleLines;
  const showLines = flatLines.slice(startIdx, startIdx + visibleLines);

  if (loading) {
    return <Box width={cols} borderStyle="single" borderColor="gray" paddingX={1}><Text dimColor>加载对话树...</Text></Box>;
  }

  return (
    <Box flexDirection="column" width={cols} borderStyle="single" borderColor="gray" paddingX={1}>
      <Box height={1}>
        <Text bold>🧵 对话树</Text>
        <Text dimColor>{' ↑↓/jk:导航 Enter:聚焦某帖 R:回复 Esc:返回'}</Text>
      </Box>

      <Box flexDirection="column" flexGrow={1}>
        {showLines.map((line, i) => {
          const globalIdx = startIdx + i;
          const isFocused = globalIdx === focusedIndex;
          const indent = '  '.repeat(Math.max(0, line.depth));
          let branch = '';
          if (line.depth > 0) branch = '↳ ';
          if (line.depth < 0) branch = '↰ ';

          return (
            <Box key={`${line.uri}-${globalIdx}`} height={2} flexDirection="column">
              <Box>
                <Text color={isFocused ? 'cyanBright' : 'blue'}>
                  {isFocused ? '▐' : '│'}
                </Text>
                <Text backgroundColor={isFocused ? '#1e40af' : undefined}>
                  {indent}{branch}
                </Text>
                <Text backgroundColor={isFocused ? '#1e40af' : undefined} color={isFocused ? 'cyanBright' : 'green'} bold={isFocused}>
                  {line.displayName}
                </Text>
                <Text backgroundColor={isFocused ? '#1e40af' : undefined} dimColor>
                  {' @'}{line.handle}
                </Text>
                <Text dimColor>{' '}{line.mediaTags.join(' ')}</Text>
              </Box>
              <Box>
                <Text color={isFocused ? 'cyanBright' : 'blue'}>
                  {isFocused ? '▐' : '│'}
                </Text>
                <Text backgroundColor={isFocused ? '#1e40af' : undefined}>
                  {' '}{line.text}{line.hasReplies ? ' [+]' : ''}
                </Text>
              </Box>
            </Box>
          );
        })}
      </Box>
    </Box>
  );
}
