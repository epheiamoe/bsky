import React from 'react';
import { useI18n } from '@bsky/app';
import { Icon } from './Icon.js';
import type { NotifReason } from '../hooks/useNotificationGroups.js';

interface NotifReasonIconProps {
  reason: NotifReason;
}

const REASON_CONFIG: Record<NotifReason, { icon: string; color: string }> = {
  like: { icon: 'heart', color: 'text-red-500' },
  repost: { icon: 'repeat', color: 'text-green-500' },
  follow: { icon: 'user', color: 'text-primary' },
  reply: { icon: 'message-circle', color: 'text-blue-500' },
  mention: { icon: 'at-sign', color: 'text-primary' },
  quote: { icon: 'quote', color: 'text-blue-500' },
  unknown: { icon: 'bell', color: 'text-text-secondary' },
};

export function NotifReasonIcon({ reason }: NotifReasonIconProps) {
  const { t } = useI18n();
  const config = REASON_CONFIG[reason];
  const label = t(`notifications.reason.${reason}`);

  return (
    <span
      className={`inline-flex shrink-0 ${config.color}`}
      role="img"
      aria-label={label}
      title={label}
    >
      <Icon name={config.icon} size={18} filled={reason === 'like'} />
    </span>
  );
}
