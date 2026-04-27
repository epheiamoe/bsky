import React, { useState, useEffect } from 'react';
import { Box, Text } from 'ink';
import { useSearch } from '@bsky/app';
import type { AppView } from '@bsky/app';
import type { BskyClient } from '@bsky/core';

interface SearchViewProps {
  client: BskyClient | null;
  query?: string;
  goBack: () => void;
  cols: number;
  rows: number;
  goTo: (v: AppView) => void;
}

export function SearchView({ client, query, goBack, cols, rows, goTo }: SearchViewProps) {
  const { results, loading, search } = useSearch(client);
  const [input, setInput] = useState(query ?? '');
  const [searched, setSearched] = useState(!!query);

  useEffect(() => {
    if (query && !searched) {
      setSearched(true);
      void search(query);
    }
  }, [query, search, searched]);

  return (
    <Box flexDirection="column" width={cols} borderStyle="single" borderColor="gray" paddingX={1}>
      <Box height={1}>
        <Text bold>🔍 搜索</Text>
        <Text dimColor>{' Esc 返回'}</Text>
      </Box>
      <Text dimColor>搜索功能：请使用命令行 test 进行搜索。TUI 搜索栏需要 raw mode。</Text>
      {loading && <Text dimColor>搜索中...</Text>}
      {results.slice(0, 15).map((p, i) => (
        <Box key={p.uri}>
          <Text color="green">{p.author.handle}</Text>
          <Text>{': '}{p.record.text.slice(0, cols - 30)}</Text>
        </Box>
      ))}
    </Box>
  );
}
