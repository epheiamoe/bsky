import { useState, useCallback, useEffect, useRef } from 'react';
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

  // Track last known message ID for silent polling
  const lastMsgIdRef = useRef<string | null>(null);

  // Update ref whenever messages change
  useEffect(() => {
    if (messages.length > 0) {
      lastMsgIdRef.current = messages[messages.length - 1]!.id;
    }
  }, [messages]);

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
      // Auto-mark as read when loading a conversation
      try { await client.updateRead(cr.convo.id); } catch { /* silent */ }
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

  const deleteMessage = useCallback(async (messageId: string) => {
    if (!client || !convo) return;
    try {
      await client.deleteMessageForSelf(convo.id, messageId);
      setMessages(prev => prev.filter(m => m.id !== messageId));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [client, convo]);

  const markRead = useCallback(async (convoId?: string) => {
    const id = convoId ?? convo?.id;
    if (!client || !id) return;
    try { await client.updateRead(id); } catch { /* silent */ }
  }, [client, convo]);

  const muteConvoFn = useCallback(async () => {
    if (!client || !convo) return;
    try {
      const res = await client.muteConvo(convo.id);
      setConvo(res.convo);
    } catch { /* silent */ }
  }, [client, convo]);

  const unmuteConvoFn = useCallback(async () => {
    if (!client || !convo) return;
    try {
      const res = await client.unmuteConvo(convo.id);
      setConvo(res.convo);
    } catch { /* silent */ }
  }, [client, convo]);

  // Silent poll — check for new messages every 10s without loading indicator
  const silentPoll = useCallback(async () => {
    if (!client || !convo) return;
    try {
      const mr: GetMessagesResponse = await client.getMessages(convo.id, 30);
      const newMsgs = mr.messages.reverse();
      const lastNewId = newMsgs.length > 0 ? newMsgs[newMsgs.length - 1]?.id : null;
      // Only update if there are new messages (last ID differs from what we've shown)
      if (lastNewId && lastNewId !== lastMsgIdRef.current) {
        setMessages(newMsgs);
        setCursor(mr.cursor);
      }
    } catch { /* silent poll — ignore errors */ }
  }, [client, convo]);

  useEffect(() => {
    if (!client || !convo) return;
    const iv = setInterval(silentPoll, 10000); // 10s poll
    return () => clearInterval(iv);
  }, [silentPoll, client, convo]);

  return {
    messages, convo, loading, sending, error,
    loadConvo, loadOlder, sendMessage, toggleReaction, refresh,
    deleteMessage, markRead, muteConvo: muteConvoFn, unmuteConvo: unmuteConvoFn,
  };
}

/** Check if text looks like a Bluesky post URI; parse it for embedding */
export function parsePostUri(text: string): { uri: string; did?: string; rkey?: string; handle?: string } | null {
  // at:// URI with DID
  const atDidMatch = text.match(/at:\/\/(did:plc:[^\/]+)\/app\.bsky\.feed\.post\/([^\s]+)/);
  if (atDidMatch) {
    return { uri: atDidMatch[0]!, did: atDidMatch[1]!, rkey: atDidMatch[2]! };
  }
  // at:// URI with handle
  const atHandleMatch = text.match(/at:\/\/([^\/]+)\/app\.bsky\.feed\.post\/([^\s]+)/);
  if (atHandleMatch) {
    return { uri: atHandleMatch[0]!, handle: atHandleMatch[1]!, rkey: atHandleMatch[2]! };
  }
  // bsky.app web URL
  const webMatch = text.match(/https?:\/\/bsky\.app\/profile\/([^\/]+)\/post\/([^\s?&]+)/);
  if (webMatch) {
    const handle = webMatch[1]!;
    const rkey = webMatch[2]!;
    return { uri: `at://${handle}/app.bsky.feed.post/${rkey}`, handle, rkey };
  }
  return null;
}
