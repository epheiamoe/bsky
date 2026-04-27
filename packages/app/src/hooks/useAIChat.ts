import { useState, useCallback, useEffect, useRef } from 'react';
import { AIAssistant, createTools } from '@bsky/core';
import type { AIConfig, BskyClient } from '@bsky/core';
import type { ChatRecord, AIChatMessage } from '../services/chatStorage.js';
import type { ChatStorage } from '../services/chatStorage.js';
import { v4 as uuidv4 } from './uuid.js';

interface UseAIChatOptions {
  chatId?: string;
  storage?: ChatStorage;
}

export function useAIChat(
  client: BskyClient | null,
  aiConfig: AIConfig,
  contextUri?: string,
  options?: UseAIChatOptions,
) {
  const [assistant] = useState(() => new AIAssistant(aiConfig));
  const [messages, setMessages] = useState<AIChatMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [guidingQuestions, setGuidingQuestions] = useState<string[]>([]);
  const lastContext = useRef<string | undefined>();
  const chatIdRef = useRef(options?.chatId ?? uuidv4());
  const storage = options?.storage;

  // Load existing conversation from storage on mount
  useEffect(() => {
    if (!storage || !options?.chatId) return;
    void (async () => {
      const record = await storage.loadChat(options.chatId!);
      if (record) {
        setMessages(record.messages);
        // Restore AIAssistant internal state by replaying user messages
        // (Tool calls and context will be re-fetched if needed on next send)
        if (contextUri) {
          assistant.addSystemMessage(
            `你是一个深度集成 Bluesky 的终端助手。用户正在查看帖子 ${contextUri}，如果需要请用工具获取上下文。回答简练，适合终端显示。`
          );
        }
      }
    })();
  }, []);

  // Initialize tools and system prompt
  useEffect(() => {
    if (!client) return;
    const tools = createTools(client);
    assistant.setTools(tools);

    if (contextUri !== lastContext.current) {
      lastContext.current = contextUri;

      // Only reset if not restoring from storage
      if (!options?.chatId && messages.length > 0) {
        assistant.clearMessages();
        setMessages([]);
      }

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

  const autoSave = useCallback(async (msgs: AIChatMessage[]) => {
    if (!storage) return;
    const title = msgs.find(m => m.role === 'user')?.content.slice(0, 80) ?? '新对话';
    try {
      await storage.saveChat({
        id: chatIdRef.current,
        title,
        contextUri,
        messages: msgs,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
    } catch { /* silently fail */ }
  }, [storage, contextUri]);

  const send = useCallback(async (text: string) => {
    const newUserMsg: AIChatMessage = { role: 'user', content: text };
    setMessages(prev => {
      const updated = [...prev, newUserMsg];
      void autoSave(updated);
      return updated;
    });
    setGuidingQuestions([]);
    setLoading(true);
    try {
      const result = await assistant.sendMessage(text);

      setMessages(prev => {
        const newMsgs: AIChatMessage[] = [];
        for (const step of result.intermediateSteps) {
          if (step.type === 'tool_call') {
            newMsgs.push({ role: 'tool_call', content: step.content, toolName: extractToolName(step.content) });
          } else if (step.type === 'tool_result') {
            const summary = truncateToolResult(step.content);
            newMsgs.push({ role: 'tool_result', content: summary });
          }
        }
        newMsgs.push({ role: 'assistant', content: result.content });
        const updated = [...prev, ...newMsgs];
        void autoSave(updated);
        return updated;
      });
    } catch (e) {
      setMessages(prev => {
        const errMsg: AIChatMessage = { role: 'assistant', content: `Error: ${e instanceof Error ? e.message : String(e)}` };
        const updated = [...prev, errMsg];
        void autoSave(updated);
        return updated;
      });
    } finally {
      setLoading(false);
    }
  }, [assistant, autoSave]);

  return { messages, loading, guidingQuestions, send, chatId: chatIdRef.current };
}

// Re-export the AIChatMessage type for consumers
export type { AIChatMessage };

function extractToolName(raw: string): string {
  const m = raw.match(/Calling (\w+)\(/);
  return m?.[1] ?? '';
}

function truncateToolResult(raw: string): string {
  const prefixMatch = raw.match(/^Result from \w+: /);
  const body = prefixMatch ? raw.slice(prefixMatch[0].length) : raw;
  const data = tryJsonSummary(body);
  return data.length > 300 ? data.slice(0, 300) + '...' : data;
}

function tryJsonSummary(text: string): string {
  try {
    const obj = JSON.parse(text);
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
