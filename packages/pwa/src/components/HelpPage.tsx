import React from 'react';
import { useI18n } from '@bsky/app';
import { Icon } from './Icon.js';

interface HelpPageProps {
  goBack: () => void;
}

const HELP_SECTIONS = [
  { icon: 'clipboard-paste', titleKey: 'help.clipboard.title' as const, descKey: 'help.clipboard.desc' as const },
  { icon: 'at-sign', titleKey: 'help.urls.title' as const, descKey: 'help.urls.desc' as const },
  { icon: 'file-image', titleKey: 'help.embeds.title' as const, descKey: 'help.embeds.desc' as const },
  { icon: 'astroid-as-AI-Button', titleKey: 'help.ai.title' as const, descKey: 'help.ai.desc' as const },
  { icon: 'type', titleKey: 'help.keyboard.title' as const, descKey: 'help.keyboard.desc' as const },
  { icon: 'flask-conical', titleKey: 'help.atplay.title' as const, descKey: 'help.atplay.desc' as const },
  { icon: 'table', titleKey: 'help.widgets.title' as const, descKey: 'help.widgets.desc' as const },
] as const;

export function HelpPage({ goBack }: HelpPageProps) {
  const { t } = useI18n();

  return (
    <div className="min-h-[100dvh] bg-background animate-fadeIn">
      <header className="sticky top-0 z-10 bg-white/80 dark:bg-[#0A0A0A]/80 backdrop-blur-md border-b border-border px-4 h-12 flex items-center">
        <button type="button" onClick={goBack} className="text-text-secondary hover:text-text-primary mr-3" aria-label={t('nav.back')}>
          <Icon name="arrow-big-left" size={20} />
        </button>
        <h1 className="font-semibold text-text-primary text-sm">{t('help.title')}</h1>
      </header>

      <div className="max-w-2xl mx-auto px-4 py-6">
        <div className="space-y-4">
          {HELP_SECTIONS.map((section) => (
            <div
              key={section.titleKey}
              className="bg-surface rounded-xl p-4 border border-border"
            >
              <div className="flex items-start gap-3">
                <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                  <Icon name={section.icon} size={20} className="text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <h2 className="text-sm font-semibold text-text-primary mb-1">
                    {t(section.titleKey)}
                  </h2>
                  <p className="text-sm text-text-secondary leading-relaxed">
                    {t(section.descKey)}
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
