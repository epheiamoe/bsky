import React, { useState, useEffect } from 'react';
import { Box, Text, useInput } from 'ink';
import TextInput from 'ink-text-input';
import { useSearch, useI18n, addFeed } from '@bsky/app';
import { getFeedLabel } from '@bsky/core';
import type { SearchTab } from '@bsky/app';
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

const TABS: { key: SearchTab; label: string }[] = [
  { key: 'top', label: '热门' },
  { key: 'latest', label: '最新' },
  { key: 'users', label: '用户' },
  { key: 'feeds', label: '动态源' },
];

export function SearchView({ client, query, goBack, cols, goTo }: SearchViewProps) {
  const { tab, posts, users, feeds, loading, search, setTab } = useSearch(client);
  const [input, setInput] = useState(query ?? '');
  const [searching, setSearching] = useState(false);
  const { t } = useI18n();

  useInput((input, key) => {
    if (key.escape) { goBack(); return; }
    if (key.tab) {
      const idx = TABS.findIndex(tb => tb.key === tab);
      const next = TABS[(idx + 1) % TABS.length]!;
      setTab(next.key);
      return;
    }
    if (key.return && input.trim()) { search(input.trim(), tab); setSearching(true); return; }
    if (key.return) {
      // Enter with no input — open selected post/user
      if (tab === 'users' && users.length > 0) { goTo({ type: 'profile', actor: users[0]!.handle }); }
      else if ((tab === 'top' || tab === 'latest') && posts.length > 0) { goTo({ type: 'thread', uri: posts[0]!.uri }); }
      return;
    }
  });

  return (
    <Box flexDirection="column" width={cols} borderStyle="single" borderColor="gray" paddingX={1}>
      <Box height={1}>
        <Text bold>{'🔍 '}{t('search.title')}</Text>
        <Text dimColor>{' Tab:切标签 Enter:搜索 Esc:返回'}</Text>
      </Box>

      {/* Tab bar */}
      <Box flexDirection="column" marginTop={0}>
        <Box>
          {TABS.map(tb => (
            <Text key={tb.key} color={tab === tb.key ? 'cyan' : undefined} bold={tab === tb.key}>{tab === tb.key ? '▸' : ' '}{tb.label}{'  '}</Text>
          ))}
        </Box>
      </Box>

      {/* Search input */}
      <Box marginTop={0}>
        <Text color="cyan">{'▸ '}</Text>
        <TextInput value={input} onChange={setInput} onSubmit={() => { if (input.trim()) { search(input.trim(), tab); setSearching(true); } }} placeholder={t('search.placeholder')} />
      </Box>

      {loading && <Text dimColor>{'⏳ '}{t('search.searching')}</Text>}

      {/* Posts results */}
      {(tab === 'top' || tab === 'latest') && posts.map((p, i) => (
        <Box key={p.uri} height={1}>
          <Text color="green">{p.author.handle}</Text>
          <Text>{': '}{p.record.text.slice(0, cols - 30)}</Text>
        </Box>
      ))}

      {/* Users results */}
      {tab === 'users' && users.map((u, i) => (
        <Box key={u.did} height={1}>
          <Text color="green">{u.handle}</Text>
          {u.displayName && <Text>{' ('}{u.displayName.slice(0, 20)}{u.displayName.length > 20 ? '…' : ''}{')'}</Text>}
        </Box>
      ))}

      {/* Feeds results */}
      {tab === 'feeds' && feeds.map((f, i) => (
        <Box key={f.uri} height={1}>
          <Text color="green">{f.displayName}</Text>
          {f.creator && <Text dimColor>{' @'}{f.creator.handle}</Text>}
          <Text>{' '}</Text>
          <Text color="cyan">{'[V: 查看]'}</Text>
          <Text>{' '}</Text>
          <Text color="yellow">{'[S: 订阅]'}</Text>
        </Box>
      ))}

      {searching && !loading && posts.length === 0 && users.length === 0 && feeds.length === 0 && (
        <Text dimColor>{t('search.noResults')}</Text>
      )}
    </Box>
  );
}
