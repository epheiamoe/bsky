# React & Hooks Lessons

> React patterns, hooks, closures, and component lifecycle
>
> Part of the [Lessons Learned](../LESSONS.md) collection.

---

## Lesson 66: Stale Closure in useCallback

**Category**: React / Hooks

**Root Cause**: `AIChatPage.tsx` `handleFileSelect` useCallback had empty dependency array `[]`, capturing initial `sessionId = undefined`. When user navigated to a specific chat session, `sessionId` prop updated but the callback was never recreated.

**Context**:
- `sessionId` prop changes when user opens different chat sessions
- `handleFileSelect` saves uploaded files with `chatId: sessionId`
- Empty deps `[]` meant `sessionId` was forever `undefined` from first render
- Files saved without `chatId` became "global" files visible in all sessions

**Solution**: Add dynamic dependencies to useCallback:
```typescript
const handleFileSelect = useCallback(async (e) => {
  // ... save file with chatId: sessionId
}, [sessionId]); // <-- must include sessionId
```

**Lesson Learned**:
1. **Empty dependency arrays are dangerous** — only for truly static callbacks
2. **Props used inside callbacks must be in deps** — ESLint exhaustive-deps rule catches this
3. **Closure captures value at creation time** — not a live reference
4. **Test multi-session workflows** — upload files in different sessions, verify isolation

---