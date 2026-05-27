import React from 'react';
import { useI18n } from '@bsky/app';
import { Icon } from './Icon.js';

interface LoadingSafetyBannerProps {
  visible: boolean;
}

/**
 * Top sticky banner shown during content safety verification loading.
 * Uses banner strategy — non-blocking, shows at the top of the feed.
 */
export function LoadingSafetyBanner({ visible }: LoadingSafetyBannerProps) {
  const { t } = useI18n();

  if (!visible) return null;

  return (
    <div
      className="sticky top-0 z-40 bg-yellow-50 dark:bg-yellow-900/20 border-b border-yellow-200 dark:border-yellow-800"
      role="status"
      aria-live="polite"
    >
      <div className="px-4 py-2.5 flex items-center gap-2">
        <div className="w-4 h-4 border-2 border-yellow-600 dark:border-yellow-400 border-t-transparent rounded-full animate-spin" />
        <span className="text-sm font-medium text-yellow-700 dark:text-yellow-300">
          {t('pipeline.loadingSafety')}
        </span>
      </div>
    </div>
  );
}
