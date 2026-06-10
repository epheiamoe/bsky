# Compose Hooks

Compose hooks manage post creation, multi-post threads, and draft persistence.

## useCompose

**File**: `packages/app/src/hooks/useCompose.ts`

```typescript
function useCompose(
  client: BskyClient | null,
  goBack: () => void,
  onSuccess?: (uris?: string[]) => void
): {
  posts: ComposePostItem[];
  addPost: () => void;
  removePost: (id: string) => void;
  setPostText: (id: string, text: string) => void;
  submitting: boolean;
  error: string | null;
  replyTo: string | undefined;
  setReplyTo: (uri: string | undefined) => void;
  quoteUri: string | undefined;
  setQuoteUri: (uri: string | undefined) => void;
  threadgateRules: ThreadgateRule[] | null | undefined;
  setThreadgateRules: (rules: ThreadgateRule[] | null | undefined) => void;
  submit: (mediaMap?: Map<string, ComposeMedia[]>, quoteMap?: Map<string, string>) => Promise<void>;
  loadFromDraft: (draftPosts: { text: string }[], draftReplyTo?: string, draftQuoteUri?: string) => void;
  toDraftData: () => { posts: { text: string }[]; replyTo?: string; quoteUri?: string };
}

interface ComposePostItem { id: string; text: string; }
interface ComposeMedia {
  type: 'image' | 'video';
  blobRef: { $link: string; mimeType: string; size: number };
  alt: string;
}
```

## useDrafts

**File**: `packages/app/src/hooks/useDrafts.ts`

```typescript
function useDrafts(client: BskyClient | null): {
  drafts: AppDraft[];
  loading: boolean;
  saving: boolean;
  saveDraft: (data: { posts: { text: string }[]; replyTo?: string; quoteUri?: string }, draftId?: string) => Promise<string>;
  deleteDraft: (id: string) => Promise<void>;
  syncDraft: (id: string) => Promise<void>;
  refreshDrafts: () => Promise<void>;
  loadDraft: (id: string) => AppDraft | undefined;
  findDuplicateOnServer: (data: { posts: { text: string }[]; replyTo?: string; quoteUri?: string }) => AppDraft | undefined;
}

interface AppDraft {
  id: string;
  serverId?: string;
  posts: { text: string }[];
  replyTo?: string;
  quoteUri?: string;
  createdAt: string;
  updatedAt: string;
  syncStatus: 'local' | 'synced';
}
```

Uses module-level `_clientRef` to avoid stale closures. PDS-first sync with local fallback.

**PWA compose media handling**: selected image/video bytes are read into `Uint8Array` immediately on selection and stored in component state. Upload uses the stored bytes — never the original `File` reference, which can become stale on mobile (especially after backgrounding or cloud-picker virtualization).
