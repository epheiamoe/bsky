import { useState, useEffect, useCallback } from 'react';
import type { ChatStorage, ChatSummary, ChatRecord } from '../services/chatStorage.js';
import { getDefaultChatStorage } from '../services/chatStorage.js';

export function useChatHistory(storage?: ChatStorage) {
  const [conversations, setConversations] = useState<ChatSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const store = storage ?? getDefaultChatStorage();

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const list = await store.listChats();
      setConversations(list);
    } catch (e) {
      console.error('Chat history load error:', e);
    } finally {
      setLoading(false);
    }
  }, [store]);

  useEffect(() => { void refresh(); }, [refresh]);

  const loadConversation = useCallback(async (id: string): Promise<ChatRecord | null> => {
    return store.loadChat(id);
  }, [store]);

  const saveConversation = useCallback(async (chat: ChatRecord) => {
    await store.saveChat(chat);
    await refresh();
  }, [store, refresh]);

  const deleteConversation = useCallback(async (id: string) => {
    await store.deleteChat(id);
    await refresh();
  }, [store, refresh]);

  return { conversations, loading, loadConversation, saveConversation, deleteConversation, refresh, storage: store };
}
