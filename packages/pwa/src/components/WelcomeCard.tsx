import React, { useState } from 'react';
import { useI18n } from '@bsky/app';
import { Icon } from './Icon.js';

interface WelcomeCardProps {
  onGoToSettings: () => void;
  onSkip: () => void;
}

/** Provider guide entry — rendered as a compact card */
interface ProviderGuide {
  name: string;
  desc: string;
  steps: string[];
  baseUrl: string;
  link: string;
  linkLabel: string;
}

export function WelcomeCard({ onGoToSettings, onSkip }: WelcomeCardProps) {
  const { t } = useI18n();
  const [expanded, setExpanded] = useState<string | null>(null);

  const providers: ProviderGuide[] = [
    {
      name: 'DeepSeek',
      desc: t('welcome.deepseekDesc'),
      steps: [
        t('welcome.deepseekStep1'),
        t('welcome.deepseekStep2'),
        t('welcome.deepseekStep3'),
      ],
      baseUrl: 'https://api.deepseek.com',
      link: 'https://platform.deepseek.com/api_keys',
      linkLabel: 'platform.deepseek.com',
    },
    {
      name: 'Mistral',
      desc: t('welcome.mistralDesc'),
      steps: [
        t('welcome.mistralStep1'),
        t('welcome.mistralStep2'),
        t('welcome.mistralStep3'),
      ],
      baseUrl: 'https://api.mistral.ai',
      link: 'https://console.mistral.ai/api-keys',
      linkLabel: 'console.mistral.ai',
    },
  ];

  return (
    <div className="fixed inset-0 z-[9998] bg-black/40 flex items-center justify-center p-4 animate-fadeIn">
      <div className="bg-white dark:bg-[#1A1A1A] rounded-xl border border-border max-w-lg w-full max-h-[85vh] overflow-y-auto shadow-xl">
        {/* Header */}
        <div className="p-6 pb-4">
          <h2 className="text-xl font-bold text-text-primary">{t('welcome.title')}</h2>
          <p className="text-text-secondary text-sm mt-1">{t('welcome.subtitle')}</p>
        </div>

        {/* Privacy note */}
        <div className="mx-6 mb-4 p-3 rounded-lg bg-primary/5 border border-primary/10">
          <p className="text-xs text-text-secondary">{t('welcome.privacyNote')}</p>
        </div>

        {/* What works without AI */}
        <div className="mx-6 mb-4 p-3 rounded-lg bg-green-500/5 border border-green-500/10">
          <p className="text-xs font-medium text-green-600 dark:text-green-400 mb-1">{t('welcome.readyNow')}</p>
          <p className="text-text-secondary text-xs">{t('welcome.readyNowDesc')}</p>
        </div>

        {/* Provider cards */}
        <div className="px-6 space-y-3 mb-4">
          <p className="text-xs font-medium text-text-secondary uppercase tracking-wider">{t('welcome.aiProviders')}</p>

          {providers.map(p => (
            <div key={p.name} className={`rounded-lg border transition-colors ${
              expanded === p.name ? 'border-primary/50 bg-primary/5' : 'border-border hover:border-primary/30'
            }`}>
              <button
                onClick={() => setExpanded(expanded === p.name ? null : p.name)}
                className="w-full text-left px-4 py-3 flex items-center justify-between"
              >
                <div>
                  <span className="text-text-primary font-medium text-sm">{p.name}</span>
                  <span className="text-text-secondary text-xs block">{p.desc}</span>
                </div>
                <Icon name="chevron-down" size={16} className={`text-text-secondary/50 transition-transform ${expanded === p.name ? 'rotate-180' : ''}`} />
              </button>

              {expanded === p.name && (
                <div className="px-4 pb-4 space-y-3 animate-slideUp">
                  <ol className="text-text-secondary text-xs space-y-1.5 list-decimal list-inside">
                    {p.steps.map((s, i) => <li key={i}>{s}</li>)}
                  </ol>
                  <p className="text-text-secondary text-xs">
                    Base URL: <code className="text-primary text-[11px] bg-primary/5 px-1 py-0.5 rounded">{p.baseUrl}</code>
                  </p>
                  <a
                    href={p.link}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" x2="21" y1="14" y2="3"/></svg>
                    {p.linkLabel}
                  </a>
                </div>
              )}
            </div>
          ))}

          {/* Custom / more providers */}
          <div className="rounded-lg border border-border p-4">
            <p className="text-text-primary font-medium text-sm mb-1">{t('welcome.customTitle')}</p>
            <p className="text-text-secondary text-xs">{t('welcome.customDesc')}</p>
          </div>
        </div>

        {/* Actions */}
        <div className="p-6 pt-0 flex items-center gap-3">
          <button
            onClick={onSkip}
            className="flex-1 py-2.5 rounded-lg border border-border text-text-secondary hover:text-text-primary text-sm font-medium transition-colors"
          >
            {t('welcome.skip')}
          </button>
          <button
            onClick={onGoToSettings}
            className="flex-1 py-2.5 rounded-lg bg-primary hover:bg-primary-hover text-white text-sm font-medium transition-colors"
          >
            {t('welcome.goSettings')}
          </button>
        </div>
      </div>
    </div>
  );
}
