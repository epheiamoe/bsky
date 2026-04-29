import React from 'react';
import type { BskyClient, Notification } from '@bsky/core';
import { useNotifications, useI18n } from '@bsky/app';

interface NotifsPageProps {
  client: BskyClient;
  goBack: () => void;
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
  like: '♥',
  repost: '♻',
  follow: '👤',
  reply: '💬',
  mention: '@',
  quote: '💬',
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

function avatarLetter(author: { displayName?: string; handle: string }): string {
  const name = author.displayName || author.handle;
  return name.charAt(0).toUpperCase();
}

function NotifItem({ n, t }: { n: Notification; t: (key: string) => string }) {
  const emoji = REASON_EMOJI[n.reason] ?? '🔔';
  const reasonLabel = reasonText(n.reason, t);

  return (
    <div className="border-b border-border px-4 py-3 hover:bg-surface transition-colors">
      <div className="flex gap-3">
        <div className="w-10 h-10 rounded-full bg-primary flex items-center justify-center text-white font-bold text-sm shrink-0">
          {avatarLetter(n.author)}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1">
            <span className="text-lg shrink-0">{emoji}</span>
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

export function NotifsPage({ client, goBack }: NotifsPageProps) {
  const { t } = useI18n();
  const { notifications, loading, refresh } = useNotifications(client);

  return (
    <div className="min-h-screen bg-white dark:bg-[#0A0A0A]">
      <div className="border-b border-border px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            onClick={goBack}
            className="text-text-secondary hover:text-text-primary transition-colors text-lg"
          >
            ←
          </button>
          <h1 className="text-text-primary font-semibold text-lg">🔔 {t('notifications.title')}</h1>
        </div>
        <button
          onClick={refresh}
          disabled={loading}
          className="text-primary hover:text-primary-hover disabled:opacity-50 transition-colors text-sm font-medium"
        >
          {t('action.refresh')}
        </button>
      </div>

      {loading && notifications.length === 0 ? (
        <div className="flex items-center justify-center py-12">
          <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      ) : notifications.length > 0 ? (
        <div>
          {notifications.map((n) => (
            <NotifItem key={n.uri} n={n} t={t} />
          ))}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center py-16 px-4">
          <p className="text-text-secondary text-sm">{t('notifications.empty')}</p>
        </div>
      )}
    </div>
  );
}
