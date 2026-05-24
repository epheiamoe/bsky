import React, { useState, useMemo } from 'react';
import { useI18n } from '@bsky/app';
import type { AppConfig } from '../hooks/useAppConfig.js';
import { updateAppConfig, saveAppConfig } from '../hooks/useAppConfig.js';
import type { TargetLang, Locale } from '@bsky/app';
import { PROVIDERS, getProviderByBaseUrl, getModelInfo, getProviderById } from '@bsky/core';
import type { ProviderInfo, ModelInfo, ModerationConfig } from '@bsky/core';
import { Icon } from './Icon.js';
import { ModerationSettingsTab } from './ModerationSettingsTab.js';

const LANG_OPTIONS: { value: string; label: string }[] = [
  { value: 'zh', label: '中文' },
  { value: 'en', label: 'English' },
  { value: 'ja', label: '日本語' },
  { value: 'ko', label: '한국어' },
  { value: 'fr', label: 'Français' },
  { value: 'de', label: 'Deutsch' },
  { value: 'es', label: 'Español' },
];

interface SettingsPageProps {
  config: AppConfig;
  onConfigChange: (config: AppConfig) => void;
  onRelogin: (handle: string, password: string) => Promise<void>;
  onLogout: () => void;
  onRestartWelcome?: () => void;
  client?: any;
  moderationConfig?: ModerationConfig;
  onModerationConfigChange?: (config: ModerationConfig) => void;
}

type Tab = 'account' | 'ai' | 'scenario' | 'display' | 'preview' | 'moderation';

