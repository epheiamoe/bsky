import type { ToolDescriptor } from './tools.js';
import {
  LANG_LABELS,
  PF_TRANSLATE_SIMPLE,
  PF_TRANSLATE_JSON,
  P_POLISH_SYSTEM,
  PF_POLISH_USER,
  P_AUTO_TITLE_SYSTEM,
  PF_AUTO_TITLE_USER,
  P_ALT_DESCRIPTION_SYSTEM,
  PF_ALT_DESCRIPTION_USER,
} from './prompts.js';
import type { ChatMessage, AIConfig, ContentBlock } from './adapter.js';
import { getAdapter } from './adapter.js';

export type { AIConfig, ChatMessage, ContentBlock } from './adapter.js';

export { P_ALT_DESCRIPTION_SYSTEM, PF_ALT_DESCRIPTION_USER } from './prompts.js';

const DEFAULT_CONFIG: Partial<AIConfig> = {
  baseUrl: 'https://api.deepseek.com',
  model: 'deepseek-v4-flash',
  thinkingEnabled: true,
};

export class AIAssistant {
  private config: AIConfig;
  private tools: ToolDescriptor[] = [];
  private toolMap: Map<string, ToolDescriptor> = new Map();
  private messages: ChatMessage[] = [];

  // Write confirmation gate
  private _confirmPromise: Promise<boolean> | null = null;
  private _confirmResolve: ((v: boolean) => void) | null = null;

  // Pending images for multi-modal support (view_image tool)
  private _pendingImages: Array<{ url: string; alt?: string }> = [];

  // User-uploaded images (not yet posted to Bluesky)
  private _userUploads: Array<{ data: Uint8Array; mimeType: string; alt: string }> = [];

