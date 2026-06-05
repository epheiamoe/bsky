import React, { useEffect, useRef, useCallback, useState, useContext } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import type { PostView } from '@bsky/core';
import type { AppView } from '@bsky/app';
import { useI18n, useModerationBatch, getScrollTop } from '@bsky/app';
import { PostPreviewCard } from './PostPreviewCard.js';
import { PostActionsRow } from './PostActionsRow.js';
import { FeedHeader } from './FeedHeader';
import { PullToRefresh, REFRESH_NOOP } from './PullToRefresh.js';
import { MobileHeaderCtx } from './Layout.js';
import { Icon } from './Icon.js';
import { LabelerFailureBanner } from './LabelerFailureBanner.js';
import { LabelerFailureToast } from './LabelerFailureToast.js';
import type { BskyClient } from '@bsky/core';
import { useModerationConfig } from '../hooks/useModerationConfig.js';

interface FeedTimelineProps {
  goTo: (v: AppView) => void;
  posts: PostView[];
  loading: boolean;
  cursor?: string;
  error: string | null;
  loadMore?: () => Promise<void>;
  refresh?: () => Promise<void>;
  initialScrollTop?: number;
  onScrollTopChange?: (top: number) => void;
  feedUri?: string;
  client?: BskyClient | null;
  isLiked?: (uri: string) => boolean;
  isReposted?: (uri: string) => boolean;
  likePost?: (uri: string, cid?: string) => void;
  repostPost?: (uri: string, cid?: string) => void;
  imageDescConfig?: import('@bsky/core').AIConfig;
  imageDescLang?: string;
  singleImageFill?: boolean;
  previewLines?: number;
  quotedPreviewLines?: number;
}

function SkeletonCard() {
  return (
    <div className="bg-surface rounded-lg border border-border p-4 animate-pulse">
      <div className="flex gap-3">
        <div className="w-10 h-10 rounded-full bg-border" />
        <div className="flex-1 space-y-2">
          <div className="h-4 bg-border rounded w-1/3" />
          <div className="h-3 bg-border rounded w-full" />
          <div className="h-3 bg-border rounded w-2/3" />
        </div>
      </div>
    </div>
  );
}

const ESTIMATED_POST_HEIGHT = 120; // px — rough estimate per post card

// Module-level cache: post.uri → measured pixel height (survives mount/unmount)
const _heightCache = new Map<string, number>();

// Module-level cache: feed key → top visible anchor post + pixel offset within that post.
// Used for URI-based restoration so image loading does not shift the perceived position.
const _anchorCache = new Map<string, { uri: string | undefined; offset: number }>();

function saveAnchor(key: string, anchor: { uri: string | undefined; offset: number }): void {
  _anchorCache.set(key, anchor);
}

function getAnchor(key: string): { uri: string | undefined; offset: number } | undefined {
  return _anchorCache.get(key);
}