export function SettingsPage({ config, onConfigChange, onRelogin, onLogout, onRestartWelcome, client, moderationConfig, onModerationConfigChange }: SettingsPageProps) {
  const { t, locale, setLocale, localeLabels, availableLocales } = useI18n();
  const [tab, setTab] = useState<Tab>('account');

  const [handle, setHandle] = useState('');
  const [password, setPassword] = useState('');
  const [loginMsg, setLoginMsg] = useState<string | null>(null);
  const [pronouns, setPronouns] = useState(config.userPronouns ?? '');
  const [pronounsCustom, setPronounsCustom] = useState(
    config.userPronouns && config.userPronouns !== 'neutral' ? config.userPronouns : ''
  );

  const [apiKey, setApiKey] = useState(config.aiConfig.apiKey);
  const [baseUrl, setBaseUrl] = useState(config.aiConfig.baseUrl);
  const [model, setModel] = useState(config.aiConfig.model);
  const [thinkingEnabled, setThinkingEnabled] = useState(config.thinkingEnabled ?? true);
  const [visionEnabled, setVisionEnabled] = useState(config.visionEnabled ?? false);
  const [customSystemPrompt, setCustomSystemPrompt] = useState(config.customSystemPrompt ?? config.aiConfig.customSystemPrompt ?? '');
  const [scenarioModels, setScenarioModels] = useState({
    aiChat: config.scenarioModels?.aiChat || '',
    translate: config.scenarioModels?.translate || '',
    polish: config.scenarioModels?.polish || '',
    imageDescription: config.scenarioModels?.imageDescription || '',
  });

  const [postPreviewLines, setPostPreviewLines] = useState(config.postPreviewLines ?? 10);
  const [quotedPreviewLines, setQuotedPreviewLines] = useState(config.quotedPreviewLines ?? 8);
  const [threadPreviewLines, setThreadPreviewLines] = useState(config.threadPreviewLines ?? 8);

  // Detect current provider from baseUrl
  const currentProvider = useMemo(() => getProviderByBaseUrl(baseUrl), [baseUrl]);
  const currentModelInfo = useMemo(() => getModelInfo(currentProvider?.id || '', model), [currentProvider, model]);
  const isCustom = !currentProvider || !currentModelInfo;
  const scenarioProviders = useMemo(() =>
    PROVIDERS.filter(p => config.apiKeys?.[p.id]),
    [config.apiKeys]
  );

  const handleProviderChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const providerId = e.target.value;
    const provider = getProviderById(providerId);
    if (provider) {
      setBaseUrl(provider.baseUrl);
      const savedKey = config.apiKeys?.[providerId];
      if (savedKey) setApiKey(savedKey); else setApiKey('');
      if (provider.models.length > 0) {
        const firstModel = provider.models[0]!;
        setModel(firstModel.id);
        setThinkingEnabled(firstModel.thinking);
        setVisionEnabled(firstModel.vision);
      } else {
        setModel('');
        setThinkingEnabled(true);
        setVisionEnabled(false);
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
      customSystemPrompt,
      apiKeys: newApiKeys,
      scenarioModels,
      aiConfig: {
        apiKey: apiKey,
        baseUrl,
        model,
        provider: currentProvider?.id,
        reasoningStyle: currentProvider?.reasoningStyle,
        apiType: currentProvider?.apiType,
        thinkingEnabled: thinkingEnabled,
        visionEnabled: visionEnabled,
        customSystemPrompt,
      },
    };
    updateAppConfig(updated);
    onConfigChange(updated);
  };

  const savePreview = () => {
    const updated = { ...config, postPreviewLines, quotedPreviewLines, threadPreviewLines };
    updateAppConfig(updated);
    onConfigChange(updated);
  };

  const saveGeneral = () => {
    const updated = { ...config, darkMode: config.darkMode, cvdMode: config.cvdMode, singleImageFill: config.singleImageFill };
    updateAppConfig(updated);
    onConfigChange(updated);
  };

  const tabs: { key: Tab; iconName: string; labelKey: string }[] = [
    { key: 'account', iconName: 'at-sign', labelKey: 'settings.tabAccount' },
    { key: 'ai', iconName: 'astroid-as-AI-Button', labelKey: 'settings.tabAI' },
    { key: 'scenario', iconName: 'database', labelKey: 'settings.tabScenario' },
    { key: 'display', iconName: 'sun', labelKey: 'settings.tabDisplay' },
    { key: 'preview', iconName: 'file-text', labelKey: 'settings.tabPreview' },
    { key: 'moderation', iconName: 'shield', labelKey: 'settings.tabModeration' },
  ];

  return (
    <div className="flex flex-col bg-background min-h-0">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-background border-b border-border flex-shrink-0">
        <div className="flex items-center h-12 px-4 gap-3">
          <span className="text-lg font-semibold text-text-primary">{t('settings.title')}</span>
        </div>
        {/* Tab bar */}
        <div className="flex px-2 overflow-x-auto scrollbar-none border-b border-border">
          {tabs.map(tabItem => (
            <button
              key={tabItem.key}
              onClick={() => setTab(tabItem.key)}
              className={`flex-shrink-0 px-3 py-2 text-sm font-medium transition-colors flex items-center gap-1 ${
                tab === tabItem.key
                  ? 'text-primary border-b-2 border-primary'
                  : 'text-text-secondary hover:text-text-primary'
              }`}
            >
              <Icon name={tabItem.iconName} size={16} />{t(tabItem.labelKey)}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-5 space-y-4 max-w-lg mx-auto w-full">
        {tab === 'account' && (
          <div className="space-y-4">
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
            {/* ── Pronouns ── */}
            <p className="text-xs font-medium text-text-primary">{t('user.pronounsLabel')}</p>
            <p className="text-text-secondary text-xs">{t('user.pronounsDesc')}</p>
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="radio" name="pronouns" value=""
                checked={pronouns === ''}
                onChange={() => { setPronouns(''); setPronounsCustom(''); }}
                className="w-4 h-4 accent-primary"
              />
              <span className="text-sm text-text-primary">{t('user.pronounsSkip')}</span>
            </label>
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="radio" name="pronouns" value="neutral"
                checked={pronouns === 'neutral'}
                onChange={() => { setPronouns('neutral'); setPronounsCustom(''); }}
                className="w-4 h-4 accent-primary"
              />
              <span className="text-sm text-text-primary">{t('user.pronounsNeutral')}</span>
            </label>
            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="radio" name="pronouns" value="custom"
                checked={pronouns !== '' && pronouns !== 'neutral'}
                onChange={() => setPronouns(pronounsCustom || 'they/them')}
                className="w-4 h-4 accent-primary mt-1"
              />
              <div className="flex-1">
                <span className="text-sm text-text-primary">{t('user.pronounsCustom')}</span>
                <input
                  type="text" value={pronounsCustom}
                  onChange={e => { setPronounsCustom(e.target.value); setPronouns(e.target.value || 'they/them'); }}
                  placeholder="they/them, she/her, he/him, ze/zir..."
                  disabled={pronouns === '' || pronouns === 'neutral'}
                  className="w-full mt-1 px-3 py-1.5 rounded-lg border border-border bg-surface text-text-primary text-sm placeholder:text-text-secondary/50 focus:outline-none focus:ring-2 focus:ring-primary disabled:opacity-40"
                />
              </div>
            </label>
            <button
              onClick={() => {
                const finalPronouns = pronouns === 'neutral' ? 'neutral' : (pronouns === '' ? '' : pronounsCustom);
                const updated = { ...config, userPronouns: finalPronouns };
                updateAppConfig(updated);
                onConfigChange(updated);
              }}
              className="w-full py-2 rounded-lg bg-primary hover:bg-primary-hover text-white text-sm font-medium transition-colors"
            >
              {t('settings.saveGeneral')}
            </button>
            <hr className="border-border" />
            {onRestartWelcome && (
              <>
                <button
                  onClick={onRestartWelcome}
                  className="w-full py-2 rounded-lg border border-border text-text-secondary hover:text-text-primary text-sm font-medium transition-colors"
                >
                  <Icon name="menu" size={14} className="inline-block mr-1" />
                  {t('settings.restartWelcome')}
            </button>
            <p className="text-xs text-text-secondary/60 italic">{t('user.pronounsNewChatHint')}</p>
            <hr className="border-border" />
              </>
            )}
            <button
              onClick={onLogout}
              className="w-full py-2 rounded-lg border border-red-300 dark:border-red-800 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 text-sm font-medium transition-colors"
            >
              {t('settings.logout')}
            </button>
          </div>
        )}

        {tab === 'ai' && (
          <div className="space-y-4">
            {/* Authorization info card */}
            <div className="p-3 rounded-lg bg-primary/5 border border-primary/10">
              <p className="text-xs font-medium text-text-primary mb-1">
                <Icon name="badge-info" size={14} className="inline-block mr-1" />
                {t('settings.aiAuthTitle')}
              </p>
              <p className="text-xs text-text-secondary">{t('settings.aiAuthDesc')}</p>
            </div>
            <p className="text-text-secondary text-xs">{t('settings.aiDesc')}</p>
            <div>
              <label htmlFor="settings-provider" className="text-xs text-text-secondary mb-1 block">{t('settings.provider')}</label>
              <select
                id="settings-provider" value={currentProvider?.id || '__custom__'}
                onChange={handleProviderChange}
                className="w-full px-3 py-2 rounded-lg border border-border bg-surface text-text-primary text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              >
                <option value="__custom__">Custom</option>
                {PROVIDERS.map(p => (
                  <option key={p.id} value={p.id}>{p.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="settings-api-key" className="text-xs text-text-secondary mb-1 block">{t('settings.apiKey')}</label>
              <input
                type="password" id="settings-api-key" value={apiKey} onChange={e => setApiKey(e.target.value)}
                placeholder="sk-..."
                className="w-full px-3 py-2 rounded-lg border border-border bg-surface text-text-primary text-sm placeholder:text-text-secondary/50 focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
            <div>
              <label htmlFor="settings-base-url" className="text-xs text-text-secondary mb-1 block">{t('settings.baseUrl')}</label>
              <input
                type="text" id="settings-base-url" value={baseUrl} onChange={e => setBaseUrl(e.target.value)}
                placeholder="https://api.deepseek.com"
                className="w-full px-3 py-2 rounded-lg border border-border bg-surface text-text-primary text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
            <div>
              <label htmlFor="settings-model" className="text-xs text-text-secondary mb-1 block">{t('settings.model')}</label>
              {currentProvider ? (
                <select
                  id="settings-model" value={isCustom ? '__custom__' : model}
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
                  id="settings-model" placeholder="model-id"
                  className="w-full px-3 py-2 rounded-lg border border-border bg-surface text-text-primary text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                />
              )}
              {currentModelInfo ? (
                <p className="text-xs text-text-secondary/70 mt-1">
                  <span className={currentModelInfo.thinking ? 'text-green-500' : 'text-text-secondary/50'}>Thinking: {currentModelInfo.thinking ? 'Yes' : 'No'}</span>
                  <span className="mx-2">|</span>
                  <span className={currentModelInfo.vision ? 'text-green-500' : 'text-text-secondary/50'}>Vision: {currentModelInfo.vision ? 'Yes' : 'No'}</span>
                </p>
              ) : isCustom ? (
                <p className="text-xs text-text-secondary/50 mt-1">Custom model — configure think/vision below</p>
              ) : null}
              {isCustom && currentProvider && (
                <input
                  type="text" value={model} onChange={e => setModel(e.target.value)}
                  placeholder="Custom model ID"
                  className="w-full px-3 py-2 rounded-lg border border-border bg-surface text-text-primary text-sm mt-2 focus:outline-none focus:ring-2 focus:ring-primary"
                />
              )}
            </div>
            {currentModelInfo ? (
              <div className="flex items-center gap-4 text-sm">
                <span className={currentModelInfo.thinking ? 'text-green-500' : 'text-text-secondary/40'}>
                  Thinking: {currentModelInfo.thinking ? 'Yes' : 'No'}
                </span>
                <span className={currentModelInfo.vision ? 'text-green-500' : 'text-text-secondary/40'}>
                  Vision: {currentModelInfo.vision ? 'Yes' : 'No'}
                </span>
                <span className="text-text-secondary/40 text-xs">(auto)</span>
              </div>
            ) : (
              <>
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
              </>
            )}
            <button
              onClick={saveAi}
              className="w-full py-2 rounded-lg bg-primary hover:bg-primary-hover text-white text-sm font-medium transition-colors"
            >
              {t('settings.saveAI')}
            </button>
          </div>
        )}

        {tab === 'scenario' && (
          <div className="space-y-4">
            <p className="text-text-secondary text-xs">{t('settings.scenarioDesc')}</p>
            {(['aiChat', 'translate', 'polish', 'imageDescription'] as const).map(scenario => {
              const isImageDesc = scenario === 'imageDescription';
              const labelKey = scenario === 'aiChat' ? 'settings.scenario.aiChat' : scenario === 'translate' ? 'settings.scenario.translate' : scenario === 'polish' ? 'settings.scenario.polish' : 'settings.scenario.imageDescription';
              const options = isImageDesc
                ? scenarioProviders.flatMap(p => p.models.filter(m => m.vision).map(m => ({ p, m })))
                : scenarioProviders.flatMap(p => p.models.map(m => ({ p, m })));
              return (
                <div key={scenario}>
                  <label htmlFor={`settings-scenario-${scenario}`} className="text-xs text-text-secondary mb-1 block">{t(labelKey)}</label>
                  <div className="flex gap-2">
                    <select
                      id={`settings-scenario-${scenario}`} value={scenarioModels[scenario]}
                      onChange={e => setScenarioModels(prev => ({ ...prev, [scenario]: e.target.value }))}
                      className="flex-1 px-3 py-2 rounded-lg border border-border bg-surface text-text-primary text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                    >
                      <option value="">{isImageDesc ? t('settings.scenario.imageAltOff') : t('settings.scenario.sameAsDefault')}</option>
                      {options.map(({ p, m }) => (
                        <option key={`${p.id}/${m.id}`} value={`${p.id}/${m.id}`}>{p.label} / {m.label}</option>
                      ))}
                      {isImageDesc && options.length === 0 && (
                        <option value="" disabled>— {t('settings.scenario.noVisionModels')} —</option>
                      )}
                    </select>
                  </div>
                  {isImageDesc && (
                    <p className="text-[10px] text-text-secondary mt-1">{t('settings.scenario.imageAltDesc')}</p>
                  )}
                </div>
              );
            })}
            <div className="border-t border-border pt-3 mt-2">
              <label htmlFor="settings-custom-prompt" className="text-xs text-text-secondary mb-1 block">{t('settings.customPrompt')}</label>
              <textarea
                value={customSystemPrompt}
                onChange={e => setCustomSystemPrompt(e.target.value)}
                id="settings-custom-prompt" placeholder={t('settings.customPromptPlaceholder')}
                rows={4}
                className="w-full px-3 py-2 rounded-lg border border-border bg-surface text-text-primary text-sm placeholder:text-text-secondary/50 focus:outline-none focus:ring-2 focus:ring-primary resize-none"
              />
            </div>
            <button
              onClick={saveAi}
              className="w-full py-2 rounded-lg bg-primary hover:bg-primary-hover text-white text-sm font-medium transition-colors"
            >
              {t('settings.saveAI')}
            </button>
          </div>
        )}

        {tab === 'display' && (
          <div className="space-y-5">
            {/* UI Language */}
            <div>
              <label htmlFor="settings-locale" className="text-xs text-text-secondary mb-1 block">UI Language</label>
              <select
                value={locale}
                id="settings-locale" onChange={e => { const l = e.target.value as typeof locale; setLocale(l); document.documentElement.lang = l; }}
                className="w-full px-3 py-2 rounded-lg border border-border bg-surface text-text-primary text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              >
                {availableLocales.map((l: Locale) => (
                  <option key={l} value={l}>{localeLabels[l]}</option>
                ))}
              </select>
            </div>

            {/* Translation target */}
            <div>
              <label htmlFor="settings-target-lang" className="text-xs text-text-secondary mb-1 block">{t('settings.targetLang')}</label>
              <select
                value={config.targetLang}
                id="settings-target-lang" onChange={e => {
                  const updated = { ...config, targetLang: e.target.value };
                  updateAppConfig(updated);
                  onConfigChange(updated);
                }}
                className="w-full px-3 py-2 rounded-lg border border-border bg-surface text-text-primary text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              >
                {LANG_OPTIONS.map(o => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>

            {/* Translate mode */}
            <div>
              <label htmlFor="settings-translate-mode" className="text-xs text-text-secondary mb-1 block">{t('settings.translateMode')}</label>
              <select
                id="settings-translate-mode" value={config.translateMode ?? 'simple'}
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

            <hr className="border-border" />

            {/* Appearance toggles */}
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={config.darkMode}
                onChange={e => {
                  const v = e.target.checked;
                  const updated = { ...config, darkMode: v };
                  document.documentElement.classList.toggle('dark', v);
                  const meta = document.querySelector('meta[name="theme-color"]');
                  if (meta) meta.setAttribute('content', v ? '#000000' : '#FFFFFF');
                  updateAppConfig(updated);
                  onConfigChange(updated);
                }}
                className="w-4 h-4 accent-primary"
              />
              <span className="text-sm text-text-primary">{t('settings.darkMode')}</span>
            </label>
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={config.cvdMode}
                onChange={e => {
                  const v = e.target.checked;
                  const updated = { ...config, cvdMode: v };
                  document.documentElement.classList.toggle('cvd', v);
                  updateAppConfig(updated);
                  onConfigChange(updated);
                }}
                className="w-4 h-4 accent-primary"
              />
              <span className="text-sm text-text-primary">{t('settings.cvdMode')}</span>
            </label>
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={config.singleImageFill}
                onChange={e => {
                  const updated = { ...config, singleImageFill: e.target.checked };
                  updateAppConfig(updated);
                  onConfigChange(updated);
                }}
                className="w-4 h-4 accent-primary"
              />
              <span className="text-sm text-text-primary">{t('settings.singleImageFill')}</span>
            </label>
          </div>
        )}

        {tab === 'preview' && (
          <div className="space-y-5">
            <p className="text-text-secondary text-xs">{t('settings.previewDesc')}</p>
            <PreviewSlider
              label={t('settings.postPreviewLines')}
              value={postPreviewLines} onChange={setPostPreviewLines}
              min={4} max={20}
            />
            <PreviewSlider
              label={t('settings.quotedPreviewLines')}
              value={quotedPreviewLines} onChange={setQuotedPreviewLines}
              min={2} max={12}
            />
            <PreviewSlider
              label={t('settings.threadPreviewLines')}
              value={threadPreviewLines} onChange={setThreadPreviewLines}
              min={2} max={12}
            />
            <button
              onClick={savePreview}
              className="w-full py-2 rounded-lg bg-primary hover:bg-primary-hover text-white text-sm font-medium transition-colors"
            >
              {t('settings.savePreview')}
            </button>
          </div>
        )}

        {tab === 'moderation' && moderationConfig && onModerationConfigChange && (
          <ModerationSettingsTab
            config={moderationConfig}
            client={client}
            onChange={onModerationConfigChange}
          />
        )}
      </div>
    </div>
  );
}

function PreviewSlider({ label, value, onChange, min, max }: { label: string; value: number; onChange: (v: number) => void; min: number; max: number }) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <label className="text-sm text-text-primary">{label}</label>
        <span className="text-sm text-text-secondary font-mono w-8 text-right">{value}</span>
      </div>
      <input
        type="range" min={min} max={max}
        value={value}
        onChange={e => onChange(Number(e.target.value))}
        className="w-full accent-primary"
      />
      <div className="flex justify-between text-[10px] text-text-secondary/50 mt-0.5">
        <span>{min}</span>
        <span>{max}</span>
      </div>
    </div>
  );
}
