import { useState, useCallback, useEffect, useRef } from 'react';
import { AIAssistant, createTools } from '@bsky/core';
import {
  P_ASSISTANT_BASE,
  PF_CURRENT_USER,
  PF_PROFILE_CONTEXT,
  PF_POST_CONTEXT,
  PF_ENVIRONMENT,
  PF_LOCALE_HINT,
  P_CONCISE,
  PF_AUTO_ANALYSIS,
  P_GUIDING_QUESTIONS,
  PF_VISION_HINT,
  PF_CURRENT_TIME,
} from '@bsky/core';
import type { AIConfig, BskyClient, ChatMessage } from '@bsky/core';
import type { ChatRecord, AIChatMessage } from '../services/chatStorage.js';
import type { ChatStorage } from '../services/chatStorage.js';
import { v4 as uuidv4 } from './uuid.js';

interface UseAIChatOptions {
  chatId?: string;
  storage?: ChatStorage;
  stream?: boolean;
  userHandle?: string;
  userDisplayName?: string;
  environment?: 'tui' | 'pwa';
  locale?: string;
  contextProfile?: string;
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
  const [pendingConfirmation, setPendingConfirmation] = useState<{
    toolName: string;
    description: string;
  } | null>(null);
  const lastContext = useRef<string | undefined>();
  const lastChatId = useRef(options?.chatId);
  const chatIdRef = useRef(options?.chatId ?? uuidv4());
  const storage = options?.storage;
  const autoStartedRef = useRef(false);

  const buildSystemPrompt = useCallback((withContext?: string, contextProfile?: string) => {
    const parts: string[] = [];
    parts.push(P_ASSISTANT_BASE);
    if (options?.userHandle || options?.userDisplayName) {
      const name = options.userDisplayName || options.userHandle || '';
      parts.push(PF_CURRENT_USER(name, options.userHandle));
    }
    if (contextProfile) {
      parts.push(PF_PROFILE_CONTEXT(contextProfile, options?.userHandle));
    } else if (withContext) {
      parts.push(PF_POST_CONTEXT(withContext));
    }
    parts.push(PF_ENVIRONMENT(options?.environment || 'pwa'));
    if (options?.locale) parts.push(PF_LOCALE_HINT(options.locale));
    parts.push(PF_CURRENT_TIME());
    parts.push(PF_VISION_HINT(aiConfig.visionEnabled ?? false));
    parts.push(P_CONCISE);
    return parts.join('');
  }, [options?.userHandle, options?.userDisplayName, options?.locale, options?.environment, aiConfig.visionEnabled]);

  // Keep chatIdRef in sync
  useEffect(() => {
    if (options?.chatId) chatIdRef.current = options.chatId;
  }, [options?.chatId]);

  // Reset assistant state when chatId changes
  useEffect(() => {
    if (options?.chatId === lastChatId.current) return;
    lastChatId.current = options?.chatId;

    assistant.clearMessages();
    setMessages([]);
    setGuidingQuestions([]);
    autoStartedRef.current = false;

    assistant.addSystemMessage(buildSystemPrompt(undefined, options?.contextProfile));
  }, [options?.chatId, buildSystemPrompt, options?.contextProfile]);

  // Load existing conversation from storage when chatId changes
  useEffect(() => {
    if (!storage || !options?.chatId) return;
    void (async () => {
      const record = await storage.loadChat(options.chatId!);
      if (record) {
        setMessages(record.messages);
        if (contextUri) {
          assistant.addSystemMessage(buildSystemPrompt(contextUri, options?.contextProfile));
        }
      } else {
        // No record found — start fresh
        setMessages([]);
      }
    })();
  }, [options?.chatId, storage]);

