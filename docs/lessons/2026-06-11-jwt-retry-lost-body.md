# Lesson — JWT Refresh Retry Dropped Request Body

**Date**: 2026-06-11  
**Scope**: `packages/core/src/at/client.ts` (`BskyClient._withRefresh`)

## Symptom

Long compose threads with images **always** failed with "Upload failed" on PWA. Short posts or text-only posts worked fine.

## Root Cause

`BskyClient` uses a ky `afterResponse` hook (`_withRefresh`) to detect expired access tokens and retry the original request with a refreshed JWT. The retry was implemented with raw `fetch`:

```js
const retryRes = await fetch(request.url, {
  method: request.method,
  headers: { Authorization: `Bearer ${self.session.accessJwt}` },
});
```

This only forwarded:
- The URL
- The HTTP method
- A brand-new `Authorization` header

It **dropped**:
- The request body (critical for `uploadBlob` binary uploads)
- `Content-Type` and all other original headers
- `redirect` / `signal` options

When a user's access token expired mid-upload (more likely during long threads with many images because the upload window was longer), the retry sent an empty POST with `Content-Type: text/plain;charset=UTF-8`, which the PDS rejected.

## Fix

Forward the original headers (minus `content-length`, which fetch should recompute) and body on retry:

```js
const retryHeaders = new Headers(request.headers);
retryHeaders.set('Authorization', `Bearer ${self.session.accessJwt}`);
retryHeaders.delete('content-length');
const retryInit = {
  method: request.method,
  headers: retryHeaders,
  body: request.body,
  redirect: request.redirect,
  signal: request.signal,
};
const retryRes = await fetch(request.url, retryInit);
```

## Side Effects

Also improved error visibility in `ComposePage.executeSubmit`: upload failures now include the raw error message (`e.message`) instead of swallowing it.

## Prevention

- Any retry path that uses raw `fetch` must forward **body + all original headers**.
- For ky hooks, prefer returning a `Response` from `afterResponse` only when the retry truly mirrors the original request.
- Long-running operations (multi-image uploads) are the most likely to hit token expiry; test them explicitly.

## Related

- `docs/lessons/auth.md` — prior JWT refresh lessons
- `docs/ARCHITECTURE.md` — BskyClient dual-ky architecture
