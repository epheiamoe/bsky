import React, { useCallback } from 'react';
import type { AppView } from '@bsky/app';
import { useI18n } from '@bsky/app';
import type { PostView } from '@bsky/core';
import type { NotifGroup, NotifReason } from '../hooks/useNotificationGroups.js';
import { formatTimeAgo } from '../utils/timeAgo.js';
import { NotifActorStack } from './NotifActorStack.js';
import { NotifReasonIcon } from './NotifReasonIcon.js';
import { NotifPostPreview } from './NotifPostPreview.js';

interface NotifItemProps {
  group: NotifGroup;
  post?: PostView;
  index: number;
  goTo: (v: AppView) => void;
}

function formatTemplate(tmpl: string, name: string, n: number): string {
  return tmpl.replace('{name}', name).replace('{n}', String(n));
}

function buildActorText(group: NotifGroup, t: (key: string) => string): string {
  const first = group.actors[0];
  if (!first) return '';
  const name = first.displayName || first.handle;
  const others = group.actors.length - 1;

  if (others === 0) {
    return `${name} ${t(`notifications.reason.${group.reason}`)}`;
  }
  return formatTemplate(t(`notifications.aggregated.${group.reason}`), name, others);
}

const POST_REASONS: Set<NotifReason> = new Set(['like', 'repost', 'reply', 'quote', 'mention']);

export function NotifItem({ group, post, index, goTo }: NotifItemProps) {
  const { t } = useI18n();

  const isClickable =
    (group.reason === 'follow' && group.actors[0]?.handle) ||
    (!!group.reasonSubject && POST_REASONS.has(group.reason));

  const handleActivate = useCallback(() => {
    if (group.reason === 'follow') {
      const handle = group.actors[0]?.handle;
      if (handle) goTo({ type: 'profile', actor: handle });
      return;
    }
    if (group.reasonSubject && POST_REASONS.has(group.reason)) {
      goTo({ type: 'thread', uri: group.reasonSubject });
    }
  }, [group, goTo]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        handleActivate();
      }
    },
    [handleActivate],
  );

  const actorText = buildActorText(group, t);
  const unreadPrefix = group.isRead ? '' : `${t('a11y.notificationUnread')} `;
  const ariaLabel = `${unreadPrefix}${actorText}`;

  const fallbackText =
    group.reason === 'reply' || group.reason === 'mention'
      ? (group.record?.text as string | undefined)
      : undefined;
  const fallbackAuthor =
    group.reason === 'reply' || group.reason === 'mention' ? group.actors[0] : undefined;

  return (
    <div role="listitem" data-index={index}>
      <div
        role={isClickable ? 'button' : undefined}
        tabIndex={isClickable ? 0 : undefined}
        onClick={isClickable ? handleActivate : undefined}
        onKeyDown={isClickable ? handleKeyDown : undefined}
        aria-label={ariaLabel}
        className={`border-b border-border px-4 py-3 transition-colors ${
          !group.isRead
            ? 'bg-surface/60 border-l-2 border-l-primary'
            : ''
        } ${isClickable ? 'cursor-pointer hover:bg-surface' : ''}`}
      >
        <div className="flex gap-3">
          <NotifActorStack actors={group.actors} />
          <div className="min-w-0 flex-1">
            <div className="flex items-start gap-2">
              <NotifReasonIcon reason={group.reason} />
              <span className="text-text-primary text-sm min-w-0 flex-1">
                {actorText}
              </span>
              <span className="text-text-secondary text-xs shrink-0">
                {formatTimeAgo(group.latestIndexedAt, t)}
              </span>
            </div>
            {group.reason !== 'follow' && (
              <NotifPostPreview
                post={post}
                fallbackText={fallbackText}
                fallbackAuthor={fallbackAuthor}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