  // Initialize tools and system prompt
  useEffect(() => {
    if (!client) return;
    const tools = createTools(client);
    assistant.setTools(tools);

    const changed = contextUri !== lastContext.current;
    lastContext.current = contextUri;

    if (changed) {
      // Only reset if not restoring from storage and not a fresh chat with contextProfile
      if (!options?.chatId && !options?.contextProfile) {
        assistant.clearMessages();
        setMessages([]);
      }

      if (contextUri) {
        assistant.addSystemMessage(buildSystemPrompt(contextUri, options?.contextProfile));
        setGuidingQuestions(P_GUIDING_QUESTIONS);
      } else if (options?.contextProfile) {
        assistant.addSystemMessage(buildSystemPrompt(undefined, options.contextProfile));
        setGuidingQuestions([]);
      } else {
        assistant.addSystemMessage(buildSystemPrompt());
        setGuidingQuestions([]);
      }
    }
  }, [client, contextUri, assistant, options?.contextProfile, buildSystemPrompt]);
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

    if (options?.stream) {
      try {
        const stream = assistant.sendMessageStreaming(text);
        let streamingContent = '';

        for await (const event of stream) {
          if ((event as any).type === 'confirmation_needed') {
            setPendingConfirmation({
              toolName: (event as any).toolName || '',
              description: event.content,
            });
            continue;
          }
          if (event.type === 'tool_call') {
            streamingContent = ''; // Reset for next assistant turn
            setMessages(prev => {
              const newMsgs: AIChatMessage[] = [
                ...prev,
                { role: 'tool_call', content: `🔧 ${event.content}`, toolName: event.toolName },
              ];
              return newMsgs;
            });
          } else if (event.type === 'tool_result') {
            const summary = tryJsonSummary(event.content);
            setMessages(prev => {
              const newMsgs: AIChatMessage[] = [
                ...prev,
                { role: 'tool_result', content: summary, toolName: event.toolName },
              ];
              return newMsgs;
            });
          } else if (event.type === 'thinking') {
            // Accumulate reasoning content — show incrementally
            setMessages(prev => {
              const last = prev[prev.length - 1];
              if (last?.role === 'thinking') {
                const updated = [...prev];
                updated[updated.length - 1] = { role: 'thinking', content: last.content + event.content };
                return updated;
              }
              return [...prev, { role: 'thinking', content: event.content }];
            });
          } else if (event.type === 'token') {
            streamingContent += event.content;
            setMessages(prev => {
              const last = prev[prev.length - 1];
              if (last?.role === 'assistant') {
                // Append to existing assistant message
                const updated = [...prev];
                updated[updated.length - 1] = { ...last, content: streamingContent };
                return updated;
              }
              // First token — create new assistant message
              return [...prev, { role: 'assistant', content: streamingContent }];
            });
          } else if (event.type === 'done') {
            // Already updated via tokens
          }
        }

        // Auto-save after streaming complete
        setMessages(prev => {
          void autoSave(prev);
          return prev;
        });
      } catch (e) {
        const errorText = `Error: ${e instanceof Error ? e.message : String(e)}`;
        console.error('[useAIChat] stream error:', errorText);
        setMessages(prev => {
          const errMsg: AIChatMessage = { role: 'assistant', content: errorText, isError: true };
          const updated = [...prev, errMsg];
          void autoSave(updated);
          return updated;
        });
      } finally {
        setLoading(false);
      }
      return;
    }

