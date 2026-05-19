# API Client Reference

**File**: `packages/core/src/at/client.ts`
**Export**: `class BskyClient`

## Constructor

```typescript
const client = new BskyClient();
```

Creates two `ky` instances:
- `this.ky` → `https://bsky.social/xrpc` (authenticated, 30s timeout)
- `this.publicKy` → `https://public.api.bsky.app/xrpc` (public, 30s timeout)

## Authentication

```typescript
const session = await client.login(handle, password);
// session: { accessJwt, refreshJwt, handle, did, email? }

client.isAuthenticated(); // boolean
client.getDID();           // string (throws if not authenticated)
client.getHandle();        // string
client.getAccessJwt();     // string
```

## Endpoints

### Feed

| Method | Endpoint | Auth |
|--------|----------|------|
| `getTimeline(limit, cursor?)` | `app.bsky.feed.getTimeline` | Required |
| `getAuthorFeed(actor, limit, cursor?)` | `app.bsky.feed.getAuthorFeed` | Optional |
| `getPostThread(uri, depth?, parentHeight?)` | `app.bsky.feed.getPostThread` | Optional |
| `getLikes(uri, limit, cursor?)` | `app.bsky.feed.getLikes` | Optional |
| `getRepostedBy(uri, limit, cursor?)` | `app.bsky.feed.getRepostedBy` | Optional |
| `searchPosts({ q, limit?, cursor?, sort? })` | `app.bsky.feed.searchPosts` | Optional |
| `getPopularFeedGenerators(limit, cursor?)` | `app.bsky.unspecced.getPopularFeedGenerators` | Optional |
| `getFeedGenerator(feed)` | `app.bsky.feed.getFeedGenerator` | Optional |
| `getFeed(feedUri, limit, cursor?)` | `app.bsky.feed.getFeed` | Optional |

### Identity & Profile

| Method | Endpoint |
|--------|----------|
| `resolveHandle(handle)` | `com.atproto.identity.resolveHandle` |
| `getProfile(actor)` | `app.bsky.actor.getProfile` |
| `searchActors({ q, limit, cursor? })` | `app.bsky.actor.searchActors` |

### Graph

| Method | Endpoint |
|--------|----------|
| `getFollows(actor, limit, cursor?)` | `app.bsky.graph.getFollows` |
| `getFollowers(actor, limit, cursor?)` | `app.bsky.graph.getFollowers` |
| `getSuggestedFollows(actor)` | `app.bsky.graph.getSuggestedFollowsByActor` |

### Notifications

| Method | Endpoint |
|--------|----------|
| `listNotifications(limit, cursor?, priority?)` | `app.bsky.notification.listNotifications` |

### Repository

| Method | Endpoint |
|--------|----------|
| `listRecords(repo, collection, limit, cursor?)` | `com.atproto.repo.listRecords` |
| `getRecord(repo, collection, rkey)` | `com.atproto.repo.getRecord` |
| `createRecord(repo, collection, record, rkey?, swapCommit?)` | `com.atproto.repo.createRecord` |

### Blobs

| Method | Endpoint |
|--------|----------|
| `uploadBlob(data: Uint8Array, mimeType: string)` | `com.atproto.repo.uploadBlob` |
| `downloadBlob(did: string, cid: string)` | `com.atproto.sync.getBlob` |

## Post Record Structure

```typescript
const postRecord = {
  text: 'Hello World',
  createdAt: new Date().toISOString(),
  // Optional:
  reply: {
    root: { uri: '...', cid: '...' },
    parent: { uri: '...', cid: '...' },
  },
  embed: {
    $type: 'app.bsky.embed.images',
    images: [{ image: { $type: 'blob', ref: { $link: cid }, mimeType: 'image/png', size: 1234 }, alt: 'desc' }],
  },
  facets: [{ index: { byteStart: 0, byteEnd: 5 }, features: [{ $type: 'app.bsky.richtext.facet#link', uri: 'https://...' }] }],
};

await client.createRecord(client.getDID(), 'app.bsky.feed.post', postRecord);
```

## Key Types

All types in `packages/core/src/at/types.ts`:
- `PostView` — Post with author, record, counts
- `ProfileView` — User profile with stats
- `ThreadViewPost` — Tree node in post thread
- `TimelineResponse` — `{ feed: Array<{ post: PostView }>, cursor? }`
- `CreateSessionResponse` — `{ accessJwt, refreshJwt, handle, did }`
- `CreateRecordResponse` — `{ uri, cid }`

AT URI format: `at://did:plc:xxx/app.bsky.feed.post/rkey`
Parse with: `parseAtUri(uri)` from `@bsky/core`
