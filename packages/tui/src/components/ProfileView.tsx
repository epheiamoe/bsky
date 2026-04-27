import React from 'react';
import { Box, Text } from 'ink';
import { useProfile } from '@bsky/app';
import type { BskyClient } from '@bsky/core';

interface ProfileViewProps {
  client: BskyClient | null;
  actor: string;
  goBack: () => void;
  cols: number;
}

export function ProfileView({ client, actor, cols }: ProfileViewProps) {
  const { profile, follows, followers, loading } = useProfile(client, actor);

  if (loading || !profile) {
    return <Box width={cols} borderStyle="single" borderColor="gray" paddingX={1}><Text dimColor>加载资料...</Text></Box>;
  }

  return (
    <Box flexDirection="column" width={cols} borderStyle="single" borderColor="gray" paddingX={1}>
      <Box height={1}><Text bold>👤 {profile.displayName || profile.handle}</Text></Box>
      <Box><Text dimColor>@{profile.handle}</Text></Box>
      <Box marginY={1}><Text>{profile.description || '无简介'}</Text></Box>
      <Box>
        <Text bold>{profile.postsCount ?? 0}</Text><Text dimColor> 帖子  </Text>
        <Text bold>{followers.length}</Text><Text dimColor> 粉丝  </Text>
        <Text bold>{follows.length}</Text><Text dimColor> 关注</Text>
      </Box>
      <Box marginTop={1}><Text dimColor>Esc 返回</Text></Box>
    </Box>
  );
}
