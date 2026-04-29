import type { ChatStorage, ChatRecord, ChatSummary } from '@bsky/app';

const DB_NAME = 'bsky-chats';
const DB_VERSION = 1;
const STORE_NAME = 'chats';

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function withStore(mode: IDBTransactionMode): Promise<IDBObjectStore> {
  return openDB().then(db => {
    const tx = db.transaction(STORE_NAME, mode);
    return tx.objectStore(STORE_NAME);
  });
}

export class IndexedDBChatStorage implements ChatStorage {
  async saveChat(chat: ChatRecord): Promise<void> {
    const store = await withStore('readwrite');
    return new Promise((resolve, reject) => {
      const req = store.put({ ...chat, updatedAt: chat.updatedAt ?? new Date().toISOString() });
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  }

  async loadChat(id: string): Promise<ChatRecord | null> {
    const store = await withStore('readonly');
    return new Promise((resolve, reject) => {
      const req = store.get(id);
      req.onsuccess = () => resolve(req.result ?? null);
      req.onerror = () => reject(req.error);
    });
  }

  async listChats(): Promise<ChatSummary[]> {
    const store = await withStore('readonly');
    return new Promise((resolve, reject) => {
      const req = store.getAll();
      req.onsuccess = () => {
        const all = req.result as ChatRecord[];
        resolve(
          all
            .map(c => ({
              id: c.id,
              title: c.title,
              messageCount: c.messages.filter(m => m.role === 'user' || m.role === 'assistant').length,
              updatedAt: c.updatedAt,
            }))
            .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
        );
      };
      req.onerror = () => reject(req.error);
    });
  }

  async deleteChat(id: string): Promise<void> {
    const store = await withStore('readwrite');
    return new Promise((resolve, reject) => {
      const req = store.delete(id);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  }
}
