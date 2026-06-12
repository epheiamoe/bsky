import { describe, it, expect } from 'vitest';
import { extractQuotedPost, extractVideo } from '../extractEmbeds.js';

const DID = 'did:plc:abc123';

function makePost(recordEmbed: Record<string, unknown>, viewEmbed?: Record<string, unknown>): any {
  return {
    author: { did: DID },
    record: { embed: recordEmbed },
    embed: viewEmbed,
  };
}

describe('extractQuotedPost', () => {
  it('extracts a direct app.bsky.embed.record#view', () => {
    const post = makePost(
      {
        $type: 'app.bsky.embed.record',
        record: { uri: 'at://quoted', cid: 'quoted-cid' },
      },
      {
        $type: 'app.bsky.embed.record#view',
        record: {
          $type: 'app.bsky.feed.defs#postView',
          uri: 'at://quoted',
          cid: 'quoted-cid',
          author: { did: 'did:plc:quoted', handle: 'quoted.test', displayName: 'Quoted User' },
          value: { text: 'hello world' },
          embeds: [],
        },
      },
    );

    const quoted = extractQuotedPost(post);
    expect(quoted).not.toBeNull();
    expect(quoted?.uri).toBe('at://quoted');
    expect(quoted?.cid).toBe('quoted-cid');
    expect(quoted?.text).toBe('hello world');
    expect(quoted?.handle).toBe('quoted.test');
    expect(quoted?.displayName).toBe('Quoted User');
  });

  it('unwraps the recordWithMedia#view wrapper to reach the quoted viewRecord', () => {
    const post = makePost(
      {
        $type: 'app.bsky.embed.recordWithMedia',
        record: {
          $type: 'app.bsky.embed.record',
          record: { uri: 'at://quoted', cid: 'quoted-cid' },
        },
        media: {
          $type: 'app.bsky.embed.images',
          images: [],
        },
      },
      {
        $type: 'app.bsky.embed.recordWithMedia#view',
        record: {
          $type: 'app.bsky.embed.record#view',
          record: {
            $type: 'app.bsky.feed.defs#postView',
            uri: 'at://quoted',
            cid: 'quoted-cid',
            author: { did: 'did:plc:quoted', handle: 'quoted.test', displayName: 'Quoted User' },
            value: { text: 'hello from inside wrapper' },
            embeds: [],
          },
        },
        media: {
          $type: 'app.bsky.embed.images#view',
          images: [],
        },
      },
    );

    const quoted = extractQuotedPost(post);
    expect(quoted).not.toBeNull();
    expect(quoted?.uri).toBe('at://quoted');
    expect(quoted?.cid).toBe('quoted-cid');
    expect(quoted?.text).toBe('hello from inside wrapper');
  });

  it('returns null for a recordWithMedia wrapper whose inner record is missing', () => {
    const post = makePost(
      {
        $type: 'app.bsky.embed.recordWithMedia',
        record: { $type: 'app.bsky.embed.record' },
        media: { $type: 'app.bsky.embed.images', images: [] },
      },
      {
        $type: 'app.bsky.embed.recordWithMedia#view',
        record: { $type: 'app.bsky.embed.record#view' },
        media: { $type: 'app.bsky.embed.images#view', images: [] },
      },
    );

    expect(extractQuotedPost(post)).toBeNull();
  });

  it('still skips non-post records such as lists', () => {
    const post = makePost(
      { $type: 'app.bsky.embed.record', record: { uri: 'at://list', cid: 'list-cid' } },
      {
        $type: 'app.bsky.embed.record#view',
        record: {
          $type: 'app.bsky.graph.defs#listView',
          uri: 'at://list',
          cid: 'list-cid',
        },
      },
    );

    expect(extractQuotedPost(post)).toBeNull();
  });
});

describe('extractVideo', () => {
  it('extracts a standalone video embed', () => {
    const post = makePost(
      {
        $type: 'app.bsky.embed.video',
        video: { ref: { $link: 'video-cid' } },
        alt: 'video alt',
        aspectRatio: { width: 16, height: 9 },
      },
      {
        $type: 'app.bsky.embed.video#view',
        cid: 'video-cid',
        thumbnail: 'https://thumb',
        playlist: 'https://playlist',
      },
    );

    const video = extractVideo(post);
    expect(video).not.toBeNull();
    expect(video?.thumbnailUrl).toBe('https://thumb');
    expect(video?.playlistUrl).toBe('https://playlist');
    expect(video?.alt).toBe('video alt');
    expect(video?.aspectRatio).toEqual({ width: 16, height: 9 });
    expect(video?.processing).toBe(false);
  });

  it('falls back to constructed thumbnail and marks processing when playlist is absent', () => {
    const post = makePost(
      {
        $type: 'app.bsky.embed.video',
        video: { ref: { $link: 'video-cid' } },
      },
      {
        $type: 'app.bsky.embed.video#view',
        cid: 'video-cid',
      },
    );

    const video = extractVideo(post);
    expect(video).not.toBeNull();
    expect(video?.thumbnailUrl).toContain('video.bsky.app');
    expect(video?.processing).toBe(true);
  });

  it('recurses into recordWithMedia.media to find the video', () => {
    const post = makePost(
      {
        $type: 'app.bsky.embed.recordWithMedia',
        record: {
          $type: 'app.bsky.embed.record',
          record: { uri: 'at://quoted', cid: 'quoted-cid' },
        },
        media: {
          $type: 'app.bsky.embed.video',
          video: { ref: { $link: 'video-cid' } },
          alt: 'quoted video alt',
        },
      },
      {
        $type: 'app.bsky.embed.recordWithMedia#view',
        record: {
          $type: 'app.bsky.embed.record#view',
          record: {
            $type: 'app.bsky.feed.defs#postView',
            uri: 'at://quoted',
            cid: 'quoted-cid',
            author: { did: 'did:plc:quoted', handle: 'quoted.test' },
            value: { text: 'hello' },
            embeds: [],
          },
        },
        media: {
          $type: 'app.bsky.embed.video#view',
          cid: 'video-cid',
          thumbnail: 'https://thumb',
          playlist: 'https://playlist',
        },
      },
    );

    const video = extractVideo(post);
    expect(video).not.toBeNull();
    expect(video?.thumbnailUrl).toBe('https://thumb');
    expect(video?.playlistUrl).toBe('https://playlist');
    expect(video?.alt).toBe('quoted video alt');
  });

  it('returns null for non-video embeds', () => {
    const post = makePost(
      { $type: 'app.bsky.embed.images', images: [] },
      { $type: 'app.bsky.embed.images#view', images: [] },
    );

    expect(extractVideo(post)).toBeNull();
  });
});
