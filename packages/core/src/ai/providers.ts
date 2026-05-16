// ── Multi-Provider Registry ──

import providerData from './providers.json';

export interface ModelInfo {
  id: string;
  label: string;
  thinking: boolean;
  vision: boolean;
  video?: boolean;
}

export interface ProviderInfo {
  id: string;
  label: string;
  baseUrl: string;
  models: ModelInfo[];
  reasoningStyle: 'reasoning_content' | 'structured_content' | 'none';
  apiType?: 'chat' | 'responses';
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
  return !info;
}

export function shouldSendThinkingParam(providerId: string): boolean {
  return providerId === 'deepseek';
}
