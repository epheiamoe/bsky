# Auth Hooks

Authentication hooks manage Bluesky session state, login, and session restoration.

## useAuth

**File**: `packages/app/src/hooks/useAuth.ts`

```typescript
function useAuth(): {
  client: BskyClient | null;
  session: CreateSessionResponse | null;
  pdsUrl: string | null;
  profile: ProfileView | null;
  loading: boolean;
  error: string | null;
  errorLog: LoginErrorDetail | null;
  login: (handle: string, password: string, pdsUrl?: string) => Promise<void>;
  restoreSession: (session: CreateSessionResponse, pdsUrl: string) => void;
}
```
