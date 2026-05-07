import React, { useState, useEffect } from 'react';
import { useI18n } from '@bsky/app';
import type { WidgetProps, WidgetContext } from '@bsky/app';
import type { ProfileView } from '@bsky/core';
import { Icon } from '../Icon.js';

export function ProfilePreviewWidget({ onClose, context }: WidgetProps) {
  const { t } = useI18n();
  const client = (context as WidgetContext)?.client;
  const threadUri = (context as WidgetContext)?.threadUri;
  const [profile, setProfile] = useState<ProfileView | null>(null);
  const [loading, setLoading] = useState(true);
  const [isFollowing, setIsFollowing] = useState(false);
  const [followUri, setFollowUri] = useState<string | null>(null);

  useEffect(() => {
    if (!client || !threadUri) { setLoading(false); return; }
    (async () => {
      setLoading(true);
      try {
        // Fetch the post (depth 0) to get the author
        const thread = await client.getPostThread(threadUri, 0, 0);
        const post = (thread as any).thread?.post ?? (thread as any).thread;
        if (!post) { setLoading(false); return; }
        const handle = post.author.handle;
        if (!handle) { setLoading(false); return; }
        const p = await client.getProfile(handle);
        setProfile(p);
        if (p.viewer?.following) {
          setIsFollowing(true);
          setFollowUri(p.viewer.following);
        }
      } catch { /* ignore */ }
      setLoading(false);
    })();
  }, [client, threadUri]);

  const handleFollow = async () => {
    if (!client || !profile) return;
    try {
      const r = await client.follow(profile.did);
      setIsFollowing(true);
      setFollowUri(r.uri);
    } catch { /* ignore */ }
  };

  const handleUnfollow = async () => {
    if (!client || !followUri) return;
    try {
      await client.unfollow(followUri);
      setIsFollowing(false);
      setFollowUri(null);
    } catch { /* ignore */ }
  };

  return (
    <div className="flex flex-col gap-2 text-sm">
      {loading && <p className="text-text-secondary text-xs">{t('status.loading')}</p>}
      {!loading && !profile && (
        <p className="text-text-secondary text-xs">{t('widget.noProfilePreview')}</p>
      )}
      {profile && (
        <div className="space-y-2">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-full bg-surface flex-shrink-0 overflow-hidden">
              {profile.avatar ? (
                <img src={profile.avatar} alt="" className="w-full h-full object-cover" />
              ) : (
                <span className="w-full h-full flex items-center justify-center text-lg">{profile.displayName?.[0] || profile.handle[0]}</span>
              )}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-text-primary font-semibold text-sm truncate">{profile.displayName || profile.handle}</p>
              <p className="text-text-secondary text-xs">@{profile.handle}</p>
            </div>
            {isFollowing ? (
              <button
                onClick={handleUnfollow}
                className="text-xs px-3 py-1 rounded-full border border-border text-text-secondary hover:text-red-500 hover:border-red-300 transition-colors whitespace-nowrap"
              >
                {t('action.following')}
              </button>
            ) : (
              <button
                onClick={handleFollow}
                className="text-xs px-3 py-1 rounded-full bg-primary text-white hover:bg-primary-hover transition-colors whitespace-nowrap"
              >
                {t('action.follow')}
              </button>
            )}
          </div>
          {profile.description && (
            <p className="text-text-secondary text-xs leading-relaxed line-clamp-3">{profile.description}</p>
          )}
          <div className="flex gap-3 text-xs text-text-secondary">
            <span>{profile.followersCount ?? 0} <span className="text-text-secondary/50">{t('profile.followers')}</span></span>
            <span>{profile.followsCount ?? 0} <span className="text-text-secondary/50">{t('profile.following')}</span></span>
            <span>{profile.postsCount ?? 0} <span className="text-text-secondary/50">{t('profile.posts')}</span></span>
          </div>
        </div>
      )}
    </div>
  );
}

export default ProfilePreviewWidget;
