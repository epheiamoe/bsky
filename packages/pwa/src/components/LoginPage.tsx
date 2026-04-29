import React, { useState } from 'react';

interface LoginPageProps {
  onLogin: (handle: string, password: string) => Promise<void>;
  error?: string | null;
}

export function LoginPage({ onLogin, error }: LoginPageProps) {
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
      setLocalError(err instanceof Error ? err.message : '登录失败');
    } finally {
      setSubmitting(false);
    }
  };

  const displayError = localError ?? error;

  return (
    <div className="min-h-screen flex items-center justify-center bg-white dark:bg-[#0A0A0A] px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <p className="text-5xl mb-3">🦋</p>
          <h1 className="text-2xl font-bold text-text-primary">Bluesky</h1>
          <p className="text-text-secondary text-sm mt-1">登录你的 Bluesky 账号</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <input
              type="text"
              value={handle}
              onChange={e => setHandle(e.target.value)}
              placeholder="handle.bsky.social"
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
              placeholder="App Password"
              autoComplete="current-password"
              disabled={submitting}
              className="w-full px-4 py-3 rounded-lg border border-border bg-surface text-text-primary placeholder:text-text-secondary/50 focus:outline-none focus:ring-2 focus:ring-primary disabled:opacity-50"
            />
            <p className="text-text-secondary text-xs mt-1">
              使用 App Password，在{' '}
              <a
                href="https://bsky.app/settings/app-passwords"
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:underline"
              >
                Bluesky 设置
              </a>{' '}
              中创建
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
            {submitting ? '登录中…' : '登录'}
          </button>
        </form>

        <p className="text-text-secondary text-xs text-center mt-6">
          登录凭证仅保存在你的浏览器本地
        </p>
      </div>
    </div>
  );
}
