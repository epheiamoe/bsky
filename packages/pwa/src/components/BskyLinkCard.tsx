import React, { useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import type { AppView } from '@bsky/app';
import { useI18n, parseBskyAppUrl, bskyUrlToAppView, getBskyUrlTypeLabel, isBskyAppUrl } from '@bsky/app';
import { Icon } from './Icon.js';

interface LinkChoiceModalProps {
  url: string;
  onOpenInternal: (view: AppView) => void;
  onClose: () => void;
}

export function LinkChoiceModal({ url, onOpenInternal, onClose }: LinkChoiceModalProps) {
  const { t } = useI18n();
  const info = parseBskyAppUrl(url);
  const typeLabel = info ? getBskyUrlTypeLabel(info.type, t) : t('link.type.unknown');

  const handleOpenInternal = useCallback(() => {
    if (info) {
      const view = bskyUrlToAppView(info);
      if (view) {
        onOpenInternal(view);
        onClose();
        return;
      }
    }
    // Fallback: open external
    window.open(url, '_blank');
    onClose();
  }, [url, info, onOpenInternal, onClose]);

  const handleOpenExternal = useCallback(() => {
    window.open(url, '_blank');
    onClose();
  }, [url, onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div
        className="bg-surface border border-border rounded-2xl p-6 max-w-sm w-full mx-4 shadow-2xl animate-fadeIn"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={t('link.choiceTitle')}
      >
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
            <Icon name="external-link" size={20} className="text-primary" />
          </div>
          <div className="min-w-0">
            <h3 className="text-text-primary font-semibold text-sm">{typeLabel}</h3>
            <p className="text-text-secondary text-xs truncate">{url}</p>
          </div>
        </div>

        <p className="text-text-secondary text-sm mb-4">{t('link.choiceDesc')}</p>

        <div className="flex flex-col gap-2">
          <button
            onClick={handleOpenInternal}
            className="w-full px-4 py-2.5 bg-primary text-white rounded-lg font-medium text-sm hover:bg-primary-hover transition-colors flex items-center justify-center gap-2"
          >
            <Icon name="home" size={16} />
            {t('link.openInApp')}
          </button>
          <button
            onClick={handleOpenExternal}
            className="w-full px-4 py-2.5 border border-border text-text-primary rounded-lg font-medium text-sm hover:bg-surface transition-colors flex items-center justify-center gap-2"
          >
            <Icon name="external-link" size={16} />
            {t('link.openInBsky')}
          </button>
          <button
            onClick={onClose}
            className="w-full px-4 py-2 text-text-secondary text-sm hover:text-text-primary transition-colors"
          >
            {t('action.cancel')}
          </button>
        </div>
      </div>
    </div>
  );
}

interface BskyLinkCardProps {
  url: string;
  onOpenInternal: (view: AppView) => void;
  stopPropagation?: boolean;
}

/**
 * A link card specifically for bsky.app URLs.
 * Shows a friendly preview with Bluesky branding.
 * Click opens a choice modal (open in app vs open in bsky.app).
 */
export function BskyLinkCard({ url, onOpenInternal, stopPropagation = true }: BskyLinkCardProps) {
  const { t } = useI18n();
  const [showModal, setShowModal] = useState(false);
  const [resolvedData, setResolvedData] = useState<{ title?: string; subtitle?: string; avatar?: string } | null>(null);

  const info = parseBskyAppUrl(url);
  const typeLabel = info ? getBskyUrlTypeLabel(info.type, t) : t('link.type.unknown');

  const handleClick = useCallback((e: React.MouseEvent) => {
    if (stopPropagation) {
      e.stopPropagation();
    }
    setShowModal(true);
  }, [stopPropagation]);

  return (
    <>
      <button
        onClick={handleClick}
        className="mt-2 w-full text-left block border border-border rounded-lg p-3 hover:bg-surface transition-colors group"
      >
        <div className="flex items-center gap-2 mb-1.5">
          <div className="w-5 h-5 rounded bg-primary/10 flex items-center justify-center shrink-0">
            <Icon name="external-link" size={12} className="text-primary" />
          </div>
          <span className="text-xs font-medium text-primary">{typeLabel}</span>
        </div>
        <p className="text-text-primary text-sm font-medium line-clamp-1">
          {resolvedData?.title || info?.handleOrDid || url}
        </p>
        {resolvedData?.subtitle && (
          <p className="text-text-secondary text-xs mt-0.5 line-clamp-1">{resolvedData.subtitle}</p>
        )}
        <p className="text-text-secondary text-xs mt-1 truncate">{url}</p>
      </button>

      {showModal && createPortal(
        <LinkChoiceModal
          url={url}
          onOpenInternal={onOpenInternal}
          onClose={() => setShowModal(false)}
        />,
        document.body
      )}
    </>
  );
}

export { isBskyAppUrl };
