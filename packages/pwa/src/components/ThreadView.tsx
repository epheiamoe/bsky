import React, { useMemo, useState, useCallback, useEffect } from 'react';
import { useThread, useBookmarks, useTranslation, useI18n } from '@bsky/app';
import type { AppView } from '@bsky/app';
import type { BskyClient, AIConfig } from '@bsky/core';
import { PostCard } from './PostCard.js';
import { ImageGrid } from './PostCard.js';
import { formatTime, uriToRkey, getPostUrl } from '../utils/format.js';

interface ThreadViewProps {
  client: BskyClient;
  uri: string;
  goBack: () => void;
  goTo: (v: AppView) => void;
  aiConfig: AIConfig;
  targetLang: string;
  translateMode: 'simple' | 'json';
}

function Spinner() {
  return (
    <div className="flex items-center justify-center py-16">
      <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
    </div>
  );
}

function ActionButtons({
  uri,
  cid,
  handle,
  rkey,
  depth,
  likePost,
  repostPost,
  isLiked,
  isReposted,
  isBookmarked,
  toggleBookmark,
  goTo,
  onTranslate,
}: {
  uri: string;
  cid: string;
  handle: string;
  rkey: string;
  depth: number;
  likePost: (uri: string) => void;
  repostPost: (uri: string) => void;
  isLiked: (uri: string) => boolean;
  isReposted: (uri: string) => boolean;
  isBookmarked: (uri: string) => boolean;
  toggleBookmark: (uri: string, cid: string) => void;
  goTo: (v: AppView) => void;
  onTranslate?: () => void;
}) {
  const { t } = useI18n();
  const sizeClass = depth > 0 ? 'text-xs gap-2' : 'text-sm gap-3';
  const [showRepostMenu, setShowRepostMenu] = useState(false);

  return (
    <div className={`flex items-center ${sizeClass} text-text-secondary mt-2`}>
      <button
        onClick={() => likePost(uri)}
        className={`hover:text-red-500 transition-colors ${isLiked(uri) ? 'text-red-500' : ''}`}
      >
        ❤️ {isLiked(uri) ? t('action.liked') : t('action.like')}
      </button>
      <div className="relative inline-flex">
        <button
          onClick={() => setShowRepostMenu(!showRepostMenu)}
          className={`hover:text-green-500 transition-colors ${isReposted(uri) ? 'text-green-500' : ''}`}
        >
          ♻️ {isReposted(uri) ? t('action.reposted') : t('action.repost')}
        </button>
        {showRepostMenu && (
          <div className="absolute bottom-full left-0 mb-1 bg-white dark:bg-[#1a1a2e] border border-border rounded-lg shadow-lg z-30 py-1 min-w-[120px]">
            <button onClick={() => { repostPost(uri); setShowRepostMenu(false); }} className="w-full text-left px-3 py-1.5 text-sm hover:bg-surface transition-colors">♻ Repost</button>
            <button onClick={() => { goTo({ type: 'compose', quoteUri: uri }); setShowRepostMenu(false); }} className="w-full text-left px-3 py-1.5 text-sm hover:bg-surface transition-colors">📌 Quote</button>
          </div>
        )}
      </div>
      <button
        onClick={() => goTo({ type: 'compose', replyTo: uri })}
        className="hover:text-primary transition-colors"
      >
        💬 {t('action.reply')}
      </button>
      <button
        onClick={() => toggleBookmark(uri, cid)}
        className={`hover:text-yellow-500 transition-colors ${isBookmarked(uri) ? 'text-yellow-500' : ''}`}
      >
        {isBookmarked(uri) ? '🔖 ' + t('action.bookmarked') : '🔖 ' + t('action.bookmark')}
      </button>
      <button
        onClick={() => goTo({ type: 'aiChat', contextUri: uri })}
        className="hover:text-primary transition-colors"
      >
        🤖 {t('thread.aiAnalyze')}
      </button>
      <button
        onClick={onTranslate}
        disabled={!onTranslate}
        className={`hover:text-primary transition-colors ${!onTranslate ? 'opacity-30 cursor-not-allowed' : ''}`}
      >
        🌐 {t('action.translate')}
      </button>
      <button
        onClick={() => {
          const url = getPostUrl(handle, rkey);
          navigator.clipboard.writeText(url).catch(() => {});
        }}
        className="hover:text-primary transition-colors"
      >
        📋 {t('action.copyLink')}
      </button>
    </div>
  );
}

