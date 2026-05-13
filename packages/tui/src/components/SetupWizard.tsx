import React, { useState, useMemo } from 'react';
import { Box, Text, useInput } from 'ink';
import TextInput from 'ink-text-input';
import { useI18n } from '@bsky/app';
import type { Locale } from '@bsky/app';
import { PROVIDERS, getProviderById, getModelInfo } from '@bsky/core';
import type { ProviderInfo, ModelInfo } from '@bsky/core';
import { writeFileSync } from 'fs';
import path from 'path';
import { saveTuiConfig } from '../config/configStore.js';
import type { TuiConfig } from '../config/configStore.js';

export interface SetupConfig {
  blueskyHandle: string;
  blueskyPassword: string;
  blueskyPds?: string;
  llmApiKey: string;
  llmBaseUrl: string;
  llmModel: string;
  llmThinkingEnabled: boolean;
  llmVisionEnabled: boolean;
  providerId: string;
  locale: string;
}

interface SetupWizardProps {
  onComplete: (config: SetupConfig) => void;
}

type Step = 'handle' | 'password' | 'pds' | 'provider' | 'model' | 'apikey' | 'scenario' | 'locale' | 'done';

const LANG_OPTIONS: { value: Locale; label: string }[] = [
  { value: 'zh', label: '中文 (zh)' },
  { value: 'en', label: 'English (en)' },
  { value: 'ja', label: '日本語 (ja)' },
];

const SCENARIO_LABELS: Record<string, string> = {
  aiChat: 'AI 聊天',
  translate: '翻译',
  polish: '润色',
};

