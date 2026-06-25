import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { BskyClient } from '../src/at/client.js';
import { groupNotifications } from '../../pwa/src/hooks/useNotificationGroups.js';
import type { Notification } from '../src/at/types.js';

describe('notification grouping', () => {
  it('keeps different reasons in separate groups', () => {
    const notifications: Notification[] = [
      makeNotif({ uri: 'at://1', reason: 'like', subject: 'at://post/a', isRead: true }),
      makeNotif({ uri: 'at://2', reason: 'repost', subject: 'at://post/a', isRead: true }),
    ];
    const groups = groupNotifications(notifications);
    expect(groups).toHaveLength(2);
    expect(groups[0]!.reason).toBe('like');
    expect(groups[1]!.reason).toBe('repost');
  });

  it('merges consecutive likes on the same post', () => {
    const notifications: Notification[] = [
      makeNotif({ uri: 'at://1', reason: 'like', subject: 'at://post/a', isRead: true }),
      makeNotif({ uri: 'at://2', reason: 'like', subject: 'at://post/a', isRead: true }),
      makeNotif({ uri: 'at://3', reason: 'like', subject: 'at://post/a', isRead: true }),
    ];
    const groups = groupNotifications(notifications);
    expect(groups).toHaveLength(1);
    expect(groups[0]!.actors).toHaveLength(3);
    expect(groups[0]!.uris).toEqual(['at://1', 'at://2', 'at://3']);
  });

  it('does not merge non-consecutive likes on the same post', () => {
    const notifications: Notification[] = [
      makeNotif({ uri: 'at://1', reason: 'like', subject: 'at://post/a', isRead: true }),
      makeNotif({ uri: 'at://2', reason: 'like', subject: 'at://post/b', isRead: true }),
      makeNotif({ uri: 'at://3', reason: 'like', subject: 'at://post/a', isRead: true }),
    ];
    const groups = groupNotifications(notifications);
    expect(groups).toHaveLength(3);
  });

  it('marks group unread when any member is unread', () => {
    const notifications: Notification[] = [
      makeNotif({ uri: 'at://1', reason: 'like', subject: 'at://post/a', isRead: true }),
      makeNotif({ uri: 'at://2', reason: 'like', subject: 'at://post/a', isRead: false }),
    ];
    const groups = groupNotifications(notifications);
    expect(groups[0]!.isRead).toBe(false);
  });

  it('uses follow key for follows without subject', () => {
    const notifications: Notification[] = [
      makeNotif({ uri: 'at://1', reason: 'follow', isRead: true }),
      makeNotif({ uri: 'at://2', reason: 'follow', isRead: true }),
    ];
    const groups = groupNotifications(notifications);
    expect(groups).toHaveLength(1);
    expect(groups[0]!.reason).toBe('follow');
    expect(groups[0]!.reasonSubject).toBeUndefined();
  });
});

describe('BskyClient.getPosts', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('calls app.bsky.feed.getPosts with uris parameter', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ posts: [] }), { status: 200, headers: { 'content-type': 'application/json' } }),
    );

    const client = new BskyClient();
    const result = await client.getPosts(['at://did:plc:abc/app.bsky.feed.post/123']);

    expect(result.posts).toEqual([]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const firstCall = fetchMock.mock.calls[0] as [Request | string, RequestInit];
    const req = firstCall[0];
    const url = typeof req === 'string' ? req : req.url;
    expect(url).toContain('app.bsky.feed.getPosts');
    expect(url).toContain(encodeURIComponent('at://did:plc:abc/app.bsky.feed.post/123'));
  });

  it('returns posts from the response', async () => {
    const posts = [
      { uri: 'at://did:plc:abc/app.bsky.feed.post/123', cid: 'cid1', author: { did: 'did:plc:abc', handle: 'alice.test' }, record: { text: 'hello', createdAt: '2024-01-01T00:00:00Z' } },
    ];
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ posts }), { status: 200, headers: { 'content-type': 'application/json' } }),
    );

    const client = new BskyClient();
    const result = await client.getPosts(['at://did:plc:abc/app.bsky.feed.post/123']);

    expect(result.posts).toHaveLength(1);
    expect(result.posts[0]!.uri).toBe('at://did:plc:abc/app.bsky.feed.post/123');
  });
});

function makeNotif(opts: {
  uri: string;
  reason: string;
  subject?: string;
  isRead: boolean;
  indexedAt?: string;
}): Notification {
  return {
    uri: opts.uri,
    cid: opts.uri.replace(/at:\/\//, ''),
    author: { did: `did:plc:${opts.uri}`, handle: `user-${opts.uri}.test` },
    reason: opts.reason,
    reasonSubject: opts.subject,
    record: {},
    isRead: opts.isRead,
    indexedAt: opts.indexedAt ?? new Date().toISOString(),
  };
}
