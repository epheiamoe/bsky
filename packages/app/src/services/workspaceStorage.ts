import * as fs from 'fs';
import * as path from 'path';
import { homedir } from 'os';

export interface WorkspaceFile {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  data: Uint8Array;
  uploadedAt: string;
  chatId?: string; // Optional session isolation — files without chatId are global
}

export interface WorkspaceStorage {
  saveFile(file: WorkspaceFile): Promise<void>;
  loadFile(id: string): Promise<WorkspaceFile | null>;
  deleteFile(id: string): Promise<void>;
  listFiles(chatId?: string): Promise<WorkspaceFile[]>;
  clearAll(): Promise<void>;
}

export class FileWorkspaceStorage implements WorkspaceStorage {
  private dir: string;

  constructor(dir?: string) {
    this.dir = dir ?? path.join(homedir(), '.bsky-tui', 'workspace');
    if (!fs.existsSync(this.dir)) {
      fs.mkdirSync(this.dir, { recursive: true });
    }
    // Clean up legacy files without chatId (orphaned from pre-isolation era)
    this.cleanupOrphanedFiles();
  }

  private cleanupOrphanedFiles(): number {
    try {
      const files = fs.readdirSync(this.dir).filter(f => f.endsWith('.json'));
      let removed = 0;
      for (const f of files) {
        const id = f.replace('.json', '');
        try {
          const metaRaw = fs.readFileSync(path.join(this.dir, f), 'utf-8');
          const meta = JSON.parse(metaRaw);
          if (!meta.chatId || meta.chatId === '') {
            fs.unlinkSync(path.join(this.dir, f));
            try { fs.unlinkSync(this._dataPath(id)); } catch {}
            removed++;
          }
        } catch { /* skip corrupted files */ }
      }
      if (removed > 0) {
        console.log(`[FileWorkspaceStorage] Cleaned up ${removed} orphaned files (no chatId)`);
      }
      return removed;
    } catch {
      return 0;
    }
  }

  private _metaPath(id: string): string {
    return path.join(this.dir, `${id}.json`);
  }

  private _dataPath(id: string): string {
    return path.join(this.dir, `${id}.bin`);
  }

  async saveFile(file: WorkspaceFile): Promise<void> {
    const metaPath = this._metaPath(file.id);
    const dataPath = this._dataPath(file.id);
    const meta = {
      id: file.id,
      name: file.name,
      mimeType: file.mimeType,
      size: file.size,
      uploadedAt: file.uploadedAt,
      chatId: file.chatId,
    };
    fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2), 'utf-8');
    fs.writeFileSync(dataPath, Buffer.from(file.data));
  }

  async loadFile(id: string): Promise<WorkspaceFile | null> {
    const metaPath = this._metaPath(id);
    const dataPath = this._dataPath(id);
    try {
      const metaRaw = fs.readFileSync(metaPath, 'utf-8');
      const meta = JSON.parse(metaRaw);
      const data = new Uint8Array(fs.readFileSync(dataPath));
      return { ...meta, data };
    } catch {
      return null;
    }
  }

  async deleteFile(id: string): Promise<void> {
    try { fs.unlinkSync(this._metaPath(id)); } catch { /* skip */ }
    try { fs.unlinkSync(this._dataPath(id)); } catch { /* skip */ }
  }

  async listFiles(chatId?: string): Promise<WorkspaceFile[]> {
    try {
      const files = fs.readdirSync(this.dir).filter(f => f.endsWith('.json'));
      const result: WorkspaceFile[] = [];
      for (const f of files) {
        const id = f.replace('.json', '');
        const file = await this.loadFile(id);
        if (!file) continue;
        // Strict isolation: if chatId is provided, only include files matching this chat
        if (chatId && file.chatId !== chatId) continue;
        result.push(file);
      }
      result.sort((a, b) => new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime());
      return result;
    } catch {
      return [];
    }
  }

  async clearAll(): Promise<void> {
    try {
      const files = fs.readdirSync(this.dir);
      for (const f of files) {
        fs.unlinkSync(path.join(this.dir, f));
      }
    } catch { /* skip */ }
  }
}

let _defaultWorkspaceStorage: WorkspaceStorage | null = null;
let _workspaceStorageFactory: (() => WorkspaceStorage) | null = null;

export function setWorkspaceStorageFactory(factory: () => WorkspaceStorage) {
  _workspaceStorageFactory = factory;
  _defaultWorkspaceStorage = null;
}

export function getDefaultWorkspaceStorage(): WorkspaceStorage {
  if (!_defaultWorkspaceStorage) {
    if (_workspaceStorageFactory) {
      _defaultWorkspaceStorage = _workspaceStorageFactory();
    } else {
      throw new Error('WorkspaceStorage not initialized. Call setWorkspaceStorageFactory() at startup.');
    }
  }
  return _defaultWorkspaceStorage;
}
