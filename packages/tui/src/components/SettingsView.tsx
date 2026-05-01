import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';
import TextInput from 'ink-text-input';
import { writeFileSync, existsSync, readFileSync } from 'fs';
import dotenv from 'dotenv';
import path from 'path';
import { useI18n } from '@bsky/app';

interface SettingsViewProps {
  goBack: () => void;
}

interface SettingField {
  key: string;
  label: string;
  current: string;
  setter: (v: string) => void;
}

export function SettingsView({ goBack }: SettingsViewProps) {
  const { t } = useI18n();
  const envPath = path.resolve(process.cwd(), '.env');
  try { dotenv.config({ path: envPath }); } catch {}

  const [llmKey, setLlmKey] = useState(process.env.LLM_API_KEY || '');
  const [llmUrl, setLlmUrl] = useState(process.env.LLM_BASE_URL || '');
  const [llmModel, setLlmModel] = useState(process.env.LLM_MODEL || '');
  const [thinkMode, setThinkMode] = useState(process.env.LLM_THINKING_ENABLED || 'true');
  const [locale, setLocale] = useState(process.env.I18N_LOCALE || process.env.TRANSLATE_TARGET_LANG || 'zh');
  const [focusIdx, setFocusIdx] = useState(0);
  const [saved, setSaved] = useState(false);

  const fields: SettingField[] = [
    { key: 'LLM_API_KEY', label: '🤖 LLM API Key', current: llmKey, setter: setLlmKey },
    { key: 'LLM_BASE_URL', label: '🔗 LLM Base URL', current: llmUrl, setter: setLlmUrl },
    { key: 'LLM_MODEL', label: '🧠 LLM Model', current: llmModel, setter: setLlmModel },
    { key: 'LLM_THINKING_ENABLED', label: '💭 Think Mode (true/false)', current: thinkMode, setter: setThinkMode },
    { key: 'I18N_LOCALE', label: '🌐 UI 语言 (zh/en/ja)', current: locale, setter: setLocale },
  ];

  const handleSave = () => {
    const lines: string[] = [];
    if (existsSync(envPath)) {
      const existing = readFileSync(envPath, 'utf-8').split('\n');
      const replaced = new Set<string>();
      for (const line of existing) {
        const key = line.split('=')[0]?.trim();
        if (key === 'LLM_API_KEY') { lines.push(`LLM_API_KEY=${llmKey}`); replaced.add(key); }
        else if (key === 'LLM_BASE_URL') { lines.push(`LLM_BASE_URL=${llmUrl}`); replaced.add(key); }
        else if (key === 'LLM_MODEL') { lines.push(`LLM_MODEL=${llmModel}`); replaced.add(key); }
        else if (key === 'LLM_THINKING_ENABLED') { lines.push(`LLM_THINKING_ENABLED=${thinkMode}`); replaced.add(key); }
        else if (key === 'I18N_LOCALE') { lines.push(`I18N_LOCALE=${locale}`); replaced.add(key); }
        else lines.push(line);
      }
      for (const key of ['LLM_API_KEY', 'LLM_BASE_URL', 'LLM_MODEL', 'LLM_THINKING_ENABLED', 'I18N_LOCALE']) {
        if (!replaced.has(key)) lines.push(`${key}=${fields.find(f => f.key === key)!.current}`);
      }
    } else {
      lines.push(`LLM_API_KEY=${llmKey}`, `LLM_BASE_URL=${llmUrl}`, `LLM_MODEL=${llmModel}`, `LLM_THINKING_ENABLED=${thinkMode}`, `I18N_LOCALE=${locale}`);
    }
    writeFileSync(envPath, lines.join('\n') + '\n', 'utf-8');
    setSaved(true);
    setTimeout(() => { setSaved(false); goBack(); }, 1500);
  };

  useInput((input, key) => {
    if (key.escape) { goBack(); return; }
    if (key.tab || key.downArrow) { setFocusIdx(i => Math.min(i + 1, fields.length - 1)); return; }
    if (key.upArrow) { setFocusIdx(i => Math.max(0, i - 1)); return; }
  });

  return (
    <Box flexDirection="column" padding={1}>
      <Box marginBottom={1}><Text bold color="cyan">{'⚙️ '}Settings — .env</Text></Box>
      {fields.map((f, i) => {
        const isFocused = i === focusIdx;
        return (
          <Box key={f.key} flexDirection="column" marginBottom={0}>
            <Box height={1}><Text color={isFocused ? 'cyan' : undefined}>{isFocused ? '▸' : ' '} {f.label}: {!isFocused ? f.current.slice(0, 20) + (f.current.length > 20 ? '...' : '') : ''}</Text></Box>
            {isFocused && (
              <Box marginLeft={2} borderStyle="single" borderColor="cyan" paddingX={1}>
                <TextInput value={f.current} onChange={f.setter} onSubmit={() => {
                  if (focusIdx < fields.length - 1) setFocusIdx(i => i + 1);
                  else handleSave();
                }} />
              </Box>
            )}
          </Box>
        );
      })}
      <Box marginTop={1}>
        <Text dimColor>{saved ? '✅ Saved! Restart needed for changes to take effect.' : 'Tab/↑↓:切换 Enter:确认当前项最后一个项确认后保存 Esc:取消'}</Text>
      </Box>
    </Box>
  );
}
