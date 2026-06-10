# Lesson — Don't Rely on Component Unmount to Close Modals

**Date**: 2026-06-11  
**Scope**: `packages/pwa/src/components/ComposePage.tsx` (`submitProgress`, `executeSubmit`)

## Symptom

After a post was successfully published, the "Posting..." progress modal remained visible and could not be closed. The UI showed a spinning loader with "Creating post (N/N)..." indefinitely.

## Root Cause

`executeSubmit` had no explicit success-handling for the `submitProgress` state:

```tsx
setSubmitProgress({ visible: true, phase: 'posting', ... });
try {
  await submit(mediaMap, quoteMap);
} catch {
  // Error handled in submit
}
// ← nothing here: modal stays on 'posting' phase
```

The code assumed that `submit()` → `onSuccess` → `handlePosted` → `goBack()` would always unmount the component, and the modal would disappear along with it. But:

1. `goBack()` uses `window.history.back()` — on mobile, if the history stack is empty or the popstate event is delayed, the component may not unmount immediately.
2. If navigation races with the modal render, the modal can stay visible for an extra frame or longer.
3. If `goBack()` fails silently (no history to go back to) and `goTo()` is the actual navigation, there's a brief window where the component is still mounted.

## Fix

Explicitly transition the modal to a `'done'` state and auto-hide it:

```tsx
try {
  await submit(mediaMap, quoteMap);
  setSubmitProgress({ visible: true, phase: 'done', current: totalItems, total: totalItems, message: t('compose.posted') });
  submitProgressTimerRef.current = setTimeout(() => {
    setSubmitProgress(prev => ({ ...prev, visible: false }));
  }, 1200);
} catch {
  // Error handled in submit
}
```

With proper timer cleanup on unmount:

```tsx
useEffect(() => {
  return () => {
    // ... blob URL cleanup
    if (submitProgressTimerRef.current) {
      clearTimeout(submitProgressTimerRef.current);
    }
  };
}, []);
```

## Prevention

- **Never rely on component unmount alone** to dismiss UI state like modals, toasts, or progress indicators.
- Always provide an explicit terminal state (`done`, `success`, `idle`) and a timeout-based auto-dismiss.
- Track timers with refs and clear them in the cleanup function to avoid:
  - Memory leaks
  - React state-update warnings on unmounted components
  - Unexpected UI behavior if the component remounts quickly

## Related

- `docs/lessons/2026-06-11-file-reference-stale-upload.md` — another ComposePage fix the same day
- `docs/ARCHITECTURE.md` — PWA routing via `useHashRouter`
