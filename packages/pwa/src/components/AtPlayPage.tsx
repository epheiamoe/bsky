import React from 'react';
import type { BskyClient } from '@bsky/core';
import type { AppView } from '@bsky/app';
import { useI18n } from '@bsky/app';
import { Icon } from './Icon.js';

interface AtPlayPageProps {
  client: BskyClient;
  goBack: () => void;
  goTo: (v: AppView) => void;
}

const EXPERIMENTS = [
  {
    id: 'socialCircle',
    icon: 'users-round' as const,
    key: 'atplay.socialCircle',
    descKey: 'atplay.socialCircleDesc',
    navigateTo: { type: 'atplaySocialCircle' } as AppView,
  },
];

export function AtPlayPage({ goBack, goTo }: AtPlayPageProps) {
  const { t } = useI18n();

  return (
    <div className="flex flex-col h-[calc(100dvh-3rem)] animate-fadeIn">
      <div className="border-b border-border px-4 py-3 flex items-center gap-3">
        <button
          onClick={goBack}
          aria-label={t('nav.back')}
          className="text-text-secondary hover:text-text-primary transition-colors"
        >
          <Icon name="arrow-big-left" size={20} />
        </button>
        <h1 className="text-text-primary font-semibold text-lg">{t('atplay.title')}</h1>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="px-4 pt-4 pb-2">
          <p className="text-text-secondary text-sm">{t('atplay.subtitle')}</p>
        </div>

        <div className="px-4 py-2 space-y-3">
          {EXPERIMENTS.map((exp) => (
            <button
              key={exp.id}
              onClick={() => goTo(exp.navigateTo)}
              className="w-full text-left bg-surface hover:bg-surface/80 border border-border rounded-xl p-4 transition-colors group"
            >
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-lg bg-primary/10 text-primary flex items-center justify-center flex-shrink-0 mt-0.5">
                  <Icon name={exp.icon} size={20} />
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className="text-text-primary font-semibold text-sm group-hover:text-primary transition-colors">
                    {t(exp.key)}
                  </h3>
                  <p className="text-text-secondary text-xs mt-1 line-clamp-2">
                    {t(exp.descKey)}
                  </p>
                </div>
                <div className="text-text-muted flex-shrink-0 mt-1">
                  <Icon name="arrow-big-right" size={18} />
                </div>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
