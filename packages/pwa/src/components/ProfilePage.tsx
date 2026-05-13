import React, { useEffect, useRef, useState } from 'react';
import type { BskyClient } from '@bsky/core';
import type { AppView, TargetLang, TranslationResult } from '@bsky/app';
import { useProfile, useI18n, useTranslation, getCdnImageUrl, useVirtualizedList, isWidgetEnabled, toggleWidget } from '@bsky/app';
import type { AIConfig } from '@bsky/core';
import { PostCard } from './PostCard';
import { PostActionsRow } from './PostActionsRow.js';
import { EditProfileModal } from './EditProfileModal.js';
import { ImageLightboxDialog } from './ImageLightboxDialog.js';
import { Icon } from './Icon.js';

interface ProfilePageProps {
  client: BskyClient;
  actor: string;
  initialTab?: string;
  goBack: () => void;
  goTo: (v: AppView) => void;
  aiConfig: AIConfig;
  targetLang: string;
  translateMode: 'simple' | 'json';
  translateConfig?: AIConfig;
  imageDescConfig?: AIConfig;
  imageDescLang?: string;
  initialScrollTop?: number;
  onScrollTopChange?: (top: number) => void;
}



function avatarLetter(name: string): string {
  return name.charAt(0).toUpperCase();
}

