# Lesson — File Object Reference Becomes Stale Before Upload

**Date**: 2026-06-11  
**Scope**: `packages/pwa/src/components/ComposePage.tsx` (`LocalImage`, `LocalVideo`, `processFiles`)

## Symptom

Long compose threads with images on PWA consistently failed during upload with:

> The requested file could not be read, typically due to permission problems that have occurred after a reference to a file was acquired.

Short posts or quick uploads often worked.

## Root Cause

`ComposePage` stored the browser's `File` object directly in React state and deferred reading its bytes until the upload phase:

```tsx
// Selected files
setPerPostVideos(prev => new Map(prev).set(postId, {
  file: videoFile,                 // ← File reference stored
  preview: URL.createObjectURL(videoFile),
  uploading: false,
}));

// Later, during upload
const data = new Uint8Array(await vid.file.arrayBuffer()); // ← may throw
```

On mobile browsers (and occasionally on desktop after backgrounding the tab), the `File` object can become stale between selection and upload. The browser revokes the underlying file handle, especially when:

- The file comes from a temporary / sandboxed origin (camera roll, cloud picker)
- The user takes a long time editing before tapping Send
- The tab is backgrounded or the device sleeps
- A file picked from a cloud provider (Google Photos, iCloud) is virtualized

When `file.arrayBuffer()` was finally called, the browser no longer had permission to read the original handle and threw the above `DOMException`.

## Fix

Read the file bytes **immediately upon selection** and store a `Uint8Array` instead of the `File` reference. Create the preview blob URL from the stored bytes so nothing depends on the original handle.

```tsx
interface LocalImage {
  data: Uint8Array;   // ← actual bytes, captured right away
  fileName: string;
  mimeType: string;
  preview: string;
  uploading: boolean;
  altText: string;
}

// Selection-time
const data = new Uint8Array(await videoFile.arrayBuffer());
const blob = new Blob([data], { type: videoFile.type });
setPerPostVideos(prev => new Map(prev).set(postId, {
  data,
  fileName: videoFile.name,
  mimeType: videoFile.type,
  preview: URL.createObjectURL(blob),
  uploading: false,
}));

// Upload-time — no File access, no staleness
const res = await client.uploadBlob(vid.data, vid.mimeType);
```

The same pattern applies to images after compression.

## Side Effects

- Slightly higher memory usage while compose is open (the bytes stay in memory). This is acceptable because the data has to be loaded for upload anyway, and the preview blob URL also holds the data.
- Better error messages: if reading fails during selection, the user sees the failure right away instead of only after pressing Send.

## Prevention

- Do **not** store `File` objects long-term in state if you intend to read them later.
- Treat `File`/`Blob` references from `<input type="file">` or `DataTransfer` as ephemeral.
- Capture `ArrayBuffer`/`Uint8Array` at the moment of selection, then work with the byte array.
- If the file is huge and cannot be held in memory, stream it through a more persistent storage (e.g. IndexedDB, OPFS) immediately, rather than relying on the live File handle.

## Related

- `docs/lessons/2026-06-11-jwt-retry-lost-body.md` — a related upload fix made the same day (JWT retry path also dropped request body)
- `packages/pwa/src/utils/compressImage.ts` — image compression, returns a new File that must also be read immediately
- `docs/ARCHITECTURE.md` — media handling in ComposePage
