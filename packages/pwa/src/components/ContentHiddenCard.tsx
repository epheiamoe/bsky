import React, { useState } from 'react';
import { useI18n } from '@bsky/app';
import type { ModerationDecision } from '@bsky/core';
import { Icon } from './Icon.js';
import { getLabelName } from '@bsky/app';

interface ContentHiddenCardProps {
  decision: ModerationDecision;
  onShow: () => void;
  compact?: boolean;
  inline?: boolean;
}

/**
 * [v0.15.0] Warning overlay for "warn" level moderation.
 *
 * Prominent overlay showing WHY content is flagged.
 * Used when user sets label to "warn" (not "hide").
 *
 * Design:
 * ┌─────────────────────────────────────────────┐
 * │ [shield-alert] 此内容可能包含敏感信息         │
 * │                                             │
 * │  被你订阅的 @moderation.bsky.app 标记为      │
 * │  · Adult Content · Sexual                   │
 * │                                             │
 * │  被你订阅的 @asukafield.xyz 标记为          │
 * │  · Transphobia                              │
 * │                                             │
 * │            [显示内容]                        │
 * └─────────────────────────────────────────────┘
 */
export function ContentHiddenCard({ decision, onShow, compact = false, inline = false }: ContentHiddenCardProps) {
  const { t } = useI18n();
  const [showInfo, setShowInfo] = useState(false);

  if (inline) {
    return (
      <div className="border border-amber-200 dark:border-amber-800 rounded-lg bg-amber-50/50 dark:bg-amber-900/10 p-3 my-2">
        <div className="flex flex-col items-center gap-2">
          <div className="flex items-center gap-2">
            <Icon name="shield-alert" size={16} className="text-amber-500" />
            <span className="text-sm font-medium text-text-primary text-center">
              {t('moderation.hiddenByLabelers')}
            </span>
          </div>

          {decision.sources.length > 0 && (
            <div className="w-full space-y-1.5">
              {decision.sources.map(source => (
                <div key={source.labelerDid} className="text-xs">
                  <p className="text-text-secondary">
                    {t('moderation.hiddenBy').replace('{labeler}', `@${source.labelerName || source.labelerDid}`)}
                  </p>
                  <div className="flex gap-1 flex-wrap mt-0.5 pl-2">
                    {source.labels.map(label => (
                      <span
                        key={label.val}
                        className="px-1 py-0.5 rounded bg-surface border border-border text-text-secondary text-[10px]"
                      >
                        {getLabelName(label.val, t, label.name)}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}

          <button
            onClick={(e) => { e.stopPropagation(); onShow(); }}
            className="px-3 py-1.5 rounded-full bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 text-xs font-medium hover:bg-amber-200 dark:hover:bg-amber-900/50 transition-colors"
          >
            {t('moderation.showContent')}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={`border border-border rounded-lg bg-surface/50 ${compact ? 'p-3' : 'p-4'}`}>
      <div className="flex flex-col items-center gap-3 py-4">
        <div className="flex items-center gap-2">
          <Icon name="shield-alert" size={compact ? 20 : 24} className="text-amber-500" />
          <span className={`font-medium text-text-primary text-center ${compact ? 'text-sm' : 'text-base'}`}>
            {t('moderation.hiddenByLabelers')}
          </span>
        </div>

        {decision.sources.length > 0 && (
          <div className="w-full space-y-2">
            {decision.sources.map(source => (
              <div key={source.labelerDid} className="text-sm">
                <p className="text-text-secondary">
                  {t('moderation.hiddenBy').replace('{labeler}', `@${source.labelerName || source.labelerDid}`)}
                </p>
                <div className="flex gap-1.5 flex-wrap mt-1 pl-2">
                  {source.labels.map(label => (
                    <span
                      key={label.val}
                      className="px-1.5 py-0.5 rounded bg-surface border border-border text-text-secondary text-xs"
                    >
                      {getLabelName(label.val, t, label.name)}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {showInfo && decision.sources.length > 0 && (
          <div className="mt-1 p-2.5 rounded-lg bg-surface border border-border text-xs space-y-2 w-full">
            {decision.sources.map(source => (
              <div key={source.labelerDid} className="space-y-1">
                <p className="font-medium text-text-primary">{source.labelerName || source.labelerDid}</p>
                <ul className="space-y-0.5 pl-2">
                  {source.labels.map(label => (
                    <li key={label.val} className="text-text-secondary/80">
                      • {getLabelName(label.val, t, label.name)} — {label.severity}/{label.blurs}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}

        <button
          onClick={(e) => { e.stopPropagation(); onShow(); }}
          className="px-4 py-2 rounded-full bg-primary text-white text-sm font-medium hover:bg-primary-hover transition-colors"
        >
          {t('moderation.showContent')}
        </button>
      </div>
    </div>
  );
}
