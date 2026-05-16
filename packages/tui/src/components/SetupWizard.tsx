import React, { useState, useMemo } from 'react';
import { Box, Text, useInput } from 'ink';
import TextInput from 'ink-text-input';
import { useI18n } from '@bsky/app';
import type { Locale } from '@bsky/app';
import { PROVIDERS, getProviderById, getModelInfo } from '@bsky/core';
import type { ProviderInfo, ModelInfo } from '@bsky/core';
import { writeFileSync } from 'fs';
import path from 'path';
import { saveTuiConfig, updateTuiConfig, getTuiConfig } from '../config/configStore.js';
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
  userPronouns: string;
}

interface SetupWizardProps {
  onComplete: (config: SetupConfig) => void;
  existing?: Partial<SetupConfig>;
}

type Step = 'auth' | 'handle' | 'password' | 'pds' | 'provider' | 'model' | 'apikey' | 'locale' | 'pronouns' | 'done';

const LANG_OPTIONS: { value: Locale; label: string }[] = [
  { value: 'zh', label: '中文 (zh)' },
  { value: 'en', label: 'English (en)' },
  { value: 'ja', label: '日本語 (ja)' },
];

export function SetupWizard({ onComplete, existing }: SetupWizardProps) {
  const { t, setLocale } = useI18n();

  // ── State, pre-filled from existing config ──
  const [handle, setHandle] = useState(existing?.blueskyHandle ?? '');
  const [password, setPassword] = useState(existing?.blueskyPassword ?? '');
  const [pdsUrl, setPdsUrl] = useState(existing?.blueskyPds ?? '');

  // Provider: try to match existing providerId
  const initProviderIdx = existing?.providerId
    ? Math.max(0, PROVIDERS.findIndex(p => p.id === existing.providerId))
    : 0;
  const [providerIdx, setProviderIdx] = useState(initProviderIdx);
  const selectedProvider = PROVIDERS[providerIdx]!;

  // Model
  const [modelIdx, setModelIdx] = useState(0);
  const [modelInput, setModelInput] = useState(existing?.llmModel ?? '');
  const [isCustomModel, setIsCustomModel] = useState(false);
  const models = selectedProvider.models;

  const [apiKey, setApiKey] = useState(existing?.llmApiKey ?? '');
  const [langIdx, setLangIdx] = useState(LANG_OPTIONS.findIndex(o => o.value === (existing?.locale ?? 'zh')));
  const [pronounsRad, setPronounsRad] = useState<'skip' | 'neutral' | 'custom'>('skip');
  const [pronounsCustom, setPronounsCustom] = useState(existing?.userPronouns
    && existing.userPronouns !== 'neutral'
    ? existing.userPronouns
    : '');

  // ── Smart step detection: only show steps whose values are empty ──
  const steps = useMemo((): Step[] => {
    const s: Step[] = [];
    // Auth disclosure always shown first (one-time consent)
    s.push('auth');
    if (!handle.trim()) s.push('handle');
    if (!password.trim()) s.push('password');
    // PDS is optional — skip if already set or empty (user can leave blank)
    if (handle.trim() && password.trim() && !pdsUrl) s.push('pds');
    // AI config
    const hasAiKey = !!apiKey.trim();
    if (!existing?.providerId) s.push('provider');
    if (!existing?.llmModel) s.push('model');
    if (!hasAiKey) s.push('apikey');
    if (!existing?.locale) s.push('locale');
    // Pronouns — always ask if not set
    const pronounsSet = existing?.userPronouns && existing.userPronouns !== '';
    if (!pronounsSet) s.push('pronouns');
    s.push('done');
    return s;
  }, [handle, password, pdsUrl, apiKey, existing?.providerId, existing?.llmModel, existing?.locale, existing?.userPronouns]);

  const [stepIdx, setStepIdx] = useState(0);
  const step = steps[stepIdx]!;

  const handleDone = () => {
    // Write .env (only bluesky credentials)
    const envPath = path.resolve(process.cwd(), '.env');
    const lines = [`BLUESKY_HANDLE=${handle}`, `BLUESKY_APP_PASSWORD=${password}`];
    if (pdsUrl) lines.push(`BLUESKY_PDS=${pdsUrl}`);
    writeFileSync(envPath, lines.join('\n') + '\n', 'utf-8');

    // Write structured config (non-credential)
    const model = isCustomModel ? modelInput : (models[modelIdx]?.id || 'deepseek-v4-flash');
    const finalPronouns = pronounsRad === 'skip' ? '' : pronounsRad === 'neutral' ? 'neutral' : pronounsCustom;
    const tuiConfig: TuiConfig = {
      targetLang: LANG_OPTIONS[langIdx]?.value || 'zh',
      translateMode: 'simple',
      aiConfig: {
        baseUrl: selectedProvider.baseUrl,
        model,
        provider: selectedProvider.id,
        reasoningStyle: selectedProvider.reasoningStyle,
        apiType: selectedProvider.apiType,
        thinkingEnabled: models[modelIdx]?.thinking ?? true,
        visionEnabled: models[modelIdx]?.vision ?? false,
      },
      apiKeys: { [selectedProvider.id]: apiKey },
      scenarioModels: { aiChat: '', translate: '', polish: '', imageDescription: '' },
      userPronouns: finalPronouns,
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
      llmThinkingEnabled: models[modelIdx]?.thinking ?? true,
      llmVisionEnabled: models[modelIdx]?.vision ?? false,
      providerId: selectedProvider.id,
      locale: LANG_OPTIONS[langIdx]?.value || 'zh',
      userPronouns: finalPronouns,
    });
  };

  const advance = () => {
    if (stepIdx < steps.length - 1) setStepIdx(i => i + 1);
    else handleDone();
  };

  useInput((_input, key) => {
    if (step === 'provider') {
      if (key.upArrow) setProviderIdx(i => Math.max(0, i - 1));
      if (key.downArrow) setProviderIdx(i => Math.min(PROVIDERS.length - 1, i + 1));
      if (key.return) { setModelIdx(0); advance(); }
      return;
    }
    if (step === 'model' && !isCustomModel) {
      if (key.upArrow) setModelIdx(i => Math.max(0, i - 1));
      if (key.downArrow) setModelIdx(i => Math.min(models.length, i + 1));
      if (key.return) {
        if (modelIdx === models.length) { setIsCustomModel(true); setModelInput(''); }
        else { advance(); }
      }
      return;
    }
    if (step === 'locale') {
      if (key.upArrow || key.leftArrow) setLangIdx(i => Math.max(0, i - 1));
      if (key.downArrow || key.rightArrow) setLangIdx(i => Math.min(LANG_OPTIONS.length - 1, i + 1));
      if (key.return) { advance(); }
      return;
    }
    if (step === 'done') {
      if (key.return) { handleDone(); }
      return;
    }
    // Consent/pronouns: Enter advances
    if ((step === 'auth' || step === 'pronouns') && key.return) {
      advance();
      return;
    }
    // Pronouns: ↑↓ selection
    if (step === 'pronouns') {
      if (key.upArrow) setPronounsRad(r => r === 'neutral' ? 'skip' : r === 'custom' ? 'neutral' : 'skip');
      if (key.downArrow) setPronounsRad(r => r === 'skip' ? 'neutral' : r === 'neutral' ? 'custom' : 'custom');
      return;
    }
  });

  const handleTextSubmit = (value: string) => {
    const trimmed = value.trim();
    if (step !== 'pds' && !trimmed) return;
    switch (step) {
      case 'handle': setHandle(trimmed); advance(); break;
      case 'password': setPassword(trimmed); advance(); break;
      case 'pds': setPdsUrl(trimmed); advance(); break;
      case 'apikey': setApiKey(trimmed); advance(); break;
    }
  };

  const handleModelCustomSubmit = (value: string) => {
    if (!value.trim()) return;
    setModelInput(value.trim());
    setIsCustomModel(false);
    advance();
  };

  return (
    <Box flexDirection="column" padding={1}>
      <Box marginBottom={1}>
        <Text bold color="cyanBright">{'🦋 Bluesky TUI — '}{t('setup.title').replace('🦋 Bluesky TUI — ', '')}</Text>
      </Box>
      <Box marginBottom={1}>
        <Text dimColor>{t('setup.welcome')}</Text>
      </Box>

      {/* Step indicator */}
      <Box marginBottom={1}>
        <Text dimColor>Step {steps.indexOf(step) + 1}/{steps.length}</Text>
      </Box>

      {step === 'auth' && (
        <Box flexDirection="column" borderStyle="round" borderColor="yellow" paddingX={1}>
          <Text bold color="yellow">{'🔑 '}{t('setup.authStep')}</Text>
          <Text dimColor>{t('setup.authDesc')}</Text>
          <Box marginTop={1}>
            <Text color="green">[Enter] {t('setup.authConfirm')}</Text>
          </Box>
        </Box>
      )}

      {step === 'handle' && (
        <Box flexDirection="column">
          <Text color={handle ? 'green' : 'cyanBright'}>▸ {t('setup.blueskyHandle')}</Text>
          <Box marginLeft={2} borderStyle="single" borderColor="cyan" paddingX={1}>
            <Text color="cyan">▸ </Text>
            <TextInput value={handle} onChange={setHandle} onSubmit={handleTextSubmit} placeholder="handle.bsky.social" />
          </Box>
        </Box>
      )}

      {step === 'password' && (
        <Box flexDirection="column">
          <Text color="green">✓ {handle || t('setup.blueskyHandle')}</Text>
          <Text color="cyanBright">▸ {t('setup.blueskyPassword')}</Text>
          <Box marginLeft={2} borderStyle="single" borderColor="cyan" paddingX={1}>
            <Text color="cyan">▸ </Text>
            <TextInput value={password} onChange={setPassword} onSubmit={handleTextSubmit} placeholder="App Password" />
          </Box>
        </Box>
      )}

      {step === 'pds' && (
        <Box flexDirection="column">
          <Text color="green">✓ {handle}</Text>
          <Text color="cyanBright">▸ PDS (optional, Enter=bsky.social)</Text>
          <Box marginLeft={2} borderStyle="single" borderColor="cyan" paddingX={1}>
            <Text color="cyan">▸ </Text>
            <TextInput value={pdsUrl} onChange={setPdsUrl} onSubmit={handleTextSubmit} placeholder="https://bsky.social" />
          </Box>
        </Box>
      )}

      {step === 'provider' && (
        <Box flexDirection="column">
          <Text color="green">✓ Bluesky: {handle}</Text>
          <Text color="cyanBright" bold>{'▸ '}{'LLM Provider'}</Text>
          <Box flexDirection="column" marginLeft={2}>
            {PROVIDERS.map((p, i) => (
              <Text key={p.id} color={i === providerIdx ? 'cyanBright' : undefined}>
                {i === providerIdx ? '▶' : ' '} {p.label} <Text dimColor>({p.baseUrl})</Text>
              </Text>
            ))}
          </Box>
          <Box marginTop={1} marginLeft={2}><Text dimColor>↑↓ select  Enter confirm</Text></Box>
        </Box>
      )}

      {step === 'model' && !isCustomModel && (
        <Box flexDirection="column">
          <Text color="green">✓ {selectedProvider.label}</Text>
          <Text color="cyanBright" bold>{'▸ '}{'Model'}</Text>
          <Box flexDirection="column" marginLeft={2}>
            {models.map((m, i) => (
              <Text key={m.id} color={i === modelIdx ? 'cyanBright' : undefined}>
                {i === modelIdx ? '▶' : ' '} {m.label} <Text dimColor>({m.id})</Text>
                {m.thinking ? <Text dimColor> 💭</Text> : null}
                {m.vision ? <Text dimColor> 👁</Text> : null}
              </Text>
            ))}
            <Text color={modelIdx === models.length ? 'cyanBright' : undefined}>
              {modelIdx === models.length ? '▶' : ' '} <Text dimColor>Custom model...</Text>
            </Text>
          </Box>
          <Box marginTop={1} marginLeft={2}><Text dimColor>↑↓ select  Enter confirm</Text></Box>
        </Box>
      )}

      {step === 'model' && isCustomModel && (
        <Box flexDirection="column">
          <Text color="green">✓ {selectedProvider.label}</Text>
          <Text color="cyanBright">▸ Custom model ID</Text>
          <Box marginLeft={2} borderStyle="single" borderColor="cyan" paddingX={1}>
            <Text color="cyan">▸ </Text>
            <TextInput value={modelInput} onChange={setModelInput} onSubmit={handleModelCustomSubmit} placeholder="model-id" />
          </Box>
        </Box>
      )}

      {step === 'apikey' && (
        <Box flexDirection="column">
          <Text color="green">✓ {selectedProvider.label} {isCustomModel ? modelInput : models[modelIdx]?.label}</Text>
          <Text color="cyanBright">▸ {t('setup.llmApiKey')}</Text>
          <Box marginLeft={2} borderStyle="single" borderColor="cyan" paddingX={1}>
            <Text color="cyan">▸ </Text>
            <TextInput value={apiKey} onChange={setApiKey} onSubmit={handleTextSubmit} placeholder="sk-..." />
          </Box>
        </Box>
      )}

      {step === 'locale' && (
        <Box flexDirection="column">
          <Text color="green">✓ API Key saved</Text>
          <Text color="cyanBright" bold>{'▸ '}{t('setup.locale')}</Text>
          <Box flexDirection="row" marginLeft={2} gap={2}>
            {LANG_OPTIONS.map((o, i) => (
              <Box key={o.value} paddingX={1}>
                <Text color={i === langIdx ? 'cyanBright' : undefined}>
                  {i === langIdx ? '▶' : ' '} {o.label}{i === langIdx ? ' ◀' : ''}
                </Text>
              </Box>
            ))}
          </Box>
          <Box marginTop={1} marginLeft={2}><Text dimColor>←→ select  Enter confirm</Text></Box>
        </Box>
      )}

      {step === 'pronouns' && (
        <Box flexDirection="column" borderStyle="round" borderColor="cyan" paddingX={1}>
          <Text bold color="cyanBright">{'👤 '}{t('setup.pronounsStep')}</Text>
          <Text dimColor>{t('setup.pronounsDesc')}</Text>
          <Box marginTop={1} flexDirection="column">
            <Box>
              <Text color={pronounsRad === 'skip' ? 'cyanBright' : undefined}>
                {pronounsRad === 'skip' ? '▶' : ' '} {t('user.pronounsSkip')}
              </Text>
            </Box>
            <Box>
              <Text color={pronounsRad === 'neutral' ? 'cyanBright' : undefined}>
                {pronounsRad === 'neutral' ? '▶' : ' '} {t('user.pronounsNeutral')}
              </Text>
              <Text dimColor> — {t('setup.pronounsNeutralHint')}</Text>
            </Box>
            <Box>
              <Text color={pronounsRad === 'custom' ? 'cyanBright' : undefined}>
                {pronounsRad === 'custom' ? '▶' : ' '} {t('user.pronounsCustom')}
              </Text>
              <Text dimColor> — {t('setup.pronounsCustomHint')}</Text>
            </Box>
          </Box>
          {pronounsRad === 'custom' && (
            <Box marginLeft={2} borderStyle="single" borderColor="cyan" paddingX={1} marginTop={1}>
              <Text color="cyan">▸ </Text>
              <TextInput
                value={pronounsCustom}
                onChange={v => { setPronounsCustom(v); setPronounsRad('custom'); }}
                onSubmit={() => advance()}
                placeholder="they/them, she/her, he/him, ze/zir..."
              />
            </Box>
          )}
          {pronounsRad !== 'custom' && (
            <Box marginTop={1}>
              <Text dimColor>↑↓ select  Enter confirm</Text>
            </Box>
          )}
        </Box>
      )}

      {step === 'done' && (
        <Box flexDirection="column">
          <Text color="green">✓ All configured!</Text>
          <Box marginTop={1}>
            <Text>{'🦋 '}{t('setup.complete')}</Text>
          </Box>
          <Box marginTop={0}>
            <Text color="yellow" bold>{'⚠ '}Credentials written to .env, settings to bsky-tui.config.json</Text>
          </Box>
        </Box>
      )}
    </Box>
  );
}