  constructor(config?: Partial<AIConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config } as AIConfig;
  }

  updateConfig(config: Partial<AIConfig>): void {
    this.config = { ...this.config, ...config };
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

  /** Store a base64 data URL for multi-modal vision model support */
  addPendingImage(base64DataUrl: string, alt?: string): void {
    this._pendingImages.push({ url: base64DataUrl, alt });
  }
  clearPendingImages(): void {
    this._pendingImages = [];
  }
  get hasPendingImages(): boolean {
    return this._pendingImages.length > 0;
  }

  /** Store a user-uploaded image for later use (e.g., posting via create_post) */
  addUserUpload(data: Uint8Array, mimeType: string, alt: string): number {
    this._userUploads.push({ data, mimeType, alt });
    return this._userUploads.length - 1;
  }
  getUserUpload(index: number): { data: Uint8Array; mimeType: string; alt: string } | undefined {
    return this._userUploads[index];
  }
  clearUserUploads(): void {
    this._userUploads = [];
  }

  /** Whether a write-tool confirmation dialog is currently open. */
  get hasPendingConfirmation(): boolean {
    return this._confirmPromise !== null;
  }

  /** Signal the pending confirmation: true = execute, false = cancel. */
  confirmAction(approved: boolean): void {
    if (this._confirmResolve) {
      this._confirmResolve(approved);
      this._confirmPromise = null;
      this._confirmResolve = null;
    }
  }

  private async _waitForConfirmation(): Promise<boolean> {
    this._confirmPromise = new Promise<boolean>((resolve) => {
      this._confirmResolve = resolve;
    });
    return this._confirmPromise;
  }

  async sendMessage(content: string): Promise<{
    content: string;
    toolCallsExecuted: number;
    intermediateSteps: Array<{ type: 'tool_call' | 'tool_result' | 'assistant' | 'user'; content: string }>;
  }> {
    this.addUserMessage(content);

    const intermediateSteps: Array<{ type: 'tool_call' | 'tool_result' | 'assistant' | 'user'; content: string }> = [];
    let toolCallsExecuted = 0;
    const adapter = getAdapter(this.config.apiType);
    for (let round = 0; ; round++) {
      const response = await this.makeRequest(adapter);

      if (!response.toolCalls || response.toolCalls.length === 0) {
        const finalContent = response.content || '';
        this.messages.push({
          role: 'assistant',
          content: finalContent,
          ...(response.reasoningContent ? { reasoning_content: response.reasoningContent } : {}),
        });
        intermediateSteps.push({ type: 'assistant', content: finalContent });
        return { content: finalContent, toolCallsExecuted, intermediateSteps };
      }

      // Tool calls
      const toolCalls = response.toolCalls.map(tc => ({
        id: tc.id,
        type: 'function' as const,
        function: { name: tc.name, arguments: tc.arguments },
      }));

      this.messages.push({
        role: 'assistant',
        content: response.content || '',
        tool_calls: toolCalls,
        ...(response.reasoningContent ? { reasoning_content: response.reasoningContent } : {}),
      });

      for (const tc of response.toolCalls) {
        const toolName = tc.name;
        let toolArgs: Record<string, unknown>;
        try {
          toolArgs = JSON.parse(tc.arguments) as Record<string, unknown>;
        } catch {
          toolArgs = { _raw: tc.arguments };
          console.warn(`[assistant] Malformed JSON in tool call "${toolName}" arguments, using raw string`);
        }
        const toolDesc = this.toolMap.get(toolName);

        intermediateSteps.push({
          type: 'tool_call',
          content: `🔧 Calling ${toolName}(${JSON.stringify(toolArgs)})`,
        });

        let toolResult: string;
        if (toolDesc) {
          if (toolDesc.requiresWrite) {
            intermediateSteps.push({
              type: 'tool_call',
              content: `⚡ PENDING: ${toolDesc.definition.description}`,
            });
            const approved = await this._waitForConfirmation();
            if (!approved) {
              toolResult = 'User cancelled the operation.';
              toolCallsExecuted++;
              intermediateSteps.push({
                type: 'tool_result',
                content: `Cancelled: ${toolName}`,
              });
              this.messages.push({
                role: 'tool',
                content: toolResult,
                tool_call_id: tc.id,
              });
              continue;
            }
          }
          try {
            toolResult = await toolDesc.handler(toolArgs, this);
          } catch (err) {
            toolResult = `Error executing tool: ${err instanceof Error ? err.message : String(err)}`;
          }
        } else {
          toolResult = `Unknown tool: ${toolName}`;
        }
        toolCallsExecuted++;

        intermediateSteps.push({
          type: 'tool_result',
          content: `Result: ${toolResult.slice(0, 300)}${toolResult.length > 300 ? '...' : ''}`,
        });

        this.messages.push({
          role: 'tool',
          content: toolResult,
          tool_call_id: tc.id,
        });
      }
    }
  }

  private _buildMessages(): ChatMessage[] {
    let msgs = this.messages;
    // For providers without native reasoning_content support (Mistral, etc):
    // merge reasoning_content into content as a thinking preface,
    // then remove the field so we don't trigger extra_forbidden errors.
    if (this.config.reasoningStyle !== 'reasoning_content') {
      msgs = msgs.map(m => {
        const rc = (m as any).reasoning_content as string | undefined;
        if (!rc || m.role !== 'assistant') return m;
        const { reasoning_content: _, ...rest } = m as any;
        const prefix = `【上一步思考过程】\n${rc}\n\n`;
        if (typeof rest.content === 'string') {
          rest.content = prefix + rest.content;
        }
        return rest;
      });
    }
    // Filter out tool messages without tool_call_id (stale from corrupted storage)
    msgs = msgs.filter(m => m.role !== 'tool' || (typeof m.tool_call_id === 'string' && m.tool_call_id.length > 0));
    if (!this.hasPendingImages || !this.config.visionEnabled) return msgs;
    msgs = [...msgs];
    for (let i = msgs.length - 1; i >= 0; i--) {
      if (msgs[i]!.role === 'user') {
        const text: string = typeof msgs[i]!.content === 'string' ? (msgs[i]!.content as string) : '';
        const blocks: ContentBlock[] = [
          { type: 'text', text },
          ...this._pendingImages.flatMap(img => {
            const result: ContentBlock[] = [];
            if (img.alt) result.push({ type: 'text', text: `[图片 ALT: ${img.alt}]` });
            result.push({ type: 'image_url', image_url: { url: img.url, detail: 'auto' } });
            return result;
          }),
        ];
        msgs[i] = { ...msgs[i]!, content: blocks } as ChatMessage;
        this.messages[i] = { ...this.messages[i]!, content: blocks } as ChatMessage;
        break;
      }
    }
    this.clearPendingImages();
    return msgs;
  }

  private async makeRequest(adapter: ReturnType<typeof getAdapter>): Promise<{
    content: string;
    reasoningContent?: string;
    toolCalls?: Array<{ id: string; name: string; arguments: string }>;
  }> {
    const spec = adapter.buildRequest(this.config, this._buildMessages(), this.tools, false);

    let res: Response;
    try {
      res = await fetch(spec.url, {
        method: 'POST',
        headers: spec.headers,
        body: JSON.stringify(spec.body),
      });
    } catch (e) {
      if (e instanceof TypeError) {
        throw new Error(`Network error: unable to reach LLM API at ${spec.url}. Check LLM_BASE_URL and network. (${(e as Error).message})`);
      }
      throw e;
    }

    if (!res.ok) {
      const errorText = await res.text();
      throw new Error(`AI API error ${res.status}: ${errorText}`);
    }

    return adapter.parseResponse(await res.json());
  }

  /**
   * Send a message with streaming.
   * Yields intermediate steps (tool_call/tool_result) and tokens.
   */
  async *sendMessageStreaming(content: string, signal?: AbortSignal): AsyncGenerator<{
    type: 'tool_call' | 'tool_result' | 'token' | 'done' | 'thinking';
    content: string;
    toolName?: string;
    toolCallId?: string;
  }> {
    this.addUserMessage(content);

    const adapter = getAdapter(this.config.apiType);

    for (let round = 0; ; round++) {
      const spec = adapter.buildRequest(this.config, this._buildMessages(), this.tools, true);

      let res: Response;
      try {
        res = await fetch(spec.url, {
          method: 'POST',
          headers: spec.headers,
          body: JSON.stringify(spec.body),
          signal,
        });
      } catch (e) {
        if (signal?.aborted) {
          yield { type: 'done', content: '\n\n[已暂停]' };
          return;
        }
        if (e instanceof TypeError) {
          throw new Error(`Network error: unable to reach LLM API at ${spec.url}. Check LLM_BASE_URL and network. If you are in China/HK, check VPN/proxy settings — some providers (e.g. Mistral) may be DNS-poisoned. (${(e as Error).message})`);
        }
        throw e;
      }

      if (!res.ok) {
        const errorText = await res.text();
        throw new Error(`AI API error ${res.status}: ${errorText}`);
      }

      // Parse SSE stream via adapter
      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      const processor = adapter.createStreamProcessor();
      let fullContent = '';
      let reasoningContent = '';

      try {
        while (true) {
          if (signal?.aborted) {
            yield { type: 'done', content: '\n\n[已暂停]' };
            break;
          }
          const { done, value } = await reader.read();
          if (done) break;
          const text = decoder.decode(value, { stream: true });
          const events = processor.feed(text);
          for (const ev of events) {
            if (ev.type === 'token') fullContent += ev.content;
            if (ev.type === 'thinking') reasoningContent += ev.content;
            yield ev;
          }
        }
      } catch (_err) {
        if (signal?.aborted) {
          yield { type: 'done', content: fullContent };
          return;
        }
        throw _err;
      }

      // Check if we got tool calls
      const toolCalls = processor.getToolCalls();
      if (toolCalls.length > 0) {
        this.messages.push({
          role: 'assistant',
          content: fullContent || '',
          tool_calls: toolCalls.map(tc => ({
            id: tc.id,
            type: 'function' as const,
            function: { name: tc.name, arguments: tc.arguments },
          })),
          ...(reasoningContent ? { reasoning_content: reasoningContent } : {}),
        });

        for (const tc of toolCalls) {
          const toolName = tc.name;
          let toolArgs: Record<string, unknown>;
          try {
            toolArgs = JSON.parse(tc.arguments) as Record<string, unknown>;
          } catch {
            toolArgs = { _raw: tc.arguments };
            console.warn(`[assistant] Malformed JSON in tool call "${toolName}" arguments, using raw string`);
          }
          const toolDesc = this.toolMap.get(toolName);

          yield { type: 'tool_call', content: `${toolName}(${JSON.stringify(toolArgs)})`, toolName, toolCallId: tc.id };

          let toolResult: string;
          if (toolDesc) {
            if (toolDesc.requiresWrite) {
              const desc = buildToolDescription(toolName, toolArgs);
              yield { type: 'confirmation_needed' as any, content: desc, toolName };
              const approved = await this._waitForConfirmation();
              if (!approved) {
                toolResult = 'User cancelled the operation.';
                yield { type: 'tool_result', content: toolResult, toolName, toolCallId: tc.id };
                this.messages.push({
                  role: 'tool',
                  content: toolResult,
                  tool_call_id: tc.id,
                });
                continue;
              }
            }
            try {
              toolResult = await toolDesc.handler(toolArgs, this);
            } catch (err) {
              toolResult = `Error: ${err instanceof Error ? err.message : String(err)}`;
            }
          } else {
            toolResult = `Unknown tool: ${toolName}`;
          }

          yield { type: 'tool_result', content: toolResult, toolName, toolCallId: tc.id };

          this.messages.push({
            role: 'tool',
            content: toolResult,
            tool_call_id: tc.id,
          });
        }
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
  }
}

function buildToolDescription(toolName: string, args: Record<string, unknown>): string {
  switch (toolName) {
    case 'create_post': return `创建帖子: "${String(args.text || '').slice(0, 100)}"`;
    case 'like': return `点赞帖子: ${String(args.uri || '')}`;
    case 'repost': return `转发帖子: ${String(args.uri || '')}`;
    case 'follow': return `关注用户: ${String(args.subject || '')}`;
    case 'create_list': return `创建列表: "${String(args.name || '')}" (${String(args.purpose || '') === 'moderation' ? '管理' : '精选'})`;
    case 'edit_list_members': {
      const action = String(args.action || 'add');
      return action === 'add' ? `添加用户 ${String(args.subject || '')} 到列表` : `从列表移除用户 ${String(args.subject || '')}`;
    }
    default: return `${toolName}: ${JSON.stringify(args).slice(0, 100)}`;
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
  modelOverride?: string,
): Promise<string> {
  const adapter = getAdapter(config.apiType);
  const messages: ChatMessage[] = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt },
  ];

  const spec = adapter.buildRequest(config, messages, [], false, {
    temperature,
    maxTokens,
    model: modelOverride,
  });

  let res: Response;
  try {
    res = await fetch(spec.url, {
      method: 'POST',
      headers: spec.headers,
      body: JSON.stringify(spec.body),
    });
  } catch (e) {
    if (e instanceof TypeError) {
      throw new Error(`Network error: unable to reach LLM API at ${spec.url}. Check LLM_BASE_URL and network. (${(e as Error).message})`);
    }
    throw e;
  }

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`AI API error ${res.status}: ${errorText}`);
  }

  const data = (await res.json()) as any;
  return adapter.parseResponse(data).content;
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
 */
