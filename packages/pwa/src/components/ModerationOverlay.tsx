import React, { useState } from 'react';
import { useI18n } from '@bsky/app';
import type { ModerationDecision } from '@bsky/core';
import { Icon } from './Icon.js';

interface ModerationOverlayProps {
  decision: ModerationDecision;
  children: React.ReactNode;
  onShowAnyway?: () => void;
}

/**
 * Renders moderation overlay on content based on decision.
 * 
 * - hide: Shows a placeholder with "show anyway" option
 * - warn: Shows a warning overlay that can be clicked away
 * - blurMedia: Applies CSS blur to media, click to show
 * - showBadge: Shows badges without blocking content
 * - none: Renders children directly
 */
export function ModerationOverlay({ decision, children, onShowAnyway }: ModerationOverlayProps) {
  const { t } = useI18n();
  const [showAnyway, setShowAnyway] = useState(false);
  const [showMedia, setShowMedia] = useState(false);

  // User chose to override
  if (showAnyway) return <>{children}</>;

  switch (decision.action) {
    case 'hide':
      return (
        <HiddenContent
          decision={decision}
          onShow={() => { setShowAnyway(true); onShowAnyway?.(); }}
        />
      );

    case 'warn':
      return (
        <WarningContent
          decision={decision}
          onShow={() => { setShowAnyway(true); onShowAnyway?.(); }}
        >
          {children}
        </WarningContent>
      );

    case 'blurMedia':
      return (
        <BlurredMedia
          decision={decision}
          showMedia={showMedia}
          onShowMedia={() => setShowMedia(true)}
        >
          {children}
        </BlurredMedia>
      );

    case 'showBadge':
    case 'none':
    default:
      return (
        <>
          {decision.badges.length > 0 && <BadgeRow decision={decision} />}
          {children}
        </>
      );
  }
}

/** Hidden content placeholder */
function HiddenContent({
  decision,
  onShow,
}: {
  decision: ModerationDecision;
  onShow: () => void;
}) {
  const { t } = useI18n();
  const [showInfo, setShowInfo] = useState(false);

  return (
    <div className="border border-border rounded-lg p-4 bg-surface/50">
      <div className="flex items-center gap-2 mb-2">
        <Icon name="shield-alert" size={18} className="text-red-500" />
        <span className="text-sm font-medium text-text-primary">{t('moderation.hidden')}</span>
        <button
          onClick={() => setShowInfo(!showInfo)}
          className="ml-auto p-1 text-text-secondary hover:text-text-primary transition-colors"
          title={t('moderation.infoTitle')}
          aria-label={t('moderation.infoTitle')}
        >
          <Icon name="info" size={14} />
        </button>
      </div>
      
      {showInfo && <LabelSourceInfo sources={decision.sources} />}
      
      <button
        onClick={onShow}
        className="text-sm text-primary hover:text-primary-hover transition-colors"
      >
        {t('moderation.showContent')}
      </button>
    </div>
  );
}

/** Warning overlay — hides content until user explicitly shows it */
function WarningContent({
  decision,
  onShow,
  children,
}: {
  decision: ModerationDecision;
  onShow: () => void;
  children: React.ReactNode;
}) {
  const { t } = useI18n();
  const [dismissed, setDismissed] = useState(false);
  const [showInfo, setShowInfo] = useState(false);

  if (dismissed) {
    return (
      <>
        {decision.badges.length > 0 && <BadgeRow decision={decision} />}
        {children}
      </>
    );
  }

  // Not dismissed: show centered warning placeholder, content is completely hidden
  return (
    <div className="border border-amber-200 dark:border-amber-900/50 rounded-lg p-4 bg-amber-50 dark:bg-amber-900/20">
      <div className="flex flex-col items-center gap-3 py-6">
        <Icon name="alert-triangle" size={32} className="text-amber-500" />
        <span className="text-base font-medium text-text-primary text-center">
          {decision.warningTextKey ? t(decision.warningTextKey) : t('moderation.warning.content')}
        </span>
        {decision.badges.length > 0 && (
          <div className="flex gap-2 flex-wrap justify-center">
            {decision.badges.map(badge => (
              <span key={badge} className="px-2 py-0.5 rounded bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300 text-xs font-medium">
                {badge}
              </span>
            ))}
          </div>
        )}
        <button
          onClick={() => setShowInfo(!showInfo)}
          className="p-1 text-text-secondary hover:text-text-primary transition-colors"
          title={t('moderation.infoTitle')}
          aria-label={t('moderation.infoTitle')}
        >
          <Icon name="info" size={16} />
        </button>
        {showInfo && <LabelSourceInfo sources={decision.sources} />}
        <button
          onClick={() => { setDismissed(true); onShow(); }}
          className="mt-2 px-4 py-2 rounded-full bg-primary text-white text-sm font-medium hover:bg-primary-hover transition-colors"
        >
          {t('moderation.showContent')}
        </button>
      </div>
    </div>
  );
}

