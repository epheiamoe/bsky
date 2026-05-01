import React, { useState } from 'react';
import { useI18n } from '@bsky/app';
import { Icon } from './Icon.js';

interface LoginPageProps {
  onLogin: (handle: string, password: string) => Promise<void>;
  error?: string | null;
}

export function LoginPage({ onLogin, error }: LoginPageProps) {
  const { t } = useI18n();
  const [handle, setHandle] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!handle.trim() || !password.trim()) return;
    setSubmitting(true);
    setLocalError(null);
    try {
      await onLogin(handle.trim(), password);
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : t('login.error'));
    } finally {
      setSubmitting(false);
    }
  };

  const displayError = localError ?? error;

  return (
    <div className="min-h-screen flex items-center justify-center bg-white dark:bg-[#0A0A0A] px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <p className="text-5xl mb-3"><Icon name="astroid-as-AI-Button" size={20} /></p>
          <h1 className="text-2xl font-bold text-text-primary">Bluesky</h1>
          <p className="text-text-secondary text-sm mt-1">{t('login.title')}</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
          <input
            type="text"
            value={handle}
            onChange={e => setHandle(e.target.value)}
            placeholder={t('login.handle')}
            autoComplete="username"
            disabled={submitting}
            className="w-full px-4 py-3 rounded-lg border border-border bg-surface text-text-primary placeholder:text-text-secondary/50 focus:outline-none focus:ring-2 focus:ring-primary disabled:opacity-50"
          />
          </div>
          <div>
          <input
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            placeholder={t('login.password')}
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
