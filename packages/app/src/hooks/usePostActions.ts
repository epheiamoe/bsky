import { useState, useCallback } from 'react';
import type { BskyClient } from '@bsky/core';

// ── Module-level state (single source of truth across all views) ──
let _liked = new Set<string>();
let _reposted = new Set<string>();
const _likeRecords = new Map<string, string>();
const _repostRecords = new Map<string, string>();
const _tickers: Array<() => void> = [];

function notifyAll() { _tickers.forEach(fn => fn()); }

// ── Plain functions (work without React, importable anywhere) ──

function uriToParts(uri: string) {
  const m = uri.match(/^at:\/\/(did:plc:[a-z0-9]+)\/([a-z.]+)\/([a-z0-9]+)$/);
  if (!m) throw new Error('Invalid AT URI: ' + uri);
  return { did: m[1]!, collection: m[2]!, rkey: m[3]! };
}

export function isPostLiked(uri: string): boolean { return _liked.has(uri); }
export function isPostReposted(uri: string): boolean { return _reposted.has(uri); }

export function seedPostViewer(post: any): void {
  if (!post) return;
  if (post.viewer?.like) {
    _liked.add(post.uri);
    _likeRecords.set(post.uri, post.viewer.like);
  }
  if (post.viewer?.repost) {
    _reposted.add(post.uri);
    _repostRecords.set(post.uri, post.viewer.repost);
  }
}

export function seedPostViewers(posts: any[]): void {
  for (const p of posts) seedPostViewer(p);
  notifyAll();
}

export async function likePost(client: BskyClient | null, postUri: string, cid?: string): Promise<void> {
  if (!client) return;
  try {
    if (_liked.has(postUri)) {
      const recordUri = _likeRecords.get(postUri);
      if (recordUri) {
        const parts = uriToParts(recordUri);
        await client.deleteRecord(parts.did, parts.collection, parts.rkey);
      }
      _liked.delete(postUri);
      _likeRecords.delete(postUri);
      notifyAll();
      return;
    }
    const parts = uriToParts(postUri);
    const res: any = await client.createRecord(client.getDID(), 'app.bsky.feed.like', {
      subject: { uri: postUri, cid: cid ?? '' },
      createdAt: new Date().toISOString(),
    });
    _liked.add(postUri);
    if (res?.uri) _likeRecords.set(postUri, res.uri);
    notifyAll();
  } catch (e) { console.error('Like error:', e); }
}

export async function repostPost(client: BskyClient | null, postUri: string, cid?: string): Promise<void> {
  if (!client) return;
  try {
    if (_reposted.has(postUri)) {
      const recordUri = _repostRecords.get(postUri);
      if (recordUri) {
        const parts = uriToParts(recordUri);
        await client.deleteRecord(parts.did, parts.collection, parts.rkey);
      }
      _reposted.delete(postUri);
      _repostRecords.delete(postUri);
      notifyAll();
      return;
    }
    const parts = uriToParts(postUri);
    const res: any = await client.createRecord(client.getDID(), 'app.bsky.feed.repost', {
      subject: { uri: postUri, cid: cid ?? '' },
      createdAt: new Date().toISOString(),
    });
    _reposted.add(postUri);
    if (res?.uri) _repostRecords.set(postUri, res.uri);
    notifyAll();
  } catch (e) { console.error('Repost error:', e); }
}

// ── React hook for components that need re-render on state change ──

export function usePostActions(client: BskyClient | null) {
  const [, tick] = useState(0);

  const subscribe = useCallback(() => {
    const fn = () => tick(n => n + 1);
    _tickers.push(fn);
    return () => { const i = _tickers.indexOf(fn); if (i >= 0) _tickers.splice(i, 1); };
  }, []);

  useState(() => { subscribe(); });

  return {
    isLiked: isPostLiked,
    isReposted: isPostReposted,
    likePost: (uri: string, cid?: string) => likePost(client, uri, cid),
    repostPost: (uri: string, cid?: string) => repostPost(client, uri, cid),
    seedFromPosts: seedPostViewers,
    seedFromPost: seedPostViewer,
  };
}
