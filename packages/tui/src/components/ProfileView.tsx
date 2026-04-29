import React from 'react';
import { Box, Text } from 'ink';
import { useProfile, useI18n } from '@bsky/app';
import type { BskyClient } from '@bsky/core';

interface ProfileViewProps {
  client: BskyClient | null;
  actor: string;
  goBack: () => void;
  cols: number;
}

export function ProfileView({ client, actor, cols }: ProfileViewProps) {
  const { profile, follows, followers, loading } = useProfile(client, actor);
  const { t } = useI18n();

  if (loading || !profile) {
    return <Box width={cols} borderStyle="single" borderColor="gray" paddingX={1}><Text dimColor>{t('profile.loading')}</Text></Box>;
  }

  return (
    <Box flexDirection="column" width={cols} borderStyle="single" borderColor="gray" paddingX={1}>
      <Box height={1}><Text bold>{'👤 '}{profile.displayName || profile.handle}</Text></Box>
      <Box><Text dimColor>@{profile.handle}</Text></Box>
      <Box marginY={1}><Text>{profile.description || t('profile.noBio')}</Text></Box>
      <Box>
        <Text bold>{profile.postsCount ?? 0}</Text><Text dimColor>{' '}{t('profile.posts')}  </Text>
        <Text bold>{followers.length}</Text><Text dimColor>{' '}{t('profile.followers')}  </Text>
        <Text bold>{follows.length}</Text><Text dimColor>{' '}{t('profile.following')}</Text>
      </Box>
      <Box marginTop={1}><Text dimColor>{t('keys.profile')}</Text></Box>
    </Box>
  );
}
