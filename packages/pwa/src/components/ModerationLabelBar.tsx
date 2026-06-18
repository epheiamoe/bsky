import React, { useState } from 'react';
import type { ModerationDecision } from '@bsky/core';
import { useI18n, getLabelName } from '@bsky/app';

interface ModerationLabelBarProps {
  decision: ModerationDecision;
  isRevealed: boolean;
  onToggle: () => void;
}

/**
 * [v0.15.0] Official Bluesky-style moderation label bar.
 *
 * Compact horizontal bar shown above media for media-level labels.
 * Matches official bsky.app UI:
 * - Left: info icon + label name
 * - Right: show/hide toggle button
 * - Expandable: "了解详情" reveals label source info
 *
 * Design (from screenshots):
 * ┌─────────────────────────────────────────┐
 * │ [i] 标签名                    [显示/隐藏] │
 * │ 由 @labeler 标记。了解详情 ▼            │
 * └─────────────────────────────────────────┘
 */
export function ModerationLabelBar({ decision, isRevealed, onToggle }: ModerationLabelBarProps) {
  const { t } = useI18n();
  const [showDetails, setShowDetails] = useState(false);

  // Get the primary label name to display
  const primaryLabel = decision.sources[0]?.labels[0];
  const labelName = primaryLabel
    ? getLabelName(primaryLabel.val, t, primaryLabel.name)
    : t('moderation.sensitiveContent');

  const labelerName = decision.sources[0]?.labelerName || decision.sources[0]?.labelerDid;

  return (
    <div className="mt-2 rounded-lg border border-border bg-surface/50 overflow-hidden">
      {/* Main bar row */}
      <div className="flex items-center justify-between px-3 py-2">
        <div className="flex items-center gap-2 min-w-0">
          {/* Info icon (Lucide info-circle) */}
          <svg
            className="w-4 h-4 text-text-secondary shrink-0"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <circle cx="12" cy="12" r="10" />
            <path d="M12 16v-4" />
            <path d="M12 8h.01" />
          </svg>
          <span className="text-sm text-text-primary truncate">{labelName}</span>
        </div>

        <button
          onClick={(e) => {
            e.stopPropagation();
            onToggle();
          }}
          className="shrink-0 ml-3 text-sm text-text-secondary hover:text-text-primary transition-colors px-2 py-0.5 rounded hover:bg-surface/80"
        >
          {isRevealed ? t('moderation.hide') : t('moderation.show')}
        </button>
      </div>

      {/* Source info + toggle details */}
      {labelerName && (
        <div className="px-3 pb-2">
          <button
            onClick={(e) => {
              e.stopPropagation();
              setShowDetails(!showDetails);
            }}
            className="text-xs text-text-secondary hover:text-text-primary transition-colors flex items-center gap-1"
          >
            <span>
              {t('moderation.labeledBy').replace('{labeler}', `@${labelerName}`)}
            </span>
            <span className="text-primary hover:underline">
              {showDetails ? t('moderation.collapseDetails') : t('moderation.learnMore')}
            </span>
          </button>

          {/* Expanded details */}
          {showDetails && decision.sources.length > 0 && (
            <div className="mt-2 pt-2 border-t border-border/50 space-y-2">
              {decision.sources.map((source) => (
                <div key={source.labelerDid} className="text-xs">
                  <p className="font-medium text-text-primary">
                    {source.labelerName || source.labelerDid}
                  </p>
                  <div className="mt-1 space-y-1">
                    {source.labels.map((label) => (
                      <div
                        key={label.val}
                        className="flex items-start gap-1.5"
                      >
                        <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-surface border border-border text-text-secondary shrink-0">
                          {getLabelName(label.val, t, label.name)}
                        </span>
                        {label.description && (
                          <span className="text-text-secondary/80 leading-relaxed">
                            {label.description}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
