import { useState, useCallback } from 'react';
import type { BskyClient, MessageView, DeletedMessageView, SystemMessageView, MessageInput, ConvoView, GetConvoResponse, GetMessagesResponse } from '@bsky/core';

export type ChatMessage = MessageView;
export type ChatDeletedMessage = DeletedMessageView;
export type ChatSystemMessage = SystemMessageView;
export type AnyChatMessage = MessageView | DeletedMessageView | SystemMessageView;

export function useChatMessages(client: BskyClient | null) {
  const [messages, setMessages] = useState<AnyChatMessage[]>([]);
  const [cursor, setCursor] = useState<string>();
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [convo, setConvo] = useState<ConvoView | null>(null);

  const loadConvo = useCallback(async (conversationId: string, reset = false) => {
    if (!client) return;
    setLoading(true);
    setError(null);
    try {
      const cr: GetConvoResponse = await client.getConvoForMembers([conversationId]);
      setConvo(cr.convo);
      const mr: GetMessagesResponse = await client.getMessages(cr.convo.id, 30);
      setMessages(mr.messages.reverse());
      setCursor(mr.cursor);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [client]);

  const loadOlder = useCallback(async () => {
    if (!client || !convo || !cursor) return;
    setLoading(true);
    try {
      const mr: GetMessagesResponse = await client.getMessages(convo.id, 30, cursor);
      setMessages(prev => [...mr.messages.reverse(), ...prev]);
      setCursor(mr.cursor);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [client, convo, cursor]);

  const sendMessage = useCallback(async (text: string, embed?: MessageInput['embed']) => {
    if (!client || !convo) return;
    setSending(true);
    setError(null);
    try {
      const msg = await client.sendMessage(convo.id, { text, ...(embed ? { embed } : {}) });
      setMessages(prev => [...prev, msg]);
      return msg;
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSending(false);
    }
  }, [client, convo]);

  const toggleReaction = useCallback(async (messageId: string, value: string, isPresent: boolean) => {
    if (!client || !convo) return;
    try {
      let updated: MessageView;
      if (isPresent) {
        updated = await client.removeReaction(convo.id, messageId, value);
      } else {
        updated = await client.addReaction(convo.id, messageId, value);
      }
      setMessages(prev => prev.map(m =>
        'reactions' in m && m.id === messageId ? updated : m
      ));
    } catch {
      // silently ignore reaction errors
    }
  }, [client, convo]);

  const refresh = useCallback(async () => {
    if (!client || !convo) return;
    setLoading(true);
    setError(null);
    try {
      const mr: GetMessagesResponse = await client.getMessages(convo.id, 50);
      setMessages(mr.messages.reverse());
      setCursor(mr.cursor);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [client, convo]);

  return {
    messages, convo, loading, sending, error,
    loadConvo, loadOlder, sendMessage, toggleReaction, refresh,
  };
}

/** Check if text looks like a Bluesky post URI; parse it for embedding */
export function parsePostUri(text: string): { uri: string } | null {
  // at:// URI
  const atMatch = text.match(/at:\/\/(did:plc:[^\/]+)\/app\.bsky\.feed\.post\/([^\s]+)/);
  if (atMatch) {
    return { uri: atMatch[0]! };
  }
  // bsky.app web URL
  const webMatch = text.match(/https?:\/\/bsky\.app\/profile\/([^\/]+)\/post\/([^\s?&]+)/);
  if (webMatch) {
    const handle = webMatch[1]!;
    const rkey = webMatch[2]!;
    return { uri: `at://${handle}/app.bsky.feed.post/${rkey}` };
  }
  return null;
}
