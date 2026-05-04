import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';
import TextInput from 'ink-text-input';
import { useI18n } from '@bsky/app';
import { PROVIDERS, getProviderById, getModelInfo } from '@bsky/core';
import type { ProviderInfo, ModelInfo } from '@bsky/core';
import { getTuiConfig, saveTuiConfig } from '../config/configStore.js';
import type { TuiConfig } from '../config/configStore.js';

interface SettingsViewProps {
  goBack: () => void;
}

type Tab = 'model' | 'scenario' | 'lang' | 'keys';

const LANG_OPTIONS = [
  { value: 'zh', label: '中文' },
  { value: 'en', label: 'English' },
  { value: 'ja', label: '日本語' },
  { value: 'ko', label: '한국어' },
  { value: 'fr', label: 'Français' },
  { value: 'de', label: 'Deutsch' },
  { value: 'es', label: 'Español' },
];

const TAB_LABELS: Record<Tab, string> = {
  model: '🤖 模型',
  scenario: '🎯 场景',
  lang: '🌐 语言',
  keys: '🔑 Keys',
};

const SCENARIO_LABELS: Record<string, string> = {
  aiChat: 'AI 聊天',
  translate: '翻译',
  polish: '润色',
};

export function SettingsView({ goBack }: SettingsViewProps) {
  const { t } = useI18n();
  const config = getTuiConfig();

  const [tab, setTab] = useState<Tab>('model');
  const [saved, setSaved] = useState(false);

  // Model tab state
  const [providerIdx, setProviderIdx] = useState(() => {
    const idx = PROVIDERS.findIndex(p => p.id === config.aiConfig.provider);
    return idx >= 0 ? idx : 0;
  });
  const [modelIdx, setModelIdx] = useState(() => {
    const p = PROVIDERS[providerIdx];
    const idx = p?.models.findIndex(m => m.id === config.aiConfig.model) ?? 0;
    return idx >= 0 ? idx : 0;
  });
  const [isCustomModel, setIsCustomModel] = useState(
    !PROVIDERS[providerIdx]?.models.find(m => m.id === config.aiConfig.model)
  );
  const [customModelInput, setCustomModelInput] = useState(
    isCustomModel ? config.aiConfig.model : ''
  );
  const [focusIdx, setFocusIdx] = useState(0);

  // Scenario tab state
  const [scenarioModels, setScenarioModels] = useState({ ...config.scenarioModels });
  const [scenarioIdx, setScenarioIdx] = useState(0);
  const [providerListIdx, setProviderListIdx] = useState<Record<number, number>>({});

  // Lang tab
  const [targetLang, setTargetLang] = useState(config.targetLang);
  const [translateMode, setTranslateMode] = useState(config.translateMode);
  const [langFocus, setLangFocus] = useState(0);

  // Keys tab
  const [apiKeys, setApiKeys] = useState<Record<string, string>>({ ...config.apiKeys });
  const [keyFocusIdx, setKeyFocusIdx] = useState(0);
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editingValue, setEditingValue] = useState('');

  const selectedProvider = PROVIDERS[providerIdx]!;
  const models = selectedProvider.models;
  const currentModel = models[modelIdx];
  const currentModelInfo = isCustomModel ? undefined : currentModel;
  const activeModel = isCustomModel ? customModelInput : (currentModel?.id || '');

  const handleSave = () => {
    const providerId = selectedProvider.id;
    const newConfig: TuiConfig = {
      ...config,
      targetLang,
      translateMode: translateMode as 'simple' | 'json',
      aiConfig: {
        baseUrl: selectedProvider.baseUrl,
        model: activeModel,
        provider: providerId,
        reasoningStyle: selectedProvider.reasoningStyle,
        thinkingEnabled: currentModelInfo?.thinking ?? config.aiConfig.thinkingEnabled ?? true,
        visionEnabled: currentModelInfo?.vision ?? config.aiConfig.visionEnabled ?? false,
      },
      apiKeys,
      scenarioModels,
    };
    saveTuiConfig(newConfig);
    setSaved(true);
    setTimeout(() => { setSaved(false); goBack(); }, 1500);
  };

  useInput((input, key) => {
    if (key.escape) {
      if (editingKey) { setEditingKey(null); return; }
      goBack(); return;
    }

    // Tab navigation
    if (key.tab && !editingKey) {
      const tabs: Tab[] = ['model', 'scenario', 'lang', 'keys'];
      const idx = tabs.indexOf(tab);
      setTab(tabs[(idx + 1) % tabs.length]!);
      return;
    }

    // Save key
    if (input.toLowerCase() === 's' && !editingKey) { handleSave(); return; }

    if (editingKey) {
      if (key.return) {
        setApiKeys(prev => ({ ...prev, [editingKey]: editingValue }));
        setEditingKey(null);
        setEditingValue('');
      }
      return;
    }

    if (tab === 'model') {
      const max = providerIdx === 0 ? 4 : 3; // provider + model + custom entry
      if (key.upArrow || key.downArrow) {
        // Within provider selection
        if (focusIdx === 0) {
          if (key.upArrow) setProviderIdx(i => Math.max(0, i - 1));
          if (key.downArrow) setProviderIdx(i => Math.min(PROVIDERS.length - 1, i + 1));
          const newP = PROVIDERS[providerIdx];
          setModelIdx(0);
          setIsCustomModel(false);
          return;
        }
        // Within model selection
        if (focusIdx === 1 || focusIdx === 2) {
          if (key.upArrow) setModelIdx(i => Math.max(0, i - 1));
          if (key.downArrow) setModelIdx(i => Math.min(models.length, i + 1));
          return;
        }
        return;
      }
      if (key.return) {
        if (focusIdx >= 2) {
          if (modelIdx === models.length) {
            setIsCustomModel(true);
            setCustomModelInput(activeModel || '');
          } else {
            setIsCustomModel(false);
          }
        }
        if (focusIdx < 4) { setFocusIdx(i => Math.min(4, i + 1)); return; }
        setTab('scenario');
        return;
      }
      if (key.upArrow) setFocusIdx(i => Math.max(0, i - 1));
      if (key.downArrow) setFocusIdx(i => Math.min(3, i + 1)); // provider + model + think hint + vision hint
      return;
    }

    if (tab === 'scenario') {
      if (key.upArrow) setScenarioIdx(i => Math.max(0, i - 1));
      if (key.downArrow) setScenarioIdx(i => Math.min(2, i + 1));
      if (key.return) {
        // Pick provider: "provider/model" format
        const keys = ['aiChat', 'translate', 'polish'] as const;
        const scKey = keys[scenarioIdx]!;
        const cur = scenarioModels[scKey];
        if (cur) {
          setScenarioModels(prev => ({ ...prev, [scKey]: '' }));
        } else {
          setScenarioModels(prev => ({ ...prev, [scKey]: `${selectedProvider.id}/${activeModel}` }));
        }
      }
      return;
    }

    if (tab === 'lang') {
      if (key.upArrow || key.leftArrow) setLangFocus(i => Math.max(0, i - 1));
      if (key.downArrow || key.rightArrow) setLangFocus(i => Math.min(1, i + 1));
      if (key.return && langFocus === 0) {
        // Cycle target language
        const idx = LANG_OPTIONS.findIndex(o => o.value === targetLang);
        setTargetLang(LANG_OPTIONS[(idx + 1) % LANG_OPTIONS.length]!.value);
      }
      if (key.return && langFocus === 1) {
        setTranslateMode(m => m === 'simple' ? 'json' : 'simple');
      }
      return;
    }

    if (tab === 'keys') {
      if (key.upArrow) setKeyFocusIdx(i => Math.max(0, i - 1));
      if (key.downArrow) setKeyFocusIdx(i => Math.min(PROVIDERS.length - 1, i + 1));
      if (key.return) {
        const pid = PROVIDERS[keyFocusIdx]!.id;
        setEditingKey(pid);
        setEditingValue(apiKeys[pid] || '');
      }
      return;
    }
  });

  return (
    <Box flexDirection="column" padding={1}>
      <Box marginBottom={0}>
        <Text bold color="cyan">{'⚙️ Settings — '}</Text>
        <Text dimColor>{'Tab:切换标签  ↓↑:导航  Enter:选择  s:保存  Esc:返回'}</Text>
      </Box>

      {/* Tab bar */}
      <Box marginTop={0} marginBottom={0}>
        {(Object.keys(TAB_LABELS) as Tab[]).map(t => (
          <Text key={t} color={t === tab ? 'cyanBright' : undefined} backgroundColor={t === tab ? '#1e40af' : undefined}>
            {t === tab ? ' ' + TAB_LABELS[t] + ' ' : ' ' + TAB_LABELS[t].replace(/^[^\s]+\s/, '') + ' '}
          </Text>
        ))}
      </Box>

      {/* Model tab */}
      {tab === 'model' && (
        <Box flexDirection="column" marginTop={0}>
          <Text dimColor>提供商与模型配置</Text>
          {/* Provider */}
          <Box height={1}>
            <Text color={focusIdx === 0 ? 'cyanBright' : undefined}>
              {focusIdx === 0 ? '▸' : ' '} Provider:{' '}
              <Text color={focusIdx === 0 ? 'cyanBright' : 'green'} bold={focusIdx === 0}>
                {selectedProvider.label}
              </Text>
              <Text dimColor>{'  ←→ 切换'}</Text>
            </Text>
          </Box>
          {/* Model */}
          <Box height={1}>
            <Text color={focusIdx === 1 || focusIdx === 2 ? 'cyanBright' : undefined}>
              {focusIdx === 1 || focusIdx === 2 ? '▸' : ' '} Model:{' '}
              <Text color={(focusIdx === 1 || focusIdx === 2) ? 'cyanBright' : 'green'}>
                {isCustomModel ? customModelInput || '(custom)' : models[modelIdx]?.label || models[0]?.label}
              </Text>
              <Text dimColor>{'  ←→ 切换'}</Text>
            </Text>
          </Box>
          {/* Capabilities */}
          {currentModelInfo ? (
            <Box height={1} marginLeft={2}>
              <Text dimColor>  Capabilities: </Text>
              <Text color={currentModelInfo.thinking ? 'green' : 'gray'}>
                {'💭 Thinking: ' + (currentModelInfo.thinking ? 'Yes' : 'No')}
              </Text>
              <Text dimColor>{'  '}</Text>
              <Text color={currentModelInfo.vision ? 'green' : 'gray'}>
                {'👁 Vision: ' + (currentModelInfo.vision ? 'Yes' : 'No')}
              </Text>
              <Text dimColor>{'  (auto)'}</Text>
            </Box>
          ) : (
            <Box height={1} marginLeft={2}>
              <Text dimColor>  Custom model — no capability info</Text>
            </Box>
          )}
          {isCustomModel && (
            <Box marginLeft={2} marginTop={0}>
              <Text color="cyan">  ▸ Custom ID: </Text>
              <TextInput value={customModelInput} onChange={setCustomModelInput} onSubmit={() => {}} />
            </Box>
          )}
          {/* Model list hint */}
          <Box marginTop={0} marginLeft={2}>
            <Text dimColor>    可用: </Text>
            {models.map((m, i) => (
              <Text key={m.id} color={i === modelIdx && !isCustomModel ? 'green' : 'gray'}>
                {i === modelIdx && !isCustomModel ? '[' + m.id + ']' : m.id}
                <Text dimColor>{' '}</Text>
              </Text>
            ))}
            <Text color={isCustomModel ? 'green' : 'gray'}>
              {isCustomModel ? '[custom]' : 'custom'}
            </Text>
          </Box>
        </Box>
      )}

      {/* Scenario tab */}
      {tab === 'scenario' && (
        <Box flexDirection="column" marginTop={0}>
          <Text dimColor>场景模型配置 — 留空使用默认模型。Enter 键切换该场景是否使用独立模型。</Text>
          {(['aiChat', 'translate', 'polish'] as const).map((key, i) => {
            const val = scenarioModels[key];
            return (
              <Box key={key} height={1}>
                <Text color={i === scenarioIdx ? 'cyanBright' : undefined} backgroundColor={i === scenarioIdx ? '#1e40af' : undefined}>
                  {i === scenarioIdx ? '▸' : ' '} {SCENARIO_LABELS[key]}:{' '}
                  {val ? (
                    <Text color="green">{val}</Text>
                  ) : (
                    <Text dimColor>(same as default — {activeModel})</Text>
                  )}
                </Text>
              </Box>
            );
          })}
          <Box marginTop={0}>
            <Text dimColor>  Enter: 切换场景使用默认 / 独立模型</Text>
          </Box>
        </Box>
      )}

      {/* Lang tab */}
      {tab === 'lang' && (
        <Box flexDirection="column" marginTop={0}>
          <Box height={1}>
            <Text color={langFocus === 0 ? 'cyanBright' : undefined} backgroundColor={langFocus === 0 ? '#1e40af' : undefined}>
              {langFocus === 0 ? '▸' : ' '} {t('settings.targetLang')}: <Text color="green">{LANG_OPTIONS.find(o => o.value === targetLang)?.label || targetLang}</Text>
            </Text>
          </Box>
          <Box height={1}>
            <Text color={langFocus === 1 ? 'cyanBright' : undefined} backgroundColor={langFocus === 1 ? '#1e40af' : undefined}>
              {langFocus === 1 ? '▸' : ' '} {t('settings.translateMode')}: <Text color="green">{translateMode === 'simple' ? t('settings.translateModeSimple') : t('settings.translateModeJson')}</Text>
            </Text>
          </Box>
          <Box marginTop={0}>
            <Text dimColor>  Enter: 切换选项</Text>
          </Box>
        </Box>
      )}

      {/* Keys tab */}
      {tab === 'keys' && (
        <Box flexDirection="column" marginTop={0}>
          <Text dimColor>Per-provider API Keys (Enter 编辑)</Text>
          {PROVIDERS.map((p, i) => {
            const hasKey = !!(apiKeys[p.id]);
            return (
              <Box key={p.id} height={1}>
                {editingKey === p.id ? (
                  <Box>
                    <Text color="cyanBright">▸ {p.label}: </Text>
                    <TextInput value={editingValue} onChange={setEditingValue} onSubmit={() => {}} />
                    <Text dimColor> Enter:保存</Text>
                  </Box>
                ) : (
                  <Text color={i === keyFocusIdx ? 'cyanBright' : undefined} backgroundColor={i === keyFocusIdx ? '#1e40af' : undefined}>
                    {i === keyFocusIdx ? '▸' : ' '} {p.label}: {hasKey ? <Text color="green">****</Text> : <Text dimColor>(empty)</Text>}
                  </Text>
                )}
              </Box>
            );
          })}
        </Box>
      )}

      {saved && (
        <Box marginTop={1}>
          <Text color="green">{'✅ Saved!'}</Text>
        </Box>
      )}
    </Box>
  );
}
