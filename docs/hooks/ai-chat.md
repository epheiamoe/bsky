# AI Chat Hooks

AI chat hooks manage conversational AI sessions, message history, and storage.

## useAIChat

**File**: `packages/app/src/hooks/useAIChat.ts`

```typescript
function useAIChat(
  client: BskyClient | null,
  aiConfig: AIConfig,
  contextUri?: string,
  options?: {
    chatId?: string;
    storage?: ChatStorage;
    stream?: boolean;
    userHandle?: string;
    userDisplayName?: string;
    environment?: 'tui' | 'pwa';
    locale?: string;
    contextPost?: string;
    contextProfile?: string;
    onChatSaved?: () => void;
  }
): {
  messages: AIChatMessage[];
  loading: boolean;
  guidingQuestions: string[];
  send: (text: string) => Promise<void>;
  stop: () => void;
  addUserImage: (data: Uint8Array, mimeType: string, alt: string) => number;
  chatId: string;
  pendingConfirmation: { toolName: string; description: string } | null;
  confirmAction: () => void;
  rejectAction: () => void;
  edit: () => string | null;
  editByIndex: (n: number) => string | null;
}
```

## useChatHistory

**File**: `packages/app/src/hooks/useChatHistory.ts`

```typescript
function useChatHistory(storage?: ChatStorage): {
  conversations: ChatSummary[];
  loading: boolean;
  loadConversation: (id: string) => Promise<ChatRecord | null>;
  saveConversation: (chat: ChatRecord) => Promise<void>;
  deleteConversation: (id: string) => Promise<void>;
  refresh: () => Promise<void>;
  storage: ChatStorage;
}
```
