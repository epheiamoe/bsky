import { useState, useCallback, useEffect, useRef } from 'react';
import { AIAssistant, createTools } from '@bsky/core';
import type { AIConfig, BskyClient } from '@bsky/core';

export interface AIChatMessage {
  role: 'user' | 'assistant' | 'tool_call' | 'tool_result';
  content: string;
  toolName?: string;
}

export function useAIChat(
  client: BskyClient | null,
  aiConfig: AIConfig,
  contextUri?: string,
) {
  const [assistant] = useState(() => new AIAssistant(aiConfig));
  const [messages, setMessages] = useState<AIChatMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [guidingQuestions, setGuidingQuestions] = useState<string[]>([]);
  const lastContext = useRef<string | undefined>();

  useEffect(() => {
    if (!client) return;
    const tools = createTools(client);
    assistant.setTools(tools);

    if (contextUri !== lastContext.current) {
      lastContext.current = contextUri;
      assistant.clearMessages();
      setMessages([]);

      if (contextUri) {
        assistant.addSystemMessage(
          `你是一个深度集成 Bluesky 的终端助手。用户正在查看帖子 ${contextUri}，如果需要请用工具获取上下文。回答简练，适合终端显示。`
        );
        setGuidingQuestions(['总结这个讨论', '查看作者动态', '分析帖子情绪']);
      } else {
        assistant.addSystemMessage(
          '你是一个深度集成 Bluesky 的终端助手。你可以通过工具调用获取最新的网络动态、用户资料和帖子上下文。回答简练，适合终端显示。'
        );
        setGuidingQuestions([]);
      }
    }
  }, [client, contextUri, assistant]);

  const send = useCallback(async (text: string) => {
    setMessages(prev => [...prev, { role: 'user', content: text }]);
    setGuidingQuestions([]);
    setLoading(true);
    try {
      // TODO: streaming support — use AbortController + ReadableStream for real-time token display
      const result = await assistant.sendMessage(text);

      const newMsgs: AIChatMessage[] = [];
      for (const step of result.intermediateSteps) {
        if (step.type === 'tool_call') {
          newMsgs.push({ role: 'tool_call', content: step.content, toolName: extractToolName(step.content) });
        } else if (step.type === 'tool_result') {
          // Truncate long tool results
          const summary = truncateToolResult(step.content);
          newMsgs.push({ role: 'tool_result', content: summary });
        }
      }
      newMsgs.push({ role: 'assistant', content: result.content });

      setMessages(prev => [...prev, ...newMsgs]);
    } catch (e) {
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: `Error: ${e instanceof Error ? e.message : String(e)}`,
      }]);
    } finally {
      setLoading(false);
    }
  }, [assistant]);

  return { messages, loading, guidingQuestions, send };
}

function extractToolName(raw: string): string {
  const m = raw.match(/Calling (\w+)\(/);
  return m?.[1] ?? '';
}

function truncateToolResult(raw: string): string {
  // Strip the "Result from X: " prefix, keep first 300 chars
  const prefixMatch = raw.match(/^Result from \w+: /);
  const body = prefixMatch ? raw.slice(prefixMatch[0].length) : raw;
  const data = tryJsonSummary(body);
  return data.length > 300 ? data.slice(0, 300) + '...' : data;
}

function tryJsonSummary(text: string): string {
  try {
    const obj = JSON.parse(text);
    // Extract meaningful summary fields
    if (obj.posts !== undefined) return `搜索到 ${obj.total ?? obj.posts.length} 个帖子`;
    if (obj.feed !== undefined) return `获取了 ${obj.feed.length} 条时间线`;
    if (obj.thread !== undefined) return obj.thread.slice(0, 200);
    if (obj.likes !== undefined) return `${obj.total ?? obj.likes.length} 人赞了`;
    if (obj.did !== undefined && obj.handle) return `用户: @${obj.handle} (${obj.displayName ?? ''})`;
    if (obj.notifications !== undefined) return `${obj.notifications.length} 条通知`;
    if (obj.images !== undefined) return `${obj.count} 张图片`;
    if (obj.text !== undefined) return `帖子: "${(obj.text as string).slice(0, 100)}"`;
    return text.slice(0, 200);
  } catch {
    return text.slice(0, 200);
  }
}
