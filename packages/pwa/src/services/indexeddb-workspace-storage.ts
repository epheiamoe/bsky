const DB_NAME = 'bsky-workspace';
const DB_VERSION = 1;
const STORE_NAME = 'files';

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

import type { WorkspaceStorage, WorkspaceFile } from '@bsky/app';

export class IndexedDBWorkspaceStorage implements WorkspaceStorage {
  async saveFile(file: WorkspaceFile): Promise<void> {
    const store = await withStore('readwrite');
    return new Promise((resolve, reject) => {
      const req = store.put(file);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  }

  async loadFile(id: string): Promise<WorkspaceFile | null> {
    const store = await withStore('readonly');
    return new Promise((resolve, reject) => {
      const req = store.get(id);
      req.onsuccess = () => resolve(req.result ?? null);
      req.onerror = () => reject(req.error);
    });
  }

  async deleteFile(id: string): Promise<void> {
    const store = await withStore('readwrite');
    return new Promise((resolve, reject) => {
      const req = store.delete(id);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  }

  async listFiles(chatId?: string): Promise<WorkspaceFile[]> {
    const store = await withStore('readonly');
    return new Promise((resolve, reject) => {
      const req = store.getAll();
      req.onsuccess = () => {
        let files = req.result as WorkspaceFile[];
        if (chatId) {
          files = files.filter(f => !f.chatId || f.chatId === chatId);
        }
        files.sort((a, b) => new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime());
        resolve(files);
      };
      req.onerror = () => reject(req.error);
    });
  }

  async clearAll(): Promise<void> {
    const store = await withStore('readwrite');
    return new Promise((resolve, reject) => {
      const req = store.clear();
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  }
}
