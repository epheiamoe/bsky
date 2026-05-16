import { useState, useCallback, useEffect, useRef } from 'react';
import { AIAssistant, createTools } from '@bsky/core';
import { buildSystemPrompt as buildMainPrompt, PF_AUTO_ANALYSIS, P_GUIDING_QUESTIONS } from '@bsky/core';
import type { AIConfig, BskyClient, ChatMessage, ToolCall } from '@bsky/core';
import type { ChatRecord, AIChatMessage } from '../services/chatStorage.js';
import { saveChat, loadChat } from '../services/chatService.js';
import { v4 as uuidv4 } from './uuid.js';

interface UseAIChatOptions {
  chatId?: string;
  stream?: boolean;
  userHandle?: string;
  userDisplayName?: string;
  userPronouns?: string;
  environment?: 'tui' | 'pwa';
  locale?: string;
  /** Profile context: handle (not at:// prefixed) — passed from navigation, not URL */
  contextProfile?: string;
  /** Post context: at:// URI — passed from navigation, not URL */
  contextPost?: string;
  /** Called after a new chat is saved — used to refresh conversation list */
  onChatSaved?: () => void;
  /** Called when the AI auto-generates a chat title — used to refresh conversation list */
  onTitleChanged?: () => void;
}

/** Repairs messages corrupted by pre-v0.12.2 mapMessages ordering bug.
 *  1. Removes empty assistant messages (artifact of broken load reconstruction)
 *  2. Reorders tool_call blocks: [tool_calls, assistant, tool_results] → [assistant, tool_calls, tool_results]
 *  Returns the original array unchanged if no repair is needed. */
function repairCorruptedMessages(messages: AIChatMessage[]): AIChatMessage[] {
  // Step 1: remove empty assistant messages
  const cleaned = messages.filter(m =>
    !(m.role === 'assistant' && (!m.content || m.content.trim() === ''))
  );
  if (cleaned.length === messages.length) return messages; // nothing to clean

  // Step 2: reorder corrupted tool_call blocks
  // Corrupted pattern: tool_call… → assistant → tool_result…
  // Correct pattern:  assistant → tool_call… → tool_result…
  const result: AIChatMessage[] = [];
  let i = 0;
  while (i < cleaned.length) {
    const m = cleaned[i]!;
    if (m.role === 'tool_call') {
      // Collect consecutive tool_calls
      const toolStart = i;
      while (i < cleaned.length && cleaned[i]!.role === 'tool_call') i++;
      const toolCallMsgs = cleaned.slice(toolStart, i);

      if (i < cleaned.length && cleaned[i]!.role === 'assistant') {
        const assistantMsg = cleaned[i]!;
        i++;
        // Collect following tool_results
        const resultStart = i;
        while (i < cleaned.length && cleaned[i]!.role === 'tool_result') i++;
        const toolResultMsgs = cleaned.slice(resultStart, i);
        if (toolResultMsgs.length > 0) {
          // Reorder: assistant → tool_calls → tool_results
          result.push(assistantMsg);
          result.push(...toolCallMsgs);
          result.push(...toolResultMsgs);
        } else {
          result.push(...toolCallMsgs);
          result.push(assistantMsg);
        }
      } else {
        result.push(...toolCallMsgs);
      }
    } else {
      result.push(m);
      i++;
    }
  }
  return result;
}

