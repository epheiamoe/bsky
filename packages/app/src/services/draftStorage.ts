import * as fs from 'fs';
import * as path from 'path';
import { homedir } from 'os';

export interface AppDraft {
  id: string;
  serverId?: string;
  posts: { text: string }[];
  replyTo?: string;
  quoteUri?: string;
  createdAt: string;
  updatedAt: string;
  syncStatus: 'local' | 'synced' | 'modified';
}

export interface DraftStorage {
  getAll(): Promise<AppDraft[]>;
  get(id: string): Promise<AppDraft | undefined>;
  set(draft: AppDraft): Promise<void>;
  delete(id: string): Promise<void>;
}

export class FileDraftStorage implements DraftStorage {
  private dir: string;

  constructor(dir?: string) {
    this.dir = dir ?? path.join(homedir(), '.bsky-tui', 'drafts');
    if (!fs.existsSync(this.dir)) {
      fs.mkdirSync(this.dir, { recursive: true });
    }
  }

  async getAll(): Promise<AppDraft[]> {
    try {
      const files = fs.readdirSync(this.dir).filter(f => f.endsWith('.json'));
      const drafts: AppDraft[] = [];
      for (const file of files) {
        try {
          const data = fs.readFileSync(path.join(this.dir, file), 'utf-8');
          const draft = JSON.parse(data) as AppDraft;
          if (draft.id && Array.isArray(draft.posts)) drafts.push(draft);
        } catch { /* skip corrupt files */ }
      }
      drafts.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
      return drafts;
    } catch {
      return [];
    }
  }

  async get(id: string): Promise<AppDraft | undefined> {
    try {
      const filePath = path.join(this.dir, `${id}.json`);
      const data = fs.readFileSync(filePath, 'utf-8');
      return JSON.parse(data) as AppDraft;
    } catch {
      return undefined;
    }
  }

  async set(draft: AppDraft): Promise<void> {
    const filePath = path.join(this.dir, `${draft.id}.json`);
    fs.writeFileSync(filePath, JSON.stringify(draft, null, 2), 'utf-8');
  }

  async delete(id: string): Promise<void> {
    const filePath = path.join(this.dir, `${id}.json`);
    try { fs.unlinkSync(filePath); } catch { /* skip */ }
  }
}

let _defaultDraftStorage: DraftStorage | null = null;
let _draftStorageFactory: (() => DraftStorage) | null = null;

export function setDraftStorageFactory(factory: () => DraftStorage) {
  _draftStorageFactory = factory;
  _defaultDraftStorage = null; // reset cached
}

export function getDefaultDraftStorage(): DraftStorage {
  if (!_defaultDraftStorage) {
    if (_draftStorageFactory) {
      _defaultDraftStorage = _draftStorageFactory();
    } else {
      // Fallback: auto-detect platform
      try {
        const g = globalThis as { window?: unknown; process?: { versions?: { node?: string } } };
        if (g.process?.versions?.node) {
          _defaultDraftStorage = new FileDraftStorage();
        } else {
          // Browser — needs setDraftStorageFactory before use
          throw new Error('No draft storage factory set. Call setDraftStorageFactory() with an IndexedDBDraftStorage instance.');
        }
      } catch {
        _defaultDraftStorage = new FileDraftStorage();
      }
    }
  }
  return _defaultDraftStorage;
}
