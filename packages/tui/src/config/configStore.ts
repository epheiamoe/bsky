import { existsSync, readFileSync, writeFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const CONFIG_FILENAME = 'bsky-tui.config.json';

export interface TuiConfig {
  targetLang: string;
  translateMode: 'simple' | 'json';
  aiConfig: {
    baseUrl: string;
    model: string;
    provider?: string;
    reasoningStyle?: 'reasoning_content' | 'structured_content' | 'none';
    thinkingEnabled?: boolean;
    visionEnabled?: boolean;
    customSystemPrompt?: string;
  };
  /** Per-provider API keys. Key = provider ID (e.g., 'deepseek', 'mistral') */
  apiKeys: Record<string, string>;
  /** Per-scenario model overrides. "provider/model" format. Empty = use aiConfig. */
  scenarioModels: {
    aiChat: string;
    translate: string;
    polish: string;
    imageDescription: string;
  };
  /** Custom emojis for DM reactions */
  dmEmojis?: string[];
}

export const DEFAULT_TUI_CONFIG: TuiConfig = {
  targetLang: 'zh',
  translateMode: 'simple',
  aiConfig: {
    baseUrl: 'https://api.deepseek.com',
    model: 'deepseek-v4-flash',
    provider: 'deepseek',
    reasoningStyle: 'reasoning_content',
    thinkingEnabled: true,
    visionEnabled: false,
  },
  apiKeys: {},
  scenarioModels: {
    aiChat: '',
    translate: '',
    polish: '',
    imageDescription: '',
  },
};

function resolveConfigPath(): string {
  // Mirrors .env path resolution: monorepo root first, then CWD
  const monoRoot = path.resolve(__dirname, '..', '..', '..', '..', CONFIG_FILENAME);
  if (existsSync(monoRoot)) return monoRoot;
  const cwd = path.resolve(process.cwd(), CONFIG_FILENAME);
  if (existsSync(cwd)) return cwd;
  // Default: save to CWD when creating new config
  return cwd;
}

export function getTuiConfig(): TuiConfig {
  try {
    const configPath = resolveConfigPath();
    if (!existsSync(configPath)) return structuredClone(DEFAULT_TUI_CONFIG);
    const raw = readFileSync(configPath, 'utf-8');
    const parsed = JSON.parse(raw) as Partial<TuiConfig>;
    const defaults = structuredClone(DEFAULT_TUI_CONFIG);
    const merged: TuiConfig = {
      ...defaults,
      ...parsed,
      aiConfig: { ...defaults.aiConfig, ...(parsed.aiConfig || {}) },
      scenarioModels: { ...defaults.scenarioModels, ...(parsed.scenarioModels || {}) },
      apiKeys: { ...defaults.apiKeys, ...(parsed.apiKeys || {}) },
    };
    return merged;
  } catch {
    return structuredClone(DEFAULT_TUI_CONFIG);
  }
}

export function saveTuiConfig(config: TuiConfig): void {
  const configPath = resolveConfigPath();
  writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n', 'utf-8');
}

export function updateTuiConfig(partial: Partial<TuiConfig>): TuiConfig {
  const current = getTuiConfig();
  const updated = { ...current, ...partial, aiConfig: { ...current.aiConfig, ...(partial.aiConfig || {}) } };
  // Deep merge scenario models
  if (partial.scenarioModels) {
    updated.scenarioModels = { ...current.scenarioModels, ...partial.scenarioModels };
  }
  // Deep merge apiKeys
  if (partial.apiKeys) {
    updated.apiKeys = { ...current.apiKeys, ...partial.apiKeys };
  }
  saveTuiConfig(updated);
  return updated;
}

// ── Helpers ──

function structuredClone<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj));
}
