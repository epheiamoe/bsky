import React, { useEffect } from 'react';
import { useI18n } from '@bsky/app';
import type { ModerationDecision } from '@bsky/core';
import { Icon } from './Icon.js';

interface LabelDetailModalProps {
  sources: ModerationDecision['sources'];
  onClose: () => void;
}

export function LabelDetailModal({ sources, onClose }: LabelDetailModalProps) {
  const { t } = useI18n();

  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = '';
    };
  }, []);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="mx-4 max-w-md w-full rounded-xl border border-border bg-surface p-4 shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-text-primary">
            {t('moderation.labelDetails')}
          </h3>
          <button
            onClick={onClose}
            className="p-1 text-text-secondary hover:text-text-primary transition-colors"
            aria-label={t('a11y.close')}
          >
            <Icon name="x" size={16} />
          </button>
        </div>
        <div className="space-y-3 max-h-[60vh] overflow-y-auto">
          {sources.map(source => (
            <div key={source.labelerDid} className="space-y-1.5">
              <p className="text-sm font-medium text-text-primary">
                {source.labelerName || source.labelerDid}
              </p>
              <div className="flex flex-wrap gap-1">
                {source.labels.map(label => (
                  <span
                    key={label.val}
                    className="px-2 py-1 rounded text-xs bg-surface border border-border text-text-secondary"
                  >
                    {label.name || label.val} ({label.val})
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