export function ThreadView({ client, uri, goBack, goTo, aiConfig, targetLang, translateMode }: ThreadViewProps) {
  const {
    flatLines,
    loading,
    focused,
    likePost,
    repostPost,
    isLiked,
    isReposted,
    expandReplies,
  } = useThread(client, uri);

  const { isBookmarked, toggleBookmark } = useBookmarks(client);
  const { translate, loading: translating } = useTranslation(
    aiConfig.apiKey, aiConfig.baseUrl, aiConfig.model,
    targetLang as 'zh' | 'en' | 'ja' | 'ko' | 'fr' | 'de' | 'es',
    translateMode,
  );

  const [translationResult, setTranslationResult] = useState<{ translated: string; sourceLang?: string } | null>(null);
  const [isFollowing, setIsFollowing] = useState(false);
  const [followUri, setFollowUri] = useState<string | undefined>();

  // Clear translation when focused post changes
  useEffect(() => {
    setTranslationResult(null);
  }, [focused?.uri]);

  // Fetch follow status when focused post changes
  useEffect(() => {
    if (!client || !focused?.handle) { setIsFollowing(false); return; }
    client.getProfile(focused.handle).then(p => {
      setIsFollowing(!!p.viewer?.following);
      setFollowUri(p.viewer?.following);
    }).catch(() => { setIsFollowing(false); });
  }, [client, focused?.handle]);

  const handleFollow = useCallback(() => {
    if (!client || !focused) return;
    if (isFollowing && followUri) {
      client.unfollow(followUri).then(() => { setIsFollowing(false); setFollowUri(undefined); }).catch(() => {});
    } else {
      client.getProfile(focused.handle).then(p => { client.follow(p.did).then(r => { setIsFollowing(true); setFollowUri(r.uri); }).catch(() => {}); }).catch(() => {});
    }
  }, [client, focused, isFollowing, followUri]);

  const hasText = (focused?.text?.trim().length ?? 0) > 0;

  const handleTranslate = useCallback(async () => {
    if (!focused || translating || !hasText) return;
    if (translationResult) { setTranslationResult(null); return; }
    try {
      const result = await translate(
        focused.text,
        targetLang as 'zh' | 'en' | 'ja' | 'ko' | 'fr' | 'de' | 'es',
      );
      setTranslationResult(result);
    } catch { /* ignore */ }
  }, [focused, translating, translationResult, translate, targetLang]);

  const { parentLines, replyLines } = useMemo(() => {
    const parents: typeof flatLines = [];
    const replies: typeof flatLines = [];
    const maxDepth = (focused?.depth ?? 0) + 1;

    for (const line of flatLines) {
      if (line.depth < 0) parents.push(line);
      else if (line.depth > 0 && line.depth <= maxDepth && line.uri !== focused?.uri) replies.push(line);
    }

    parents.sort((a, b) => a.depth - b.depth);
    replies.sort(
      (a, b) =>
        new Date(a.indexedAt).getTime() - new Date(b.indexedAt).getTime(),
    );

    return { parentLines: parents, replyLines: replies };
  }, [flatLines]);

  const { t } = useI18n();
  const isTheme = focused?.isRoot && focused?.depth === 0;
  const focusedTitle = isTheme ? t('thread.rootPost') : t('thread.currentPost');

  if (loading) return <Spinner />;

  return (
    <div className="min-h-screen bg-white dark:bg-[#0A0A0A]">
      <header className="sticky top-0 z-10 bg-white/80 dark:bg-[#0A0A0A]/80 backdrop-blur-md border-b border-border">
        <div className="max-w-content mx-auto px-4 h-14 flex items-center gap-3">
          <button
            onClick={goBack}
            className="flex items-center gap-1 text-text-secondary hover:text-text-primary transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
            <span className="text-sm">{t('nav.back')}</span>
          </button>
          <h1 className="text-lg font-semibold text-text-primary">{t('thread.title')}</h1>
        </div>
      </header>

      <main className="max-w-content mx-auto px-4 py-6 space-y-4">
        {/* ── 讨论源 (parent chain) ── */}
        {parentLines.length > 0 && (
          <section className="space-y-2">
            <p className="text-xs text-text-secondary font-medium pl-4">── {t('thread.discussionSource')} ──</p>
            {parentLines.map((line) => (
              <div
                key={line.uri || line.rkey}
                onClick={() => goTo({ type: 'thread', uri: line.uri })}
                className="pl-4 border-l-2 border-border opacity-60 hover:opacity-100 transition-opacity rounded-r-lg py-3 cursor-pointer"
              >
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-sm font-medium text-text-primary">
                    {line.displayName}
                  </span>
                  <span className="text-xs text-text-secondary">
                    @{line.handle}
                  </span>
                  <span className="text-xs text-text-secondary">·</span>
                  <span className="text-xs text-text-secondary">
                    {formatTime(line.indexedAt)}
                  </span>
                </div>
                <p className="text-sm text-text-primary leading-relaxed whitespace-pre-wrap line-clamp-4">
                  {line.text}
                </p>
              </div>
            ))}
          </section>
        )}

        {/* ── 主题帖 / 当前帖子 ── */}
        {focused && (
          <article className="border-l-4 border-primary pl-4 py-3 rounded-r-lg bg-surface/50">
            <p className="text-xs text-text-secondary font-medium mb-2">── {focusedTitle} ──</p>
            <div className="flex items-center gap-2 mb-2">
              <div
                className="w-10 h-10 rounded-full bg-primary flex-shrink-0 overflow-hidden cursor-pointer hover:opacity-80 transition-opacity"
                onClick={(e) => { e.stopPropagation(); goTo({ type: 'profile', actor: focused.handle }); }}
              >
                {focused.authorAvatar ? (
                  <img src={focused.authorAvatar} alt={focused.displayName} className="w-full h-full object-cover" />
                ) : (
                  <span className="w-full h-full flex items-center justify-center text-white font-bold text-sm">
                    {focused.displayName?.charAt(0) || '?'}
                  </span>
                )}
              </div>
              <span className="text-base font-semibold text-text-primary">
                {focused.displayName}
              </span>
              <span className="text-sm text-text-secondary">
                @{focused.handle}
              </span>
              <span className="text-sm text-text-secondary">·</span>
              <span className="text-sm text-text-secondary">
                {formatTime(focused.indexedAt)}
              </span>
              <button
                onClick={handleFollow}
                className={`ml-auto text-xs px-3 py-1 rounded-full font-medium transition-colors ${
                  isFollowing
                    ? 'bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 hover:bg-red-100'
                    : 'bg-primary text-white hover:bg-primary-hover'
                }`}
              >
                {isFollowing ? t('profile.unfollow') : t('profile.follow')}
              </button>
            </div>
            <p className="text-lg text-text-primary leading-relaxed whitespace-pre-wrap">
              {focused.text}
            </p>
            {translating && <p className="text-text-secondary text-sm mt-1">🌐 {t('action.translating')}</p>}
            {translationResult && !translating && (
              <div className="mt-2 p-3 bg-primary/5 border border-primary/20 rounded-lg">
                <p className="text-xs text-primary font-medium mb-1">
                  🌐 {t('action.translate')} ({targetLang})
                  {translationResult.sourceLang && (
                    <span className="text-text-secondary ml-2">{t('thread.sourceLang')}: {translationResult.sourceLang}</span>
                  )}
                </p>
                <p className="text-text-primary text-sm leading-relaxed whitespace-pre-wrap">{translationResult.translated}</p>
              </div>
            )}
            {focused.imageUrls?.length > 0 && (
              <ImageGrid images={focused.imageUrls.map(url => ({ url, alt: '' }))} />
            )}
            {focused.externalLink && (
              <a href={focused.externalLink.uri} target="_blank" rel="noopener noreferrer"
                className="mt-2 block border border-border rounded-lg p-3 hover:bg-surface transition-colors no-underline"
              >
                <p className="text-text-primary text-sm font-medium line-clamp-1">{focused.externalLink.title || focused.externalLink.uri}</p>
                {focused.externalLink.description && <p className="text-text-secondary text-xs mt-0.5 line-clamp-2">{focused.externalLink.description}</p>}
                <p className="text-primary text-xs mt-1 truncate">🔗 {focused.externalLink.uri}</p>
              </a>
            )}
            {focused.mediaTags.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1">
                {focused.mediaTags.map((tag, i) => (
                  <span key={i} className="text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary">
                    {tag}
                  </span>
                ))}
              </div>
            )}
            <div className="mt-3 flex items-center gap-4 text-sm text-text-secondary">
              <span>💬 {focused.replyCount}</span>
              <span>♻️ {focused.repostCount}</span>
              <span>❤️ {focused.likeCount}</span>
            </div>
            <ActionButtons
              uri={focused.uri}
              cid={focused.cid}
              handle={focused.handle}
              rkey={focused.rkey}
              depth={0}
              likePost={likePost}
              repostPost={repostPost}
              isLiked={isLiked}
              isReposted={isReposted}
              isBookmarked={isBookmarked}
              toggleBookmark={toggleBookmark}
              goTo={goTo}
              onTranslate={hasText ? handleTranslate : undefined}
            />
          </article>
        )}

        {/* ── 回复 ── */}
        {replyLines.length > 0 && (
          <section className="space-y-3">
            <p className="text-xs text-text-secondary font-medium pl-4">── {t('thread.replies')} ({replyLines.length}) ──</p>
            {replyLines.map((line) => {
              if (line.isTruncation) {
                return (
                  <div key={line.text} className="flex justify-center py-3">
                    <button
                      onClick={expandReplies}
                      className="text-sm text-primary hover:text-primary-hover cursor-pointer transition-colors"
                    >
                      {line.text.replace('（', '').replace('）', '')}
                    </button>
                  </div>
                );
              }
              return (
                <div
                  key={line.uri || line.rkey}
                  style={{ marginLeft: Math.min((line.depth - 1) * 16, 48) }}
                >
                  <PostCard
                    line={line}
                    onClick={line.uri ? () => goTo({ type: 'thread', uri: line.uri }) : undefined}
                    goTo={goTo}
                  >
                    <ActionButtons
                      uri={line.uri}
                      cid={line.cid}
                      handle={line.handle}
                      rkey={line.rkey}
                      depth={line.depth}
                      likePost={likePost}
                      repostPost={repostPost}
                      isLiked={isLiked}
                      isReposted={isReposted}
                      isBookmarked={isBookmarked}
                      toggleBookmark={toggleBookmark}
                      goTo={goTo}
                    />
                  </PostCard>
                </div>
              );
            })}
          </section>
        )}

        {!loading && flatLines.length === 0 && (
          <div className="text-center py-16 text-text-secondary">
            <p className="text-4xl mb-3">📭</p>
            <p>{t('thread.loadFailed')}</p>
          </div>
        )}
      </main>
    </div>
  );
}
