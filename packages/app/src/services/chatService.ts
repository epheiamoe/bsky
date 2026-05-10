import type { ChatStorage, ChatRecord, AIChatMessage, ChatSummary } from './chatStorage.js';
import { FileChatStorage } from './chatStorage.js';

let _storage: ChatStorage | null = null;

let _writeQueue = Promise.resolve();
let _debounceTimers = new Map<string, ReturnType<typeof setTimeout>>();
let _latestSnapshot = new Map<string, ChatRecord>();
const DEBOUNCE_MS = 300;

function getStorage(): ChatStorage {
  if (!_storage) {
    try {
      if (typeof process !== 'undefined' && process?.versions?.node) {
        // fallback for TUI if initChatService wasn't called explicitly
        _storage = new FileChatStorage();
      } else {
        throw new Error('ChatService not initialized. Call initChatService() at startup.');
      }
    } catch {
      _storage = new FileChatStorage();
    }
  }
  return _storage;
}

export function initChatService(storage: ChatStorage): void {
  if (!_storage) _storage = storage;
}

export function saveChat(
  id: string,
  messages: AIChatMessage[],
  title?: string,
  contextUri?: string,
  context?: { type: 'post'; uri: string } | { type: 'profile'; handle: string },
): void {
  if (messages.length === 0) return;

  const firstUser = messages.find(m => m.role === 'user' && !m.content.startsWith('<currently_viewing>'))
    ?? messages.find(m => m.role === 'user');

  const record: ChatRecord = {
    id,
    title: title ?? firstUser?.content.slice(0, 80) ?? '新对话',
    contextUri,
    context,
    messages,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  _latestSnapshot.set(id, record);

  const existing = _debounceTimers.get(id);
  if (existing) clearTimeout(existing);

  _debounceTimers.set(id, setTimeout(() => {
    const snap = _latestSnapshot.get(id);
    if (!snap || snap.messages.length === 0) { _latestSnapshot.delete(id); return; }
    const storage = getStorage();
    _writeQueue = _writeQueue.then(() => storage.saveChat(snap));
  }, DEBOUNCE_MS));
}

export function loadChat(id: string): Promise<ChatRecord | null> {
  return getStorage().loadChat(id);
}

export function saveChatNow(chat: ChatRecord): Promise<void> {
  return getStorage().saveChat(chat);
}

export function deleteChat(id: string): Promise<void> {
  return getStorage().deleteChat(id);
}

export function listChats(): Promise<ChatSummary[]> {
  return getStorage().listChats();
}

export function getChatStorage(): ChatStorage {
  return getStorage();
}
