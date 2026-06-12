# Lesson: The `recordWithMedia` quote-wrapper trap

**Date**: 2026-06-12
**Related files**: `packages/app/src/utils/extractEmbeds.ts`, `packages/app/src/hooks/useCompose.ts`

## The symptom

A post created as *image + quote* rendered correctly on bsky.app, but in our client the quoted post disappeared. Refreshing or opening the same post on another device did not help. The stored PDS record was valid and the AppView returned the quote.

## Root cause

Bluesky's `app.bsky.embed.recordWithMedia` has a nested shape that is easy to misread.

### Record shape (what we submit)

```json
{
  "$type": "app.bsky.embed.recordWithMedia",
  "record": {
    "$type": "app.bsky.embed.record",
    "record": { "uri": "...", "cid": "..." }
  },
  "media": {
    "$type": "app.bsky.embed.images",
    "images": [...]
  }
}
```

### View shape (what AppView returns)

```json
{
  "$type": "app.bsky.embed.recordWithMedia#view",
  "record": {
    "$type": "app.bsky.embed.record#view",
    "record": {
      "$type": "app.bsky.feed.defs#postView",
      "uri": "...",
      "cid": "...",
      "author": {...},
      "value": {...},
      "embeds": [...]
    }
  },
  "media": {
    "$type": "app.bsky.embed.images#view",
    "images": [...]
  }
}
```

For a **direct** `app.bsky.embed.record#view`, `embed.record` *is* the quoted `postView`. For a **recordWithMedia** `#view`, `embed.record` is an `app.bsky.embed.record#view` *wrapper*, and the actual quoted `postView` is one level deeper at `embed.record.record`.

Our old `extractQuotedPost` assumed both shapes put the quoted viewRecord at `embed.record`. Because the wrapper has no `uri`, the function returned `null` and the quote was silently dropped.

## Related extraction gap

`extractVideo` did not recurse into `recordWithMedia.media`, so a *video + quote* post would have lost its video in our client even after the quote fix.

`extractImages` already recursed correctly, which is why the image side of the original bug was not visible on the media axis.

## Submission gap

`useCompose.ts` gave video unconditional priority over the quote for the first post:

```typescript
if (isFirstPost && video) {
  record.embed = buildVideoEmbed(video);
}
```

This meant a video + quote submission dropped the quote on the way in. The fix is to build `recordWithMedia` when both video and quote are present, mirroring the image + quote path.

## The fix

1. **Extraction**: `extractQuotedPost` now normalizes the wrapper:
   - If the embed is `recordWithMedia`, unwrap `embed.record.record`.
   - Otherwise use `embed.record` directly.
2. **Extraction**: `extractVideo` now mirrors `extractImages` and recurses into `recordWithMedia.media`.
3. **Submission**: `buildFirstPostEmbed` builds `recordWithMedia` for video + quote.

## Takeaways

- `recordWithMedia` is a **double wrapper** in view form. Always verify whether the code is handling the wrapper layer.
- When adding a new media type + quote combination, the submission path must produce `recordWithMedia` and the extraction path must recurse through `recordWithMedia.media`.
- Unit tests with both record and view shapes prevent regressions. The view shape in particular is the one that is easy to get wrong.
