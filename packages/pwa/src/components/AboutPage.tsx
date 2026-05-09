import React from 'react';
import { useI18n } from '@bsky/app';
import { Icon } from './Icon.js';

interface AboutPageProps {
  goBack: () => void;
}

export function AboutPage({ goBack }: AboutPageProps) {
  const { t } = useI18n();

  const commitHash = typeof __COMMIT_HASH__ !== 'undefined' ? __COMMIT_HASH__ : '(dev)';
  const commitDesc = typeof __COMMIT_DESC__ !== 'undefined' ? __COMMIT_DESC__ : '(dev)';
const buildTime = typeof __BUILD_TIME__ !== 'undefined'
  ? (() => {
      const d = new Date(__BUILD_TIME__);
      const offset = -d.getTimezoneOffset();
      const sign = offset >= 0 ? '+' : '';
      const tz = `UTC${sign}${Math.floor(offset / 60)}`;
      return d.toLocaleString() + ` (${tz})`;
    })()
  : '(dev)';
  const repoUrl = 'https://github.com/epheiamoe/bsky';
  const demoUrl = 'https://ai-bsky.pages.dev';
  const issuesUrl = 'https://github.com/epheiamoe/bsky/issues';
  const contactEmail = 'bsky@desuwa.org';

  return (
    <div className="min-h-screen bg-white dark:bg-[#0A0A0A] animate-fadeIn">
      <header className="sticky top-0 z-10 bg-white/80 dark:bg-[#0A0A0A]/80 backdrop-blur-md border-b border-border px-4 h-12 flex items-center">
        <button onClick={goBack} className="text-text-secondary hover:text-text-primary mr-3">
          <Icon name="arrow-big-left" size={20} />
        </button>
        <h1 className="font-semibold text-text-primary text-sm">{t('nav.about')}</h1>
      </header>

      <main className="max-w-content mx-auto p-6">
        <div className="rounded-xl border border-border bg-surface/50 p-6 space-y-4">
          <div className="text-center">
            <Icon name="astroid-as-AI-Button" size={32} />
            <h2 className="text-lg font-semibold text-text-primary mt-2">Bluesky Client</h2>
            <p className="text-sm text-text-secondary">v0.7.0</p>
          </div>

          <div className="space-y-3 text-sm">
            <div>
              <p className="text-text-secondary text-xs font-medium uppercase tracking-wider">{t('about.repository')}</p>
              <a href={repoUrl} target="_blank" rel="noopener noreferrer" className="text-primary hover:text-primary-hover break-all">{repoUrl}</a>
            </div>

            <div>
              <p className="text-text-secondary text-xs font-medium uppercase tracking-wider">{t('about.description')}</p>
              <p className="text-text-primary leading-relaxed">A dual-UI (TUI + PWA) Bluesky social client with AI integration. Built with React, TypeScript, Tailwind CSS, and AT Protocol.</p>
            </div>

            <div>
              <p className="text-text-secondary text-xs font-medium uppercase tracking-wider">{t('about.demo')}</p>
              <a href={demoUrl} target="_blank" rel="noopener noreferrer" className="text-primary hover:text-primary-hover break-all">{demoUrl}</a>
            </div>

            <div>
              <p className="text-text-secondary text-xs font-medium uppercase tracking-wider">{t('about.commit')}</p>
              <div className="flex items-center gap-2 mt-1">
                <code className="text-text-primary text-xs break-all bg-surface border border-border rounded px-2 py-1 inline-block max-w-full">{commitHash}</code>
                <button onClick={() => navigator.clipboard.writeText(commitHash)} className="shrink-0 text-text-secondary hover:text-primary transition-colors" title="Copy commit hash">
                  <Icon name="copy" size={14} />
                </button>
              </div>
            </div>

            <div>
              <p className="text-text-secondary text-xs font-medium uppercase tracking-wider">{t('about.commitDesc')}</p>
              <p className="text-text-primary italic">{commitDesc}</p>
            </div>

            <div>
              <p className="text-text-secondary text-xs font-medium uppercase tracking-wider">{t('about.buildTime')}</p>
              <p className="text-text-primary">{buildTime}</p>
            </div>

            <div>
              <p className="text-text-secondary text-xs font-medium uppercase tracking-wider">{t('about.feedback')}</p>
              <a href={issuesUrl} target="_blank" rel="noopener noreferrer" className="text-primary hover:text-primary-hover break-all">{issuesUrl}</a>
            </div>

            <div>
              <p className="text-text-secondary text-xs font-medium uppercase tracking-wider">{t('about.contact')}</p>
              <a href={`mailto:${contactEmail}`} className="text-primary hover:text-primary-hover">{contactEmail}</a>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
