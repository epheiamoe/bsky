import React, { useState, useMemo } from 'react';
import { useI18n } from '@bsky/app';
import type { AppConfig } from '../hooks/useAppConfig.js';
import { updateAppConfig } from '../hooks/useAppConfig.js';
import type { TargetLang, Locale } from '@bsky/app';
import { PROVIDERS, getProviderByBaseUrl, getModelInfo, getProviderById } from '@bsky/core';
import type { ProviderInfo, ModelInfo } from '@bsky/core';
import { Icon } from './Icon.js';

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

type Tab = 'bluesky' | 'ai' | 'scenario' | 'general';

export function SettingsModal({ open, onClose, config, onConfigChange, onRelogin, onLogout }: SettingsModalProps) {
  const { t, locale, setLocale, localeLabels, availableLocales } = useI18n();
  const [tab, setTab] = useState<Tab>('bluesky');

  const [handle, setHandle] = useState('');
  const [password, setPassword] = useState('');
  const [loginMsg, setLoginMsg] = useState<string | null>(null);

  const [apiKey, setApiKey] = useState(config.aiConfig.apiKey);
  const [baseUrl, setBaseUrl] = useState(config.aiConfig.baseUrl);
  const [model, setModel] = useState(config.aiConfig.model);
  const [thinkingEnabled, setThinkingEnabled] = useState(config.thinkingEnabled ?? true);
  const [visionEnabled, setVisionEnabled] = useState(config.visionEnabled ?? false);
  const [scenarioModels, setScenarioModels] = useState({
    aiChat: config.scenarioModels?.aiChat || '',
    translate: config.scenarioModels?.translate || '',
    polish: config.scenarioModels?.polish || '',
  });

  // Detect current provider from baseUrl
  const currentProvider = useMemo(() => getProviderByBaseUrl(baseUrl), [baseUrl]);
  const currentModelInfo = useMemo(() => getModelInfo(currentProvider?.id || '', model), [currentProvider, model]);
  const isCustom = !currentProvider || !currentModelInfo;

  const handleProviderChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const providerId = e.target.value;
    const provider = getProviderById(providerId);
    if (provider) {
      setBaseUrl(provider.baseUrl);
      // Load existing key for this provider (or keep current if none saved)
      const savedKey = config.apiKeys?.[providerId];
      if (savedKey) setApiKey(savedKey);
      // Auto-select first model
      const firstModel = provider.models[0];
      if (firstModel) {
        setModel(firstModel.id);
        setThinkingEnabled(firstModel.thinking);
        setVisionEnabled(firstModel.vision);
      }
    }
  };

  const handleModelChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const modelId = e.target.value;
    if (modelId === '__custom__') {
      setModel('');
    } else {
      setModel(modelId);
      const info = getModelInfo(currentProvider?.id || '', modelId);
      if (info) {
        setThinkingEnabled(info.thinking);
        setVisionEnabled(info.vision);
      }
    }
  };

  const [targetLang, setTargetLang] = useState(config.targetLang);
  const [darkMode, setDarkMode] = useState(config.darkMode);

  if (!open) return null;

  const handleRelogin = async () => {
    if (!handle.trim() || !password.trim()) return;
    try {
      await onRelogin(handle.trim(), password);
      setLoginMsg('ok');
    } catch (e) {
      setLoginMsg(e instanceof Error ? e.message : t('settings.updateFailed'));
    }
  };

  const saveAi = () => {
    const providerId = currentProvider?.id || 'custom';
    const newApiKeys = { ...config.apiKeys, [providerId]: apiKey };
    const updated = {
      ...config,
      thinkingEnabled,
      visionEnabled,
      apiKeys: newApiKeys,
      scenarioModels,
      aiConfig: {
        apiKey: apiKey,                   // active key for current provider
        baseUrl,
        model,
        provider: currentProvider?.id,
        reasoningStyle: currentProvider?.reasoningStyle,
      },
    };
    updateAppConfig(updated);
    onConfigChange(updated);
  };

  const saveGeneral = () => {
    const updated = { ...config, targetLang, darkMode };
    updateAppConfig(updated);
    onConfigChange(updated);
    document.documentElement.classList.toggle('dark', darkMode);
  };

  const tabs: { key: Tab; iconName: string; labelKey: string }[] = [
    { key: 'bluesky', iconName: 'at-sign', labelKey: 'settings.tabAccount' },
    { key: 'ai', iconName: 'astroid-as-AI-Button', labelKey: 'settings.tabAI' },
    { key: 'scenario', iconName: 'database', labelKey: 'settings.tabScenario' },
    { key: 'general', iconName: 'settings', labelKey: 'settings.tabGeneral' },
  ];

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white dark:bg-[#121212] rounded-xl shadow-xl border border-border w-full max-w-md max-h-[80vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h2 className="text-lg font-semibold text-text-primary">{t('settings.title')}</h2>
          <button onClick={onClose} className="text-text-secondary hover:text-text-primary text-xl leading-none p-1"><Icon name="x" size={16} /></button>
        </div>

        <div className="flex border-b border-border">
          {tabs.map(tabItem => (
            <button
              key={tabItem.key}
              onClick={() => setTab(tabItem.key)}
              className={`flex-1 py-2.5 text-sm font-medium transition-colors flex items-center justify-center gap-1 ${
                tab === tabItem.key
                  ? 'text-primary border-b-2 border-primary'
                  : 'text-text-secondary hover:text-text-primary'
              }`}
            >
              <Icon name={tabItem.iconName} size={16} />{t(tabItem.labelKey)}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {tab === 'bluesky' && (
            <>
              <p className="text-text-secondary text-xs">{t('settings.blueskyDesc')}</p>
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
              {loginMsg && <p className={`text-xs ${loginMsg === 'ok' ? 'text-green-500' : 'text-red-500'}`}>{loginMsg === 'ok' ? <><Icon name="badge-check" size={14} /> {t('settings.updated')}</> : loginMsg}</p>}
              <button
                onClick={handleRelogin}
                disabled={!handle.trim() || !password.trim()}
                className="w-full py-2 rounded-lg bg-primary hover:bg-primary-hover text-white text-sm font-medium disabled:opacity-50 transition-colors"
              >
                {t('settings.updateLogin')}
              </button>
              <hr className="border-border" />
              <button
                onClick={onLogout}
                className="w-full py-2 rounded-lg border border-red-300 dark:border-red-800 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 text-sm font-medium transition-colors"
              >
                {t('settings.logout')}
              </button>
            </>
          )}

          {tab === 'ai' && (
            <>
              <p className="text-text-secondary text-xs">{t('settings.aiDesc')}</p>
              {/* Provider selector */}
              <div>
                <label className="text-xs text-text-secondary mb-1 block">{t('settings.provider') || 'Provider'}</label>
                <select
                  value={currentProvider?.id || '__custom__'}
                  onChange={handleProviderChange}
                  className="w-full px-3 py-2 rounded-lg border border-border bg-surface text-text-primary text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                >
                  <option value="__custom__">Custom</option>
                  {PROVIDERS.map(p => (
                    <option key={p.id} value={p.id}>{p.label}</option>
                  ))}
                </select>
              </div>
              {/* API Key */}
              <div>
                <label className="text-xs text-text-secondary mb-1 block">{t('settings.apiKey')}</label>
                <input
                  type="password" value={apiKey} onChange={e => setApiKey(e.target.value)}
                  placeholder="sk-..."
                  className="w-full px-3 py-2 rounded-lg border border-border bg-surface text-text-primary text-sm placeholder:text-text-secondary/50 focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>
              {/* Base URL */}
              <div>
                <label className="text-xs text-text-secondary mb-1 block">{t('settings.baseUrl')}</label>
                <input
                  type="text" value={baseUrl} onChange={e => setBaseUrl(e.target.value)}
                  placeholder="https://api.deepseek.com"
                  className="w-full px-3 py-2 rounded-lg border border-border bg-surface text-text-primary text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>
              {/* Model selector */}
              <div>
                <label className="text-xs text-text-secondary mb-1 block">{t('settings.model')}</label>
                {currentProvider ? (
                  <select
                    value={isCustom ? '__custom__' : model}
                    onChange={handleModelChange}
                    className="w-full px-3 py-2 rounded-lg border border-border bg-surface text-text-primary text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  >
                    {currentProvider.models.map(m => (
                      <option key={m.id} value={m.id}>{m.label} ({m.id})</option>
                    ))}
                    <option value="__custom__">Custom model...</option>
                  </select>
                ) : (
                  <input
                    type="text" value={model} onChange={e => setModel(e.target.value)}
                    placeholder="model-id"
                    className="w-full px-3 py-2 rounded-lg border border-border bg-surface text-text-primary text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                )}
                {/* Model capabilities hint */}
                {currentModelInfo ? (
                  <p className="text-xs text-text-secondary/70 mt-1">
                    <span className={currentModelInfo.thinking ? 'text-green-500' : 'text-text-secondary/50'}>Thinking: {currentModelInfo.thinking ? 'Yes' : 'No'}</span>
                    <span className="mx-2">|</span>
                    <span className={currentModelInfo.vision ? 'text-green-500' : 'text-text-secondary/50'}>Vision: {currentModelInfo.vision ? 'Yes' : 'No'}</span>
                  </p>
                ) : isCustom ? (
                  <p className="text-xs text-text-secondary/50 mt-1">Custom model — configure think/vision below</p>
                ) : null}
                {/* Custom model input when '__custom__' is selected */}
                {isCustom && currentProvider && (
                  <input
                    type="text" value={model} onChange={e => setModel(e.target.value)}
                    placeholder="Custom model ID"
                    className="w-full px-3 py-2 rounded-lg border border-border bg-surface text-text-primary text-sm mt-2 focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                )}
              </div>
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={thinkingEnabled}
                  onChange={e => setThinkingEnabled(e.target.checked)}
                  className="w-4 h-4 accent-primary"
                />
                <span className="text-sm text-text-primary">{t('settings.thinkMode')}</span>
              </label>
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={visionEnabled}
                  onChange={e => setVisionEnabled(e.target.checked)}
                  className="w-4 h-4 accent-primary"
                />
                <span className="text-sm text-text-primary">{t('settings.visionMode')}</span>
              </label>
              <button
                onClick={saveAi}
                className="w-full py-2 rounded-lg bg-primary hover:bg-primary-hover text-white text-sm font-medium transition-colors"
              >
                {t('settings.saveAI')}
              </button>
            </>
          )}

          {tab === 'scenario' && (
            <>
              <p className="text-text-secondary text-xs">Assign models to different scenarios. Leave blank to use the default AI model.</p>
              {(['aiChat', 'translate', 'polish'] as const).map(scenario => {
                const label = scenario === 'aiChat' ? 'AI Chat' : scenario === 'translate' ? 'Translation' : 'Draft Polish';
                return (
                  <div key={scenario}>
                    <label className="text-xs text-text-secondary mb-1 block">{label}</label>
                    <div className="flex gap-2">
                      <select
                        value={scenarioModels[scenario]}
                        onChange={e => setScenarioModels(prev => ({ ...prev, [scenario]: e.target.value }))}
                        className="flex-1 px-3 py-2 rounded-lg border border-border bg-surface text-text-primary text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                      >
                        <option value="">Same as default</option>
                        {PROVIDERS.map(p =>
                          p.models.map(m => (
                            <option key={`${p.id}/${m.id}`} value={`${p.id}/${m.id}`}>{p.label} / {m.label}</option>
                          ))
                        )}
                      </select>
                    </div>
                  </div>
                );
              })}
              <button
                onClick={saveAi}
                className="w-full py-2 rounded-lg bg-primary hover:bg-primary-hover text-white text-sm font-medium transition-colors"
              >
                {t('settings.saveAI')}
              </button>
            </>
          )}

          {tab === 'general' && (
            <>
              <div>
                <label className="text-xs text-text-secondary mb-1 block">{t('settings.targetLang')}</label>
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
                <label className="text-xs text-text-secondary mb-1 block">{t('settings.translateMode')}</label>
                <select
                  value={config.translateMode ?? 'simple'}
                  onChange={e => {
                    const updated = { ...config, translateMode: e.target.value as 'simple' | 'json' };
                    updateAppConfig(updated);
                    onConfigChange(updated);
                  }}
                  className="w-full px-3 py-2 rounded-lg border border-border bg-surface text-text-primary text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                >
                  <option value="simple">{t('settings.translateModeSimple')}</option>
                  <option value="json">{t('settings.translateModeJson')}</option>
                </select>
              </div>
              <div>
                <label className="text-xs text-text-secondary mb-1 block">UI Language</label>
                <select
                  value={locale}
                  onChange={e => setLocale(e.target.value as typeof locale)}
                  className="w-full px-3 py-2 rounded-lg border border-border bg-surface text-text-primary text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                >
                  {availableLocales.map((l: Locale) => (
                    <option key={l} value={l}>{localeLabels[l]}</option>
                  ))}
                </select>
              </div>
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={darkMode}
                  onChange={e => setDarkMode(e.target.checked)}
                  className="w-4 h-4 accent-primary"
                />
                <span className="text-sm text-text-primary">{t('settings.darkMode')}</span>
              </label>
              <button
                onClick={saveGeneral}
                className="w-full py-2 rounded-lg bg-primary hover:bg-primary-hover text-white text-sm font-medium transition-colors"
              >
                {t('settings.saveGeneral')}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
