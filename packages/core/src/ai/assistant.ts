import type { ToolDescriptor } from '../at/tools.js';

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
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

export interface ChatCompletionRequest {
  model: string;
  messages: ChatMessage[];
  tools?: Array<{
    type: 'function';
    function: {
      name: string;
      description: string;
      parameters: Record<string, unknown>;
    };
  }>;
  tool_choice?: 'auto' | 'none' | { type: 'function'; function: { name: string } };
  temperature?: number;
  max_tokens?: number;
  stream?: boolean;
}

export interface ChatCompletionChoice {
  index: number;
  message: {
    role: 'assistant';
    content: string | null;
    tool_calls?: ToolCall[];
    reasoning_content?: string;
  };
  finish_reason: 'stop' | 'tool_calls' | 'length';
}

export interface ChatCompletionResponse {
  id: string;
  object: 'chat.completion';
  created: number;
  model: string;
  choices: ChatCompletionChoice[];
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

export type AIConfig = {
  apiKey: string;
  baseUrl: string;
  model: string;
};

const DEFAULT_CONFIG: Partial<AIConfig> = {
  baseUrl: 'https://api.deepseek.com',
  model: 'deepseek-v4-flash',
};

export class AIAssistant {
  private config: AIConfig;
  private tools: ToolDescriptor[] = [];
  private toolMap: Map<string, ToolDescriptor> = new Map();
  private messages: ChatMessage[] = [];

  constructor(config?: Partial<AIConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config } as AIConfig;
  }

  setTools(tools: ToolDescriptor[]): void {
    this.tools = tools;
    this.toolMap.clear();
    for (const tool of tools) {
      this.toolMap.set(tool.definition.name, tool);
    }
  }

  getToolDefinitions(): Array<{
    name: string;
    description: string;
    inputSchema: Record<string, unknown>;
  }> {
    return this.tools.map((t) => t.definition);
  }

  getToolMap(): Map<string, ToolDescriptor> {
    return this.toolMap;
  }

  addSystemMessage(content: string): void {
    this.messages.push({ role: 'system', content });
  }

  addUserMessage(content: string): void {
    this.messages.push({ role: 'user', content });
  }

  getMessages(): ChatMessage[] {
    return this.messages;
  }

  clearMessages(): void {
    this.messages = [];
  }

  loadMessages(msgs: ChatMessage[]): void {
    this.messages = [...msgs];
  }

  async sendMessage(content: string): Promise<{
    content: string;
    toolCallsExecuted: number;
    intermediateSteps: Array<{ type: 'tool_call' | 'tool_result' | 'assistant' | 'user'; content: string }>;
  }> {
    this.addUserMessage(content);

    const intermediateSteps: Array<{ type: 'tool_call' | 'tool_result' | 'assistant' | 'user'; content: string }> = [];
    let toolCallsExecuted = 0;
    const MAX_TOOL_ROUNDS = 10;

    for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
      const response = await this.makeRequest();

      const choice = response.choices[0];
      if (!choice) throw new Error('No response from AI');

      const message = choice.message;

      // Check for tool calls
      if (message.tool_calls && message.tool_calls.length > 0) {
        // Add assistant's tool call message
        this.messages.push({
          role: 'assistant',
          content: message.content || '',
          tool_calls: message.tool_calls,
          ...(message.reasoning_content ? { reasoning_content: message.reasoning_content } : {}),
        });

        for (const tc of message.tool_calls) {
          const toolName = tc.function.name;
          const toolArgs = JSON.parse(tc.function.arguments);
          const toolDesc = this.toolMap.get(toolName);

          intermediateSteps.push({
            type: 'tool_call',
            content: `🔧 Calling ${toolName}(${JSON.stringify(toolArgs)})`,
          });

          let toolResult: string;
          if (toolDesc) {
            try {
              toolResult = await toolDesc.handler(toolArgs);
            } catch (err) {
              toolResult = `Error executing tool: ${err instanceof Error ? err.message : String(err)}`;
            }
          } else {
            toolResult = `Unknown tool: ${toolName}`;
          }
          toolCallsExecuted++;

          intermediateSteps.push({
            type: 'tool_result',
            content: `Result from ${toolName}: ${toolResult.slice(0, 500)}${toolResult.length > 500 ? '...' : ''}`,
          });

          // Add tool result message
          this.messages.push({
            role: 'tool',
            content: toolResult,
            tool_call_id: tc.id,
          });
        }

        // Continue loop to get final response
        continue;
      }

      // No tool calls - final response
      const finalContent = message.content || '';
      this.messages.push({
        role: 'assistant',
        content: finalContent,
        ...(message.reasoning_content ? { reasoning_content: message.reasoning_content } : {}),
      });

      intermediateSteps.push({
        type: 'assistant',
        content: finalContent,
      });

      return {
        content: finalContent,
        toolCallsExecuted,
        intermediateSteps,
      };
    }

