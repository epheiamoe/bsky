import React, { useState, useEffect } from 'react';
import { Box, Text, useInput } from 'ink';
import TextInput from 'ink-text-input';
import { useSearch, useI18n, addFeed, saveViewState, getViewState } from '@bsky/app';
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

export function SearchView({ client, query, goBack, cols, rows, goTo }: SearchViewProps) {
  const { tab, posts, users, feeds, loading, search, setTab } = useSearch(client);
  const [input, setInput] = useState(query ?? '');
  const [searching, setSearching] = useState(false);
  const saved = input ? getViewState(`search-${input}`) : undefined;
  const [postIdx, setPostIdx] = useState(saved?.postIdx ?? 0);
  const [userIdx, setUserIdx] = useState(saved?.userIdx ?? 0);
  const [feedIdx, setFeedIdx] = useState(saved?.feedIdx ?? 0);
  const { t } = useI18n();

  // Save state on unmount
  useEffect(() => {
    return () => {
      if (input) saveViewState(`search-${input}`, { postIdx, userIdx, feedIdx });
    };
  }, [input, postIdx, userIdx, feedIdx]);

  useInput((inputChar, key) => {
    if (key.escape) { goBack(); return; }
    if (key.tab) {
      const idx = TABS.findIndex(tb => tb.key === tab);
      const next = TABS[(idx + 1) % TABS.length]!;
      setTab(next.key);
      return;
    }
    if (key.return && input.trim()) { search(input.trim(), tab); setSearching(true); goTo({ type: 'search', query: input.trim() }); return; }
    if (key.return) {
      if (tab === 'users' && users.length > 0) { goTo({ type: 'profile', actor: users[userIdx]!.handle }); }
      else if ((tab === 'top' || tab === 'latest') && posts.length > 0) { goTo({ type: 'thread', uri: posts[postIdx]!.uri }); }
      else if (tab === 'feeds' && feeds.length > 0) { goTo({ type: 'feed', feedUri: feeds[feedIdx]!.uri }); }
      return;
    }
    if (key.upArrow || inputChar === 'k') {
      if (tab === 'users') setUserIdx(i => Math.max(0, i - 1));
      else if (tab === 'feeds') setFeedIdx(i => Math.max(0, i - 1));
      else setPostIdx(i => Math.max(0, i - 1));
      return;
    }
    if (key.downArrow || inputChar === 'j') {
      if (tab === 'users') setUserIdx(i => Math.min(users.length - 1, i + 1));
      else if (tab === 'feeds') setFeedIdx(i => Math.min(feeds.length - 1, i + 1));
      else setPostIdx(i => Math.min(posts.length - 1, i + 1));
      return;
    }
    if (inputChar === 'v' || inputChar === 'V') {
      if (tab === 'feeds' && feeds.length > 0) { goTo({ type: 'feed', feedUri: feeds[feedIdx]!.uri }); }
      return;
    }
    if (inputChar === 's' || inputChar === 'S') {
      if (tab === 'feeds' && feeds.length > 0) { addFeed(feeds[feedIdx]!.uri); }
      return;
    }
  });

  return (
    <Box flexDirection="column" width={cols} borderStyle="single" borderColor="gray" paddingX={1}>
      <Box height={1}>
        <Text bold>{'🔍 '}{t('search.title')}</Text>
        <Text dimColor>{' Tab:切标签 jk:导航 Enter:搜索/查看 Esc:返回 V/S:动态源'}</Text>
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
      {(tab === 'top' || tab === 'latest') && posts.map((p, i) => {
        const isSel = i === postIdx;
        const viewEmbed = (p as any).embed as { $type?: string; record?: { uri?: string; author?: { handle?: string }; value?: { text?: string } } } | undefined;
        const hasQuote = viewEmbed?.record?.uri && (viewEmbed.$type === 'app.bsky.embed.record#view' || viewEmbed.$type === 'app.bsky.embed.record' || viewEmbed.$type === 'app.bsky.embed.recordWithMedia#view' || viewEmbed.$type === 'app.bsky.embed.recordWithMedia');
        return (
          <React.Fragment key={p.uri}>
            <Box height={1}>
              <Text backgroundColor={isSel ? '#1e40af' : undefined} color={isSel ? 'cyanBright' : 'green'}>{isSel ? '▶' : ' '}{p.author.handle}</Text>
              <Text backgroundColor={isSel ? '#1e40af' : undefined} color={isSel ? 'cyanBright' : undefined}>{': '}{p.record.text.slice(0, cols - 30)}</Text>
              {hasQuote && <Text color="magenta">{' 📌'}</Text>}
            </Box>
            {hasQuote && (
              <Box height={1}>
                <Text color="magenta" dimColor>{'│ @'}{viewEmbed!.record!.author?.handle || ''}{' '}{viewEmbed!.record!.value?.text?.replace(/\n/g, ' ').slice(0, 60) || ''}</Text>
              </Box>
            )}
          </React.Fragment>
        );
      })}

      {/* Users results */}
      {tab === 'users' && users.map((u, i) => (
        <Box key={u.did} height={1}>
          <Text backgroundColor={i === userIdx ? '#1e40af' : undefined} color={i === userIdx ? 'cyanBright' : 'green'}>{i === userIdx ? '▶' : ' '}{u.handle}</Text>
          {u.displayName && <Text backgroundColor={i === userIdx ? '#1e40af' : undefined} color={i === userIdx ? 'cyanBright' : undefined}>{' ('}{u.displayName.slice(0, 20)}{u.displayName.length > 20 ? '…' : ''}{')'}</Text>}
        </Box>
      ))}

      {/* Feeds results */}
      {tab === 'feeds' && feeds.map((f, i) => (
        <Box key={f.uri} height={1}>
          <Text backgroundColor={i === feedIdx ? '#1e40af' : undefined} color={i === feedIdx ? 'cyanBright' : 'green'}>{i === feedIdx ? '▶' : ' '}{f.displayName}</Text>
          {f.creator && <Text backgroundColor={i === feedIdx ? '#1e40af' : undefined} dimColor>{' @'}{f.creator.handle}</Text>}
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
