import React, { useCallback, useMemo, useState } from 'react';
import type { AppView } from '@bsky/app';
import { useI18n } from '@bsky/app';
import type { PostView, ProfileViewBasic } from '@bsky/core';
import type { NotifGroup, NotifReason } from '../hooks/useNotificationGroups.js';
import { formatTimeAgo } from '../utils/timeAgo.js';
import { NotifActorStack } from './NotifActorStack.js';
import { NotifReasonIcon } from './NotifReasonIcon.js';
import { NotifPostPreview } from './NotifPostPreview.js';
import { NotifActorListModal } from './NotifActorListModal.js';

interface NotifItemProps {
  group: NotifGroup;
  post?: PostView;
  index: number;
  goTo: (v: AppView) => void;
  loadingPost?: boolean;
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

function truncate(text: string, max = 80): string {
  if (text.length <= max) return text;
  return text.slice(0, max - 1) + '\u2026';
}

function buildContentAriaLabel(
  group: NotifGroup,
  post: PostView | undefined,
  t: (key: string, vars?: Record<string, string | number>) => string,
): string {
  const actorText = buildActorText(group, t);
  const unreadPrefix = group.isRead ? '' : `${t('a11y.notificationUnread')} `;

  if (group.reason === 'follow') {
    const target = group.actors[0]?.handle ?? '';
    return `${unreadPrefix}${actorText}. ${t('a11y.openProfileOf')} @${target}`;
  }

  if (post && group.reasonSubject) {
    const authorName = post.author.displayName || post.author.handle;
    const previewText = truncate(post.record.text || '');
    const imageCount =
      ((post.record.embed as any)?.images?.length as number | undefined) ??
      ((post.record.embed as any)?.items?.length as number | undefined) ??
      0;
    const mediaSuffix = imageCount > 0 ? `. ${t('post.imageCount', { n: imageCount })}` : '';
    return `${unreadPrefix}${actorText}, ${authorName}. ${previewText}${mediaSuffix}`;
  }

  if (group.reasonSubject) {
    return `${unreadPrefix}${actorText}, ${t('notifications.viewPostHint')}`;
  }

  return `${unreadPrefix}${actorText}`;
}

export function NotifItem({ group, post, index, goTo, loadingPost }: NotifItemProps) {
  const { t } = useI18n();
  const [showActorList, setShowActorList] = useState(false);

  const isClickable =
    (group.reason === 'follow' && group.actors[0]?.handle) ||
    (!!group.reasonSubject && POST_REASONS.has(group.reason));

  const handleRowClick = useCallback(() => {
    if (group.reason === 'follow') {
      const handle = group.actors[0]?.handle;
      if (handle) goTo({ type: 'profile', actor: handle });
      return;
    }
    if (group.reasonSubject && POST_REASONS.has(group.reason)) {
      goTo({ type: 'thread', uri: group.reasonSubject });
    }
  }, [group, goTo]);

  const handleActorClick = useCallback(
    (actor: ProfileViewBasic) => {
      if (actor.handle) {
        goTo({ type: 'profile', actor: actor.handle });
      }
    },
    [goTo],
  );

  const actorText = buildActorText(group, t);
  const contentLabel = useMemo(() => buildContentAriaLabel(group, post, t), [group, post, t]);

  const fallbackText =
    group.reason === 'reply' || group.reason === 'mention'
      ? (group.record?.text as string | undefined)
      : undefined;

  return (
    <>
      <article
        className={`border-b border-border px-4 py-2.5 transition-colors ${
          !group.isRead ? 'bg-surface/60 border-l-2 border-l-primary' : ''
        }`}
      >
        <div className="flex items-start gap-3">
          <NotifReasonIcon
            reason={group.reason}
            className="shrink-0 w-6 text-center"
            aria-hidden="true"
          />

          <NotifActorStack
            actors={group.actors}
            className="shrink-0"
            onActorClick={handleActorClick}
            onRemainingClick={() => setShowActorList(true)}
          />

          <button
            type="button"
            onClick={handleRowClick}
            disabled={!isClickable}
            aria-label={contentLabel}
            className={`min-w-0 flex-1 text-left ${
              isClickable ? 'cursor-pointer hover:opacity-90' : 'cursor-default'
            }`}
          >
            <span className="flex items-start gap-2">
              <span className="text-text-primary text-sm min-w-0 flex-1">{actorText}</span>
              <span className="text-text-secondary text-xs shrink-0">
                {formatTimeAgo(group.latestIndexedAt, t)}
              </span>
            </span>
            {group.reason !== 'follow' && (
              <NotifPostPreview
                post={post}
                fallbackText={fallbackText}
                loading={loadingPost && !post}
              />
            )}
          </button>
        </div>
      </article>
      <NotifActorListModal
        open={showActorList}
        onClose={() => setShowActorList(false)}
        actors={group.actors}
        goTo={goTo}
      />
    </>
  );
}