    throw new Error('Max tool calling rounds exceeded');
  }

  private async makeRequest(): Promise<ChatCompletionResponse> {
    // TODO: streaming support — set stream:true, use ReadableStream + SSE parser
    // to yield tokens in real-time instead of waiting for full response
    const body: ChatCompletionRequest = {
      model: this.config.model,
      messages: this.messages,
      temperature: 0.7,
      max_tokens: 4096,
    };

    // Only include tools if we have any
    if (this.tools.length > 0) {
      body.tools = this.tools.map((t) => ({
        type: 'function' as const,
        function: {
          name: t.definition.name,
          description: t.definition.description,
          parameters: t.definition.inputSchema as Record<string, unknown>,
        },
      }));
      body.tool_choice = 'auto';
    }

    const url = `${this.config.baseUrl}/v1/chat/completions`;

    let res: Response;
    try {
      res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.config.apiKey}`,
        },
        body: JSON.stringify(body),
      });
    } catch (e) {
      if (e instanceof TypeError && e.message === 'fetch failed') {
        throw new Error(`Network error: unable to reach LLM API at ${url}. Check LLM_BASE_URL and network. (${e.message})`);
      }
      throw e;
    }

    if (!res.ok) {
      const errorText = await res.text();
      throw new Error(`AI API error ${res.status}: ${errorText}`);
    }

    return res.json() as Promise<ChatCompletionResponse>;
  }

  /**
   * Send a message with streaming.
   * Yields intermediate steps (tool_call/tool_result) and tokens.
   */
  async *sendMessageStreaming(content: string): AsyncGenerator<{
    type: 'tool_call' | 'tool_result' | 'token' | 'done';
    content: string;
    toolName?: string;
  }> {
    this.addUserMessage(content);

    const MAX_TOOL_ROUNDS = 10;

    for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
      const body: ChatCompletionRequest = {
        model: this.config.model,
        messages: this.messages,
        temperature: 0.7,
        max_tokens: 4096,
        stream: true,
      };

      if (this.tools.length > 0) {
        body.tools = this.tools.map((t) => ({
          type: 'function' as const,
          function: {
            name: t.definition.name,
            description: t.definition.description,
            parameters: t.definition.inputSchema as Record<string, unknown>,
          },
        }));
        body.tool_choice = 'auto';
      }

      const url = `${this.config.baseUrl}/v1/chat/completions`;

      let res: Response;
      try {
        res = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${this.config.apiKey}`,
          },
          body: JSON.stringify(body),
        });
      } catch (e) {
        if (e instanceof TypeError && e.message === 'fetch failed') {
          throw new Error(`Network error: unable to reach LLM API at ${url}. Check LLM_BASE_URL and network. (${e.message})`);
        }
        throw e;
      }

      if (!res.ok) {
        const errorText = await res.text();
        throw new Error(`AI API error ${res.status}: ${errorText}`);
      }

      // Parse SSE stream
      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let fullContent = '';
      let reasoningContent = '';
      let toolCallAccum: Map<number, { id: string; name: string; arguments: string }> = new Map();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const text = decoder.decode(value, { stream: true });
        const lines = text.split('\n');

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const data = line.slice(6);
          if (data === '[DONE]') continue;

          try {
            const chunk = JSON.parse(data);
            const delta = chunk.choices?.[0]?.delta;
            if (!delta) continue;

            if (delta.reasoning_content) {
              reasoningContent += delta.reasoning_content;
            }

            if (delta.content) {
              fullContent += delta.content;
              yield { type: 'token', content: delta.content };
            }

            if (delta.tool_calls) {
              for (const tc of delta.tool_calls) {
                const idx = tc.index;
                if (!toolCallAccum.has(idx)) {
                  toolCallAccum.set(idx, { id: tc.id || '', name: tc.function?.name || '', arguments: '' });
                }
                const acc = toolCallAccum.get(idx)!;
                if (tc.id) acc.id = tc.id;
                if (tc.function?.name) acc.name = tc.function.name;
                if (tc.function?.arguments) acc.arguments += tc.function.arguments;
              }
            }
          } catch { /* skip unparseable chunks */ }
        }
      }

      // Check if we got tool calls
      if (toolCallAccum.size > 0) {
        const toolCalls = Array.from(toolCallAccum.entries())
          .sort(([a], [b]) => a - b)
          .map(([, v]) => ({
            id: v.id,
            type: 'function' as const,
            function: { name: v.name, arguments: v.arguments },
          }));

        this.messages.push({
          role: 'assistant',
          content: fullContent || '',
          tool_calls: toolCalls,
          ...(reasoningContent ? { reasoning_content: reasoningContent } : {}),
        });

        for (const tc of toolCalls) {
          const toolName = tc.function.name;
          const toolArgs = JSON.parse(tc.function.arguments);
          const toolDesc = this.toolMap.get(toolName);

          yield { type: 'tool_call', content: `${toolName}(${JSON.stringify(toolArgs)})`, toolName };

          let toolResult: string;
          if (toolDesc) {
            try {
              toolResult = await toolDesc.handler(toolArgs);
            } catch (err) {
              toolResult = `Error: ${err instanceof Error ? err.message : String(err)}`;
            }
          } else {
            toolResult = `Unknown tool: ${toolName}`;
          }

          yield { type: 'tool_result', content: toolResult.slice(0, 500), toolName };

          this.messages.push({
            role: 'tool',
            content: toolResult,
            tool_call_id: tc.id,
          });
        }
        // Continue loop for next round
        continue;
      }

      // No tool calls — done
      this.messages.push({
        role: 'assistant',
        content: fullContent,
        ...(reasoningContent ? { reasoning_content: reasoningContent } : {}),
      });
      yield { type: 'done', content: fullContent };
      return;
    }

    throw new Error('Max tool calling rounds exceeded');
  }
}