export async function translateText(
  config: AIConfig,
  text: string,
  targetLang: string,
  mode: 'simple' | 'json' = 'simple',
  maxRetries = 3,
  modelOverride?: string,
): Promise<TranslationResult> {
  const langLabel = LANG_LABELS[targetLang] ?? targetLang;

  const systemPrompt = mode === 'json'
    ? PF_TRANSLATE_JSON(langLabel)
    : PF_TRANSLATE_SIMPLE(langLabel);

  const adapter = getAdapter(config.apiType);

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const messages: ChatMessage[] = [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: text },
      ];

      const spec = adapter.buildRequest(config, messages, [], false, {
        temperature: 0.3,
        maxTokens: 2000,
        model: modelOverride,
      });

      if (config.apiType !== 'responses') {
        (spec.body as any).thinking = { type: 'disabled' };
      }

      if (mode === 'json') {
        (spec.body as any).response_format = { type: 'json_object' };
      }

      const res = await fetch(spec.url, {
        method: 'POST',
        headers: spec.headers,
        body: JSON.stringify(spec.body),
      });

      if (!res.ok) {
        const errorText = await res.text();
        throw new Error(`Translate API error ${res.status}: ${errorText.slice(0, 200)}`);
      }

      const data = await res.json() as any;
      const content = adapter.parseResponse(data).content;

      if (!content.trim()) {
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
 * Polish/refine post draft. Returns polished text and optional reasoning (CoT) content.
 */
export interface PolishResult {
  polished: string;
  reasoning?: string;
}

export async function polishDraft(config: AIConfig, draft: string, requirement: string, modelOverride?: string): Promise<PolishResult> {
  const adapter = getAdapter(config.apiType);
  const messages: ChatMessage[] = [
    { role: 'system', content: P_POLISH_SYSTEM },
    { role: 'user', content: PF_POLISH_USER(requirement, draft) },
  ];

  const spec = adapter.buildRequest(config, messages, [], false, {
    temperature: 0.7,
    maxTokens: 2000,
    model: modelOverride,
  });

  let res: Response;
  try {
    res = await fetch(spec.url, {
      method: 'POST',
      headers: spec.headers,
      body: JSON.stringify(spec.body),
    });
  } catch (e) {
    if (e instanceof TypeError) {
      throw new Error(`Network error: unable to reach LLM API at ${spec.url}. Check LLM_BASE_URL and network. (${(e as Error).message})`);
    }
    throw e;
  }

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`AI API error ${res.status}: ${errorText}`);
  }

  const data = (await res.json()) as any;
  const parsed = adapter.parseResponse(data);
  return { polished: parsed.content, reasoning: parsed.reasoningContent || undefined };
}

