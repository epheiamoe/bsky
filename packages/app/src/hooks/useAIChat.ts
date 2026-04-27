import { useState, useCallback, useEffect, useRef } from 'react';
import { AIAssistant, createTools } from '@bsky/core';
import type { AIConfig, BskyClient } from '@bsky/core';

export interface AIChatMessage {
  role: 'user' | 'assistant';
  content: string;
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
  const initRef = useRef(false);

  useEffect(() => {
    if (!client || initRef.current) return;
    initRef.current = true;
    const tools = createTools(client);
    assistant.setTools(tools);

    if (contextUri) {
      assistant.addSystemMessage(
        `你是一个深度集成 Bluesky 的终端助手。用户正在查看帖子 ${contextUri}，如果需要请用工具获取上下文。回答简练，适合终端显示。`
      );
      setGuidingQuestions(['总结这个讨论', '查看作者动态', '分析帖子情绪']);
    }
  }, [client, assistant, contextUri]);

  const send = useCallback(async (text: string) => {
    setMessages(prev => [...prev, { role: 'user', content: text }]);
    setGuidingQuestions([]);
    setLoading(true);
    try {
      const result = await assistant.sendMessage(text);
      setMessages(prev => [...prev, { role: 'assistant', content: result.content }]);
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