/**
 * Single-turn AI call without tools - for translation, polish, etc.
 */
export async function singleTurnAI(
  config: AIConfig,
  systemPrompt: string,
  userPrompt: string,
  temperature = 0.3,
  maxTokens = 2000,
): Promise<string> {
  const body = {
    model: config.model,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    temperature,
    max_tokens: maxTokens,
    stream: false,
  };

  const url = `${config.baseUrl}/v1/chat/completions`;

  let res: Response;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify(body),
    });
  } catch (e) {
    if (e instanceof TypeError && e.message === 'fetch failed') {
      throw new Error(`Network error: unable to reach LLM API at ${url}. Check LLM_BASE_URL and network. (${e.message})`);
    }
    throw e;
  }

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`AI API error ${res.status}: ${errorText}`);
  }

  const data = (await res.json()) as ChatCompletionResponse;
  return data.choices[0]?.message?.content ?? '';
}

/**
 * Translation result with optional source language detection.
 */
export interface TranslationResult {
  translated: string;
  sourceLang?: string; // ISO 639-1 code, or 'und' if unknown; only in 'json' mode
}

/**
 * Single-turn AI translation with retry and dual mode support.
 * - 'simple': plain text translation (current behavior)
 * - 'json': structured JSON output with source language detection
 *
 * Retries up to maxRetries times on empty content or network errors,
 * with exponential backoff.
 */
