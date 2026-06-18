import React, { useState } from 'react';
import { useI18n } from '@bsky/app';
import type { FailedLabelerInfo } from '@bsky/app';
import { Icon } from './Icon.js';

interface LabelerFailureBannerProps {
  failedLabelers: FailedLabelerInfo[];
  onDismiss?: (did: string) => void;
  onRetry?: () => void;
}

/**
 * Top banner for labeler failures.
 * Shows when block or banner level labelers fail.
 * Block level = red theme, Banner level = amber theme.
 * Click to expand and see details of each failed labeler.
 */
export function LabelerFailureBanner({ failedLabelers, onDismiss, onRetry }: LabelerFailureBannerProps) {
  const { t } = useI18n();
  const [expanded, setExpanded] = useState(false);
  
  if (failedLabelers.length === 0) return null;
  
  const hasBlock = failedLabelers.some(f => f.behavior === 'block');
  const names = failedLabelers.map(f => f.name).join(', ');
  
  const bgClass = hasBlock 
    ? 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800 text-red-700 dark:text-red-300'
    : 'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-300';
  
  const iconName = hasBlock ? 'shield-alert' : 'shield';
  
  return (
    <div className={`sticky top-0 z-50 border-b ${bgClass}`}>
      {/* Main banner - clickable to expand */}
      <div 
        className="px-4 py-2.5 cursor-pointer hover:opacity-80 transition-opacity"
        onClick={() => setExpanded(!expanded)}
        role="button"
        aria-expanded={expanded}
      >
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
            <Icon 
              name="chevron-down" 
              size={14} 
              className={`transition-transform ${expanded ? 'rotate-180' : ''}`} 
            />
            {onRetry && (
              <button
                onClick={(e) => { e.stopPropagation(); onRetry(); }}
                className="text-xs font-medium underline hover:no-underline opacity-80 hover:opacity-100 transition-opacity"
              >
                {t('action.retry')}
              </button>
            )}
            {onDismiss && (
              <button
                onClick={(e) => { e.stopPropagation(); failedLabelers.forEach(f => onDismiss(f.did)); }}
                className="opacity-70 hover:opacity-100 transition-opacity"
                aria-label={t('a11y.close')}
              >
                <Icon name="x" size={14} />
              </button>
            )}
          </div>
        </div>
      </div>
      
      {/* Expanded details */}
      {expanded && (
        <div className="px-4 pb-3 border-t border-current/10">
          <div className="pt-2 space-y-2">
            {failedLabelers.map(labeler => (
              <div key={labeler.did} className="flex items-start gap-2 text-xs">
                <Icon
                  name={labeler.behavior === 'block' ? 'shield-alert' : 'shield'}
                  size={12}
                  className="shrink-0 mt-0.5"
                />
                <div className="min-w-0 flex-1">
                  <div className="font-medium truncate">{labeler.name}</div>
                  <div className="opacity-70 truncate">{labeler.error}</div>
                  <div className="opacity-60 text-[10px] uppercase tracking-wider mt-0.5">
                    {labeler.behavior === 'block' && t('moderation.failureBehavior.block')}
                    {labeler.behavior === 'banner' && t('moderation.failureBehavior.banner')}
                    {labeler.behavior === 'silent' && t('moderation.failureBehavior.silent')}
                  </div>
                </div>
                {onDismiss && (
                  <button
                    onClick={() => onDismiss(labeler.did)}
                    className="opacity-50 hover:opacity-100 transition-opacity shrink-0"
                    aria-label={t('a11y.close')}
                  >
                    <Icon name="x" size={12} />
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
