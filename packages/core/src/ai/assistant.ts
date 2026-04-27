import type { ToolDescriptor } from '../at/tools.js';

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  name?: string;
  tool_call_id?: string;
  tool_calls?: ToolCall[];
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
  stream?: false;
}

export interface ChatCompletionChoice {
  index: number;
  message: {
    role: 'assistant';
    content: string | null;
    tool_calls?: ToolCall[];
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
  model: 'deepseek-chat',
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
      this.messages.push({ role: 'assistant', content: finalContent });

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

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.config.apiKey}`,
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const errorText = await res.text();
      throw new Error(`AI API error ${res.status}: ${errorText}`);
    }

    return res.json() as Promise<ChatCompletionResponse>;
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

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`AI API error ${res.status}: ${errorText}`);
  }

  const data = (await res.json()) as ChatCompletionResponse;
  return data.choices[0]?.message?.content ?? '';
}

/**
 * Translate text to Chinese
 */
export async function translateToChinese(config: AIConfig, text: string): Promise<string> {
  return singleTurnAI(
    config,
    '你是一个专业翻译，将以下文本翻译成中文，保持原意，仅输出翻译结果，不做解释。',
    text,
    0.3,
    2000,
  );
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
