import { useState, useEffect, useCallback, useRef } from 'react';
import type { BskyClient, ProfileView, PostView } from '@bsky/core';
import type { ProfileViewBasic } from '@bsky/core';

type ProfileTab = 'posts' | 'replies';

export interface FollowListItem {
  did: string;
  handle: string;
  displayName?: string;
  avatar?: string;
}

export function useProfile(
  client: BskyClient | null,
  actor: string | undefined,
) {
  const [profile, setProfile] = useState<ProfileView | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Feed tabs
  const [tab, setTab] = useState<ProfileTab>('posts');
  const [posts, setPosts] = useState<PostView[]>([]);
  const [repostReasons, setRepostReasons] = useState<Record<string, string>>({});
  const [feedCursor, setFeedCursor] = useState<string | undefined>();
  const [feedLoading, setFeedLoading] = useState(false);

  // Follow state (viewer.following contains follow record URI)
  const [isFollowing, setIsFollowing] = useState(false);
  const [followUri, setFollowUri] = useState<string | undefined>();

  // Follows / Followers lists
  const [followList, setFollowList] = useState<'follows' | 'followers' | null>(null);
  const [followItems, setFollowItems] = useState<FollowListItem[]>([]);
  const [followListCursor, setFollowListCursor] = useState<string | undefined>();
  const [followListLoading, setFollowListLoading] = useState(false);

  const loadedActor = useRef('');

  const loadProfile = useCallback(async () => {
    if (!client || !actor) return;
    if (actor === loadedActor.current) return;
    loadedActor.current = actor;
    setLoading(true);
    setError(null);
    setPosts([]);
    setRepostReasons({});
    setFeedCursor(undefined);
    setFollowList(null);
    setFollowItems([]);

    try {
      const p = await client.getProfile(actor);
      setProfile(p);
      setIsFollowing(!!p.viewer?.following);
      setFollowUri(p.viewer?.following);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [client, actor]);

  useEffect(() => { void loadProfile(); }, [loadProfile]);

  // Load author feed for current tab
  const loadFeed = useCallback(async (cursor?: string) => {
    if (!client || !actor) return;
    setFeedLoading(true);
    try {
      const filter = tab === 'posts' ? 'posts_no_replies' : '';
      const res = await client.getAuthorFeed(actor, 20, cursor, filter || undefined);
      const newPosts = res.feed.map(f => f.post);
      const reasons: Record<string, string> = {};
      for (const f of res.feed) {
        const reason = f.reason as { $type?: string; by?: { handle?: string } } | undefined;
        if (reason?.$type === 'app.bsky.feed.defs#reasonRepost' && reason.by?.handle) {
          reasons[f.post.uri] = reason.by.handle;
        }
      }
      if (cursor) {
        setPosts(prev => [...prev, ...newPosts]);
        setRepostReasons(prev => ({ ...prev, ...reasons }));
      } else {
        setPosts(newPosts);
        setRepostReasons(reasons);
      }
      setFeedCursor(res.cursor);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setFeedLoading(false);
    }
  }, [client, actor, tab]);

  // Load feed when tab changes
  useEffect(() => {
    if (actor === loadedActor.current) {
      void loadFeed();
    }
  }, [tab, actor, loadFeed]);

  const loadMoreFeed = useCallback(() => {
    if (feedCursor && !feedLoading) void loadFeed(feedCursor);
  }, [feedCursor, feedLoading, loadFeed]);

  // Follow / Unfollow
  const handleFollow = useCallback(async () => {
    if (!client || !profile) return;
    try {
      const res = await client.follow(profile.did);
      setIsFollowing(true);
      setFollowUri(res.uri);
      // Refresh profile to update viewer state
      const p = await client.getProfile(actor!);
      setProfile(p);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [client, profile, actor]);

  const handleUnfollow = useCallback(async () => {
    if (!client || !followUri) return;
    try {
      await client.unfollow(followUri);
      setIsFollowing(false);
      setFollowUri(undefined);
      const p = await client.getProfile(actor!);
      setProfile(p);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [client, followUri, actor]);

  // Load follow/follower lists
  const loadFollowList = useCallback(async (type: 'follows' | 'followers') => {
    if (!client || !actor) return;
    setFollowList(type);
    setFollowListLoading(true);
    setFollowListCursor(undefined);
    setFollowItems([]);
    try {
      const res = type === 'follows' ? await client.getFollows(actor, 30) : await client.getFollowers(actor, 30);
      const items = type === 'follows'
        ? (res as { follows: ProfileViewBasic[]; cursor?: string }).follows
        : (res as { followers: ProfileViewBasic[]; cursor?: string }).followers;
      setFollowItems(items.map(f => ({
        did: f.did, handle: f.handle, displayName: f.displayName, avatar: f.avatar,
      })));
      setFollowListCursor(res.cursor);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setFollowListLoading(false);
    }
  }, [client, actor]);

  const loadMoreFollowList = useCallback(async () => {
    if (!client || !actor || !followList || !followListCursor || followListLoading) return;
    setFollowListLoading(true);
    try {
      const res = followList === 'follows' ? await client.getFollows(actor, 30, followListCursor) : await client.getFollowers(actor, 30, followListCursor);
      const items = followList === 'follows'
        ? (res as { follows: ProfileViewBasic[]; cursor?: string }).follows
        : (res as { followers: ProfileViewBasic[]; cursor?: string }).followers;
      setFollowItems(prev => [...prev, ...items.map(f => ({
        did: f.did, handle: f.handle, displayName: f.displayName, avatar: f.avatar,
      }))]);
      setFollowListCursor(res.cursor);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setFollowListLoading(false);
    }
  }, [client, actor, followList, followListCursor, followListLoading]);

  return {
    profile, loading, error,
    tab, setTab,
    posts, repostReasons, feedCursor, feedLoading, loadMoreFeed,
    isFollowing, handleFollow, handleUnfollow,
    followList, followItems, followListCursor, followListLoading,
    openFollowList: loadFollowList, closeFollowList: () => setFollowList(null),
    loadMoreFollowList,
  };
}
