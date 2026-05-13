import React, { useState } from 'react';
import { useI18n } from '@bsky/app';
import type { LoginErrorDetail } from '@bsky/core';
import { Icon } from './Icon.js';
import { AboutPage } from './AboutPage.js';

interface LoginPageProps {
  onLogin: (handle: string, password: string, pdsUrl?: string) => Promise<void>;
  error?: string | null;
  errorLog?: LoginErrorDetail | null;
}

function LoginErrorModal({
  log,
  onClose,
}: {
  log: LoginErrorDetail;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const [copied, setCopied] = useState(false);

  const logLines: string[] = [
    '==== Login Error Log ====',
    `${t('login.logFieldTime')}: ${log.timestamp}`,
    `${t('login.logFieldVersion')}: ${log.version}`,
    `${t('login.logFieldCommit')}: ${log.commitHash}`,
    `${t('login.logFieldBuildTime')}: ${log.buildTime}`,
    `${t('login.logFieldHandle')}: ${log.handleOriginal}`,
    `${t('login.logFieldPassword')}: ${log.passwordMasked}`,
    `${t('login.logFieldPds')}: ${log.pdsUrl}`,
    `${t('login.logFieldStatus')}: ${log.status}`,
  ];
  if (log.blueskyError) {
    logLines.push(`${t('login.logFieldError')}: ${log.blueskyError}`);
  }
  if (log.blueskyMessage) {
    logLines.push(`${t('login.logFieldMessage')}: ${log.blueskyMessage}`);
  }
  logLines.push(`${t('login.logFieldUrl')}: ${log.requestUrl}`);
  const logText = logLines.join('\n');

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(logText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // fallback for non-https
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
      <div className="bg-white dark:bg-[#1a1a1a] rounded-xl shadow-2xl border border-border max-w-md w-full max-h-[80vh] flex flex-col">
        <div className="p-4 border-b border-border">
          <h2 className="text-lg font-bold text-text-primary">{t('login.logTitle')}</h2>
          <p className="text-text-secondary text-xs mt-1">{t('login.logHint')}</p>
        </div>
        <pre className="flex-1 overflow-auto p-4 text-xs font-mono text-text-primary bg-surface leading-relaxed whitespace-pre-wrap break-all">
          {logText}
        </pre>
        <div className="p-4 border-t border-border flex gap-2">
          <button
            onClick={handleCopy}
            className="flex-1 py-2 rounded-lg bg-primary hover:bg-primary-hover text-white text-sm font-semibold transition-colors"
          >
            {copied ? (
              <><Icon name="badge-check" size={14} /> {t('login.logCopied')}</>
            ) : (
              t('login.copyLog')
            )}
          </button>
          <button
            onClick={onClose}
            className="py-2 px-4 rounded-lg border border-border text-text-secondary hover:text-text-primary text-sm transition-colors"
          >
            {t('action.done')}
          </button>
        </div>
      </div>
    </div>
  );
}

export function LoginPage({ onLogin, error, errorLog }: LoginPageProps) {
  const { t } = useI18n();
  const [handle, setHandle] = useState('');
  const [password, setPassword] = useState('');
  const [pdsUrl, setPdsUrl] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [showAbout, setShowAbout] = useState(false);
  const [showLog, setShowLog] = useState(false);

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
  };

  const displayError = localError ?? error;

  if (showAbout) {
    return <AboutPage goBack={() => setShowAbout(false)} />;
  }

  return (
    <div className="min-h-[100dvh] flex items-center justify-center bg-background px-4 animate-fadeIn">
      {showLog && errorLog && (
        <LoginErrorModal log={errorLog} onClose={() => setShowLog(false)} />
      )}
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
            <label htmlFor="login-handle" className="block text-xs font-medium text-text-secondary mb-1">{t('login.handleLabel')}</label>
            <input
              type="text"
              value={handle}
              onChange={e => setHandle(e.target.value)}
              id="login-handle" aria-describedby="login-error" aria-invalid={displayError ? 'true' : undefined} placeholder={t('login.handlePlaceholder')}
              autoComplete="username"
              disabled={submitting}
              className="w-full px-4 py-3 rounded-lg border border-border bg-surface text-text-primary placeholder:text-text-secondary/50 focus:outline-none focus:ring-2 focus:ring-primary disabled:opacity-50"
            />
          </div>
          <div>
            <label htmlFor="login-password" className="block text-xs font-medium text-text-secondary mb-1">{t('login.password')}</label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              id="login-password" aria-describedby="login-error" aria-invalid={displayError ? 'true' : undefined} autoComplete="current-password"
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
            <label htmlFor="login-pds-url" className="block text-xs font-medium text-amber-700 dark:text-amber-300 mb-1">{t('login.pdsLabel')}</label>
            <input
              type="text"
              value={pdsUrl}
              onChange={e => setPdsUrl(e.target.value)}
              id="login-pds-url" placeholder={`${t('login.pdsHint')}`}
              disabled={submitting}
              className="w-full px-3 py-2 rounded-lg border border-amber-300 dark:border-amber-700 bg-white dark:bg-amber-900/40 text-amber-900 dark:text-amber-100 placeholder:text-amber-400/50 focus:outline-none focus:ring-2 focus:ring-amber-500 disabled:opacity-50"
            />
            <p className="text-amber-600 dark:text-amber-400 text-xs mt-1">
              {t('login.pdsWarning')}
            </p>
          </div>

          {displayError && (
            <div id="login-error" role="alert" className="text-red-500 text-sm bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg px-3 py-2">
              <p>{displayError}</p>
              {errorLog && (
                <button
                  onClick={() => setShowLog(true)}
                  className="mt-2 text-xs text-red-400 hover:text-red-300 underline underline-offset-2"
                >
                  {t('login.viewLog')}
                </button>
              )}
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
