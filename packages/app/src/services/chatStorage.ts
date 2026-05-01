import * as fs from 'fs';
import * as path from 'path';
import { homedir } from 'os';

export interface AIChatMessage {
  role: 'user' | 'assistant' | 'tool_call' | 'tool_result' | 'thinking';
  content: string;
  toolName?: string;
  isError?: boolean;
}

export interface ChatRecord {
  id: string;
  title: string;
  contextUri?: string;
  context?: { type: 'post'; uri: string } | { type: 'profile'; handle: string };
  messages: AIChatMessage[];
  createdAt: string;
  updatedAt: string;
}

export interface ChatSummary {
  id: string;
  title: string;
  messageCount: number;
  updatedAt: string;
}

export interface ChatStorage {
  saveChat(chat: ChatRecord): Promise<void>;
  loadChat(id: string): Promise<ChatRecord | null>;
  listChats(): Promise<ChatSummary[]>;
  deleteChat(id: string): Promise<void>;
}

export class FileChatStorage implements ChatStorage {
  private dir: string;

  constructor(dir?: string) {
    this.dir = dir ?? path.join(homedir(), '.bsky-tui', 'chats');
    if (!fs.existsSync(this.dir)) {
      fs.mkdirSync(this.dir, { recursive: true });
    }
  }

  async saveChat(chat: ChatRecord): Promise<void> {
    const filePath = path.join(this.dir, `${chat.id}.json`);
    chat.updatedAt = new Date().toISOString();
    fs.writeFileSync(filePath, JSON.stringify(chat, null, 2), 'utf-8');
  }

  async loadChat(id: string): Promise<ChatRecord | null> {
    const filePath = path.join(this.dir, `${id}.json`);
    try {
      const data = fs.readFileSync(filePath, 'utf-8');
      return JSON.parse(data) as ChatRecord;
    } catch {
      return null;
    }
  }

  async listChats(): Promise<ChatSummary[]> {
    try {
      const files = fs.readdirSync(this.dir).filter(f => f.endsWith('.json'));
      const summaries: ChatSummary[] = [];
      for (const file of files) {
        try {
          const data = fs.readFileSync(path.join(this.dir, file), 'utf-8');
          const record = JSON.parse(data) as ChatRecord;
          summaries.push({
            id: record.id,
            title: record.title,
            messageCount: record.messages.filter(m => m.role === 'user' || m.role === 'assistant').length,
            updatedAt: record.updatedAt,
          });
        } catch { /* skip corrupt files */ }
      }
      summaries.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
      return summaries;
    } catch {
      return [];
    }
  }

  async deleteChat(id: string): Promise<void> {
    const filePath = path.join(this.dir, `${id}.json`);
    try { fs.unlinkSync(filePath); } catch { /* skip */ }
  }
}
