import type { AIConfig } from '@bsky/core';

const CONFIG_KEY = 'bsky_app_config';

export interface AppConfig {
  aiConfig: AIConfig;
  targetLang: string;
  darkMode: boolean;
}

const DEFAULT_CONFIG: AppConfig = {
  aiConfig: {
    apiKey: '',
    baseUrl: 'https://api.deepseek.com',
    model: 'deepseek-chat',
  },
  targetLang: 'zh',
  darkMode: false,
};

export function getAppConfig(): AppConfig {
  try {
    const raw = localStorage.getItem(CONFIG_KEY);
    if (!raw) return { ...DEFAULT_CONFIG };
    return { ...DEFAULT_CONFIG, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}

export function saveAppConfig(config: AppConfig): void {
  localStorage.setItem(CONFIG_KEY, JSON.stringify(config));
}

export function updateAppConfig(partial: Partial<AppConfig>): AppConfig {
  const current = getAppConfig();
  const updated = { ...current, ...partial };
  saveAppConfig(updated);
  return updated;
}