    // Non-streaming path (original, for TUI)
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
      const errorText = `Error: ${e instanceof Error ? e.message : String(e)}`;
      console.error('[useAIChat] non-stream error:', errorText);
      setMessages(prev => {
        const errMsg: AIChatMessage = { role: 'assistant', content: errorText, isError: true };
        const updated = [...prev, errMsg];
        void autoSave(updated);
        return updated;
      });
    } finally {
      setLoading(false);
    }
  }, [assistant, autoSave, options?.stream]);

  // Auto-start: when contextProfile is set on a fresh chat, send first message
  useEffect(() => {
    if (options?.contextProfile && messages.length === 0 && client && !loading && !autoStartedRef.current) {
      autoStartedRef.current = true;
      const displayName = options.contextProfile;
      const timer = setTimeout(() => {
        send(PF_AUTO_ANALYSIS(displayName));
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [options?.contextProfile, messages.length, client, loading, send]);

  const confirmAction = useCallback(() => {
    assistant.confirmAction(true);
    setPendingConfirmation(null);
  }, [assistant]);

  const rejectAction = useCallback(() => {
    assistant.confirmAction(false);
    setPendingConfirmation(null);
  }, [assistant]);

  const mapMessages = useCallback((msgs: ChatMessage[]): AIChatMessage[] => {
    return msgs.map(m => ({
      role: (m.role === 'tool' ? 'tool_result' : m.role) as AIChatMessage['role'],
      content: contentToString(m.content),
    }));
  }, []);

  /** Roll back to before the nth user message (0-indexed) and return that user's text. */
  const editByIndex = useCallback((n: number): string | null => {
    const allMsgs = assistant.getMessages();
    let count = 0;
    for (let i = 0; i < allMsgs.length; i++) {
      if (allMsgs[i]!.role === 'user') {
        if (count === n) {
          const userContent = contentToString(allMsgs[i]!.content);
          const keep = allMsgs.slice(0, i);
          assistant.loadMessages(keep);
          setMessages(mapMessages(keep));
          return userContent;
        }
        count++;
      }
    }
    return null;
  }, [assistant, mapMessages]);

  const undoLastMessage = useCallback(() => {
    const allMsgs = assistant.getMessages();
    let lastUserIdx = -1;
    for (let i = allMsgs.length - 1; i >= 0; i--) {
      if (allMsgs[i]!.role === 'user') { lastUserIdx = i; break; }
    }
    if (lastUserIdx < 0) return;
    const keep = allMsgs.slice(0, lastUserIdx);
    assistant.loadMessages(keep);
    setMessages(mapMessages(keep));
  }, [assistant, mapMessages]);

  const edit = useCallback((): string | null => {
    const allMsgs = assistant.getMessages();
    let lastUserIdx = -1;
    for (let i = allMsgs.length - 1; i >= 0; i--) {
      if (allMsgs[i]!.role === 'user') { lastUserIdx = i; break; }
    }
    if (lastUserIdx < 0) return null;
    return editByIndex(lastUserIdx);
  }, [assistant, editByIndex]);

  return { messages, loading, guidingQuestions, send, chatId: chatIdRef.current, pendingConfirmation, confirmAction, rejectAction, undoLastMessage, edit, editByIndex };
}

// Re-export the AIChatMessage type for consumers
export type { AIChatMessage };

function extractToolName(raw: string): string {
  const m = raw.match(/Calling (\w+)\(/);
  return m?.[1] ?? '';
}

function truncateToolResult(raw: string): string {
  const prefixMatch = raw.match(/^Result: /);
  const body = prefixMatch ? raw.slice(prefixMatch[0].length) : raw;
  return tryJsonSummary(body);
}

function contentToString(c: string | unknown): string {
  if (typeof c === 'string') return c;
  if (Array.isArray(c)) {
    return c.map((b: { type?: string; text?: string }) => b.text ?? '').join('');
  }
  return String(c ?? '');
}

function tryJsonSummary(text: string): string {
  try {
    const obj = JSON.parse(text);
    if (obj.posts !== undefined) return `搜索到 ${obj.total ?? obj.posts.length} 个帖子`;
    if (obj.feed !== undefined) return `获取了 ${obj.feed.length} 条时间线`;
    if (obj.thread !== undefined) return obj.thread.slice(0, 800);
    if (obj.likes !== undefined) return `${obj.total ?? obj.likes.length} 人赞了`;
    if (obj.saved !== undefined) return `图片已保存: ${obj.saved}`;
    if (obj.mimeType !== undefined && obj.size) return `图片: ${obj.mimeType} (${(obj.size / 1024).toFixed(1)}KB)`;
    if (obj.did !== undefined && obj.handle) return `用户: @${obj.handle} (${obj.displayName ?? ''})`;
    if (obj.notifications !== undefined) return `${obj.notifications.length} 条通知`;
    if (obj.text !== undefined) return `帖子: ${(obj.text as string).slice(0, 300)}`;
    return text.slice(0, 500);
  } catch {
    return text.slice(0, 500);
  }
}
