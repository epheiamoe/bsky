import React, { useEffect, useRef, useState } from 'react';
import type { ModerationDecision } from '@bsky/core';
import { useI18n, getLabelName } from '@bsky/app';

interface ContentWarningOverlayProps {
  decision: ModerationDecision;
  children: React.ReactNode;
}

/**
 * [v0.15.0] Content-level warning overlay for blurs='content' labels.
 *
 * Covers the entire content area (text + media + quotes + external links)
 * but preserves author info and interaction buttons.
 *
 * Official Bluesky style:
 * - Dark background with subtle border
 * - Centered title: "此内容被标记为敏感："
 * - Label list with source info
 * - "显示内容" button
 */
export function ContentWarningOverlay({ decision, children }: ContentWarningOverlayProps) {
  const { t } = useI18n();
  const [revealed, setRevealed] = useState(false);
  const blurRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // `inert` removes the subtree from the accessibility tree and blocks all
    // user interactions.  We set it imperatively so we do not need to fight
    // React’s (older) JSX typings.
    if (blurRef.current) {
      blurRef.current.inert = true;
    }
  }, []);

  if (revealed) {
    return <>{children}</>;
  }

  return (
    <div className="relative">
      {/* Blurred content underneath — hidden from screen readers */}
      <div
        ref={blurRef}
        className="blur-sm brightness-75 select-none pointer-events-none"
        aria-hidden="true"
      >
        {children}
      </div>

      {/* Overlay */}
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-4 bg-background/90 backdrop-blur-sm rounded-lg">
        <div className="text-center">
          <p className="text-sm font-medium text-text-primary mb-2">
            {t('moderation.flaggedByLabelers')}
          </p>

          {decision.sources.length > 0 && (
            <div className="space-y-1">
              {decision.sources.map((source) => (
                <div key={source.labelerDid} className="text-xs">
                  <div className="flex items-center justify-center gap-1.5 flex-wrap">
                    {source.labels.map((label) => (
                      <span
                        key={label.val}
                        className="inline-flex items-center px-2 py-0.5 rounded-full bg-surface border border-border text-text-secondary"
                      >
                        {getLabelName(label.val, t, label.name)}
                      </span>
                    ))}
                  </div>
                  <p className="text-text-secondary mt-1">
                    {t('moderation.labeledBy').replace('{labeler}', `@${source.labelerName || source.labelerDid}`)}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>

        <button
          onClick={(e) => {
            e.stopPropagation();
            setRevealed(true);
          }}
          aria-expanded={revealed}
          className="px-4 py-1.5 rounded-full bg-surface border border-border text-text-primary text-sm font-medium hover:bg-surface/80 transition-colors"
        >
          {t('moderation.showContent')}
        </button>
      </div>
    </div>
  );
}
