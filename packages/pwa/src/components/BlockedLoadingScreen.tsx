import React from 'react';
import { useI18n } from '@bsky/app';
import { Icon } from './Icon.js';

interface BlockedLoadingScreenProps {
  visible: boolean;
  error?: string;
  onRetry?: () => void;
  onLoadAnyway?: () => void;
}

/**
 * Full-screen blocking overlay shown when content safety verification fails.
 * Uses block strategy — prevents content loading until resolved or bypassed.
 */
export function BlockedLoadingScreen({ visible, error, onRetry, onLoadAnyway }: BlockedLoadingScreenProps) {
  const { t } = useI18n();

  if (!visible) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      role="alert"
      aria-live="polite"
    >
      <div className="mx-4 w-full max-w-sm bg-surface rounded-xl shadow-2xl border border-border p-6 text-center">
        <div className="flex justify-center mb-4">
          <div className="w-12 h-12 rounded-full bg-red-50 dark:bg-red-900/20 flex items-center justify-center">
            <Icon name="shield" size={24} className="text-red-500 dark:text-red-400" />
          </div>
        </div>

        <h2 className="text-lg font-semibold text-text-primary mb-2">
          {t('pipeline.blockedTitle')}
        </h2>

        <p className="text-sm text-text-secondary mb-4">
          {t('pipeline.blockedDesc')}
        </p>

        {error && (
          <div className="mb-4 p-3 rounded-lg bg-red-50 dark:bg-red-900/10 border border-red-200 dark:border-red-800 text-left">
            <p className="text-xs text-red-600 dark:text-red-400 font-mono break-all">
              {error}
            </p>
          </div>
        )}

        <div className="flex flex-col sm:flex-row gap-3">
          {onRetry && (
            <button
              onClick={onRetry}
              className="flex-1 px-4 py-2.5 rounded-lg bg-primary text-white text-sm font-medium hover:bg-primary-hover active:bg-primary-active transition-colors"
            >
              {t('pipeline.retry')}
            </button>
          )}
          {onLoadAnyway && (
            <button
              onClick={onLoadAnyway}
              className="flex-1 px-4 py-2.5 rounded-lg border border-border text-text-secondary text-sm font-medium hover:bg-surface-hover active:bg-surface-active transition-colors"
            >
              {t('pipeline.loadAnyway')}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