export async function translateText(
  config: AIConfig,
  text: string,
  targetLang: string,
  mode: 'simple' | 'json' = 'simple',
  maxRetries = 3,
): Promise<TranslationResult> {
  const LANG_LABELS: Record<string, string> = {
    zh: '中文', en: 'English', ja: '日本語', ko: '한국어', fr: 'Français', de: 'Deutsch', es: 'Español',
  };
  const langLabel = LANG_LABELS[targetLang] ?? targetLang;

  const systemPrompt = mode === 'json'
    ? `You are a translator. Translate the user's text to ${langLabel}. Output valid JSON with these keys: {"source_lang": "<ISO 639-1 code, use 'und' if unsure>", "translated": "<the translation>"}. Output ONLY the JSON object. The response must be a valid JSON object containing the word json.`
    : `Translate the following text to ${langLabel}. Keep the original meaning, output only the translation, no explanations.`;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const body: Record<string, unknown> = {
        model: config.model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: text },
        ],
        temperature: 0.3,
        max_tokens: 2000,
      };

      if (mode === 'json') {
        body.response_format = { type: 'json_object' };
      }

      const res = await fetch(`${config.baseUrl}/v1/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${config.apiKey}`,
        },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const errorText = await res.text();
        throw new Error(`Translate API error ${res.status}: ${errorText.slice(0, 200)}`);
      }

      const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
      const content = data.choices?.[0]?.message?.content ?? '';

      if (!content.trim()) {
        // Empty content — retry
        if (attempt < maxRetries - 1) {
          await new Promise(r => setTimeout(r, 800 * (attempt + 1)));
          continue;
        }
        throw new Error('Translation returned empty content after retries');
      }

      if (mode === 'json') {
        try {
          const parsed = JSON.parse(content) as { translated?: string; source_lang?: string };
          if (!parsed.translated) {
            // Missing translated field — retry
            if (attempt < maxRetries - 1) {
              await new Promise(r => setTimeout(r, 800 * (attempt + 1)));
              continue;
            }
            return { translated: content, sourceLang: 'und' };
          }
          return {
            translated: parsed.translated,
            sourceLang: parsed.source_lang || 'und',
          };
        } catch {
          // JSON parse failed — retry
          if (attempt < maxRetries - 1) {
            await new Promise(r => setTimeout(r, 800 * (attempt + 1)));
            continue;
          }
          return { translated: content, sourceLang: 'und' };
        }
      }

      return { translated: content };
    } catch (e) {
      if (attempt < maxRetries - 1) {
        await new Promise(r => setTimeout(r, 1000 * (attempt + 1)));
        continue;
      }
      throw e;
    }
  }

  throw new Error('Translation failed after all retries');
}

/**
 * Convenience: translate to Chinese (simple mode, backward compatible).
 */
export async function translateToChinese(config: AIConfig, text: string): Promise<string> {
  const result = await translateText(config, text, 'zh', 'simple');
  return result.translated;
}

/**
 * Polish/refine post draft
 */
export async function polishDraft(config: AIConfig, draft: string, requirement: string): Promise<string> {
  const systemPrompt = `你是一个文字润色助手，根据用户要求调整以下帖子草稿，只返回润色后的文本。`;
  return singleTurnAI(
    config,
    systemPrompt,
    `用户要求：${requirement}\n\n草稿：\n${draft}`,
    0.7,
    2000,
  );
}
