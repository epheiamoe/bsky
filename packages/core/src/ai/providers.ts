// ── Multi-Provider Registry ──

export interface ModelInfo {
  id: string;           // API identifier (e.g., 'deepseek-v4-flash')
  label: string;        // Human-readable label
  /** Supports thinking/reasoning visibility in streaming (e.g., delta.reasoning_content) */
  thinking: boolean;
  /** Supports vision / image input (multi-modal with image_url ContentBlocks) */
  vision: boolean;
}

export interface ProviderInfo {
  id: string;           // Internal key (e.g., 'deepseek', 'mistral')
  label: string;        // UI label (e.g., 'DeepSeek')
  baseUrl: string;      // Default API endpoint (without trailing /v1)
  models: ModelInfo[];
  /** How reasoning content is delivered in SSE streaming:
   *  - 'reasoning_content': delta.reasoning_content string (DeepSeek, xAI grok-4.3)
   *  - 'structured_content': delta.content as array [{type:'thinking',thinking:[{text:'...'}]}] (Mistral)
   *  - 'none': no reasoning content exposed
   */
  reasoningStyle: 'reasoning_content' | 'structured_content' | 'none';
}

export const PROVIDERS: ProviderInfo[] = [
  {
    id: 'deepseek',
    label: 'DeepSeek',
    baseUrl: 'https://api.deepseek.com',
    reasoningStyle: 'reasoning_content',
    models: [
      { id: 'deepseek-v4-flash', label: 'DeepSeek V4 Flash', thinking: true, vision: false },
      { id: 'deepseek-v4-pro', label: 'DeepSeek V4 Pro', thinking: true, vision: false },
    ],
  },
  {
    id: 'mistral',
    label: 'Mistral',
    baseUrl: 'https://api.mistral.ai',
    reasoningStyle: 'structured_content',
    models: [
      { id: 'mistral-small-latest', label: 'Mistral Small (24B)', thinking: true, vision: true },
      { id: 'pixtral-large-latest', label: 'Pixtral Large (多模态)', thinking: false, vision: true },
      { id: 'mistral-medium-latest', label: 'Mistral Medium (128B)', thinking: false, vision: true },
      { id: 'ministral-3b-latest', label: 'Ministral 3B (最快)', thinking: false, vision: false },
    ],
  },
];

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
