import React from 'react';
import type { BskyClient, Notification } from '@bsky/core';
import { useNotifications, useI18n, useVirtualizedList } from '@bsky/app';
import type { AppView } from '@bsky/app';
import { Icon } from './Icon.js';

interface NotifsPageProps {
  client: BskyClient;
  goBack: () => void;
  goTo: (v: AppView) => void;
  initialScrollTop?: number;
  onScrollTopChange?: (top: number) => void;
}

function timeAgo(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const seconds = Math.floor((now - then) / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo`;
  return `${Math.floor(months / 12)}y`;
}

const REASON_EMOJI: Record<string, string> = {
  like: '\u2665',
  repost: '\u267B',
  follow: '\uD83D\uDC64',
  reply: '\uD83D\uDCAC',
  mention: '@',
  quote: '\uD83D\uDCAC',
};

function reasonText(reason: string, t: (key: string) => string): string {
  const map: Record<string, string> = {
    like: 'notifications.reason.like',
    repost: 'notifications.reason.repost',
    follow: 'notifications.reason.follow',
    reply: 'notifications.reason.reply',
    mention: 'notifications.reason.mention',
    quote: 'notifications.reason.quote',
  };
  return t(map[reason] ?? reason);
}

function NotifItem({ n, t, goTo, index }: { n: Notification; t: (key: string) => string; goTo: (v: AppView) => void; index: number }) {
  const emoji = REASON_EMOJI[n.reason] ?? null;
  const reasonLabel = reasonText(n.reason, t);
  const reasonSubject = n.reasonSubject;

  return (
    <div
      onClick={reasonSubject ? () => goTo({ type: 'thread', uri: reasonSubject! }) : undefined}
      className={`border-b border-border px-4 py-3 hover:bg-surface transition-colors animate-slideUp stagger-${(index % 6) + 1} ${reasonSubject ? 'cursor-pointer' : ''}`}>
      <div className="flex gap-3">
        <div className="w-10 h-10 rounded-full shrink-0 overflow-hidden">
          {n.author.avatar ? (
            <img src={n.author.avatar} alt="" className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full bg-primary flex items-center justify-center text-white font-bold text-sm">
              {(n.author.displayName || n.author.handle).charAt(0).toUpperCase()}
            </div>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1">
            <span className="text-lg shrink-0">{emoji}{!emoji && <Icon name="bell" size={20} />}</span>
            <span className="text-text-primary font-semibold text-sm truncate">
              {n.author.displayName || n.author.handle}
            </span>
          </div>
          <p className="text-text-secondary text-xs mt-0.5">
            @{n.author.handle}{' '}
            {reasonLabel}
          </p>
          <p className="text-text-secondary text-xs mt-0.5">
            {timeAgo(n.indexedAt)}
          </p>
        </div>
        {!n.isRead && (
          <div className="shrink-0 self-center">
            <div className="w-2 h-2 rounded-full bg-primary" />
          </div>
        )}
      </div>
    </div>
  );
}

export function NotifsPage({ client, goBack, goTo, initialScrollTop, onScrollTopChange }: NotifsPageProps) {
  const { t } = useI18n();
  const { notifications, loading, error, refresh } = useNotifications(client);
  const { scrollRef, virtualizer, measureAndCache } = useVirtualizedList(
    notifications, 'notifs', 72, n => n.uri, { initialScrollTop, onScrollTopChange },
  );

  return (
    <div className="flex flex-col h-[calc(100dvh-3rem)] bg-background animate-fadeIn">
      <div className="flex-shrink-0 border-b border-border px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            onClick={goBack}
            className="text-text-secondary hover:text-text-primary transition-colors text-lg"
          >
            <Icon name="arrow-big-left" size={20} />
          </button>
          <h1 className="text-text-primary font-semibold text-lg"><Icon name="bell" size={20} /> {t('notifications.title')}</h1>
        </div>
        <button
          onClick={() => refresh()}
          disabled={loading}
          className="text-primary hover:text-primary-hover disabled:opacity-50 transition-colors text-sm font-medium"
        >
          {t('action.refresh')}
        </button>
      </div>

      {error && (
        <div role="alert" className="m-4 p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 text-sm">
          {error}
        </div>
      )}

      {loading && notifications.length === 0 ? (
        <div className="flex items-center justify-center py-12">
          <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      ) : notifications.length > 0 ? (
        <div ref={scrollRef} role="list" className="flex-1 overflow-y-auto">
          <div style={{ height: virtualizer.getTotalSize(), position: 'relative', width: '100%' }}>
            {virtualizer.getVirtualItems().map((vi) => {
              const n = notifications[vi.index]!;
              return (
                <div
                  key={n.uri}
            data-index={vi.index}
            role="listitem"
            ref={(el) => measureAndCache(el, n)}
                  style={{
                    position: 'absolute', top: 0, left: 0, width: '100%',
                    transform: `translateY(${vi.start}px)`,
                  }}
                >
                  <NotifItem n={n} t={t} goTo={goTo} index={vi.index} />
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center py-16 px-4">
          <p className="text-text-secondary text-sm">{t('notifications.empty')}</p>
        </div>
      )}
    </div>
  );
}