export function useAIChat(
  client: BskyClient | null,
  aiConfig: AIConfig,
  contextUri?: string,
  options?: UseAIChatOptions,
) {
  const [assistant] = useState(() => new AIAssistant(aiConfig));

  // Keep assistant config in sync when provider/model/baseUrl changes
  useEffect(() => {
    assistant.updateConfig(aiConfig);
  }, [aiConfig, assistant]);
  const [messages, setMessages] = useState<AIChatMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [guidingQuestions, setGuidingQuestions] = useState<string[]>([]);
  const [wasRepaired, setWasRepaired] = useState(false);
  const [pendingConfirmation, setPendingConfirmation] = useState<{
    toolName: string;
    description: string;
  } | null>(null);
  const lastContextUri = useRef<string | undefined>();
  const lastContextPost = useRef<string | undefined>();
  const lastContextProfile = useRef<string | undefined>();
  const abortRef = useRef<AbortController | null>(null);
  const lastChatId = useRef(options?.chatId);
  const chatIdRef = useRef(options?.chatId ?? uuidv4());
  // Sync ref mirroring React state — always has the latest messages
  const messagesRef = useRef<AIChatMessage[]>([]);
  const autoStartedRef = useRef(false);
  const chatNotifiedRef = useRef(false);
  const titleGeneratedRef = useRef(false);
  // Track current context for auto-save persistence
  const contextRef = useRef<import('../services/chatStorage.js').ChatRecord['context']>(undefined);

  const buildSystemPrompt = useCallback((withContext?: string, contextProfile?: string) => {
    return buildMainPrompt({
      contextPost:   withContext,
      contextProfile,
      currentUser:    options?.userHandle,
      userHandle:     options?.userHandle,
      userDisplayName: options?.userDisplayName,
      userPronouns:   options?.userPronouns,
      environment:    options?.environment || 'pwa',
      locale:         options?.locale,
      visionEnabled:  aiConfig.visionEnabled ?? false,
      customPrompt:   aiConfig.customSystemPrompt,
    });
  }, [options?.userHandle, options?.userDisplayName, options?.userPronouns, options?.locale, options?.environment, aiConfig.visionEnabled, aiConfig.customSystemPrompt]);

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
    messagesRef.current = [];
    setGuidingQuestions([]);
    setWasRepaired(false);
    autoStartedRef.current = false;
    chatNotifiedRef.current = false;
    titleGeneratedRef.current = false;

    // Add initial system message based on context from options (in-memory from navigation)
    if (options?.contextPost) {
      assistant.addSystemMessage(buildSystemPrompt(options.contextPost, undefined));
      setGuidingQuestions(P_GUIDING_QUESTIONS);
    } else if (options?.contextProfile) {
      assistant.addSystemMessage(buildSystemPrompt(undefined, options.contextProfile));
    } else {
      assistant.addSystemMessage(buildSystemPrompt(undefined, options?.contextProfile));
    }
  }, [options?.chatId, buildSystemPrompt, options?.contextProfile, options?.contextPost]);

  // Load existing conversation from storage when chatId changes
  useEffect(() => {
    if (!options?.chatId) return;
    void (async () => {
      const record = await loadChat(options.chatId!);
      if (record) {
        const repaired = repairCorruptedMessages(record.messages);
        setMessages(repaired);
        // Persist repair back to storage so the fix is permanent
        if (repaired !== record.messages) {
          saveChat(record.id, repaired, record.title, record.contextUri, record.context);
          setWasRepaired(true);
        }
        // Restore context from saved record (survives page refresh)
        if (record.context) {
          contextRef.current = record.context;
          if (record.context.type === 'post') {
            assistant.addSystemMessage(buildSystemPrompt(record.context.uri, undefined));
            if (record.messages.length === 0) setGuidingQuestions(P_GUIDING_QUESTIONS);
          } else {
            assistant.addSystemMessage(buildSystemPrompt(undefined, record.context.handle));
          }
        } else if (contextUri) {
          assistant.addSystemMessage(buildSystemPrompt(contextUri, options?.contextProfile));
        }
        // Sync assistant state with repaired messages so editByIndex works
        const system = assistant.getMessages().filter(m => m.role === 'system');
        const chatMsgs: ChatMessage[] = [];
        for (const m of repaired) {
          if (m.role === 'thinking') continue;
          if (m.role === 'tool_call' && m.toolCallId && m.toolName) {
            const argsMatch = m.content.match(/\{.*\}/s);
            const toolArgs = argsMatch?.[0] ?? '{}';
            chatMsgs.push({
              role: 'assistant',
              content: '',
              tool_calls: [{
                id: m.toolCallId,
                type: 'function',
                function: { name: m.toolName, arguments: toolArgs },
              }],
            });
          } else if ((m.role === 'tool_result' || m.role === 'tool_call') && m.toolCallId) {
            chatMsgs.push({
              role: 'tool',
              content: m.content,
              tool_call_id: m.toolCallId,
              name: m.toolName,
            });
          } else if (m.role === 'user' || m.role === 'assistant') {
            chatMsgs.push({ 
              role: m.role, 
              content: m.content,
              reasoning_content: (m as any).reasoning_content,
            } as ChatMessage);
          }
        }
        assistant.loadMessages([...system, ...chatMsgs]);
      } else {
        setMessages([]);
      }
    })();
  }, [options?.chatId]);

  // Initialize tools and system prompt
  useEffect(() => {
    if (!client) return;
    const tools = createTools(client);
    assistant.setTools(tools);

    // Set context from options (first navigation — in memory, not URL)
    if (options?.contextPost) {
      contextRef.current = { type: 'post', uri: options.contextPost };
    } else if (options?.contextProfile) {
      contextRef.current = { type: 'profile', handle: options.contextProfile };
    }

    const changed = contextUri !== lastContextUri.current
      || options?.contextPost !== lastContextPost.current
      || options?.contextProfile !== lastContextProfile.current;
    lastContextUri.current = contextUri;
    lastContextPost.current = options?.contextPost;
    lastContextProfile.current = options?.contextProfile;

    if (changed) {
      if (!options?.chatId && !options?.contextProfile && !options?.contextPost) {
        assistant.clearMessages();
        setMessages([]);
      }

      if (options?.contextPost) {
        assistant.addSystemMessage(buildSystemPrompt(options.contextPost, undefined));
        setGuidingQuestions(P_GUIDING_QUESTIONS);
      } else if (options?.contextProfile) {
        assistant.addSystemMessage(buildSystemPrompt(undefined, options.contextProfile));
        setGuidingQuestions([]);
      } else if (contextUri) {
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
  }, [client, contextUri, assistant, options?.contextProfile, options?.contextPost, buildSystemPrompt]);

  // Debounced persistence via ChatService
  const autoSave = useCallback((msgs: AIChatMessage[]) => {
    if (msgs.length === 0) return;

    const firstRealUser = msgs.find(m => m.role === 'user' && !m.content.startsWith('<currently_viewing>'));
    const firstUser = firstRealUser ?? msgs.find(m => m.role === 'user');
    const title = firstUser?.content.slice(0, 80) ?? '新对话';

    saveChat(chatIdRef.current, msgs, title, contextUri, contextRef.current);

    if (!chatNotifiedRef.current) {
      chatNotifiedRef.current = true;
      options?.onChatSaved?.();
    }

    // Auto-generate title once after first assistant reply
    if (!titleGeneratedRef.current && firstRealUser) {
      const firstAssistant = msgs.find(m => m.role === 'assistant');
      if (firstAssistant) {
        titleGeneratedRef.current = true;
        import('@bsky/core').then(({ generateChatTitle }) =>
          generateChatTitle(
            aiConfig,
            firstRealUser.content.slice(0, 100),
            firstAssistant.content.slice(0, 300),
          )
        ).then(newTitle => {
          if (newTitle) {
            saveChat(chatIdRef.current, messagesRef.current, newTitle, contextUri, contextRef.current);
            options?.onTitleChanged?.();
          }
        }).catch(() => {});
      }
    }
  }, [contextUri, options?.onChatSaved, options?.onTitleChanged, aiConfig]);

  const send = useCallback(async (text: string) => {
    const newUserMsg: AIChatMessage = { role: 'user', content: text };
    setMessages(prev => {
      const next = [...prev, newUserMsg];
      messagesRef.current = next;
      return next;
    });
    setGuidingQuestions([]);
    setLoading(true);

    const ctrl = new AbortController();
    abortRef.current = ctrl;

    if (options?.stream) {
      try {
        const stream = assistant.sendMessageStreaming(text, ctrl.signal);
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
            streamingContent = '';
            setMessages(prev => {
              const newMsgs: AIChatMessage[] = [
                ...prev,
                { role: 'tool_call', content: `🔧 ${event.content}`, toolName: event.toolName, toolCallId: (event as any).toolCallId },
              ];
              messagesRef.current = newMsgs;
              return newMsgs;
            });
          } else if (event.type === 'tool_result') {
            setMessages(prev => {
              const newMsgs: AIChatMessage[] = [
                ...prev,
                { role: 'tool_result', content: event.content, toolName: event.toolName, toolCallId: (event as any).toolCallId },
              ];
              messagesRef.current = newMsgs;
              return newMsgs;
            });
          } else if (event.type === 'thinking') {
            setMessages(prev => {
              const last = prev[prev.length - 1];
              if (last?.role === 'thinking') {
                const updated = [...prev];
                updated[updated.length - 1] = { role: 'thinking' as const, content: last.content + event.content };
                messagesRef.current = updated;
                return updated;
              }
              const updated = [...prev, { role: 'thinking' as const, content: event.content }];
              messagesRef.current = updated;
              return updated;
            });
          } else if (event.type === 'token') {
            streamingContent += event.content;
            setMessages(prev => {
              const last = prev[prev.length - 1];
              if (last?.role === 'assistant') {
                const updated = [...prev];
                updated[updated.length - 1] = { ...last, content: streamingContent };
                messagesRef.current = updated;
                return updated;
              }
              const updated = [...prev, { role: 'assistant' as const, content: streamingContent }];
              messagesRef.current = updated;
              return updated;
            });
          } else if (event.type === 'done') {
            // Already updated via tokens
          }
        }

        // Auto-save after streaming complete — read from ref (always latest)
        autoSave(messagesRef.current);
      } catch (e) {
        if (!ctrl.signal.aborted) {
          const errorText = `Error: ${e instanceof Error ? e.message : String(e)}`;
          console.error('[useAIChat] stream error:', errorText);
          setMessages(prev => {
            const errMsg: AIChatMessage = { role: 'assistant', content: errorText, isError: true };
            const updated = [...prev, errMsg];
            messagesRef.current = updated;
            autoSave(updated);
            return updated;
          });
        }
      } finally {
        setLoading(false);
        abortRef.current = null;
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
            const s = step as any;
            newMsgs.push({ role: 'tool_result', content: step.content, toolName: s.toolName, toolCallId: s.toolCallId });
          }
        }
        newMsgs.push({ role: 'assistant', content: result.content });
        const updated = [...prev, ...newMsgs];
        messagesRef.current = updated;
        autoSave(updated);
        return updated;
      });
    } catch (e) {
      if (!ctrl.signal.aborted) {
        const errorText = `Error: ${e instanceof Error ? e.message : String(e)}`;
        console.error('[useAIChat] non-stream error:', errorText);
        setMessages(prev => {
          const errMsg: AIChatMessage = { role: 'assistant', content: errorText, isError: true };
          const updated = [...prev, errMsg];
          messagesRef.current = updated;
          autoSave(updated);
          return updated;
        });
      }
    } finally {
      setLoading(false);
      abortRef.current = null;
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
    const result: AIChatMessage[] = [];
    for (const m of msgs) {
      if (m.role === 'system') continue;

      if (m.role === 'assistant') {
        if (m.reasoning_content) {
          result.push({ role: 'thinking', content: m.reasoning_content as string });
        }
        // Push text content first so tool_call pairs correctly with the tool_result that follows
        const textContent = contentToString(m.content);
        const hasContent = textContent.trim().length > 0;
        if (hasContent) {
          result.push({
            role: 'assistant',
            content: textContent,
            reasoning_content: m.reasoning_content,
            tool_calls: m.tool_calls as any,
          });
        }
        // Tool calls come after text so they are adjacent to tool_result in the message stream
        if (m.tool_calls && m.tool_calls.length > 0) {
          for (const tc of m.tool_calls) {
            result.push({
              role: 'tool_call',
              content: tc.function.name,
              toolName: tc.function.name,
              toolCallId: tc.id,
            });
          }
        }
        // Only push empty-content assistant when there's nothing else (no tool_calls, no reasoning)
        if (!hasContent && (!m.tool_calls || m.tool_calls.length === 0) && !m.reasoning_content) {
          result.push({
            role: 'assistant',
            content: textContent,
            reasoning_content: m.reasoning_content,
            tool_calls: m.tool_calls as any,
          });
        }
      } else if (m.role === 'tool') {
        result.push({
          role: 'tool_result',
          content: contentToString(m.content),
          toolName: m.name,
          toolCallId: m.tool_call_id,
        });
      } else {
        result.push({
          role: m.role as AIChatMessage['role'],
          content: contentToString(m.content),
          reasoning_content: m.reasoning_content,
        });
      }
    }
    return result;
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
          const newMsgs = mapMessages(keep);
          setMessages(newMsgs);
          messagesRef.current = newMsgs;
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
    const newMsgs = mapMessages(keep);
    setMessages(newMsgs);
    messagesRef.current = newMsgs;
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

  const stop = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  const addUserImage = useCallback((data: Uint8Array, mimeType: string, alt: string): number => {
    return assistant.addUserUpload(data, mimeType, alt);
  }, [assistant]);

  return { messages, loading, guidingQuestions, wasRepaired, send, stop, addUserImage, chatId: chatIdRef.current, pendingConfirmation, confirmAction, rejectAction, undoLastMessage, edit, editByIndex };
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