export function FeedTimeline({ goTo, posts, loading, cursor, error, loadMore, refresh, initialScrollTop, onScrollTopChange, feedUri, client, isLiked, isReposted, likePost, repostPost, imageDescConfig, imageDescLang, singleImageFill, previewLines = 10, quotedPreviewLines = 8 }: FeedTimelineProps) {
  const { t } = useI18n();
  const { config } = useModerationConfig();
  const { decisions, failedLabelers } = useModerationBatch(posts, config, client ?? null);
  const { onSidebarOpen, setTabBarHidden, tabBarHidden, dmCount } = useContext(MobileHeaderCtx);
  const [mobileCollapsed, setMobileCollapsed] = useState(false);
  const lastScrollY = useRef(0);
  const scrollRef = useRef<HTMLDivElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const prevDecisionsRef = useRef<Map<string, import('@bsky/core').ModerationDecision>>(new Map());

  // ── Invalidate height cache when moderation decisions change ──
  useEffect(() => {
    const prevDecisions = prevDecisionsRef.current;
    let hasChanges = false;

    // Check for new or changed decisions
    for (const [uri, decision] of decisions) {
      const prev = prevDecisions.get(uri);
      if (!prev || prev.contentAction !== decision.contentAction || prev.mediaAction !== decision.mediaAction) {
        _heightCache.delete(uri);
        hasChanges = true;
      }
    }

    // Check for removed decisions (e.g., posts deleted from list)
    for (const uri of prevDecisions.keys()) {
      if (!decisions.has(uri)) {
        _heightCache.delete(uri);
        hasChanges = true;
      }
    }

    if (hasChanges) {
      virtualizer.measure();
    }

    prevDecisionsRef.current = new Map(decisions);
  }, [decisions]);

  // ── Virtual scroll ──
  const virtualizer = useVirtualizer({
    count: loading && posts.length === 0 ? 5 : posts.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: (index) => {
      const post = posts[index];
      if (post) {
        const cached = _heightCache.get(post.uri);
        if (cached) return cached;
      }
      return ESTIMATED_POST_HEIGHT;
    },
    overscan: 5,
    initialOffset: (initialScrollTop ?? 0) > 0 ? initialScrollTop : 0,
  });

  // ── Restore scroll position when feed changes and data is loaded ──
  const restoredForRef = useRef<string | null>(null);
  const isTransitioningRef = useRef(false);
  const prevFeedUriRef = useRef(feedUri);

  // When feed changes, pause scroll reporting and reset container to top so the
  // browser doesn't auto-clamp the old feed's saved position while skeletons render.
  useEffect(() => {
    if (prevFeedUriRef.current === feedUri) return;
    prevFeedUriRef.current = feedUri;
    isTransitioningRef.current = true;
    restoredForRef.current = null;
    if (scrollRef.current) {
      scrollRef.current.scrollTop = 0;
    }
  }, [feedUri]);

  useEffect(() => {
    const key = `feed-${feedUri ?? 'following'}`;
    // Wait until loading finishes and we have posts (or a definitive empty state).
    if (loading) {
      restoredForRef.current = null;
      return;
    }
    if (restoredForRef.current === key) return;
    restoredForRef.current = key;

    const anchor = getAnchor(key);
    const saved = getScrollTop(key);

    // Prefer URI-based restoration: find the same top-visible post and restore
    // the pixel offset within it. This survives image-loading height changes.
    if (anchor?.uri && posts.some(p => p.uri === anchor.uri) && scrollRef.current) {
      const idx = posts.findIndex(p => p.uri === anchor.uri);
      requestAnimationFrame(() => {
        virtualizer.scrollToIndex(idx, { align: 'start' });
        requestAnimationFrame(() => {
          if (scrollRef.current) {
            scrollRef.current.scrollTop += anchor.offset;
          }
          requestAnimationFrame(() => {
            isTransitioningRef.current = false;
          });
        });
      });
      return;
    }

    // Fallback to raw pixel restoration.
    if (saved !== undefined && saved > 0 && scrollRef.current) {
      requestAnimationFrame(() => {
        virtualizer.scrollToOffset(saved, { align: 'start' });
        requestAnimationFrame(() => {
          isTransitioningRef.current = false;
        });
      });
    } else {
      isTransitioningRef.current = false;
    }
  }, [feedUri, loading, posts, virtualizer]);

  // ── Report scroll position to parent ──
  // During a feed transition the container height collapses to skeleton size and
  // the browser auto-clamps scrollTop; ignore those values so the old feed's
  // saved position isn't overwritten.
  const reportScrollTop = useCallback(() => {
    if (!onScrollTopChange || !scrollRef.current || isTransitioningRef.current) return;
    const top = scrollRef.current.scrollTop;
    onScrollTopChange(top);

    // Also snapshot the top-visible post as an anchor. This lets us restore by
    // post URI on the next visit, avoiding drift from lazy-loaded images.
    const key = `feed-${feedUri ?? 'following'}`;
    const items = virtualizer.getVirtualItems();
    const topItem = items[0];
    if (topItem) {
      const anchorUri = posts[topItem.index]?.uri;
      const offset = top - topItem.start;
      saveAnchor(key, { uri: anchorUri, offset });
    }
  }, [onScrollTopChange, feedUri, virtualizer, posts]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.addEventListener('scroll', reportScrollTop, { passive: true });
    const raf = requestAnimationFrame(reportScrollTop);
    return () => {
      el.removeEventListener('scroll', reportScrollTop);
      cancelAnimationFrame(raf);
    };
  }, [reportScrollTop]);

  // ── Auto-load-more sentinel ──
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || !loadMore || !cursor) return;
    const obs = new IntersectionObserver(
      ([entry]) => { if (entry?.isIntersecting) loadMore(); },
      { root: scrollRef.current, rootMargin: '200px' },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [loadMore, cursor, posts.length]);

  // ── Hide header/footer on scroll down (mobile) ──
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onScroll = () => {
      const st = el.scrollTop;
      if (st > lastScrollY.current && st > 50) {
        setMobileCollapsed(true);
        setTabBarHidden(true);
      } else if (st < lastScrollY.current || st < 10) {
        setMobileCollapsed(false);
        setTabBarHidden(false);
      }
      lastScrollY.current = st;
    };
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => el.removeEventListener('scroll', onScroll);
  }, [scrollRef, setTabBarHidden]);

  const menuBtn = (
    <div className="relative">
      <button
        onClick={onSidebarOpen}
        className="md:hidden text-text-secondary hover:text-text-primary transition-colors p-1 -ml-1 text-lg leading-none"
        aria-label={t('nav.menu')}
      >
        <Icon name="menu" size={20} />
      </button>
      {dmCount > 0 && <span className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-red-500 rounded-full" aria-hidden="true" />}
    </div>
  );

  const settingsBtn = null;

  // Filter banner/block level failures for banner display
  const bannerFailures = failedLabelers.filter(f => f.behavior === 'banner' || f.behavior === 'block');

  return (
    <div className="flex flex-col h-dvh md:h-[calc(100dvh-3rem)] animate-fadeIn">
      <FeedHeader
        goTo={goTo}
        currentFeedUri={feedUri}
        refresh={refresh}
        client={client}
        mobileMenuButton={menuBtn}
        mobileCollapsed={mobileCollapsed}
      />
      <LabelerFailureBanner failedLabelers={bannerFailures} />
      <LabelerFailureToast failedLabelers={failedLabelers} />
      
      <PullToRefresh onRefresh={refresh ?? REFRESH_NOOP} scrollRef={scrollRef} />
      <div ref={scrollRef} className="flex-1 overflow-y-auto pb-14">
        {error && (
          <div role="alert" className="m-4 p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 text-sm">
            {error}
          </div>
        )}

        {loading && posts.length === 0 && (
          <div className="space-y-2 p-4">
            {Array.from({ length: 5 }).map((_, i) => (
              <SkeletonCard key={i} />
            ))}
          </div>
        )}

        {!loading && !error && posts.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 text-text-secondary">
            <Icon name="bird" size={48} className="mb-3" />
            <p className="text-sm">{t('status.noPosts')}</p>
          </div>
        )}

        <div
          role="list"
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
                ref={(el: HTMLDivElement | null) => {
                  if (el) {
                    virtualizer.measureElement(el);
                    const h = el.getBoundingClientRect().height;
                    if (h > 0) _heightCache.set(post.uri, h);
                  }
                }}
                data-index={virtualItem.index}
                role="listitem"
              >
                <PostPreviewCard
                  post={post}
                  onClick={() => goTo({ type: 'thread', uri: post.uri })}
                  goTo={goTo}
                  imageDescConfig={imageDescConfig}
                  imageDescLang={imageDescLang}
                  singleImageFill={singleImageFill}
                  client={client}
                  previewLines={previewLines}
                  quotedPreviewLines={quotedPreviewLines}
                  moderationDecision={decisions.get(post.uri) ?? null}
                >
                  <PostActionsRow client={client} goTo={goTo} post={post} />
                </PostPreviewCard>
              </div>
            );
          })}
        </div>

        {/* Auto-load sentinel */}
        <div ref={sentinelRef} className="h-px" />

        {cursor && (
          <div className="flex justify-center py-4">
            <button
              onClick={loadMore}
              disabled={loading}
              className="rounded-full bg-primary hover:bg-primary-hover text-white text-sm font-semibold px-6 py-2 disabled:opacity-50 transition-colors"
            >
              {loading ? t('action.loading') : t('action.loadMore')}
            </button>
          </div>
        )}

        {posts.length > 0 && (
          <p className="text-center text-text-secondary text-xs py-4">
            {t('post.postsCount', { n: posts.length })}
          </p>
        )}
      </div>
    </div>
  );
}
