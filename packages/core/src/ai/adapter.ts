import type { ToolDescriptor } from './tools.js';
import { getProviderById, getModelInfo } from './providers.js';

// ── Shared types ──

export interface ContentBlock {
  type: 'text' | 'image_url';
  text?: string;
  image_url?: { url: string; detail?: 'auto' | 'low' | 'high' };
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | ContentBlock[];
  name?: string;
  tool_call_id?: string;
  tool_calls?: ToolCall[];
  reasoning_content?: string;
}

export interface ToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
}

export type AIConfig = {
  apiKey: string;
  baseUrl: string;
  model: string;
  thinkingEnabled?: boolean;
  visionEnabled?: boolean;
  provider?: string;
  reasoningStyle?: 'reasoning_content' | 'structured_content' | 'none';
  apiType?: 'chat' | 'responses';
  reasoningEffort?: 'none' | 'low' | 'medium' | 'high';
  customSystemPrompt?: string;
};

export interface RequestSpec {
  url: string;
  headers: Record<string, string>;
  body: unknown;
}

export interface ParsedResponse {
  content: string;
  reasoningContent?: string;
  toolCalls?: Array<{ id: string; name: string; arguments: string }>;
}

export interface StreamProcessor {
  feed(chunkText: string): Array<{ type: 'token' | 'thinking'; content: string }>;
  getToolCalls(): Array<{ id: string; name: string; arguments: string }>;
  getFullContent(): string;
  getReasoningContent(): string;
}

export interface ApiAdapter {
  readonly apiType: string;
  buildRequest(
    config: AIConfig,
    messages: ChatMessage[],
    tools: ToolDescriptor[],
    stream: boolean,
    overrides?: { temperature?: number; maxTokens?: number; model?: string },
  ): RequestSpec;
  parseResponse(raw: unknown): ParsedResponse;
  createStreamProcessor(): StreamProcessor;
}

// ── Chat Completions ──

export class ChatCompletionsStreamProcessor implements StreamProcessor {
  private toolCallAccum = new Map<number, { id: string; name: string; arguments: string }>();
  private fullContent = '';
  private reasoningContent = '';

  feed(chunkText: string): Array<{ type: 'token' | 'thinking'; content: string }> {
    const events: Array<{ type: 'token' | 'thinking'; content: string }> = [];
    const lines = chunkText.split('\n');
    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;
      const data = line.slice(6);
      if (data === '[DONE]') continue;
      try {
        const chunk = JSON.parse(data);
        const delta = chunk.choices?.[0]?.delta;
        if (!delta) continue;

        if (delta.reasoning_content) {
          this.reasoningContent += delta.reasoning_content;
          events.push({ type: 'thinking', content: delta.reasoning_content });
        }

        if (delta.content) {
          if (Array.isArray(delta.content)) {
            for (const block of delta.content) {
              if (block.type === 'thinking' && block.thinking) {
                for (const t of block.thinking) {
                  if (t.type === 'text' && t.text) {
                    this.reasoningContent += t.text;
                    events.push({ type: 'thinking', content: t.text });
                  }
                }
              } else if (block.type === 'text' && block.text) {
                this.fullContent += block.text;
                events.push({ type: 'token', content: block.text });
              }
            }
          } else {
            this.fullContent += delta.content;
            events.push({ type: 'token', content: delta.content });
          }
        }

        if (delta.tool_calls) {
          for (const tc of delta.tool_calls) {
            const idx = tc.index;
            if (!this.toolCallAccum.has(idx)) {
              this.toolCallAccum.set(idx, { id: tc.id || '', name: tc.function?.name || '', arguments: '' });
            }
            const acc = this.toolCallAccum.get(idx)!;
            if (tc.id) acc.id = tc.id;
            if (tc.function?.name) acc.name = tc.function.name;
            if (tc.function?.arguments) acc.arguments += tc.function.arguments;
          }
        }
      } catch { /* skip unparseable chunks */ }
    }
    return events;
  }

  getToolCalls(): Array<{ id: string; name: string; arguments: string }> {
    return Array.from(this.toolCallAccum.entries())
      .sort(([a], [b]) => a - b)
      .map(([, v]) => ({
        id: v.id,
        name: v.name,
        arguments: v.arguments,
      }));
  }

  getFullContent(): string { return this.fullContent; }
  getReasoningContent(): string { return this.reasoningContent; }
}

export class ChatCompletionsAdapter implements ApiAdapter {
  readonly apiType = 'chat';

