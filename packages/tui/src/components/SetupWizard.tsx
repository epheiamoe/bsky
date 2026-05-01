import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';
import TextInput from 'ink-text-input';
import { useI18n } from '@bsky/app';
import type { Locale } from '@bsky/app';

export interface SetupConfig {
  blueskyHandle: string;
  blueskyPassword: string;
  llmApiKey: string;
  llmBaseUrl: string;
  llmModel: string;
  llmThinkingEnabled: boolean;
  llmVisionEnabled: boolean;
  locale: string;
}

interface SetupWizardProps {
  onComplete: (config: SetupConfig) => void;
}

interface Field {
  key: keyof SetupConfig;
  labelKey: string;
  default?: string;
  isPassword?: boolean;
  validate?: (value: string) => string | null;
}

const FIELDS: Field[] = [
  { key: 'blueskyHandle', labelKey: 'setup.blueskyHandle', validate: (v) => !v.trim() ? 'Required' : null },
  { key: 'blueskyPassword', labelKey: 'setup.blueskyPassword', isPassword: true, validate: (v) => !v.trim() ? 'Required' : null },
  { key: 'llmApiKey', labelKey: 'setup.llmApiKey', isPassword: true },
  { key: 'llmBaseUrl', labelKey: 'setup.llmBaseUrl', default: 'https://api.deepseek.com' },
  { key: 'llmModel', labelKey: 'setup.llmModel', default: 'deepseek-v4-flash' },
  { key: 'llmThinkingEnabled', labelKey: 'setup.thinkMode', default: 'true', validate: (v) => {
    const trimmed = v.trim().toLowerCase();
    return ['true', 'false', 'yes', 'no'].includes(trimmed) ? null : 'Must be true/false/yes/no';
  }},
  { key: 'llmVisionEnabled', labelKey: 'setup.visionMode', default: 'false', validate: (v) => {
    const trimmed = v.trim().toLowerCase();
    return ['true', 'false', 'yes', 'no'].includes(trimmed) ? null : 'Must be true/false/yes/no';
  }},
  { key: 'locale', labelKey: 'setup.locale', default: 'zh', validate: (v) => {
    const trimmed = v.trim().toLowerCase();
    return ['zh', 'en', 'ja'].includes(trimmed) ? null : 'Must be zh, en, or ja';
  }},
];

export function SetupWizard({ onComplete }: SetupWizardProps) {
  const { t, setLocale, locale } = useI18n();
  const [values, setValues] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {};
    for (const f of FIELDS) init[f.key] = f.default ?? '';
    return init;
  });
  const [focusIndex, setFocusIndex] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const focusedField = FIELDS[focusIndex]!;
  const isLastField = focusIndex === FIELDS.length - 1;

  const handleFieldSubmit = (val: string) => {
    const trimmed = val.trim();
    const newValues = { ...values, [focusedField.key]: trimmed };
    setValues(newValues);

    // Validate
    if (focusedField.validate) {
      const err = focusedField.validate(trimmed);
      if (err) {
        setError(err);
        return;
      }
    }
    setError(null);

    // If locale field was just submitted, update the i18n locale
    if (focusedField.key === 'locale') {
      const loc = trimmed.toLowerCase();
      if (loc === 'zh' || loc === 'en' || loc === 'ja') {
        setLocale(loc as Locale);
      }
    }

    if (isLastField) {
      // Submit
      const config: SetupConfig = {
        blueskyHandle: newValues.blueskyHandle || '',
        blueskyPassword: newValues.blueskyPassword || '',
        llmApiKey: newValues.llmApiKey || '',
        llmBaseUrl: newValues.llmBaseUrl || '',
        llmModel: newValues.llmModel || '',
        llmThinkingEnabled: (newValues.llmThinkingEnabled || 'true').toLowerCase() !== 'false' && (newValues.llmThinkingEnabled || 'true').toLowerCase() !== 'no',
        llmVisionEnabled: (newValues.llmVisionEnabled || 'false').toLowerCase() === 'true' || (newValues.llmVisionEnabled || 'false').toLowerCase() === 'yes',
        locale: newValues.locale || 'zh',
      };
      onComplete(config);
    } else {
      // Move to next field
      setFocusIndex(i => Math.min(i + 1, FIELDS.length - 1));
    }
  };

  useInput((input, key) => {
    if (key.tab || key.downArrow) {
      setFocusIndex(i => Math.min(i + 1, FIELDS.length - 1));
      return;
    }
    if (key.upArrow) {
      setFocusIndex(i => Math.max(0, i - 1));
      return;
    }
  });

  return (
    <Box flexDirection="column" padding={1}>
      <Box marginBottom={1}>
        <Text bold color="cyanBright">{'🦋 Bluesky TUI — '}{t('setup.title').replace('🦋 Bluesky TUI — ', '')}</Text>
      </Box>
      <Box marginBottom={1}>
        <Text dimColor>{t('setup.welcome')}</Text>
      </Box>

      {FIELDS.map((field, i) => {
        const isFocused = i === focusIndex;
        const isDone = i < focusIndex;
        const value = values[field.key] ?? '';

        return (
          <Box key={field.key} flexDirection="column" marginBottom={0}>
            <Box height={1}>
              <Text color={isFocused ? 'cyanBright' : isDone ? 'green' : undefined} bold={isFocused}>
                {isDone ? '✓' : isFocused ? '▸' : ' '}
                {' '}{t(field.labelKey)}
                {field.isPassword && isDone && value ? ': ****' : ''}
                {!field.isPassword && isDone ? ': ' + value : ''}
                {!isDone && field.default && !isFocused ? ` (${field.default})` : ''}
              </Text>
            </Box>
            {isFocused && (
              <Box marginLeft={2} borderStyle="single" borderColor="cyan" paddingX={1}>
                <Text color="cyan">{'▸ '}</Text>
                <TextInput
                  value={value}
                  onChange={(v) => setValues(prev => ({ ...prev, [field.key]: v }))}
                  onSubmit={handleFieldSubmit}
                  placeholder={field.default ? t('action.save') + ' (' + field.default + ')' : ''}
                />
              </Box>
            )}
          </Box>
        );
      })}

      {error && (
        <Box marginTop={1}>
          <Text color="red">{'⚠ '}{error}</Text>
        </Box>
      )}

      <Box marginTop={1}>
        <Text dimColor>{t('setup.navigate')}</Text>
      </Box>
    </Box>
  );
}
