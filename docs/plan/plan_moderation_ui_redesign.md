# Moderation UI Redesign & Unified Pipeline Plan

## 1. Problem Diagnosis

### Current Issues

1. **Wrong wrapping level**: `ModerationOverlay` wraps the ENTIRE `PostCard` content. Even `blurs: 'media'` labels cause the whole post (author, text, interactions) to be hidden/blurred.
2. **ThreadView focused post has NO moderation**: The focused post uses inline rendering, not `PostCard`. No `ModerationOverlay` is applied.
3. **Ugly overlay style**: Big black box replacing content. Not Twitter-style.
4. **Wrong copy**: Uses "sensitive content" / "sensitive media". User wants transparent labeler attribution.
5. **Hardcoded English label names**: No i18n hook reserved for built-in labels.
6. **Emoji usage**: ThreadView line 372 uses 📭 emoji.
7. **Clicking "show content" navigates to post**: Event bubbling not stopped.
8. **No blob-level label query**: Currently only queries post URI. Media-level labels (blob URIs) are missed.
9. **Quoted post has no moderation**: Quoted post preview cards don't apply moderation.

### Root Cause

The `ModerationDecision` only has a single `action` field. There's no separation between `contentAction` (affects whole post) and `mediaAction` (affects only media). The UI layer treats all moderation the same way by wrapping the entire post.

---

## 2. Design Principles

1. **Transparency first**: Show WHICH labeler hid the content, not vague "sensitive" warnings
2. **Minimal impact**: Media-level labels ONLY affect media. Post text/author/interactions remain fully visible.
3. **Twitter-style media blur**: High blur (`backdrop-blur-2xl`) + dark overlay. Content faintly visible underneath.
4. **Neutral language**: No "sensitive" / "NSFW" labels. Use "hidden by your subscribed moderation services"
5. **Lucide icons only**: No emojis anywhere
6. **i18n-ready**: All label names go through i18n lookup map (with fallback)
7. **Ephemeral reveal**: Clicking "show" reveals content in-place. Refresh resets.
8. **Unified moderation pipeline**: All posts (except AI tools) go through the same moderation query + decision flow
9. **Two display modes**: `PostPreviewCard` (compact, for timelines/lists) and `PostFullCard` (expanded, for thread focused post)

---

## 3. Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│  Data Loading (per-page, existing hooks)                        │
│  ├─ useTimeline() → PostView[]                                 │
│  ├─ useThread() → FlatLine[]                                   │
│  ├─ useSearch() → PostView[]                                   │
│  └─ useProfile() → PostView[]                                  │
├─────────────────────────────────────────────────────────────────┤
│  Unified Moderation Layer (NEW)                                 │
│  ├─ usePostModeration(posts, config, client)                   │
│  │   ├─ Extract URIs: post URIs + blob URIs                    │
│  │   ├─ Batch query labels (LabelCache)                        │
│  │   ├─ Resolve decisions (resolveModeration)                  │
│  │   └─ Return: decisions Map + failedLabelers                │
│  └─ useModerationConfig() → persisted config                   │
├─────────────────────────────────────────────────────────────────┤
│  Unified Display Components (NEW)                               │
│  ├─ PostPreviewCard → compact mode (timelines/lists/replies)   │
│  │   ├─ Author + text always visible                           │
│  │   ├─ ContentHiddenCard (if contentAction=hide)              │
│  │   ├─ MediaBlurOverlay (if mediaAction=blur)                 │
│  │   └─ BadgeRow (if applicable)                               │
│  └─ PostFullCard → expanded mode (thread focused post)         │
│      ├─ Same moderation logic as PostPreviewCard               │
│      └─ Full layout with actions, translation, etc.            │
└─────────────────────────────────────────────────────────────────┘
```

---

## 4. Phase 1: Core Layer Changes

### 4.1 Extend `ModerationDecision` Interface

**File**: `packages/core/src/moderation.ts`

```typescript
export interface ModerationDecision {
  /** Backward-compatible most restrictive action */
  action: ModerationAction;
  /** Whether post content (text, author) should be hidden */
  contentAction: 'hide' | 'none';
  /** Whether media should be blurred */
  mediaAction: 'blur' | 'none';
  sources: Array<{
    labelerDid: string;
    labelerName?: string;
    labels: Array<{
      val: string;
      name: string;
      description: string;
      severity: string;
      blurs: string;
      i18nKey?: string; // Reserved for i18n
    }>;
  }>;
  warningTextKey?: string;
  badges: string[];
}
```

### 4.2 Update `resolveModeration` to Calculate Separate Actions

**File**: `packages/core/src/moderation.ts`

Logic change:
- Process ALL labels as before
- But SEPARATELY track:
  - `contentLabels`: labels where `def.blurs === 'content'`
  - `mediaLabels`: labels where `def.blurs === 'media'`
- `contentAction = 'hide'` if any contentLabel resolves to 'hide' or 'warn'
- `mediaAction = 'blur'` if any mediaLabel resolves to 'warn'
- `action` = most restrictive of the two (for backward compat)

### 4.3 Add `i18nKey` to Built-in Definitions

**File**: `packages/core/src/moderation.ts`

```typescript
export const BUILTIN_LABEL_DEFINITIONS: LabelValueDefinition[] = [
  {
    identifier: 'porn',
    severity: 'alert',
    blurs: 'content',
    defaultSetting: 'hide',
    adultOnly: true,
    locales: [{ lang: 'en', name: 'Adult Content', description: '...' }],
    i18nKey: 'moderation.labels.porn',
  },
  // ... same for sexual, nudity, graphic-media
];
```

### 4.4 Blob URI Extraction

**File**: `packages/app/src/utils/extractEmbeds.ts` (NEW function)

```typescript
export interface BlobReference {
  cid: string;
  uri: string; // at://{did}/app.bsky.feed.post/{rkey}#/{cid}
  type: 'image' | 'video';
}

