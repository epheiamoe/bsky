import React from 'react';
import type { BskyClient } from '@bsky/core';
import type { AppView } from '@bsky/app';
import { useProfile, useI18n } from '@bsky/app';

interface ProfilePageProps {
  client: BskyClient;
  actor: string;
  goBack: () => void;
  goTo: (v: AppView) => void;
}

export function ProfilePage({ client, actor, goBack, goTo }: ProfilePageProps) {
  const { t } = useI18n();
  const { profile, loading } = useProfile(client, actor);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white dark:bg-[#0A0A0A]">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-white dark:bg-[#0A0A0A] px-4">
        <p className="text-text-secondary text-lg">{t('profile.notFound')}</p>
      </div>
    );
  }

  const initial = (profile.displayName || profile.handle).charAt(0).toUpperCase();

  return (
    <div className="min-h-screen bg-white dark:bg-[#0A0A0A]">
      <div className="border-b border-border px-4 py-3 flex items-center gap-3">
        <button
          onClick={goBack}
          className="text-text-secondary hover:text-text-primary transition-colors text-lg"
        >
          ←
        </button>
        <span className="text-text-primary font-semibold text-lg truncate">
          {profile.displayName || profile.handle}
        </span>
      </div>

      {profile.banner ? (
        <div className="h-32 bg-primary/20">
          <img src={profile.banner} alt="" className="w-full h-full object-cover" />
        </div>
      ) : (
        <div className="h-32 bg-primary/10" />
      )}

      <div className="px-4">
        <div className="relative -mt-12 mb-3">
          {profile.avatar ? (
            <img
              src={profile.avatar}
              alt={profile.handle}
              className="w-24 h-24 rounded-full border-4 border-white dark:border-[#0A0A0A] bg-surface"
            />
          ) : (
            <div className="w-24 h-24 rounded-full bg-primary flex items-center justify-center text-white font-bold text-3xl border-4 border-white dark:border-[#0A0A0A]">
              {initial}
            </div>
          )}
        </div>

        <div className="mb-4">
          <h2 className="text-2xl font-bold text-text-primary">
            {profile.displayName || profile.handle}
          </h2>
          <p className="text-text-secondary text-sm">
            @{profile.handle}
          </p>
        </div>

        {profile.description && (
          <p className="text-text-primary text-sm whitespace-pre-wrap mb-4">
            {profile.description}
          </p>
        )}

        <div className="flex items-center gap-4 text-sm mb-4">
          <span className="text-text-primary">
            <strong>{profile.postsCount ?? 0}</strong>{' '}
            <span className="text-text-secondary">{t('profile.posts')}</span>
          </span>
          <span className="text-text-primary">
            <strong>{profile.followersCount ?? 0}</strong>{' '}
            <span className="text-text-secondary">{t('profile.followers')}</span>
          </span>
          <span className="text-text-primary">
            <strong>{profile.followsCount ?? 0}</strong>{' '}
            <span className="text-text-secondary">{t('profile.following')}</span>
          </span>
        </div>
      </div>

      <div className="border-t border-border" />
    </div>
  );
}
