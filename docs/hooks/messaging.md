# Messaging Hooks

Messaging hooks handle direct message conversations and chat message threads.

## useConvoList

**File**: `packages/app/src/hooks/useConvoList.ts`

```typescript
function useConvoList(client: BskyClient | null): {
  convos: ConvoView[];
  cursor?: string;
  loading: boolean;
  error: string | null;
  load: (reset?: boolean) => Promise<void>;
  refresh: () => Promise<void>;
}

/** Optimistically clear unread badge after markRead */
export function markConvoRead(convoId: string): void;
```

Calls `client.listConvos()` via `chatKy` (→ `api.bsky.chat/xrpc`). Supports cursor-based pagination. 30s silent polling interval.

## useChatMessages

**File**: `packages/app/src/hooks/useChatMessages.ts`

```typescript
function useChatMessages(client: BskyClient | null): {
  messages: AnyChatMessage[];
  convo: ConvoView | null;
  loading: boolean;
  sending: boolean;
  error: string | null;
  cursor?: string;
  loadConvo: (conversationId: string, reset?: boolean) => Promise<void>;
  loadOlder: () => Promise<void>;
  sendMessage: (text: string, embed?: MessageInput['embed']) => Promise<void>;
  toggleReaction: (messageId: string, value: string, isPresent: boolean) => Promise<void>;
  refresh: () => Promise<void>;
  deleteMessage: (messageId: string) => Promise<void>;
  markRead: () => Promise<void>;
  muteConvo: () => Promise<void>;
  unmuteConvo: () => Promise<void>;
}

export function parsePostUri(text: string): {
  uri: string; did?: string; rkey?: string; handle?: string;
} | null
```

`loadConvo` calls `getConvoForMembers([did])` + `getMessages(convoId)`. `loadOlder` paginates via cursor. 10s silent polling for new messages.

`parsePostUri` detects three formats:
- `at://did:plc:xxx/app.bsky.feed.post/rkey`
- `at://handle/app.bsky.feed.post/rkey`
- `https://bsky.app/profile/handle/post/rkey`
