# Chat Storage & Persistence

## Interface

**File**: `packages/app/src/services/chatStorage.ts`

```typescript
interface ChatStorage {
  saveChat(chat: ChatRecord): Promise<void>;
  loadChat(id: string): Promise<ChatRecord | null>;
  listChats(): Promise<ChatSummary[]>;
  deleteChat(id: string): Promise<void>;
}

interface ChatRecord {
  id: string;                 // UUID v4
  title: string;              // First user message, truncated
  contextUri?: string;        // Bluesky post that started the conversation
  messages: AIChatMessage[];  // UI messages (user/assistant/tool_call/tool_result)
  createdAt: string;
  updatedAt: string;
}

interface ChatSummary {
  id: string;
  title: string;
  messageCount: number;
  updatedAt: string;
}

interface AIChatMessage {
  role: 'user' | 'assistant' | 'tool_call' | 'tool_result';
  content: string;
  toolName?: string;          // Only for tool_call
}
```

## FileChatStorage (Node.js/TUI)

**Location**: `~/.bsky-tui/chats/{chatId}.json`

- Each conversation = one JSON file
- `listChats()` reads directory, parses all JSON files, returns summaries sorted by `updatedAt` desc
- `saveChat()` writes JSON file (overwrites if exists)
- Corrupt files silently skipped

## PWA Implementation

PWA implements `IndexedDBChatStorage` using the same `ChatStorage` interface:

```typescript
class IndexedDBChatStorage implements ChatStorage {
  private db: IDBDatabase;

  async saveChat(chat: ChatRecord): Promise<void> { /* IDB put */ }
  async loadChat(id: string): Promise<ChatRecord | null> { /* IDB get */ }
  async listChats(): Promise<ChatSummary[]> { /* IDB getAll */ }
  async deleteChat(id: string): Promise<void> { /* IDB delete */ }
}
```

Same hooks work identically:
```typescript
const storage = new IndexedDBChatStorage();
const { conversations, loadConversation } = useChatHistory(storage);
const { messages, send } = useAIChat(client, aiConfig, contextUri, { storage });
```

## Auto-Save Flow

```
User types message → useAIChat.send(text)
  │
  ├──▶ setMessages(prev → [...prev, userMsg])
  │     └──▶ autoSave(msgs) → storage.saveChat({ id, title, messages, ... })
  │
  ├──▶ assistant.sendMessage(text) [async, may call tools]
  │
  └──▶ setMessages(prev → [...prev, tool_call, tool_result, assistant])
        └──▶ autoSave(msgs) → storage.saveChat(...)
```

## Restore Flow

```
User selects conversation from history
  │
  ├──▶ setChatId(id) → setShowHistory(false)
  │
  └──▶ useAIChat detects chatId → storage.loadChat(id)
        └──▶ setMessages(record.messages)
        └──▶ assistant.addSystemMessage(context system prompt)
        └──▶ Ready for new messages (previous context preserved in UI)
```

**Note**: Tool results and system prompts are NOT restored to `AIAssistant`'s internal `messages[]`. Only UI messages are displayed. The next `send()` will set up the system prompt fresh. This means multi-turn continuity is maintained for the user's view, but the LLM may not remember previous tool results. For full continuity, `AIAssistant.loadMessages()` can be called with saved raw messages.
