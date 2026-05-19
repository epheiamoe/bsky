# Lists Hooks

Lists hooks manage Bluesky moderation and curation lists, including CRUD operations and member management.

## useLists

**File**: `packages/app/src/hooks/useLists.ts`

```typescript
function useLists(
  client: BskyClient | null,
  actor?: string  // undefined = self
): {
  lists: ListView[];
  loading: boolean;
  error: string | null;
  createList: (name: string, purpose: ListPurpose, description?: string) => Promise<ListView | null>;
  deleteList: (uri: string) => Promise<void>;
  updateListInfo: (uri: string, params: { name?: string; description?: string }) => Promise<void>;
  refresh: () => Promise<void>;
}
```

Uses `readCache`/`writeCache` for local persistence. Auto-retry once on failure.

## useListDetail

**File**: `packages/app/src/hooks/useListDetail.ts`

```typescript
function useListDetail(
  client: BskyClient | null,
  listUri: string
): {
  list: ListView | null;
  loading: boolean;
  error: string | null;
  members: ListItemView[];
  membersCursor?: string;
  loadMoreMembers: () => Promise<void>;
  feed: PostView[];
  feedCursor?: string;
  loadMoreFeed: () => Promise<void>;
  isMuted: boolean;
  toggleMute: () => Promise<void>;
  addMember: (subjectDid: string) => Promise<void>;
  removeMember: (itemUri: string) => Promise<void>;
  updateListInfo: (params: { name?: string; description?: string }) => Promise<void>;
  deleteList: () => Promise<void>;
  refresh: () => Promise<void>;
}
```

Parallel loads list info + feed on mount. Posts/Members tabs in PWA both consume this hook.
