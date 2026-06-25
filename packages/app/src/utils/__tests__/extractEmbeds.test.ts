import { describe, it, expect } from 'vitest';
import { extractQuotedPost, extractVideo, extractGallery, extractImages } from '../extractEmbeds.js';

const DID = 'did:plc:abc123';

function makePost(recordEmbed: Record<string, unknown>, viewEmbed?: Record<string, unknown>): any {
  return {
    author: { did: DID },
    record: { embed: recordEmbed },
    embed: viewEmbed,
  };
}

describe('extractGallery', () => {
  it('extracts a standalone gallery view with up to 10 images', () => {
    const items = Array.from({ length: 10 }, (_, i) => ({
      $type: 'app.bsky.embed.gallery#viewImage' as const,
      thumbnail: `https://thumb/${i}`,
      fullsize: `https://full/${i}`,
      alt: `alt ${i}`,
      aspectRatio: { width: 4, height: 3 },
    }));
    const post = makePost(
      { $type: 'app.bsky.embed.gallery', items },
      { $type: 'app.bsky.embed.gallery#view', items },
    );

    const gallery = extractGallery(post);
    expect(gallery).not.toBeNull();
    expect(gallery!.images).toHaveLength(10);
    expect(gallery!.images[0]!.thumbnail).toBe('https://thumb/0');
    expect(gallery!.images[0]!.alt).toBe('alt 0');
  });

  it('prefers view-side CDN URLs over record-side data', () => {
    const post = makePost(
      {
        $type: 'app.bsky.embed.gallery',
        items: [
          {
            $type: 'app.bsky.embed.gallery#image',
            image: { ref: { $link: 'blob-cid' }, mimeType: 'image/jpeg' },
            alt: 'record alt',
          },
        ],
      },
      {
        $type: 'app.bsky.embed.gallery#view',
        items: [
          {
            $type: 'app.bsky.embed.gallery#viewImage',
            thumbnail: 'https://cdn.thumb',
            fullsize: 'https://cdn.full',
            alt: 'view alt',
          },
        ],
      },
    );

    const gallery = extractGallery(post);
    expect(gallery).not.toBeNull();
    expect(gallery!.images[0]!.thumbnail).toBe('https://cdn.thumb');
    expect(gallery!.images[0]!.fullsize).toBe('https://cdn.full');
    expect(gallery!.images[0]!.alt).toBe('record alt');
  });

  it('recurses into recordWithMedia.media to find gallery', () => {
    const post = makePost(
      {
        $type: 'app.bsky.embed.recordWithMedia',
        record: {
          $type: 'app.bsky.embed.record',
          record: { uri: 'at://quoted', cid: 'quoted-cid' },
        },
        media: {
          $type: 'app.bsky.embed.gallery',
          items: [
            {
              $type: 'app.bsky.embed.gallery#image',
              image: { ref: { $link: 'blob-cid' }, mimeType: 'image/jpeg' },
              alt: 'gallery in recordWithMedia',
            },
          ],
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
          $type: 'app.bsky.embed.gallery#view',
          items: [
            {
              $type: 'app.bsky.embed.gallery#viewImage',
              thumbnail: 'https://cdn.thumb',
              fullsize: 'https://cdn.full',
              alt: 'gallery in recordWithMedia view',
            },
          ],
        },
      },
    );

    const gallery = extractGallery(post);
    expect(gallery).not.toBeNull();
    expect(gallery!.images).toHaveLength(1);
    expect(gallery!.images[0]!.thumbnail).toBe('https://cdn.thumb');
    expect(gallery!.images[0]!.alt).toBe('gallery in recordWithMedia');
  });

  it('returns null when no gallery embed is present', () => {
    const post = makePost(
      { $type: 'app.bsky.embed.images', images: [] },
      { $type: 'app.bsky.embed.images#view', images: [] },
    );

    expect(extractGallery(post)).toBeNull();
  });
});

describe('extractImages', () => {
  it('extracts legacy images from record-side embed', () => {
    const post = makePost(
      {
        $type: 'app.bsky.embed.images',
        images: [
          {
            $type: 'app.bsky.embed.images#image',
            image: { ref: { $link: 'blob-cid' }, mimeType: 'image/jpeg' },
            alt: 'legacy image',
          },
        ],
      },
      {
        $type: 'app.bsky.embed.images#view',
        images: [
          {
            $type: 'app.bsky.embed.images#viewImage',
            thumb: 'https://legacy.thumb',
            fullsize: 'https://legacy.full',
            alt: 'legacy image view',
          },
        ],
      },
    );

    const images = extractImages(post);
    expect(images).toHaveLength(1);
    // extractImages builds the CDN URL from the record-side blob ref when no
    // view-side data is supplied.
    expect(images[0]!.url).toContain('cdn.bsky.app');
    expect(images[0]!.alt).toBe('legacy image');
  });
});

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
