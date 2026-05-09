import React, { useState } from 'react';
import { useI18n } from '@bsky/app';
import { Icon } from './Icon.js';
import { AboutPage } from './AboutPage.js';

interface LoginPageProps {
  onLogin: (handle: string, password: string, pdsUrl?: string) => Promise<void>;
  error?: string | null;
}

export function LoginPage({ onLogin, error }: LoginPageProps) {
  const { t } = useI18n();
  const [handle, setHandle] = useState('');
  const [password, setPassword] = useState('');
  const [pdsUrl, setPdsUrl] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [showAbout, setShowAbout] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!handle.trim() || !password.trim()) return;
    setSubmitting(true);
    setLocalError(null);
    try {
      let cleaned = handle.trim();
      cleaned = cleaned.replace(/^@/, '');
      cleaned = cleaned.replace(/^https?:\/\//, '');
      await onLogin(cleaned, password, pdsUrl.trim() || undefined);
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : t('login.error'));
    } finally {
      setSubmitting(false);
    }
    } finally {
      setSubmitting(false);
    }
  };

  const displayError = localError ?? error;

  if (showAbout) {
    return <AboutPage goBack={() => setShowAbout(false)} />;
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-white dark:bg-[#0A0A0A] px-4 animate-fadeIn">
      <div className="relative w-full max-w-sm">
        <button
          onClick={() => setShowAbout(true)}
          className="absolute -top-2 right-0 text-text-secondary hover:text-primary transition-colors"
          title={t('nav.about')}
        >
          <Icon name="astroid-as-AI-Button" size={18} />
        </button>
        <div className="text-center mb-8">
          <p className="mb-3"><Icon name="astroid-as-AI-Button" size={32} className="text-primary" /></p>
          <h1 className="text-2xl font-bold text-text-primary">Bluesky</h1>
          <p className="text-text-secondary text-sm mt-1">{t('login.title')}</p>
        </div>

        {/* Help hint */}
        <div className="mb-4 p-3 rounded-lg bg-primary/5 border border-primary/10 text-text-secondary text-xs">
          {t('login.needHint')}
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-text-secondary mb-1">{t('login.handleLabel')}</label>
            <input
              type="text"
              value={handle}
              onChange={e => setHandle(e.target.value)}
              placeholder={t('login.handlePlaceholder')}
              autoComplete="username"
              disabled={submitting}
              className="w-full px-4 py-3 rounded-lg border border-border bg-surface text-text-primary placeholder:text-text-secondary/50 focus:outline-none focus:ring-2 focus:ring-primary disabled:opacity-50"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-text-secondary mb-1">{t('login.password')}</label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              autoComplete="current-password"
              disabled={submitting}
              className="w-full px-4 py-3 rounded-lg border border-border bg-surface text-text-primary placeholder:text-text-secondary/50 focus:outline-none focus:ring-2 focus:ring-primary disabled:opacity-50"
            />
            <p className="text-text-secondary text-xs mt-1">
              {t('login.passwordHint')}{' '}
              <a
                href="https://bsky.app/settings/app-passwords"
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:underline"
              >
                {t('login.passwordHintLink')}
              </a>{' '}
              {t('login.passwordHintCreate')}
            </p>
          </div>

          {/* PDS Host */}
          <div className="p-3 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800">
            <label className="block text-xs font-medium text-amber-700 dark:text-amber-300 mb-1">{t('login.pdsLabel')}</label>
            <input
              type="text"
              value={pdsUrl}
              onChange={e => setPdsUrl(e.target.value)}
              placeholder={`${t('login.pdsHint')}`}
              disabled={submitting}
              className="w-full px-3 py-2 rounded-lg border border-amber-300 dark:border-amber-700 bg-white dark:bg-amber-900/40 text-amber-900 dark:text-amber-100 placeholder:text-amber-400/50 focus:outline-none focus:ring-2 focus:ring-amber-500 disabled:opacity-50"
            />
            <p className="text-amber-600 dark:text-amber-400 text-xs mt-1">
              {t('login.pdsWarning')}
            </p>
          </div>

          {displayError && (
            <div className="text-red-500 text-sm bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg px-3 py-2">
              {displayError}
            </div>
          )}

          <button
            type="submit"
            disabled={submitting || !handle.trim() || !password.trim()}
            className="w-full py-3 rounded-lg bg-primary hover:bg-primary-hover text-white font-semibold disabled:opacity-50 transition-colors"
          >
            {submitting ? t('login.submitting') : t('login.submit')}
          </button>
        </form>

        <p className="text-text-secondary text-xs text-center mt-6">
          {t('login.privacyNote')}
        </p>
      </div>
    </div>
  );
}