/** Blurred media overlay */
function BlurredMedia({
  decision,
  showMedia,
  onShowMedia,
  children,
}: {
  decision: ModerationDecision;
  showMedia: boolean;
  onShowMedia: () => void;
  children: React.ReactNode;
}) {
  const { t } = useI18n();
  const [showInfo, setShowInfo] = useState(false);

  if (showMedia) {
    return (
      <>
        {decision.badges.length > 0 && <BadgeRow decision={decision} />}
        {children}
      </>
    );
  }

  return (
    <div className="relative">
      {decision.badges.length > 0 && <BadgeRow decision={decision} />}
      <div className="relative">
        <div className="blur-xl brightness-50">
          {children}
        </div>
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2">
          <Icon name="eye-off" size={24} className="text-text-secondary" />
          <span className="text-sm text-text-secondary">{t('moderation.warning.media')}</span>
          <button
            onClick={onShowMedia}
            className="text-sm text-primary hover:text-primary-hover transition-colors"
          >
            {t('moderation.showMedia')}
          </button>
          <button
            onClick={() => setShowInfo(!showInfo)}
            className="p-1 text-text-secondary hover:text-text-primary transition-colors"
            title={t('moderation.infoTitle')}
            aria-label={t('moderation.infoTitle')}
          >
            <Icon name="info" size={14} />
          </button>
          {showInfo && (
            <div className="absolute top-full mt-2 z-10">
              <LabelSourceInfo sources={decision.sources} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/** Badge row showing moderation labels */
export function BadgeRow({ decision }: { decision: ModerationDecision }) {
  const { t } = useI18n();
  const [showInfo, setShowInfo] = useState(false);

  if (decision.badges.length === 0) return null;

  return (
    <div className="flex items-center gap-1.5 mb-1.5 flex-wrap">
      {decision.badges.map((badge, i) => (
        <span
          key={i}
          className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs bg-surface border border-border text-text-secondary"
        >
          <Icon name="tag" size={10} />
          {badge}
        </span>
      ))}
      <button
        onClick={() => setShowInfo(!showInfo)}
        className="p-0.5 text-text-secondary hover:text-text-primary transition-colors"
        title={t('moderation.infoTitle')}
        aria-label={t('moderation.infoTitle')}
      >
        <Icon name="info" size={12} />
      </button>
      {showInfo && <LabelSourceInfo sources={decision.sources} />}
    </div>
  );
}

/** Info popup showing label sources */
function LabelSourceInfo({ sources }: { sources: ModerationDecision['sources'] }) {
  const { t } = useI18n();

  return (
    <div className="mt-2 p-2.5 rounded-lg bg-surface border border-border text-xs space-y-2">
      <p className="font-medium text-text-primary">{t('moderation.infoTitle')}</p>
      {sources.map(source => (
        <div key={source.labelerDid} className="space-y-1">
          <p className="text-text-secondary">
            <span className="font-medium">{source.labelerName || source.labelerDid}</span>
          </p>
          <ul className="space-y-0.5 pl-2">
            {source.labels.map(label => (
              <li key={label.val} className="text-text-secondary/80">
                • {label.name} ({label.val}) — {label.severity}/{label.blurs}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}