export function extractBlobReferences(post: PostView): BlobReference[] {
  const refs: BlobReference[] = [];
  const { did, rkey } = parseAtUri(post.uri);
  
  const embed = post.record.embed as Record<string, unknown> | undefined;
  if (!embed) return refs;
  
  // Extract image blobs
  const extractImages = (e: Record<string, unknown>) => {
    const type = e.$type as string | undefined;
    if ((type === 'app.bsky.embed.images' || type === 'app.bsky.embed.images#view') && Array.isArray(e.images)) {
      for (const img of e.images as Array<Record<string, unknown>>) {
        const cid = ((img as any).image?.ref?.$link as string) || ((img as any).cid as string);
        if (cid) {
          refs.push({ cid, uri: `at://${did}/app.bsky.feed.post/${rkey}#/${cid}`, type: 'image' });
        }
      }
    } else if ((type === 'app.bsky.embed.recordWithMedia' || type === 'app.bsky.embed.recordWithMedia#view') && e.media) {
      extractImages(e.media as Record<string, unknown>);
    }
  };
  extractImages(embed);
  
  // Extract video blob
  if ((embed.$type as string) === 'app.bsky.embed.video') {
    const cid = ((embed.video as any)?.ref?.$link as string) || ((post as any).embed?.cid as string);
    if (cid) {
      refs.push({ cid, uri: `at://${did}/app.bsky.feed.post/${rkey}#/${cid}`, type: 'video' });
    }
  }
  
  return refs;
}
```

### 4.5 Enhanced Batch Label Query with Blob URIs

**File**: `packages/app/src/hooks/useModeration.ts`

Modify `resolveModerationBatch` and `useModerationBatch` to:
1. Extract blob URIs from all posts
2. Include blob URIs in batch label queries
3. Merge blob labels with post labels when resolving decisions
4. Blob labels automatically treated as `blurs: 'media'` if no definition found

---

## 5. Phase 2: UI Component Refactor

### 5.1 Create `ContentHiddenCard` Component

**File**: `packages/pwa/src/components/ContentHiddenCard.tsx`

Replaces the entire post content when `contentAction === 'hide'`.

Design:
```
┌─────────────────────────────────────────────┐
│ [shield-alert icon] 此内容因为你订阅的审核服务 │
│                     而被隐藏：               │
│                                             │
│  被你订阅的 @moderation.bsky.app 标记为      │
│  · Adult Content · Sexual                   │
│                                             │
│  被你订阅的 @asukafield.xyz 标记为          │
│  · Transphobia                              │
│                                             │
│            [显示内容]                        │
└─────────────────────────────────────────────┘
```

Features:
- Lucide `shield-alert` icon (amber color)
- Lists each labeler with their labels
- Label names go through i18n lookup
- "显示内容" button reveals in-place (no navigation)
- `stopPropagation()` on button click
- Compact design matching PostCard border/background

### 5.2 Create `MediaBlurOverlay` Component

**File**: `packages/pwa/src/components/MediaBlurOverlay.tsx`

Wraps ONLY media (images/video) when `mediaAction === 'blur'`.

Design:
```
┌─────────────────────────────────────────────┐
│ [Author info - fully visible]               │
│ [Post text - fully visible]                 │
│                                             │
│ ┌─────────────────────────────────────────┐ │
│ │                                         │ │
│ │    [heavily blurred image underneath]   │ │
│ │                                         │ │
│ │         [eye-off icon]                  │ │
│ │         点击显示媒体                      │ │
│ │                                         │ │
│ └─────────────────────────────────────────┘ │
│ [Interactions - fully visible]              │
└─────────────────────────────────────────────┘
```

Features:
- `blur-2xl` + `brightness-50` on media
- Absolute-positioned overlay with `bg-black/30`
- Lucide `eye-off` icon + neutral text "点击显示媒体"
- Click anywhere on overlay to reveal
- `stopPropagation()` to prevent post navigation
- Smooth transition on reveal

### 5.3 Refactor `ModerationOverlay`

**File**: `packages/pwa/src/components/ModerationOverlay.tsx`

Simplify to just render `BadgeRow` for `showBadge`/`none` cases. Remove old `WarningContent` and `HiddenContent` (replaced by new components).

### 5.4 Create `PostPreviewCard` Component

**File**: `packages/pwa/src/components/PostPreviewCard.tsx`

**Purpose**: Compact post display for timelines, search results, profile pages, thread replies, and discussion sources.

**Props**:
```typescript
interface PostPreviewCardProps {
  post: PostView | FlatLine;
  onClick?: () => void;
  goTo?: (v: AppView) => void;
  moderationDecision?: ModerationDecision | null;
  repostBy?: string;
  imageDescConfig?: AIConfig;
  imageDescLang?: string;
  client?: BskyClient | null;
  singleImageFill?: boolean;
  previewLines?: number;
  quotedPreviewLines?: number;
  children?: React.ReactNode; // For PostActionsRow
}
```

**Structure**:
```tsx
// Always render the card frame
<div className="mx-2 my-1.5 px-3 py-2.5 rounded-xl border border-border bg-surface/20">
  {repostBy && <RepostHeader />}
  
  {moderationDecision?.contentAction === 'hide' && !contentRevealed ? (
    <ContentHiddenCard decision={moderationDecision} onShow={() => setContentRevealed(true)} />
  ) : (
    <div className="flex gap-3">
      {/* Avatar - always visible */}
      {/* Author info - always visible */}
      <div className="min-w-0 flex-1">
        {/* Text - always visible */}
        
        {/* Media with optional blur */}
        {hasImages && (
          moderationDecision?.mediaAction === 'blur' && !mediaRevealed ? (
            <MediaBlurOverlay onShow={() => setMediaRevealed(true)}>
              <ImageGrid ... />
            </MediaBlurOverlay>
          ) : <ImageGrid ... />
        )}
        
        {/* Video with optional blur */}
        {video && (
          moderationDecision?.mediaAction === 'blur' && !mediaRevealed ? (
            <MediaBlurOverlay onShow={() => setMediaRevealed(true)}>
              <VideoCard ... />
            </MediaBlurOverlay>
          ) : <VideoCard ... />
        )}
        
        {/* External link, quoted post, interactions */}
        {quotedPost && <QuotedPostPreview ... />}
        {externalLink && <ExternalLinkCard ... />}
        {children}
      </div>
    </div>
  )}
  
  {/* BadgeRow shown at top when applicable */}
  {moderationDecision?.badges.length > 0 && <BadgeRow decision={moderationDecision} />}
