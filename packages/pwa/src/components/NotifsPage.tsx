import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { BskyClient } from '@bsky/core';
import { useNotifications, useI18n, useVirtualizedList } from '@bsky/app';
import type { AppView } from '@bsky/app';
import { Icon } from './Icon.js';
import { PullToRefresh } from './PullToRefresh.js';
import { NotifTabs, type NotifTab } from './NotifTabs.js';
import { NotifItem } from './NotifItem.js';
import { useNotificationGroups } from '../hooks/useNotificationGroups.js';
import { useNotificationPosts } from '../hooks/useNotificationPosts.js';

interface NotifsPageProps {
  client: BskyClient;
  goBack: () => void;
  goTo: (v: AppView) => void;
  initialScrollTop?: number;
  onScrollTopChange?: (top: number) => void;
  autoMarkRead?: boolean;
}

export function NotifsPage({
  client,
  goBack,
  goTo,
  initialScrollTop,
  onScrollTopChange,
  autoMarkRead = true,
}: NotifsPageProps) {
  const { t } = useI18n();
  const { notifications, loading, error, refresh, unreadCount, markAllAsRead } = useNotifications(client);
  const [activeTab, setActiveTab] = useState<NotifTab>('all');
  const autoMarkedRef = useRef(false);

  // 进入通知页后，若存在未读通知则自动标记已读（默认开启）
  useEffect(() => {
    if (autoMarkRead && unreadCount > 0 && !autoMarkedRef.current) {
      autoMarkedRef.current = true;
      void markAllAsRead();
    }
  }, [autoMarkRead, unreadCount, markAllAsRead]);

  const groups = useNotificationGroups(notifications);

  const filteredGroups = useMemo(
    () =>
      groups.filter((g) => {
        if (activeTab === 'all') return true;
        return g.reason === 'mention' || g.reason === 'reply';
      }),
    [groups, activeTab],
  );

  const { posts, loading: postsLoading, error: postsError } = useNotificationPosts(client, filteredGroups);

  const { scrollRef, virtualizer, measureAndCache } = useVirtualizedList(
    filteredGroups,
    'notifs',
    96,
    (g) => g.key,
    { initialScrollTop, onScrollTopChange },
  );

  // Post previews change item heights; remeasure virtual list when posts arrive
  useEffect(() => {
    if (!postsLoading) {
      virtualizer.measure();
    }
  }, [postsLoading, posts, virtualizer]);

  const handleRefresh = useCallback(async () => {
    await refresh();
  }, [refresh]);

  return (
    <div className="flex flex-col h-[calc(100dvh-3rem)] bg-background animate-fadeIn">
      <div className="flex-shrink-0 border-b border-border px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            onClick={goBack}
            className="text-text-secondary hover:text-text-primary transition-colors text-lg"
            aria-label={t('a11y.back')}
          >
            <Icon name="arrow-big-left" size={20} />
          </button>
          <h1 className="text-text-primary font-semibold text-lg flex items-center gap-2">
            <Icon name="bell" size={20} />
            {t('notifications.title')}
          </h1>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleRefresh}
            disabled={loading}
            className="text-text-secondary hover:text-text-primary disabled:opacity-50 transition-colors p-1"
            aria-label={t('action.refresh')}
            title={t('action.refresh')}
          >
            <Icon name="refresh-cw" size={18} />
          </button>
          <button
            onClick={() => goTo({ type: 'settings' })}
            className="text-text-secondary hover:text-text-primary transition-colors p-1"
            aria-label={t('notifications.settings')}
            title={t('notifications.settings')}
          >
            <Icon name="settings" size={20} />
          </button>
        </div>
      </div>

      <NotifTabs activeTab={activeTab} onChange={setActiveTab} />

      {(error || postsError) && (
        <div
          role="alert"
          className="m-4 p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 text-sm"
        >
          {error || postsError}
        </div>
      )}

      {loading && notifications.length === 0 ? (
        <div className="flex items-center justify-center py-12">
          <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      ) : filteredGroups.length > 0 ? (
        <>
          <PullToRefresh onRefresh={refresh} scrollRef={scrollRef} />
          <div ref={scrollRef} role="list" className="flex-1 overflow-y-auto">
            <div
              style={{ height: virtualizer.getTotalSize(), position: 'relative', width: '100%' }}
            >
              {virtualizer.getVirtualItems().map((vi) => {
                const group = filteredGroups[vi.index]!;
                return (
                  <div
                    key={group.key}
                    data-index={vi.index}
                    ref={(el) => measureAndCache(el, group)}
                    style={{
                      position: 'absolute',
                      top: 0,
                      left: 0,
                      width: '100%',
                      transform: `translateY(${vi.start}px)`,
                    }}
                  >
                    <NotifItem
                      group={group}
                      post={posts.get(group.reasonSubject ?? '')}
                      index={vi.index}
                      goTo={goTo}
                      loadingPost={postsLoading}
                    />
                  </div>
                );
              })}
            </div>
          </div>
          {postsLoading && (
            <div className="sr-only" role="status" aria-live="polite">
              {t('action.loading')}
            </div>
          )}
        </>
      ) : (
        <div className="flex flex-col items-center justify-center py-16 px-4">
          <p className="text-text-secondary text-sm">{t('notifications.empty')}</p>
        </div>
      )}
    </div>
  );
}
