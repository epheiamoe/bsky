import React from 'react';
import { useI18n } from '@bsky/app';
import type { FailedLabelerInfo } from '@bsky/app';
import { Icon } from './Icon.js';

interface LabelerFailureBannerProps {
  failedLabelers: FailedLabelerInfo[];
  onDismiss?: () => void;
  onRetry?: () => void;
}

/**
 * Top banner for labeler failures.
 * Shows when block or banner level labelers fail.
 * Block level = red theme, Banner level = amber theme.
 */
export function LabelerFailureBanner({ failedLabelers, onDismiss, onRetry }: LabelerFailureBannerProps) {
  const { t } = useI18n();
  
  if (failedLabelers.length === 0) return null;
  
  const hasBlock = failedLabelers.some(f => f.behavior === 'block');
  const names = failedLabelers.map(f => f.name).join(', ');
  
  const bgClass = hasBlock 
    ? 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800 text-red-700 dark:text-red-300'
    : 'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-300';
  
  const iconName = hasBlock ? 'shield-alert' : 'shield';
  
  return (
    <div className={`sticky top-0 z-50 border-b px-4 py-2.5 ${bgClass}`}>
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <Icon name={iconName} size={16} className="shrink-0" />
          <span className="text-sm font-medium truncate">
            {hasBlock 
              ? t('moderation.blockLevelFailure', { count: failedLabelers.length, names })
              : t('moderation.bannerLevelFailure', { count: failedLabelers.length, names })
            }
          </span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {onRetry && (
            <button
              onClick={onRetry}
              className="text-xs font-medium underline hover:no-underline opacity-80 hover:opacity-100 transition-opacity"
            >
              {t('action.retry')}
            </button>
          )}
          {onDismiss && (
            <button
              onClick={onDismiss}
              className="opacity-70 hover:opacity-100 transition-opacity"
              aria-label={t('a11y.close')}
            >
              <Icon name="x" size={14} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
