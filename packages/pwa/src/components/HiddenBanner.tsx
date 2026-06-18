import React from 'react';
import { useI18n } from '@bsky/app';
import type { ModerationDecision } from '@bsky/core';
import { Icon } from './Icon.js';
import { getLabelName } from '@bsky/app';

interface HiddenBannerProps {
  decision: ModerationDecision;
  onShow: () => void;
}

/**
 * [v0.15.0] Simple hidden banner — like X's "Post unavailable".
 *
 * Minimal, unobtrusive banner showing why content is hidden.
 * Blocks interaction until user clicks "Show".
 *
 * Design:
 * ┌────────────────────────────────────────────────────────────┐
 * │  [shield] Post hidden by @labeler: label1, label2  [Show]  │
 * └────────────────────────────────────────────────────────────┘
 */
export function HiddenBanner({ decision, onShow }: HiddenBannerProps) {
  const { t } = useI18n();

  // Build a compact label list
  const allLabels: string[] = [];
  for (const source of decision.sources) {
    for (const label of source.labels) {
      allLabels.push(getLabelName(label.val, t, label.name));
    }
  }

  const labelerName = decision.sources[0]?.labelerName || decision.sources[0]?.labelerDid || '';

  return (
    <div className="border border-border rounded-lg p-3 bg-surface/30 flex items-center gap-3">
      <Icon name="shield-alert" size={16} className="text-amber-500 shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-sm text-text-secondary truncate">
          {t('moderation.hiddenByLabelers')}
          {' '}
          <span className="text-text-primary">
            {t('moderation.hiddenBy').replace('{labeler}', `@${labelerName}`)}
            {allLabels.length > 0 && ` ${allLabels.join(', ')}`}
          </span>
        </p>
      </div>
      <button
        onClick={(e) => { e.stopPropagation(); onShow(); }}
        className="text-sm text-primary hover:text-primary-hover font-medium shrink-0 transition-colors"
      >
        {t('moderation.showContent')}
      </button>
    </div>
  );
}