/**
 * Generate a concise conversation title from the first user message + first AI reply.
 */
export async function generateChatTitle(
  config: AIConfig,
  firstUserMsg: string,
  firstAiReply: string,
): Promise<string> {
  try {
    const raw = await singleTurnAI(
      config,
      P_AUTO_TITLE_SYSTEM,
      PF_AUTO_TITLE_USER(firstUserMsg.slice(0, 150), firstAiReply.slice(0, 300)),
      0.3,
    );
    const cleaned = raw.trim().replace(/^["「『\s]+|["」』\s]+$/g, '').slice(0, 50);
    return cleaned || firstUserMsg.slice(0, 50);
  } catch {
    return firstUserMsg.slice(0, 50);
  }
}

/**
 * Generate an accessibility-focused image description using a vision-capable model.
 */
export async function describeImage(
  config: AIConfig,
  downloadFn: () => Promise<Uint8Array>,
  existingAlt?: string,
  targetLang?: string,
): Promise<string> {
  const data = await downloadFn();

  let mimeType = 'image/jpeg';
  if (data.length >= 4) {
    if (data[0] === 0x89 && data[1] === 0x50) mimeType = 'image/png';
    else if (data[0] === 0x47 && data[1] === 0x49) mimeType = 'image/gif';
  }

  let base64: string;
  if (typeof Buffer !== 'undefined') {
    base64 = Buffer.from(data).toString('base64');
  } else {
    let binary = '';
    for (let i = 0; i < data.length; i++) binary += String.fromCharCode(data[i]!);
    base64 = btoa(binary);
  }
  const dataUrl = `data:${mimeType};base64,${base64}`;

  const adapter = getAdapter(config.apiType);
  const messages: ChatMessage[] = [
    { role: 'system', content: P_ALT_DESCRIPTION_SYSTEM(targetLang) },
    {
      role: 'user',
      content: [
        { type: 'text', text: PF_ALT_DESCRIPTION_USER(existingAlt) },
        { type: 'image_url', image_url: { url: dataUrl, detail: 'auto' } },
      ] as ContentBlock[],
    },
  ];

  const spec = adapter.buildRequest(config, messages, [], false, {
    temperature: 0.3,
    maxTokens: 300,
  });

  const res = await fetch(spec.url, {
    method: 'POST',
    headers: spec.headers,
    body: JSON.stringify(spec.body),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`Image description API error ${res.status}: ${errText.slice(0, 200)}`);
  }

  const respData = await res.json() as any;
  const content = adapter.parseResponse(respData).content;
  return content.trim().slice(0, 500);
}
