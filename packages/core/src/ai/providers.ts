// ── Multi-Provider Registry ──
// Default config lives in providers.json for easy editing.
// The TS interface ensures type safety; users edit the JSON file.

import providerData from './providers.json';

export interface ModelInfo {
  id: string;
  label: string;
  thinking: boolean;
  vision: boolean;
}

export interface ProviderInfo {
  id: string;
  label: string;
  baseUrl: string;
  models: ModelInfo[];
  reasoningStyle: 'reasoning_content' | 'structured_content' | 'none';
}

export const PROVIDERS: ProviderInfo[] = providerData as ProviderInfo[];

// ── Helpers ──

export function getProviderById(id: string): ProviderInfo | undefined {
  return PROVIDERS.find(p => p.id === id);
}

export function getProviderByBaseUrl(baseUrl: string): ProviderInfo | undefined {
  const clean = baseUrl.replace(/\/+$/, '');
  return PROVIDERS.find(p => p.baseUrl.replace(/\/+$/, '') === clean);
}

export function getModelInfo(providerId: string, modelId: string): ModelInfo | undefined {
  const provider = getProviderById(providerId);
  if (!provider) return undefined;
  return provider.models.find(m => m.id === modelId);
}

export function cleanBaseUrl(baseUrl: string): string {
  return baseUrl
    .replace(/\/v1\/chat\/completions\/?$/, '')
    .replace(/\/v1\/?$/, '')
    .replace(/\/+$/, '');
}

export function isCustomModel(providerId: string, modelId: string): boolean {
  const info = getModelInfo(providerId, modelId);
  return !info; // If not in the registry, it's a custom model
}

export function shouldSendThinkingParam(providerId: string): boolean {
  // Only DeepSeek uses the non-standard thinking parameter
  return providerId === 'deepseek';
}
