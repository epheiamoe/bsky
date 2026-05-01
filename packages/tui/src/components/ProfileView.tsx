import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';
import { useProfile, useI18n } from '@bsky/app';
import type { AppView } from '@bsky/app';
import type { BskyClient, AIConfig } from '@bsky/core';

interface ProfileViewProps {
  client: BskyClient | null;
  actor: string;
  goBack: () => void;
  cols: number;
  rows: number;
  goTo: (v: AppView) => void;
  aiConfig?: AIConfig;
  targetLang?: string;
}

export function ProfileView({ client, actor, goBack, cols, rows, goTo, aiConfig, targetLang }: ProfileViewProps) {
  const {
    profile, loading, error,
    tab, setTab,
    posts, feedLoading, loadMoreFeed,
    isFollowing, handleFollow, handleUnfollow,
    followList, followItems, followListLoading,
    openFollowList, closeFollowList, loadMoreFollowList,
    repostReasons,
  } = useProfile(client, actor);
  const { t } = useI18n();
  const [postIdx, setPostIdx] = useState(0);
  const [followIdx, setFollowIdx] = useState(0);
  const [translatingBio, setTranslatingBio] = useState(false);
  const [translatedBio, setTranslatedBio] = useState<string | null>(null);

  useInput((input, key) => {
    if (followList) {
      if (key.escape) { closeFollowList(); setFollowIdx(0); return; }
      if (key.upArrow || input === 'k') { setFollowIdx(i => Math.max(0, i - 1)); return; }
      if (key.downArrow || input === 'j') { setFollowIdx(i => Math.min(followItems.length - 1, i + 1)); return; }
      if (key.return) {
        const item = followItems[followIdx];
        if (item) goTo({ type: 'profile', actor: item.handle });
        return;
      }
      if (input === 'm') { void loadMoreFollowList(); return; }
      return;
    }

    if (key.escape) { goBack(); return; }
    if (key.tab || key.leftArrow || key.rightArrow) {
      setTab(t => t === 'posts' ? 'replies' : 'posts');
      setPostIdx(0);
      return;
    }
    if (key.upArrow || input === 'k') { setPostIdx(i => Math.max(0, i - 1)); return; }
    if (key.downArrow || input === 'j') { setPostIdx(i => Math.min(posts.length - 1, i + 1)); return; }
    if (key.return) {
      const post = posts[postIdx];
      if (post) goTo({ type: 'thread', uri: post.uri });
      return;
    }
    if (input === 'a' || input === 'A') { goTo({ type: 'aiChat', sessionId: crypto.randomUUID(), contextProfile: actor }); return; }
    if (input === 'f' || input === 'F') {
      if (profile?.description && !translatingBio) {
        setTranslatingBio(true);
        import('@bsky/core').then(({ translateText: tt }) => {
          const cfg = { apiKey: aiConfig?.apiKey || '', baseUrl: aiConfig?.baseUrl || 'https://api.deepseek.com', model: aiConfig?.model || 'deepseek-v4-flash' };
          tt(cfg, profile.description!, targetLang || 'zh', 'simple').then(r => {
            setTranslatedBio(`[→${targetLang || 'zh'}] ${r.translated}`);
          }).finally(() => setTranslatingBio(false));
        }).catch(() => setTranslatingBio(false));
      }
      return;
    }
    if (input === 'u' || input === 'U') {
      if (isFollowing) void handleUnfollow();
      else void handleFollow();
      return;
    }
    if (input === 'm') { void loadMoreFeed(); return; }
    if (input === 'p') { void openFollowList('follows'); return; }
    if (input === 'P') { void openFollowList('followers'); return; }
  });

  if (loading || !profile) {
    return <Box width={cols} borderStyle="single" borderColor="gray" paddingX={1}><Text dimColor>{t('profile.loading')}</Text></Box>;
  }

  if (error) {
    return <Box width={cols} borderStyle="single" borderColor="gray" paddingX={1}><Text color="red">{error}</Text></Box>;
  }

  if (followList) {
    const isFollows = followList === 'follows';
    const title = isFollows
      ? t('profile.following') + ' (' + (profile.followsCount ?? followItems.length) + ')'
      : t('profile.followers') + ' (' + (profile.followersCount ?? followItems.length) + ')';
    const maxItems = rows - 5;

    return (
      <Box flexDirection="column" width={cols} borderStyle="single" borderColor="gray" paddingX={1}>
        <Box height={1}>
          <Text bold>{'👤 '}{title}</Text>
          <Text dimColor>{' Exc:'}{t('nav.back')}</Text>
        </Box>
        <Box><Text dimColor>──────────────────────────────────────</Text></Box>
        {followItems.length === 0 && !followListLoading && <Text dimColor>{t('status.empty')}</Text>}
        {followItems.slice(0, Math.max(1, maxItems)).map((item, i) => {
          const isSel = i === followIdx;
          const name = item.displayName || item.handle;
          return (
            <Box key={item.did} height={1}>
              <Text backgroundColor={isSel ? '#1e40af' : undefined} color={isSel ? 'cyanBright' : undefined}>
                {isSel ? '▶' : ' '}{' '}
                <Text color={isSel ? 'cyanBright' : 'green'}>@{item.handle}</Text>
                {name !== item.handle && <Text>{' '}{name}</Text>}
              </Text>
            </Box>
          );
        })}
        {followListLoading && <Text dimColor>{'  ⏳ '}{t('action.loading')}</Text>}
      </Box>
    );
  }

  const maxPosts = Math.max(1, rows - 8);
  const followLabel = isFollowing ? t('profile.unfollow') : t('profile.follow');

  return (
    <Box flexDirection="column" width={cols} borderStyle="single" borderColor="gray" paddingX={1}>
      <Box height={1}>
        <Text bold>{'👤 '}{profile.displayName || profile.handle}</Text>
        <Text dimColor>{' Esc:'}{t('nav.back')}</Text>
        <Text dimColor>{' a:AI u:'}{followLabel}</Text>
      </Box>
      <Box><Text dimColor>@{profile.handle}</Text></Box>
      <Box><Text>{profile.description || t('profile.noBio')}</Text></Box>
      {translatingBio && <Text dimColor>{'  ⏳ '}{t('action.translating')}</Text>}
      {translatedBio && !translatingBio && <Text dimColor>{translatedBio}</Text>}
      <Box>
        <Text bold>{profile.postsCount ?? 0}</Text><Text dimColor>{' '}{t('profile.posts')}  </Text>
        <Text bold>{profile.followersCount ?? 0}</Text><Text dimColor>{' '}{t('profile.followers')}  </Text>
        <Text bold>{profile.followsCount ?? 0}</Text><Text dimColor>{' '}{t('profile.following')}</Text>
      </Box>
      <Box><Text dimColor>──────────────────────────────────────</Text></Box>
      <Box height={1}>
        <Text color={tab === 'posts' ? 'cyanBright' : undefined}>{'📋 '}{t('profile.tabPosts')}</Text>
        <Text>{'  '}</Text>
        <Text color={tab === 'replies' ? 'cyanBright' : undefined}>{'📋+ '}{t('profile.tabReplies')}</Text>
        <Box flexGrow={1}><Text>{' '}</Text></Box>
        <Text color={isFollowing ? 'yellow' : 'green'}>{followLabel}</Text>
      </Box>
      {posts.length === 0 && !feedLoading && <Text dimColor>{t('status.noPosts')}</Text>}
      {posts.slice(0, maxPosts).map((post, i) => {
        const isSel = i === postIdx;
        const raw = (post.record.text || '').replace(/\n/g, ' ');
        const text = raw.slice(0, 80);
        const truncated = raw.length > 80;
        const showAuthor = tab === 'replies';
        const repostBy = repostReasons[post.uri] || null;
        return (
          <Box key={post.uri} height={1}>
            <Text backgroundColor={isSel ? '#1e40af' : undefined} color={isSel ? 'cyanBright' : undefined}>
              {isSel ? '▶' : ' '}{' '}
              {repostBy && <Text color="yellow">{'↻ @'}{repostBy}{' '}</Text>}
              {showAuthor && <Text color={isSel ? 'cyanBright' : 'green'}>@{post.author.handle} </Text>}
              <Text>{text}{truncated ? '…' : ''}</Text>
            </Text>
          </Box>
        );
      })}
      {feedLoading && <Text dimColor>{'  ⏳ '}{t('action.loading')}</Text>}
      {posts.length > 0 && <Text dimColor>{t('keys.profile')}</Text>}
    </Box>
  );
}