export function ProfilePage({ client, actor, initialTab, goBack, goTo, aiConfig, targetLang, translateMode, translateConfig, imageDescConfig, imageDescLang, initialScrollTop, onScrollTopChange }: ProfilePageProps) {
  const { t } = useI18n();
  const {
    profile, loading, error,
    tab, setTab,
    posts, repostReasons, feedCursor, feedLoading, loadMoreFeed,
    isFollowing, handleFollow, handleUnfollow,
    followList, followItems, followListCursor, followListLoading,
    openFollowList, closeFollowList, loadMoreFollowList,
  } = useProfile(client, actor, initialTab as 'posts' | 'replies' | undefined);

  // Update URL when tab changes so it survives back navigation
  useEffect(() => {
    if (tab !== initialTab) {
      goTo({ type: 'profile', actor, profileTab: tab });
    }
  }, [tab]);

  const { translate, loading: translatingBio } = useTranslation(
    translateConfig?.apiKey || aiConfig.apiKey,
    translateConfig?.baseUrl || aiConfig.baseUrl,
    translateConfig?.model || aiConfig.model,
    targetLang as TargetLang, translateMode,
  );
  const [translatedBio, setTranslatedBio] = useState<string | null>(null);

  const [bannerLightbox, setBannerLightbox] = useState(false);
  const [avatarLightbox, setAvatarLightbox] = useState(false);
  const [bannerLightboxRect, setBannerLightboxRect] = useState<DOMRect | null>(null);
  const [avatarLightboxRect, setAvatarLightboxRect] = useState<DOMRect | null>(null);
  const [bannerNaturalRatio, setBannerNaturalRatio] = useState(1);
  const [avatarNaturalRatio, setAvatarNaturalRatio] = useState(1);
  const [showEditProfile, setShowEditProfile] = useState(false);
  const bannerRef = useRef<HTMLButtonElement>(null);
  const bannerImgRef = useRef<HTMLImageElement>(null);
  const avatarRef = useRef<HTMLButtonElement>(null);
  const avatarImgRef = useRef<HTMLImageElement>(null);
  const isOwn = client.isAuthenticated() && (actor === client.getHandle() || profile?.did === client.getDID());

  const { scrollRef, virtualizer, measureAndCache } = useVirtualizedList(
    posts, `profile-${actor}`, 150, p => p.uri, { initialScrollTop, onScrollTopChange },
  );
  const sentinelRef = useRef<HTMLDivElement>(null);
  const followScrollRef = useRef<HTMLDivElement>(null);
  const followSentinelRef = useRef<HTMLDivElement>(null);

  // ── Auto-load-more sentinel for posts ──
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || !feedCursor || feedLoading) return;
    const obs = new IntersectionObserver(
      ([entry]) => { if (entry?.isIntersecting) loadMoreFeed(); },
      { root: scrollRef.current, rootMargin: '200px' },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [feedCursor, feedLoading, loadMoreFeed, posts.length]);

  // ── Auto-load-more sentinel for follow list ──
  useEffect(() => {
    const el = followSentinelRef.current;
    if (!el || !followListCursor || followListLoading) return;
    const obs = new IntersectionObserver(
      ([entry]) => { if (entry?.isIntersecting) loadMoreFollowList(); },
      { root: followScrollRef.current, rootMargin: '200px' },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [followListCursor, followListLoading, loadMoreFollowList, followItems.length]);

  // ── Loading ──
  if (loading) {
    return (
      <div className="min-h-[100dvh] flex items-center justify-center bg-background animate-fadeIn">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  // ── Not found ──
  if (!profile) {
    return (
      <div className="min-h-[100dvh] flex flex-col items-center justify-center bg-background px-4 animate-fadeIn">
        <button
          onClick={goBack}
          className="text-text-secondary hover:text-text-primary transition-colors text-lg mb-4"
        >
          ← {t('nav.back')}
        </button>
        <p className="text-text-secondary text-lg">{t('profile.notFound')}</p>
      </div>
    );
  }

  const initial = (profile.displayName || profile.handle).charAt(0).toUpperCase();

  // ── Follow list view ──
  if (followList) {
    const isFollowers = followList === 'followers';
    const count = isFollowers ? profile.followersCount : profile.followsCount;
    return (
      <div className="flex flex-col h-[calc(100dvh-3rem)] bg-background animate-fadeIn">
        <div className="flex-shrink-0 border-b border-border px-4 py-3 flex items-center gap-3">
          <button
            onClick={closeFollowList}
            className="text-text-secondary hover:text-text-primary transition-colors text-lg"
          >
            ←
          </button>
          <span className="text-text-primary font-semibold text-lg truncate">
            {isFollowers ? t('profile.followers') : t('profile.following')}
            {count != null ? ` (${count})` : ''}
          </span>
        </div>

        <div ref={followScrollRef} className="flex-1 overflow-y-auto">
          {followListLoading && followItems.length === 0 && (
            <div className="flex items-center justify-center py-12">
              <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            </div>
          )}

          {followItems.map((item) => (
            <div
              key={item.did}
              onClick={() => {
                closeFollowList();
                goTo({ type: 'profile', actor: item.handle });
              }}
              className="flex items-center gap-3 px-4 py-3 border-b border-border cursor-pointer hover:bg-surface transition-colors"
            >
              <div className="w-10 h-10 rounded-full bg-primary flex items-center justify-center text-white font-bold text-sm shrink-0 overflow-hidden">
                {item.avatar ? (
                  <img src={item.avatar} alt="" className="w-full h-full object-cover" />
                ) : (
                  avatarLetter(item.displayName || item.handle)
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-text-primary font-semibold text-sm truncate">
                  {item.displayName || item.handle}
                </p>
                <p className="text-text-secondary text-xs truncate">
                  @{item.handle}
                </p>
              </div>
            </div>
          ))}

          {!followListLoading && followItems.length === 0 && (
            <div className="flex flex-col items-center justify-center py-16 px-4">
              <p className="text-text-secondary text-sm">{t('status.empty')}</p>
            </div>
          )}

          <div ref={followSentinelRef} className="h-px" />

          {followListCursor && !followListLoading && (
            <div className="flex justify-center py-4">
              <button
                onClick={loadMoreFollowList}
                className="rounded-full bg-surface hover:bg-primary/10 text-text-primary text-sm px-6 py-2 transition-colors"
              >
                {t('action.loadMore')}
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }

  // ── Main profile view ──
  return (
    <div className="flex flex-col h-[calc(100dvh-3rem)] bg-background animate-fadeIn">
      {/* Header bar */}
      <div className="flex-shrink-0 border-b border-border px-4 py-3 flex items-center gap-3">
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

      {/* Scrollable content: profile info + feed */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto">
        {/* Banner */}
        {profile.banner ? (
          <button ref={bannerRef} className="h-32 bg-primary/20 w-full border-none cursor-pointer p-0" onClick={() => {
            const el = bannerImgRef.current;
            if (!el) return;
            const rect = bannerRef.current?.getBoundingClientRect();
            if (rect) setBannerLightboxRect(rect);
            if (el.naturalWidth && el.naturalHeight) {
              setBannerNaturalRatio(el.naturalWidth / el.naturalHeight);
            }
            setBannerLightbox(true);
          }}>
            <img ref={bannerImgRef} src={profile.banner} alt="" className="w-full h-full object-cover" />
          </button>
        ) : (
          <div className="h-32 bg-primary/10" />
        )}

        <div className="px-4">
          {/* Avatar + Follow button row */}
          <div className="relative -mt-12 mb-3 flex justify-between items-end">
            {profile.avatar ? (
              <button ref={avatarRef} className="border-none bg-transparent p-0 cursor-pointer" onClick={() => {
                const el = avatarImgRef.current;
                if (!el) return;
                const rect = avatarRef.current?.getBoundingClientRect();
                if (rect) setAvatarLightboxRect(rect);
                if (el.naturalWidth && el.naturalHeight) {
                  setAvatarNaturalRatio(el.naturalWidth / el.naturalHeight);
                }
                setAvatarLightbox(true);
              }}>
                <img
                  ref={avatarImgRef}
                  src={profile.avatar}
                  alt={profile.handle}
                  className="w-24 h-24 rounded-full border-4 border-white dark:border-[#0A0A0A] bg-surface"
                />
              </button>
            ) : (
              <div className="w-24 h-24 rounded-full bg-primary flex items-center justify-center text-white font-bold text-3xl border-4 border-white dark:border-[#0A0A0A]">
                {initial}
              </div>
            )}

            <div className="flex gap-2 items-center">
              {isOwn ? (
                <button
                  onClick={() => setShowEditProfile(true)}
                  className="hover:text-primary transition-colors"
                  title={t('profile.editProfile')}
                >
                  <Icon name="pencil" size={18} />
                </button>
              ) : (profile.viewer?.following && profile.viewer?.followedBy) ? (
                <button
                  onClick={async () => {
                    try {
                      const res = await client.getConvoForMembers([profile.did]);
                      goTo({ type: 'dmChat', conversationId: res.convo.id });
                    } catch { /* silently fail if DMs unavailable */ }
                  }}
                  className="hover:text-primary transition-colors"
                  title={t('profile.sendMessage')}
                >
                  <Icon name="message-square" size={18} />
                </button>
              ) : null}
              {!isOwn && client.isAuthenticated() && (
                <button
                  onClick={() => goTo({ type: 'lists', actor })}
                  className="hover:text-blue-500 transition-colors"
                  title={t('nav.lists')}
                  aria-label={t('nav.lists')}
                >
                  <Icon name="list" size={18} />
                </button>
              )}
              <button
                onClick={() => {
                  if (isWidgetEnabled('aiChat')) {
                    toggleWidget('aiChat');
                  } else {
                    goTo({ type: 'aiChat', sessionId: crypto.randomUUID(), contextProfile: actor });
                  }
                }}
                className="hover:text-purple-500 transition-colors flex items-center gap-1 text-sm"
                title={t('thread.aiAnalyze')}
              >
                <Icon name="astroid-as-AI-Button" size={18} /> AI
              </button>
              {!profile.viewer?.blockedBy && (
                <button
                  onClick={isFollowing ? handleUnfollow : handleFollow}
                  className={`px-5 py-2 rounded-full font-semibold text-sm transition-colors ${
                    isFollowing
                      ? 'border border-red-400 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20'
                      : 'bg-primary hover:bg-primary-hover text-white'
                  }`}
                >
                  {isFollowing ? t('profile.unfollow') : t('profile.follow')}
                </button>
              )}
            </div>
          </div>

          {/* Display name + handle */}
          <div className="mb-3">
            <h1 className="text-2xl font-bold text-text-primary">
              {profile.displayName || profile.handle}
            </h1>
            <p className="text-text-secondary text-sm">
              @{profile.handle}
            </p>
          </div>

          {/* Description */}
          {profile.description && (
            <div className="mb-3">
              <p className="text-text-primary text-sm whitespace-pre-wrap">
                {translatedBio ?? profile.description}
              </p>
              <button
                onClick={async () => {
                  if (translatedBio) {
                    setTranslatedBio(null);
                    return;
                  }
                  const result = await translate(profile.description!);
                  setTranslatedBio(result.translated);
                }}
                disabled={translatingBio}
                className="mt-1 text-xs text-primary hover:underline bg-transparent border-none cursor-pointer p-0"
              >
                {translatingBio ? <><Icon name="clock" size={14} /> ...</> : translatedBio ? <><Icon name="arrow-big-right" size={16} /> {t('action.original')}</> : <><Icon name="languages" size={18} /> {t('action.translate')}</>}
              </button>
            </div>
          )}

          {/* Stats row */}
          <div className="flex items-center gap-4 text-sm mb-1">
            <span className="text-text-primary">
              <strong>{profile.postsCount ?? 0}</strong>{' '}
              <span className="text-text-secondary">{t('profile.posts')}</span>
            </span>
            <button
              onClick={() => openFollowList('followers')}
              className="text-text-primary hover:underline cursor-pointer bg-transparent border-none p-0"
            >
              <strong>{profile.followersCount ?? 0}</strong>{' '}
              <span className="text-text-secondary">{t('profile.followers')}</span>
            </button>
            <button
              onClick={() => openFollowList('follows')}
              className="text-text-primary hover:underline cursor-pointer bg-transparent border-none p-0"
            >
              <strong>{profile.followsCount ?? 0}</strong>{' '}
              <span className="text-text-secondary">{t('profile.following')}</span>
            </button>
          </div>
        </div>

        {/* Tab bar */}
        <div className="sticky top-0 z-10 bg-background border-b border-border mt-4 flex">
          <button
            onClick={() => setTab('posts')}
            className={`flex-1 text-center py-3 text-sm font-medium transition-colors relative ${
              tab === 'posts'
                ? 'text-primary'
                : 'text-text-secondary hover:text-text-primary'
            }`}
          >
            {t('profile.posts')}
            {tab === 'posts' && (
              <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-12 h-0.5 bg-primary rounded-full" />
            )}
          </button>
          <button
            onClick={() => setTab('replies')}
            className={`flex-1 text-center py-3 text-sm font-medium transition-colors relative ${
              tab === 'replies'
                ? 'text-primary'
                : 'text-text-secondary hover:text-text-primary'
            }`}
          >
            {t('profile.tabReplies')}
            {tab === 'replies' && (
              <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-16 h-0.5 bg-primary rounded-full" />
            )}
          </button>
        </div>

        {/* Loading skeleton for initial feed load */}
        {feedLoading && posts.length === 0 && (
          <div className="space-y-2 p-4">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="bg-surface rounded-lg border border-border p-4 animate-pulse">
                <div className="flex gap-3">
                  <div className="w-10 h-10 rounded-full bg-border" />
                  <div className="flex-1 space-y-2">
                    <div className="h-4 bg-border rounded w-1/3" />
                    <div className="h-3 bg-border rounded w-full" />
                    <div className="h-3 bg-border rounded w-2/3" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Error */}
        {error && (
          <div role="alert" className="m-4 p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 text-sm">
            {error}
          </div>
        )}

        {/* Empty state */}
        {!feedLoading && !error && posts.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 text-text-secondary">
            <span className="text-4xl mb-3">🕊️</span>
            <p className="text-sm">{t('status.noPosts')}</p>
          </div>
        )}

        {/* Virtual scroll posts */}
        <div
          style={{
            height: `${virtualizer.getTotalSize()}px`,
            width: '100%',
            position: 'relative',
          }}
        >
          {virtualizer.getVirtualItems().map((virtualItem) => {
            const post = posts[virtualItem.index];
            if (!post) return null;
            return (
              <div
                key={post.uri}
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '100%',
                  transform: `translateY(${virtualItem.start}px)`,
                }}
                ref={(el) => measureAndCache(el, post)}
                data-index={virtualItem.index}
              >
                <PostCard
                  post={post}
                  onClick={() => goTo({ type: 'thread', uri: post.uri })}
                  goTo={goTo}
                  repostBy={repostReasons[post.uri]}
                  imageDescConfig={imageDescConfig}
                  imageDescLang={imageDescLang}
                  client={client}
                >
                  <PostActionsRow client={client} goTo={goTo} post={post} />
                </PostCard>
              </div>
            );
          })}
        </div>

        {/* Load more sentinel */}
        <div ref={sentinelRef} className="h-px" />

        {/* Load more button fallback */}
        {feedCursor && !feedLoading && (
          <div className="flex justify-center py-4">
            <button
              onClick={loadMoreFeed}
              className="rounded-full bg-surface hover:bg-primary/10 text-text-primary text-sm px-6 py-2 transition-colors"
            >
              {t('action.loadMore')}
            </button>
          </div>
        )}

        {feedLoading && posts.length > 0 && (
          <div className="flex justify-center py-4">
            <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        )}
      </div>

      <ImageLightboxDialog
        open={bannerLightbox && profile.banner !== undefined && bannerLightboxRect !== null}
        images={[{ url: profile.banner ?? '', alt: 'Banner' }]}
        initial={0}
        sourceRects={[bannerLightboxRect ?? new DOMRect(window.innerWidth / 2 - 200, 60, 400, 200)]}
        naturalAspectRatio={bannerNaturalRatio}
        onClose={() => { setBannerLightbox(false); setBannerLightboxRect(null); }}
      />
      <ImageLightboxDialog
        open={avatarLightbox && profile.avatar !== undefined && avatarLightboxRect !== null}
        images={[{ url: profile.avatar ?? '', alt: profile.handle }]}
        initial={0}
        sourceRects={[avatarLightboxRect ?? new DOMRect(window.innerWidth / 2 - 48, window.innerHeight / 2 - 48, 96, 96)]}
        naturalAspectRatio={avatarNaturalRatio}
        onClose={() => { setAvatarLightbox(false); setAvatarLightboxRect(null); }}
      />
      {showEditProfile && profile && (
        <EditProfileModal client={client} profile={profile} onClose={() => setShowEditProfile(false)} onSaved={() => { setShowEditProfile(false); }} />
      )}

    </div>
  );
}
