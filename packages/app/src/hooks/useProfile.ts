import { useState, useEffect, useCallback, useRef } from 'react';
import type { BskyClient, ProfileView, PostView } from '@bsky/core';
import type { ProfileViewBasic } from '@bsky/core';
import { readCache, writeCache, hasCache } from '../stores/cache';

type ProfileTab = 'posts' | 'replies';

export interface FollowListItem {
  did: string;
  handle: string;
  displayName?: string;
  avatar?: string;
}

function profileCacheKey(actor: string): string {
  return `profile-${actor}`;
}

interface ProfileCache {
  profile: ProfileView | null;
  posts: PostView[];
  repostReasons: Record<string, string>;
  feedCursor?: string;
  isFollowing: boolean;
  followUri?: string;
}

export function useProfile(
  client: BskyClient | null,
  actor: string | undefined,
  initialTab?: ProfileTab,
) {
  const ck = actor ? profileCacheKey(actor) : '';
  const cached = ck ? readCache<ProfileCache>(ck) : undefined;
  const [profile, setProfile] = useState<ProfileView | null>(cached?.profile ?? null);
  const [loading, setLoading] = useState(!cached);
  const [error, setError] = useState<string | null>(null);

  // Feed tabs
  const [tab, setTab] = useState<ProfileTab>(initialTab ?? 'posts');
  const [posts, setPosts] = useState<PostView[]>(cached?.posts ?? []);
  const [repostReasons, setRepostReasons] = useState<Record<string, string>>(cached?.repostReasons ?? {});
  const [feedCursor, setFeedCursor] = useState<string | undefined>(cached?.feedCursor);
  const [feedLoading, setFeedLoading] = useState(false);

  // Follow state (viewer.following contains follow record URI)
  const [isFollowing, setIsFollowing] = useState(cached?.isFollowing ?? false);
  const [followUri, setFollowUri] = useState<string | undefined>(cached?.followUri);

  // Follows / Followers lists
  const [followList, setFollowList] = useState<'follows' | 'followers' | null>(null);
  const [followItems, setFollowItems] = useState<FollowListItem[]>([]);
  const [followListCursor, setFollowListCursor] = useState<string | undefined>();
  const [followListLoading, setFollowListLoading] = useState(false);

  const loadedActor = useRef('');
  const currentPostsRef = useRef<PostView[]>([]);
  const currentRepostRef = useRef<Record<string, string>>({});

  // Keep refs in sync with state
  currentPostsRef.current = posts;
  currentRepostRef.current = repostReasons;

  const loadProfile = useCallback(async (retried = false, silent = false) => {
    if (!client || !actor) return;
    if (actor === loadedActor.current) return;
    loadedActor.current = actor;
    if (!silent) setLoading(true);
    setError(null);
    if (!silent) {
      setPosts([]);
      setRepostReasons({});
      setFeedCursor(undefined);
      setFollowList(null);
      setFollowItems([]);
    }

    try {
      const p = await client.getProfile(actor);
      writeCache(ck, {
        profile: p,
        posts: currentPostsRef.current,
        repostReasons: currentRepostRef.current,
        feedCursor: feedCursor,
        isFollowing: !!p.viewer?.following,
        followUri: p.viewer?.following,
      });
      setProfile(p);
      setIsFollowing(!!p.viewer?.following);
      setFollowUri(p.viewer?.following);
    } catch (e) {
      if (!retried) {
        await new Promise(r => setTimeout(r, 1500));
        return loadProfile(true, silent);
      }
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      if (!silent) setLoading(false);
    }
  }, [client, actor, ck]);

  useEffect(() => { void loadProfile(false, hasCache(ck)); }, [loadProfile]);

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
      if (!cursor) {
        writeCache(ck, {
          profile, posts: newPosts, repostReasons: reasons,
          feedCursor: res.cursor, isFollowing, followUri,
        });
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setFeedLoading(false);
    }
  }, [client, actor, tab, ck, profile, isFollowing, followUri]);

  // Load feed when tab changes
  useEffect(() => {
    if (actor === loadedActor.current) {
      void loadFeed();
    }
  }, [tab, actor, loadFeed]);

  const loadMoreFeed = useCallback(() => {
    if (feedCursor && !feedLoading) void loadFeed(feedCursor);
  }, [feedCursor, feedLoading, loadFeed]);

  const refreshFeed = useCallback(async () => {
    if (!actor) return;
    loadedActor.current = '';
    await loadProfile(false, false);
  }, [actor, loadProfile]);

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
    posts, repostReasons, feedCursor, feedLoading, loadMoreFeed, refreshFeed,
    isFollowing, handleFollow, handleUnfollow,
    followList, followItems, followListCursor, followListLoading,
    openFollowList: loadFollowList, closeFollowList: () => setFollowList(null),
    loadMoreFollowList,
  };
}