</div>
```

**Key behaviors**:
- Author + text ALWAYS visible regardless of moderation
- Media blur ONLY affects images/video
- Content hide replaces everything except the card frame
- Clicking "show" sets local state, doesn't navigate
- Badges shown at top (above content)

### 5.5 Create `PostFullCard` Component

**File**: `packages/pwa/src/components/PostFullCard.tsx`

**Purpose**: Expanded post display for thread focused post (theme post / current post).

**Props**:
```typescript
interface PostFullCardProps {
  post: FlatLine; // Thread focused post is always FlatLine
  goTo?: (v: AppView) => void;
  moderationDecision?: ModerationDecision | null;
  imageDescConfig?: AIConfig;
  imageDescLang?: string;
  client?: BskyClient | null;
  singleImageFill?: boolean;
  showFollow?: boolean;
  isFollowing?: boolean;
  onFollow?: () => void;
  children?: React.ReactNode; // For actions, translation, etc.
}
```

**Structure**:
Same moderation logic as PostPreviewCard, but with full layout:
- Larger avatar and text
- Follow button
- Translation section
- Threadgate badge
- Full action row

### 5.6 Refactor `PostCard` (Deprecated / Replaced)

**File**: `packages/pwa/src/components/PostCard.tsx`

Options:
1. **Replace entirely**: Delete PostCard, replace all usages with PostPreviewCard
2. **Wrapper mode**: Make PostCard a thin wrapper around PostPreviewCard for backward compat
3. **Keep for TUI**: TUI might still use PostCard logic

**Decision**: Replace in PWA. TUI can keep its own implementation.

---

## 6. Phase 3: ThreadView Integration

### 6.1 Add Moderation to Focused Post

**File**: `packages/pwa/src/components/ThreadView.tsx`

Changes:
1. Import `useModeration` hook for single post
2. Get moderation decision for `focused.uri` + blob URIs
3. Replace inline rendering with `PostFullCard`
4. Apply same moderation logic:
   - If `contentAction === 'hide'`: show `ContentHiddenCard`
   - If `mediaAction === 'blur'`: wrap `ImageGrid` and `VideoCard`
   - Always show author info, text, interactions

### 6.2 Update Reply Lines

**File**: `packages/pwa/src/components/ThreadView.tsx`

Replace `PostCard` with `PostPreviewCard` for reply lines.

### 6.3 Remove Emoji

**File**: `packages/pwa/src/components/ThreadView.tsx`

Line 372: Replace 📭 with Lucide `inbox` icon.

---

## 7. Phase 4: List Component Updates

Update all 6 list components to use new `PostPreviewCard`:

| Component | Current | Change |
|-----------|---------|--------|
| `FeedTimeline.tsx` | `PostCard` | `PostPreviewCard` |
| `BookmarkPage.tsx` | `PostCard` | `PostPreviewCard` |
| `ProfilePage.tsx` | `PostCard` | `PostPreviewCard` |
| `SearchPage.tsx` | `PostCard` | `PostPreviewCard` |
| `ListDetailPage.tsx` | `PostCard` | `PostPreviewCard` |
| `ThreadView.tsx` | Inline + `PostCard` | `PostFullCard` + `PostPreviewCard` |

---

## 8. Phase 5: i18n Updates

### 8.1 New Keys

**Files**: `packages/app/src/i18n/locales/{zh,en,ja}.ts`

```typescript
// Neutral copy for hidden content
moderation.hiddenByLabelers: '此内容因为你订阅的审核服务而被隐藏：',
moderation.hiddenBy: '被你订阅的 {labeler} 标记为',

