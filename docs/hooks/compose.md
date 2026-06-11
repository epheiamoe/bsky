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
  /** For video: uploaded caption blob refs (VTT subtitles) */
  captions?: Array<{ lang: string; blobRef: { $link: string; mimeType: string; size: number } }>;
  /** For video: aspect ratio { width, height } */
  aspectRatio?: { width: number; height: number };
}
```

**Video upload** (v0.14.2+): Uses Bluesky Video Service (`video.bsky.app`) for preprocessing before posting. The service transcodes the video and stores it as a blob on the PDS. ComposePage generates a unique `name` for each upload, shows upload/progress stages (`video_uploading` → `video_processing`) with percentage, and defaults to `allowFallback: false`. On a recoverable Video Service failure, ComposePage shows a modal with **Retry preprocessing**, **Upload without preprocessing**, and **Back to Edit** options. Raw-blob fallback only happens after explicit user consent and is flagged with `fallbackReason`.

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

**Video metadata** (v0.14.2+): Videos support ALT text (max 10000 chars), VTT caption tracks (up to 20, max 20KB each), and aspect ratio. Caption files are uploaded as separate blobs and referenced in the `app.bsky.embed.video` record.
