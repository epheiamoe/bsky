import React, { useState } from 'react';
import type { AppConfig } from '../hooks/useAppConfig.js';
import { updateAppConfig } from '../hooks/useAppConfig.js';
import type { TargetLang } from '@bsky/app';

const LANG_OPTIONS: { value: string; label: string }[] = [
  { value: 'zh', label: '中文' },
  { value: 'en', label: 'English' },
  { value: 'ja', label: '日本語' },
  { value: 'ko', label: '한국어' },
  { value: 'fr', label: 'Français' },
  { value: 'de', label: 'Deutsch' },
  { value: 'es', label: 'Español' },
];

interface SettingsModalProps {
  open: boolean;
  onClose: () => void;
  config: AppConfig;
  onConfigChange: (config: AppConfig) => void;
  onRelogin: (handle: string, password: string) => Promise<void>;
  onLogout: () => void;
}

type Tab = 'bluesky' | 'ai' | 'general';

export function SettingsModal({ open, onClose, config, onConfigChange, onRelogin, onLogout }: SettingsModalProps) {
  const [tab, setTab] = useState<Tab>('bluesky');

  const [handle, setHandle] = useState('');
  const [password, setPassword] = useState('');
  const [loginMsg, setLoginMsg] = useState<string | null>(null);

  const [apiKey, setApiKey] = useState(config.aiConfig.apiKey);
  const [baseUrl, setBaseUrl] = useState(config.aiConfig.baseUrl);
  const [model, setModel] = useState(config.aiConfig.model);

  const [targetLang, setTargetLang] = useState(config.targetLang);
  const [darkMode, setDarkMode] = useState(config.darkMode);

  if (!open) return null;

  const handleRelogin = async () => {
    if (!handle.trim() || !password.trim()) return;
    try {
      await onRelogin(handle.trim(), password);
      setLoginMsg('✅ 已更新凭证');
    } catch (e) {
      setLoginMsg(e instanceof Error ? e.message : '失败');
    }
  };

  const saveAi = () => {
    const updated = { ...config, aiConfig: { apiKey, baseUrl, model } };
    updateAppConfig(updated);
    onConfigChange(updated);
  };

  const saveGeneral = () => {
    const updated = { ...config, targetLang, darkMode };
    updateAppConfig(updated);
    onConfigChange(updated);
    document.documentElement.classList.toggle('dark', darkMode);
  };

  const tabs: { key: Tab; label: string }[] = [
    { key: 'bluesky', label: '🦋 账号' },
    { key: 'ai', label: '🤖 AI' },
    { key: 'general', label: '⚙️ 通用' },
  ];

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white dark:bg-[#121212] rounded-xl shadow-xl border border-border w-full max-w-md max-h-[80vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h2 className="text-lg font-semibold text-text-primary">设置</h2>
          <button onClick={onClose} className="text-text-secondary hover:text-text-primary text-xl leading-none p-1">✕</button>
        </div>

        <div className="flex border-b border-border">
          {tabs.map(t => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`flex-1 py-2.5 text-sm font-medium transition-colors ${
                tab === t.key
                  ? 'text-primary border-b-2 border-primary'
                  : 'text-text-secondary hover:text-text-primary'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {tab === 'bluesky' && (
            <>
              <p className="text-text-secondary text-xs">更新 Bluesky 登录凭证（重新登录后将刷新 session）</p>
              <input
                type="text" value={handle} onChange={e => setHandle(e.target.value)}
                placeholder="handle.bsky.social"
                className="w-full px-3 py-2 rounded-lg border border-border bg-surface text-text-primary text-sm placeholder:text-text-secondary/50 focus:outline-none focus:ring-2 focus:ring-primary"
              />
              <input
                type="password" value={password} onChange={e => setPassword(e.target.value)}
                placeholder="App Password"
                className="w-full px-3 py-2 rounded-lg border border-border bg-surface text-text-primary text-sm placeholder:text-text-secondary/50 focus:outline-none focus:ring-2 focus:ring-primary"
              />
              {loginMsg && <p className={`text-xs ${loginMsg.startsWith('✅') ? 'text-green-500' : 'text-red-500'}`}>{loginMsg}</p>}
              <button
                onClick={handleRelogin}
                disabled={!handle.trim() || !password.trim()}
                className="w-full py-2 rounded-lg bg-primary hover:bg-primary-hover text-white text-sm font-medium disabled:opacity-50 transition-colors"
              >
                更新登录
              </button>
              <hr className="border-border" />
              <button
                onClick={onLogout}
                className="w-full py-2 rounded-lg border border-red-300 dark:border-red-800 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 text-sm font-medium transition-colors"
              >
                退出登录
              </button>
            </>
          )}

          {tab === 'ai' && (
            <>
              <p className="text-text-secondary text-xs">AI 功能需要配置 DeepSeek（或其他兼容 OpenAI 的）API</p>
              <div>
                <label className="text-xs text-text-secondary mb-1 block">API Key</label>
                <input
                  type="password" value={apiKey} onChange={e => setApiKey(e.target.value)}
                  placeholder="sk-..."
                  className="w-full px-3 py-2 rounded-lg border border-border bg-surface text-text-primary text-sm placeholder:text-text-secondary/50 focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>
              <div>
                <label className="text-xs text-text-secondary mb-1 block">Base URL</label>
                <input
                  type="text" value={baseUrl} onChange={e => setBaseUrl(e.target.value)}
                  placeholder="https://api.deepseek.com"
                  className="w-full px-3 py-2 rounded-lg border border-border bg-surface text-text-primary text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>
              <div>
                <label className="text-xs text-text-secondary mb-1 block">Model</label>
                <input
                  type="text" value={model} onChange={e => setModel(e.target.value)}
                  placeholder="deepseek-chat"
                  className="w-full px-3 py-2 rounded-lg border border-border bg-surface text-text-primary text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>
              <button
                onClick={saveAi}
                className="w-full py-2 rounded-lg bg-primary hover:bg-primary-hover text-white text-sm font-medium transition-colors"
              >
                保存 AI 设置
              </button>
            </>
          )}

          {tab === 'general' && (
            <>
              <div>
                <label className="text-xs text-text-secondary mb-1 block">翻译目标语言</label>
                <select
                  value={targetLang}
                  onChange={e => setTargetLang(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-border bg-surface text-text-primary text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                >
                  {LANG_OPTIONS.map(o => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs text-text-secondary mb-1 block">翻译模式</label>
                <select
                  value={config.translateMode ?? 'simple'}
                  onChange={e => {
                    const updated = { ...config, translateMode: e.target.value as 'simple' | 'json' };
                    updateAppConfig(updated);
                    onConfigChange(updated);
                  }}
                  className="w-full px-3 py-2 rounded-lg border border-border bg-surface text-text-primary text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                >
                  <option value="simple">简单 — 仅显示译文</option>
                  <option value="json">JSON — 显示源语言 + 译文</option>
                </select>
              </div>
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={darkMode}
                  onChange={e => setDarkMode(e.target.checked)}
                  className="w-4 h-4 accent-primary"
                />
                <span className="text-sm text-text-primary">深色模式</span>
              </label>
              <button
                onClick={saveGeneral}
                className="w-full py-2 rounded-lg bg-primary hover:bg-primary-hover text-white text-sm font-medium transition-colors"
              >
                保存通用设置
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