export function SetupWizard({ onComplete }: SetupWizardProps) {
  const { t, setLocale } = useI18n();

  const [step, setStep] = useState<Step>('handle');
  const [handle, setHandle] = useState('');
  const [password, setPassword] = useState('');
  const [pdsUrl, setPdsUrl] = useState('');
  const [providerIdx, setProviderIdx] = useState(0);
  const [modelIdx, setModelIdx] = useState(0);
  const [modelInput, setModelInput] = useState('');
  const [isCustomModel, setIsCustomModel] = useState(false);
  const [apiKey, setApiKey] = useState('');
  const [langIdx, setLangIdx] = useState(0);
  const [scenarioModels, setScenarioModels] = useState<{ aiChat: string; translate: string; polish: string; imageDescription: string }>({ aiChat: '', translate: '', polish: '', imageDescription: '' });
  const [scenarioFocus, setScenarioFocus] = useState(0);

  const selectedProvider = PROVIDERS[providerIdx]!;
  const models = selectedProvider.models;
  const selectedModelInfo = isCustomModel ? undefined : models[modelIdx];

  const handleDone = () => {
    // Write .env
    const envPath = path.resolve(process.cwd(), '.env');
    const lines = [
      `BLUESKY_HANDLE=${handle}`,
      `BLUESKY_APP_PASSWORD=${password}`,
    ];
    if (pdsUrl) lines.push(`BLUESKY_PDS=${pdsUrl}`);
    writeFileSync(envPath, lines.join('\n') + '\n', 'utf-8');

    // Write structured config (non-credential)
    const model = isCustomModel ? modelInput : (models[modelIdx]?.id || 'deepseek-v4-flash');
    const tuiConfig: TuiConfig = {
      targetLang: LANG_OPTIONS[langIdx]?.value || 'zh',
      translateMode: 'simple',
      aiConfig: {
        baseUrl: selectedProvider.baseUrl,
        model,
        provider: selectedProvider.id,
        reasoningStyle: selectedProvider.reasoningStyle,
        thinkingEnabled: selectedModelInfo?.thinking ?? true,
        visionEnabled: selectedModelInfo?.vision ?? false,
      },
      apiKeys: { [selectedProvider.id]: apiKey },
      scenarioModels,
    };
    saveTuiConfig(tuiConfig);

    setLocale(LANG_OPTIONS[langIdx]?.value || 'zh');

    onComplete({
      blueskyHandle: handle,
      blueskyPassword: password,
      blueskyPds: pdsUrl || undefined,
      llmApiKey: apiKey,
      llmBaseUrl: selectedProvider.baseUrl,
      llmModel: model,
      llmThinkingEnabled: selectedModelInfo?.thinking ?? true,
      llmVisionEnabled: selectedModelInfo?.vision ?? false,
      providerId: selectedProvider.id,
      locale: LANG_OPTIONS[langIdx]?.value || 'zh',
    });
  };

  useInput((_input, key) => {
    if (step === 'provider') {
      if (key.upArrow) setProviderIdx(i => Math.max(0, i - 1));
      if (key.downArrow) setProviderIdx(i => Math.min(PROVIDERS.length - 1, i + 1));
      if (key.return) { setModelIdx(0); setStep('model'); }
      return;
    }
    if (step === 'model') {
      if (key.upArrow) setModelIdx(i => Math.max(0, i - 1));
      if (key.downArrow) setModelIdx(i => Math.min(models.length, i + 1)); // +1 for "Custom"
      if (key.return) {
        if (modelIdx === models.length) { setIsCustomModel(true); setModelInput(''); setStep('model'); }
        else { setStep('apikey'); }
      }
      return;
    }
    if (step === 'locale') {
      if (key.upArrow || key.leftArrow) setLangIdx(i => Math.max(0, i - 1));
      if (key.downArrow || key.rightArrow) setLangIdx(i => Math.min(LANG_OPTIONS.length - 1, i + 1));
      if (key.return) { setStep('scenario'); }
      return;
    }
    if (step === 'scenario') {
      if (key.upArrow || key.leftArrow) setScenarioFocus(i => Math.max(0, i - 1));
      if (key.downArrow || key.rightArrow) setScenarioFocus(i => Math.min(2, i + 1));
      if (key.return) {
        const keys = ['aiChat', 'translate', 'polish'] as const;
        const scKey = keys[scenarioFocus]!;
        setScenarioModels(prev => ({
          ...prev,
          [scKey]: prev[scKey] ? '' : `${selectedProvider.id}/${isCustomModel ? modelInput : (models[modelIdx]?.id || '')}`,
        }));
      }
      if (key.escape || key.tab) { setStep('done'); }
      return;
    }
    if (step === 'done') {
      if (key.return) { handleDone(); }
      return;
    }
  });

  const handleTextSubmit = (value: string) => {
    const trimmed = value.trim();
    // PDS is optional — allow empty
    if (step !== 'pds' && !trimmed) return;
    switch (step) {
      case 'handle': setHandle(trimmed); setStep('password'); break;
      case 'password': setPassword(trimmed); setStep('pds'); break;
      case 'pds': setPdsUrl(trimmed); setStep('provider'); break;
      case 'apikey': setApiKey(trimmed); setStep('locale'); break;
    }
  };

  const handleModelCustomSubmit = (value: string) => {
    if (!value.trim()) return;
    setModelInput(value.trim());
    setIsCustomModel(false);
    setStep('apikey');
  };

  return (
    <Box flexDirection="column" padding={1}>
      <Box marginBottom={1}>
        <Text bold color="cyanBright">{'🦋 Bluesky TUI — '}{t('setup.title').replace('🦋 Bluesky TUI — ', '')}</Text>
      </Box>
      <Box marginBottom={1}>
        <Text dimColor>{t('setup.welcome')}</Text>
      </Box>

      {step === 'handle' && (
        <Box flexDirection="column">
          <Text color="cyanBright">▸ {t('setup.blueskyHandle')}</Text>
          <Box marginLeft={2} borderStyle="single" borderColor="cyan" paddingX={1}>
            <Text color="cyan">▸ </Text>
            <TextInput value={handle} onChange={setHandle} onSubmit={handleTextSubmit} placeholder="handle.bsky.social" />
          </Box>
        </Box>
      )}

      {step === 'password' && (
        <Box flexDirection="column">
          <Text color="green">✓ {t('setup.blueskyHandle')}: {handle}</Text>
          <Text color="cyanBright">▸ {t('setup.blueskyPassword')}</Text>
          <Box marginLeft={2} borderStyle="single" borderColor="cyan" paddingX={1}>
            <Text color="cyan">▸ </Text>
            <TextInput value={password} onChange={setPassword} onSubmit={handleTextSubmit} placeholder="App Password" />
          </Box>
        </Box>
      )}

      {step === 'pds' && (
        <Box flexDirection="column">
          <Text color="green">✓ {t('setup.blueskyHandle')}: {handle}  密码: ****</Text>
          <Text color="cyanBright">▸ PDS 主机 (可选, 留空=bsky.social)</Text>
          <Box marginLeft={2} borderStyle="single" borderColor="cyan" paddingX={1}>
            <Text color="cyan">▸ </Text>
            <TextInput value={pdsUrl} onChange={setPdsUrl} onSubmit={handleTextSubmit} placeholder="https://bsky.social" />
          </Box>
          <Box marginLeft={2}><Text color="yellow">自定义 PDS 仅适用于技术用户</Text></Box>
        </Box>
      )}

      {step === 'provider' && (
        <Box flexDirection="column">
          <Text color="green">✓ Bluesky: {handle}</Text>
          <Text color="cyanBright" bold>{'▸ 选择 LLM 提供商'}</Text>
          <Box flexDirection="column" marginTop={0} marginLeft={2}>
            {PROVIDERS.map((p, i) => (
              <Text key={p.id} color={i === providerIdx ? 'cyanBright' : undefined} backgroundColor={i === providerIdx ? '#1e40af' : undefined}>
                {i === providerIdx ? '▶' : ' '} {p.label} <Text dimColor>({p.baseUrl})</Text>
              </Text>
            ))}
          </Box>
          <Box marginTop={1} marginLeft={2}><Text dimColor>↑↓ 选择  Enter 确认</Text></Box>
        </Box>
      )}

      {step === 'model' && !isCustomModel && (
        <Box flexDirection="column">
          <Text color="green">✓ 提供商: {selectedProvider.label}</Text>
          <Text color="cyanBright" bold>{'▸ 选择模型'}</Text>
          <Box flexDirection="column" marginTop={0} marginLeft={2}>
            {models.map((m, i) => {
              const caps = [m.thinking ? '💭' : '', m.vision ? '👁' : ''].filter(Boolean).join(' ');
              return (
                <Text key={m.id} color={i === modelIdx ? 'cyanBright' : undefined} backgroundColor={i === modelIdx ? '#1e40af' : undefined}>
                  {i === modelIdx ? '▶' : ' '} {m.label} <Text dimColor>({m.id})</Text>{caps ? <Text dimColor>{' ' + caps}</Text> : null}
                </Text>
              );
            })}
            <Text color={modelIdx === models.length ? 'cyanBright' : undefined} backgroundColor={modelIdx === models.length ? '#1e40af' : undefined}>
              {modelIdx === models.length ? '▶' : ' '} <Text dimColor>Custom model...</Text>
            </Text>
          </Box>
          <Box marginTop={1} marginLeft={2}><Text dimColor>↑↓ 选择  Enter 确认</Text></Box>
        </Box>
      )}

      {step === 'model' && isCustomModel && (
        <Box flexDirection="column">
          <Text color="green">✓ 提供商: {selectedProvider.label}</Text>
          <Text color="cyanBright">▸ 输入自定义模型 ID</Text>
          <Box marginLeft={2} borderStyle="single" borderColor="cyan" paddingX={1}>
            <Text color="cyan">▸ </Text>
            <TextInput value={modelInput} onChange={setModelInput} onSubmit={handleModelCustomSubmit} placeholder="model-id" />
          </Box>
        </Box>
      )}

      {step === 'apikey' && (
        <Box flexDirection="column">
          <Text color="green">✓ 提供商: {selectedProvider.label}</Text>
          <Text color="green">✓ 模型: {isCustomModel ? modelInput : models[modelIdx]?.label}</Text>
          <Text color="cyanBright">▸ {t('setup.llmApiKey')} (for {selectedProvider.label})</Text>
          <Box marginLeft={2} borderStyle="single" borderColor="cyan" paddingX={1}>
            <Text color="cyan">▸ </Text>
            <TextInput value={apiKey} onChange={setApiKey} onSubmit={handleTextSubmit} placeholder="sk-..." />
          </Box>
        </Box>
      )}

      {step === 'locale' && (
        <Box flexDirection="column">
          <Text color="green">✓ API Key: ****</Text>
          <Text color="cyanBright" bold>{'▸ '}{t('setup.locale')}</Text>
          <Box flexDirection="row" marginLeft={2} gap={2}>
            {LANG_OPTIONS.map((o, i) => (
              <Box key={o.value} paddingX={1}>
                <Text color={i === langIdx ? 'cyanBright' : undefined} backgroundColor={i === langIdx ? '#1e40af' : undefined}>
                  {i === langIdx ? '▶' : ' '} {o.label}{i === langIdx ? ' ◀' : ''}
                </Text>
              </Box>
            ))}
          </Box>
          <Box marginTop={1} marginLeft={2}><Text dimColor>←→ 选择  Enter 确认  (或按 Tab 跳过场景配置)</Text></Box>
        </Box>
      )}

      {step === 'scenario' && (
        <Box flexDirection="column">
          <Text color="green">✓ 语言: {LANG_OPTIONS[langIdx]?.label}</Text>
          <Text color="cyanBright" bold>{'▸ 场景模型配置 (可选)'}</Text>
          <Box marginLeft={2}><Text dimColor>分配不同场景使用的模型。留空则使用默认模型。</Text></Box>
          {(['aiChat', 'translate', 'polish'] as const).map((key, i) => {
            const val = scenarioModels[key];
            const isActive = i === scenarioFocus;
            return (
              <Box key={key} marginLeft={2} marginTop={0}>
                <Text color={isActive ? 'cyanBright' : undefined} backgroundColor={isActive ? '#1e40af' : undefined}>
                  {isActive ? '▶' : ' '} {SCENARIO_LABELS[key]}: {val ? <Text color="green">{val}</Text> : <Text dimColor>(同默认)</Text>}
                </Text>
              </Box>
            );
          })}
          <Box marginTop={1} marginLeft={2}><Text dimColor>↑↓ 切换  Enter 切换开/关  Esc/Tab 完成</Text></Box>
        </Box>
      )}

      {step === 'done' && (
        <Box flexDirection="column">
          <Text color="green">✓ 全部配置完成</Text>
          <Box marginTop={1}>
            <Text>{'🦋 '}{t('setup.complete')}</Text>
          </Box>
          <Box marginTop={0}>
            <Text color="yellow" bold>{'⚠ '}API Key 凭证已写入 .env, 非凭证设置写入 bsky-tui.config.json（不要提交到 Git）</Text>
          </Box>
        </Box>
      )}
    </Box>
  );
}
