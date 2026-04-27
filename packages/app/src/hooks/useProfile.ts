import { useState, useEffect, useCallback } from 'react';
import { BskyClient } from '@bsky/core';
import type { ProfileView } from '@bsky/core';

export function useProfile(client: BskyClient | null, actor: string) {
  const [profile, setProfile] = useState<ProfileView | null>(null);
  const [follows, setFollows] = useState<ProfileView[]>([]);
  const [followers, setFollowers] = useState<ProfileView[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!client || !actor) return;
    setLoading(true);
    Promise.all([
      client.getProfile(actor).then(setProfile),
      client.getFollows(actor, 20).then(r => setFollows(r.follows)),
      client.getFollowers(actor, 20).then(r => setFollowers(r.followers)),
    ]).catch(console.error).finally(() => setLoading(false));
  }, [client, actor]);

  return { profile, follows, followers, loading };
}
