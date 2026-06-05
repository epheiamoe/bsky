import type { AIConfig } from '@bsky/core';

const CONFIG_KEY = 'bsky_app_config';

export interface AppConfig {
  aiConfig: AIConfig;
  targetLang: string;
  translateMode: 'simple' | 'json';
  darkMode: boolean;
  /** CVD-friendly color palette — replaces red/green/yellow with magenta/teal/amber */
  cvdMode: boolean;
  /** Fill single images to fixed height (true) or show at original aspect ratio (false) */
  singleImageFill: boolean;
  thinkingEnabled: boolean;
  visionEnabled: boolean;
  /** Per-provider API keys. Key = provider ID (e.g., 'deepseek', 'mistral') */
  apiKeys: Record<string, string>;
  /** Per-scenario model overrides. Empty string = use aiConfig.model */
  scenarioModels: {
    aiChat: string;
    translate: string;
    polish: string;
    /** Vision model override for generating ALT text on images. Only vision-capable models. */
    imageDescription: string;
  };
  /** Enabled widget IDs (right panel) */
  enabledWidgets: string[];
  /** Custom AI system prompt appended to every AI chat */
  customSystemPrompt?: string;
  /** User pronouns for AI reference. ''=skip injection, 'neutral'=use neutral terms, any other value=use as-is */
  userPronouns?: string;
  /** Post preview line count in feed timeline */
  postPreviewLines: number;
  /** Quoted post preview line count */
  quotedPreviewLines: number;
  /** Thread post preview line count */
  threadPreviewLines: number;
  /** Max posts to cache per feed in memory (sliding window). 0 = unlimited. */
  feedCacheLimit: number;
}

const DEFAULT_CONFIG: AppConfig = {
  aiConfig: {
    apiKey: '',
    baseUrl: 'https://api.deepseek.com',
    model: 'deepseek-v4-flash',
  },
  targetLang: 'zh',
  translateMode: 'simple',
  darkMode: false,
  cvdMode: false,
  singleImageFill: true,
  thinkingEnabled: true,
  visionEnabled: false,
  apiKeys: {},
  scenarioModels: {
    aiChat: '',
    translate: '',
    polish: '',
    imageDescription: '',
  },
  enabledWidgets: [],
  postPreviewLines: 10,
  quotedPreviewLines: 8,
  threadPreviewLines: 8,
  feedCacheLimit: 1000,
};

export function getAppConfig(): AppConfig {
  try {
    const raw = localStorage.getItem(CONFIG_KEY);
    if (!raw) {
      // First launch: detect system dark mode preference
      const prefersDark = typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches;
      return { ...DEFAULT_CONFIG, darkMode: prefersDark };
    }
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
