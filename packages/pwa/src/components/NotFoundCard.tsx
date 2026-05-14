import React from 'react';
import { useI18n } from '@bsky/app';
import { Icon } from './Icon.js';

interface NotFoundCardProps {
  uri?: string;
  message?: string;
  goBack: () => void;
}

export function NotFoundCard({ uri, message, goBack }: NotFoundCardProps) {
  const { t } = useI18n();
  return (
    <div className="min-h-[100dvh] flex flex-col items-center justify-center bg-background px-4 animate-fadeIn">
      <button
        onClick={goBack}
        className="text-text-secondary hover:text-text-primary transition-colors mb-6 flex items-center gap-2"
      >
        <Icon name="arrow-big-left" size={20} />
        {t('common.back')}
      </button>
      <div className="text-text-secondary mb-4">
        <Icon name="book-search" size={64} />
      </div>
      <p className="text-text-primary text-lg font-medium mb-2">
        {message || t('common.notFound')}
      </p>
      {uri && (
        <p className="text-text-secondary text-xs break-all max-w-md text-center font-mono">{uri}</p>
      )}
    </div>
  );
}