// Neutral copy for media blur
moderation.clickToShowMedia: '点击显示媒体',
moderation.mediaHidden: '媒体已隐藏',

// Label names (already exist, ensure consistency)
moderation.labels.porn: '成人内容',
moderation.labels.sexual: '性暗示',
moderation.labels.nudity: '非色情裸露',
moderation.labels.graphic-media: '敏感/写实媒体',
```

### 8.2 Create `LABEL_I18N_KEYS` Map

**File**: `packages/app/src/i18n/label-i18n.ts` (NEW)

```typescript
export const LABEL_I18N_KEYS: Record<string, string> = {
  'porn': 'moderation.labels.porn',
  'sexual': 'moderation.labels.sexual',
  'nudity': 'moderation.labels.nudity',
  'graphic-media': 'moderation.labels.graphic-media',
  // Community labels can be added here
};

export function getLabelName(val: string, t: (key: string) => string, fallback?: string): string {
  const key = LABEL_I18N_KEYS[val];
  if (key) {
    const translated = t(key);
    if (translated !== key) return translated;
  }
  return fallback || val;
}
```

---

## 9. Phase 6: Quoted Post Moderation

### 9.1 Quoted Post in PostPreviewCard

When rendering a quoted post preview:
1. Check if quoted post has its own `labels` or fetch them
2. Apply `ContentHiddenCard` or `MediaBlurOverlay` to quoted post media
3. Quoted post text should always be visible
4. If quoted post content is hidden, show compact "ContentHiddenCard" version

**Implementation**:
- Quoted post data comes from `extractQuotedPost()` which returns `ExtractQuotedPost`
- `ExtractQuotedPost` doesn't have URI-level labels, only image details
- For full moderation, need to fetch labels for quoted post URI
- **Simplified approach**: For now, only apply media blur to quoted post images if parent post has media-level labels. Full quoted post moderation can be deferred.

### 9.2 Quoted Post in PostFullCard

Same logic as PostPreviewCard.

---

## 10. File Changes Summary

### New Files

| File | Description |
|------|-------------|
| `packages/pwa/src/components/ContentHiddenCard.tsx` | Hidden post content with labeler attribution |
| `packages/pwa/src/components/MediaBlurOverlay.tsx` | Twitter-style media blur overlay |
| `packages/pwa/src/components/PostPreviewCard.tsx` | Compact post card for timelines/lists |
| `packages/pwa/src/components/PostFullCard.tsx` | Expanded post card for thread focused post |
| `packages/app/src/i18n/label-i18n.ts` | i18n key map for label names |

### Modified Files

| File | Change |
|------|--------|
| `packages/core/src/moderation.ts` | Extend `ModerationDecision`, update `resolveModeration`, add `i18nKey` to built-in defs |
| `packages/core/src/moderation-cache.ts` | Support blob URI queries in batch |
| `packages/app/src/hooks/useModeration.ts` | Extract blob URIs, include in batch queries |
| `packages/app/src/utils/extractEmbeds.ts` | Add `extractBlobReferences()` function |
| `packages/pwa/src/components/ModerationOverlay.tsx` | Simplify: remove old WarningContent/HiddenContent, keep BadgeRow |
| `packages/pwa/src/components/PostCard.tsx` | Deprecate / replace usages |
| `packages/pwa/src/components/ThreadView.tsx` | Use `PostFullCard` + `PostPreviewCard`, remove emoji |
| `packages/pwa/src/components/FeedTimeline.tsx` | Use `PostPreviewCard` |
| `packages/pwa/src/components/BookmarkPage.tsx` | Use `PostPreviewCard` |
| `packages/pwa/src/components/ProfilePage.tsx` | Use `PostPreviewCard` |
| `packages/pwa/src/components/SearchPage.tsx` | Use `PostPreviewCard` |
| `packages/pwa/src/components/ListDetailPage.tsx` | Use `PostPreviewCard` |
| `packages/app/src/i18n/locales/zh.ts` | Add new moderation keys |
| `packages/app/src/i18n/locales/en.ts` | Add new moderation keys |
| `packages/app/src/i18n/locales/ja.ts` | Add new moderation keys |

### Deleted/Deprecated Files

| File | Action |
|------|--------|
| `packages/pwa/src/components/PostCard.tsx` | Move to `out-of-date/` or keep for TUI |

---

## 11. Implementation Order

### Step 1: Core Layer (Foundation)
1. Extend `ModerationDecision` interface with `contentAction` + `mediaAction`
2. Update `resolveModeration()` to calculate separate actions
3. Add `i18nKey` to `BUILTIN_LABEL_DEFINITIONS`
4. Add `extractBlobReferences()` to `extractEmbeds.ts`
5. Update `useModeration.ts` to query blob URIs

### Step 2: UI Components (Building Blocks)
1. Create `ContentHiddenCard.tsx`
2. Create `MediaBlurOverlay.tsx`
3. Simplify `ModerationOverlay.tsx`
4. Create `PostPreviewCard.tsx`
5. Create `PostFullCard.tsx`

### Step 3: i18n
1. Create `label-i18n.ts`
2. Add new keys to zh/en/ja

### Step 4: Integration (Wiring)
1. Update `FeedTimeline.tsx`
2. Update `BookmarkPage.tsx`
3. Update `ProfilePage.tsx`
4. Update `SearchPage.tsx`
5. Update `ListDetailPage.tsx`
6. Update `ThreadView.tsx` (biggest change)

### Step 5: Cleanup
1. Remove/deprecate old `PostCard.tsx`
2. Remove emoji from `ThreadView.tsx`
3. Run typecheck
4. Test all views

---

## 12. Potential Issues & Solutions

### Issue 1: Unified Hook Scope
**Problem**: If we try to unify ALL post loading (API calls), different pages have different logic (timeline has cursor, thread has tree, search has tabs).

**Solution**: Only unify moderation processing (tag query + decision calculation), not data loading. Pages keep their own `useTimeline`/`useThread` hooks but use shared `usePostModeration` for moderation.

### Issue 2: Blob Query Performance
**Problem**: Querying blob URIs adds extra API calls. A post with 4 images needs 4 extra URI queries.

**Solution**: 
- Batch all blob URIs together in a single `queryLabels` call (up to 250 patterns)
- Cache results in `LabelCache`
- Only query blob URIs when post doesn't already have labels in `PostView.labels`

### Issue 3: FlatLine vs PostView
**Problem**: `FlatLine` (from useThread) and `PostView` (from other hooks) have different shapes. `PostPreviewCard` needs to accept both.

**Solution**: 
- Make `PostPreviewCard` accept `PostView | FlatLine`
- Internally normalize to common interface
- Or create adapter functions

### Issue 4: Virtual Scroll Height Changes
**Problem**: When moderation overlay appears (e.g., content hidden), post height changes significantly. Virtual scroll needs to recalculate.

**Solution**:
- Use `min-height` constraints on `ContentHiddenCard` to match typical post height
- When user clicks "show", height changes but that's intentional user action
- Clear height cache for that post URI when moderation state changes

### Issue 5: Quoted Post Moderation Complexity
**Problem**: Quoted posts need their own moderation decisions, but they're nested inside parent post.

**Solution**:
- Phase 1: Only apply media blur to quoted post images if parent has media-level labels
- Phase 2: Fetch quoted post labels independently and apply full moderation

### Issue 6: Backward Compatibility
**Problem**: TUI might depend on `PostCard` or existing moderation interfaces.

**Solution**:
- Keep `moderation.ts` interfaces backward compatible (`action` field still works)
- TUI can keep its own `PostCard` implementation
- Only PWA uses new components

---

## 13. Success Criteria

1. ✅ Media-level labels (`blurs: 'media'`) ONLY blur images/video. Post text, author, interactions remain fully visible and clickable.
2. ✅ Content-level labels (`blurs: 'content'`) replace post with `ContentHiddenCard` showing labeler attribution.
3. ✅ ThreadView focused post has moderation applied via `PostFullCard`.
4. ✅ No emoji anywhere (Lucide icons only).
5. ✅ i18n keys reserved for label names (with fallback to English).
6. ✅ Neutral copy: no "sensitive" / "NSFW" language.
7. ✅ Twitter-style media blur: high blur, faintly visible, dark overlay.
8. ✅ Clicking "show content" reveals in-place without navigating.
9. ✅ Blob-level labels are queried and applied correctly.
10. ✅ Quoted post images are blurred when appropriate.
11. ✅ All type checks pass.
12. ✅ All three locales (zh/en/ja) updated.
13. ✅ All 6 list views use unified `PostPreviewCard`.

---

## 14. Open Questions

1. **Quoted post full moderation**: Should we fetch labels for quoted posts independently in this PR, or defer to Phase 2?

2. **Video blur**: Should `VideoCard` support the same `MediaBlurOverlay` as images?

3. **Height caching**: Should we pre-calculate `ContentHiddenCard` height to match typical post height and avoid virtual scroll jitter?

4. **TUI compatibility**: Does TUI use `PostCard` from PWA, or does it have its own implementation?

---

## 15. Related Documents

- `docs/plan/plan_labeling_failure_handling.md` — Previous labeling plan (Phase 1 failure handling)
- `docs/LABELING.md` — Labeling system architecture
- `docs/CONTEXT.md` — Project context and current status
- `packages/core/src/moderation.ts` — Decision engine
- `packages/core/src/moderation-cache.ts` — Label cache
- `packages/app/src/hooks/useModeration.ts` — Moderation hooks
- `packages/pwa/src/components/ModerationOverlay.tsx` — Current overlay
- `packages/pwa/src/components/PostCard.tsx` — Current post card
- `packages/pwa/src/components/ThreadView.tsx` — Thread view

---

*Document created: 2026-05-25*
*Target: v0.15.0*
*Branch: feature/moderation-ui-redesign-v15*
*Status: Core implementation complete (2026-05-25)*
*Commits: 2*
  - `8d427ac`: Core moderation engine + pipeline + UI components
  - `c3c2f5b`: usePostsWithModeration hook + FeedTimeline update
  - `8a49565`: ThreadView + all list components unified moderation