  buildRequest(
    config: AIConfig,
    messages: ChatMessage[],
    tools: ToolDescriptor[],
    stream: boolean,
    overrides?: { temperature?: number; maxTokens?: number; model?: string },
  ): RequestSpec {
    const effectiveModel = overrides?.model || config.model;
    const body: Record<string, unknown> = {
      model: effectiveModel,
      messages,
      temperature: overrides?.temperature ?? 0.7,
      max_tokens: overrides?.maxTokens ?? 4096,
    };

    if (stream) body.stream = true;

    // ── Provider-specific parameter handling ──
    const modelInfo = config.provider ? getModelInfo(config.provider, effectiveModel) : undefined;

    // Fixed params (immutable per model, e.g. Kimi K2.6/K2.5)
    if (modelInfo?.fixedParams) {
      for (const [key, val] of Object.entries(modelInfo.fixedParams)) {
        body[key] = val;
      }
    }

    // Thinking param: DeepSeek and Kimi use { type: "enabled" | "disabled" }
    if (config.provider && shouldSendThinkingParam(config.provider)) {
      body.thinking = { type: config.thinkingEnabled !== false ? 'enabled' : 'disabled' };
      // Kimi K2.6/K2.5: temperature varies with thinking mode
      if (config.provider.startsWith('kimi-') && modelInfo) {
        body.temperature = config.thinkingEnabled !== false ? 1.0 : 0.6;
      }
    }

    // Mistral structured content reasoning
    if (config.reasoningStyle === 'structured_content' && config.thinkingEnabled !== false) {
      body.reasoning_effort = 'high';
    }

    if (tools.length > 0) {
      body.tools = tools.map(t => ({
        type: 'function',
        function: {
          name: t.definition.name,
          description: t.definition.description,
          parameters: t.definition.inputSchema as Record<string, unknown>,
        },
      }));
      body.tool_choice = 'auto';
    }

    return {
      url: `${cleanBaseUrl(config.baseUrl)}/v1/chat/completions`,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.apiKey}`,
      },
      body,
    };
  }

  parseResponse(raw: unknown): ParsedResponse {
    const data = raw as any;
    const choice = data?.choices?.[0];
    if (!choice) return { content: '' };

    const message = choice.message || {};
    const rawContent = message.content;
    // Some providers return message.content as an array of content blocks
    // (e.g., [{type: 'thinking', thinking: [...], closed: true}, {type: 'text', text: '...'}]).
    // Arrays are truthy so `rawContent || ''` passes them through as-is. This caused
    // React Error #31 when the object was rendered directly in the Polish Widget.
    let content: string;
    if (Array.isArray(rawContent)) {
      content = rawContent
        .map((block: any) => {
          if (block.type === 'text' && typeof block.text === 'string') return block.text;
          if (block.type === 'thinking' && Array.isArray(block.thinking)) {
            return block.thinking
              .map((t: any) => (t.type === 'text' ? t.text ?? '' : ''))
              .join('');
          }
          return '';
        })
        .join('');
    } else if (typeof rawContent === 'string') {
      content = rawContent;
    } else {
      content = String(rawContent ?? '');
    }
    const reasoningContent = message.reasoning_content;

    let toolCalls: ParsedResponse['toolCalls'];
    if (message.tool_calls && message.tool_calls.length > 0) {
      toolCalls = message.tool_calls.map((tc: any) => ({
        id: tc.id,
        name: tc.function.name,
        arguments: tc.function.arguments,
      }));
    }

    return { content, reasoningContent, toolCalls };
  }

  createStreamProcessor(): StreamProcessor {
    return new ChatCompletionsStreamProcessor();
  }
}

// ── Utility ──

function shouldSendThinkingParam(providerId: string): boolean {
  return providerId === 'deepseek' || providerId.startsWith('kimi-');
}

function cleanBaseUrl(baseUrl: string): string {
  return baseUrl
    .replace(/\/v1\/chat\/completions\/?$/, '')
    .replace(/\/v1\/?$/, '')
    .replace(/\/+$/, '');
}

// ── Adapter factory ──

const _adapters = new Map<string, ApiAdapter>();
_adapters.set('chat', new ChatCompletionsAdapter());

export function getAdapter(apiType?: string): ApiAdapter {
  const type = apiType || 'chat';
  return _adapters.get(type) ?? _adapters.get('chat')!;
}

export function registerAdapter(apiType: string, adapter: ApiAdapter): void {
  _adapters.set(apiType, adapter);
}
