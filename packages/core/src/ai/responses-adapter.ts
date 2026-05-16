import type { ToolDescriptor } from './tools.js';
import type {
  ApiAdapter,
  AIConfig,
  ChatMessage,
  ContentBlock,
  RequestSpec,
  ParsedResponse,
  StreamProcessor,
} from './adapter.js';
import { registerAdapter } from './adapter.js';
import { getModelInfo } from './providers.js';

// ── Responses API Stream Processor ──

class ResponsesApiStreamProcessor implements StreamProcessor {
  private toolCallAccum = new Map<string, { id: string; name: string; arguments: string }>();
  private callIdOrder: string[] = [];
  private fullContent = '';
  private reasoningContent = '';
  private lastEventType: string | null = null;

  feed(chunkText: string): Array<{ type: 'token' | 'thinking'; content: string }> {
    const events: Array<{ type: 'token' | 'thinking'; content: string }> = [];
    const lines = chunkText.split('\n');
    for (const line of lines) {
      if (line.startsWith('event: ')) {
        this.lastEventType = line.slice(7).trim();
        continue;
      }
      if (!line.startsWith('data: ')) continue;
      const data = line.slice(6);
      try {
        const parsed = JSON.parse(data);
        if (parsed.type === 'error') continue;
        const eventType = this.lastEventType || parsed.type || '';
        this.lastEventType = null;

        if (eventType === 'response.output_text.delta') {
          const delta = parsed.delta || '';
          this.fullContent += delta;
          events.push({ type: 'token', content: delta });
        } else if (eventType === 'response.reasoning_summary_text.delta') {
          const text = parsed.delta || '';
          this.reasoningContent += text;
          events.push({ type: 'thinking', content: text });
        } else if (eventType === 'response.output_item.added') {
          const item = parsed.item || parsed.output_item || {};
          if (item.type === 'function_call') {
            const callId = item.call_id || item.id || crypto.randomUUID();
            if (!this.toolCallAccum.has(callId)) {
              this.toolCallAccum.set(callId, { id: callId, name: item.name || '', arguments: item.arguments || '' });
              this.callIdOrder.push(callId);
            }
          }
        } else if (eventType === 'response.function_call_arguments.delta') {
          const callId = parsed.call_id;
          const delta = parsed.delta || '';
          if (callId && this.toolCallAccum.has(callId)) {
            const acc = this.toolCallAccum.get(callId)!;
            acc.arguments += delta;
          }
        } else if (eventType === 'response.function_call_arguments.done') {
          const callId = parsed.call_id;
          if (callId && this.toolCallAccum.has(callId)) {
            const acc = this.toolCallAccum.get(callId)!;
            if (parsed.name) acc.name = parsed.name;
            if (parsed.arguments) acc.arguments = parsed.arguments;
          }
        }
      } catch { /* skip unparseable chunks */ }
    }
    return events;
  }

  getToolCalls(): Array<{ id: string; name: string; arguments: string }> {
    return this.callIdOrder
      .map(id => this.toolCallAccum.get(id)!)
      .filter(Boolean);
  }

  getFullContent(): string { return this.fullContent; }
  getReasoningContent(): string { return this.reasoningContent; }
}

// ── Responses API Adapter ──

class ResponsesApiAdapter implements ApiAdapter {
  readonly apiType = 'responses';

  buildRequest(
    config: AIConfig,
    messages: ChatMessage[],
    tools: ToolDescriptor[],
    stream: boolean,
    overrides?: { temperature?: number; maxTokens?: number; model?: string },
  ): RequestSpec {
    const instructions = messages.find(m => m.role === 'system')?.content || '';

    const input: unknown[] = [];
    const nonSystem = messages.filter(m => m.role !== 'system');
    for (const m of nonSystem) {
      if (m.role === 'tool') {
        input.push({
          type: 'function_call_output',
          call_id: m.tool_call_id,
          output: m.content,
        });
      } else if (m.role === 'assistant' && m.tool_calls && m.tool_calls.length > 0) {
        if (m.content) {
          input.push({ role: 'assistant', content: m.content });
        }
        for (const tc of m.tool_calls) {
          input.push({
            type: 'function_call',
            call_id: tc.id,
            name: tc.function.name,
            arguments: tc.function.arguments,
          });
        }
      } else {
        const content = convertContent(m.content);
        input.push({ role: m.role, content });
      }
    }

    const body: Record<string, unknown> = {
      model: overrides?.model || config.model,
      input,
      temperature: overrides?.temperature ?? 0.7,
      max_output_tokens: overrides?.maxTokens ?? 4096,
    };

    if (instructions) body.instructions = instructions;
    if (stream) body.stream = true;

    // Reasoning effort for models that support it (OpenAI o3/o4-mini, xAI grok-4.x)
    const modelInfo = config.provider ? getModelInfo(config.provider, overrides?.model || config.model) : undefined;
    if (modelInfo?.supportsReasoningEffort) {
      body.reasoning = { effort: (config as any).reasoningEffort || 'medium' };
    }

    if (tools.length > 0) {
      body.tools = tools.map(t => ({
        type: 'function',
        name: t.definition.name,
        description: t.definition.description,
        parameters: t.definition.inputSchema as Record<string, unknown>,
      }));
      body.tool_choice = 'auto';
    }

    return {
      url: `${cleanBaseUrl(config.baseUrl)}/v1/responses`,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.apiKey}`,
      },
      body,
    };
  }

  parseResponse(raw: unknown): ParsedResponse {
    const data = raw as any;
    const output: any[] = data?.output || [];

    let content = '';
    let reasoningContent: string | undefined;
    const toolCalls: Array<{ id: string; name: string; arguments: string }> = [];

    for (const item of output) {
      if (item.type === 'message') {
        for (const part of item.content || []) {
          if (part.type === 'output_text') {
            content += part.text || '';
          }
        }
      } else if (item.type === 'reasoning') {
        const summaries = item.summary || [];
        const texts = summaries
          .filter((s: any) => s.type === 'summary_text')
          .map((s: any) => s.text)
          .filter(Boolean);
        if (texts.length > 0) {
          reasoningContent = (reasoningContent || '') + texts.join('\n');
        }
      } else if (item.type === 'function_call') {
        toolCalls.push({
          id: item.call_id,
          name: item.name,
          arguments: item.arguments || '{}',
        });
      }
    }

    if (!content && data?.output_text) {
      content = data.output_text;
    }

    return {
      content,
      reasoningContent: reasoningContent || undefined,
      toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
    };
  }

  createStreamProcessor(): StreamProcessor {
    return new ResponsesApiStreamProcessor();
  }
}

// ── Helpers ──

function convertContent(content: string | ContentBlock[]): string | unknown[] {
  if (typeof content === 'string') return content;
  return content.map(block => {
    if (block.type === 'image_url' && block.image_url) {
      return { type: 'input_image', image_url: block.image_url.url };
    }
    return { type: 'text', text: block.text || '' };
  });
}

function cleanBaseUrl(baseUrl: string): string {
  return baseUrl
    .replace(/\/v1\/chat\/completions\/?$/, '')
    .replace(/\/v1\/responses\/?$/, '')
    .replace(/\/v1\/?$/, '')
    .replace(/\/+$/, '');
}

// Self-register on import
const adapter = new ResponsesApiAdapter();
registerAdapter('responses', adapter);

export { ResponsesApiAdapter };
