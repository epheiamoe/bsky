import { useMemo } from 'react';
import type { Notification, ProfileViewBasic } from '@bsky/core';

export type NotifReason = 'like' | 'repost' | 'follow' | 'reply' | 'mention' | 'quote';

const VALID_REASONS = new Set<NotifReason>([
  'like',
  'repost',
  'follow',
  'reply',
  'mention',
  'quote',
]);

function toNotifReason(reason: string): NotifReason {
  if (VALID_REASONS.has(reason as NotifReason)) return reason as NotifReason;
  // Gracefully degrade unknown server reasons instead of crashing the list.
  return 'mention';
}

export interface NotifGroup {
  /** 分组键：follow 用 'follow'，其它用 `${reason}:${reasonSubject}` */
  key: string;
  reason: NotifReason;
  /** 目标帖文 URI；follow 为 undefined */
  reasonSubject?: string;
  /** 聚合触发者（按出现顺序，最新在后） */
  actors: ProfileViewBasic[];
  /** 组内最新的 indexedAt */
  latestIndexedAt: string;
  /** 组内是否全部已读 */
  isRead: boolean;
  /** 原始通知 URI 集合 */
  uris: string[];
  /** 首个通知的 record，用于 reply/mention 的兜底预览 */
  record?: Record<string, unknown>;
}

/**
 * 将 Notification[] 按连续相同的 reason + reasonSubject 聚合。
 *
 * 设计取舍：仅合并相邻项，保持服务端顺序，避免跨时间重排。
 * 后续可升级为全局 Map 聚合并重新排序。
 */
export function groupNotifications(notifications: Notification[]): NotifGroup[] {
  const groups: NotifGroup[] = [];

  for (const n of notifications) {
    const reason = toNotifReason(n.reason);
    const subject = n.reasonSubject;
    const key = reason === 'follow' ? 'follow' : `${reason}:${subject ?? ''}`;

    const last = groups[groups.length - 1];
    if (last && last.key === key) {
      last.actors.push(n.author);
      last.uris.push(n.uri);
      if (new Date(n.indexedAt) > new Date(last.latestIndexedAt)) {
        last.latestIndexedAt = n.indexedAt;
      }
      last.isRead = last.isRead && n.isRead;
    } else {
      groups.push({
        key,
        reason,
        reasonSubject: subject,
        actors: [n.author],
        latestIndexedAt: n.indexedAt,
        isRead: n.isRead,
        uris: [n.uri],
        record: n.record,
      });
    }
  }

  return groups;
}

export function useNotificationGroups(notifications: Notification[]): NotifGroup[] {
  return useMemo(() => groupNotifications(notifications), [notifications]);
}
