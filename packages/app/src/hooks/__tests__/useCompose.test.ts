import { describe, it, expect } from 'vitest';
import { buildFirstPostEmbed, type ComposeMedia } from '../useCompose.js';

const videoBlobRef = { $link: 'blob-cid', mimeType: 'video/mp4', size: 1234 };
const imageBlobRef = { $link: 'blob-cid', mimeType: 'image/png', size: 1234 };

function makeVideo(overrides?: Partial<ComposeMedia>): ComposeMedia {
  return {
    type: 'video',
    blobRef: videoBlobRef,
    alt: '',
    ...overrides,
  };
}

function makeImage(overrides?: Partial<ComposeMedia>): ComposeMedia {
  return {
    type: 'image',
    blobRef: imageBlobRef,
    alt: '',
    ...overrides,
  };
}

describe('buildFirstPostEmbed', () => {
  it('builds app.bsky.embed.recordWithMedia for video + quote', () => {
    const embed = buildFirstPostEmbed({
      video: makeVideo(),
      quoteUri: 'at://did:plc:quoted/app.bsky.feed.post/3jx',
      quoteCid: 'quoted-cid',
    });

    expect(embed).toEqual({
      $type: 'app.bsky.embed.recordWithMedia',
      record: {
        $type: 'app.bsky.embed.record',
        record: {
          uri: 'at://did:plc:quoted/app.bsky.feed.post/3jx',
          cid: 'quoted-cid',
        },
      },
      media: {
        $type: 'app.bsky.embed.video',
        video: {
          $type: 'blob',
          ref: { $link: 'blob-cid' },
          mimeType: 'video/mp4',
          size: 1234,
        },
      },
    });
  });

  it('preserves standalone video behavior', () => {
    const embed = buildFirstPostEmbed({ video: makeVideo({ alt: 'alt text', aspectRatio: { width: 16, height: 9 } }) });

    expect(embed).toEqual({
      $type: 'app.bsky.embed.video',
      video: {
        $type: 'blob',
        ref: { $link: 'blob-cid' },
        mimeType: 'video/mp4',
        size: 1234,
      },
      alt: 'alt text',
      aspectRatio: { width: 16, height: 9 },
    });
  });

  it('preserves image + quote behavior as recordWithMedia', () => {
    const embed = buildFirstPostEmbed({
      images: [makeImage({ alt: 'img alt' })],
      quoteUri: 'at://did:plc:quoted/app.bsky.feed.post/3jx',
      quoteCid: 'quoted-cid',
    });

    expect(embed).toEqual({
      $type: 'app.bsky.embed.recordWithMedia',
      record: {
        $type: 'app.bsky.embed.record',
        record: {
          uri: 'at://did:plc:quoted/app.bsky.feed.post/3jx',
          cid: 'quoted-cid',
        },
      },
      media: {
        $type: 'app.bsky.embed.images',
        images: [
          {
            image: {
              $type: 'blob',
              ref: { $link: 'blob-cid' },
              mimeType: 'image/png',
              size: 1234,
            },
            alt: 'img alt',
          },
        ],
      },
    });
  });

  it('preserves standalone quote behavior', () => {
    const embed = buildFirstPostEmbed({
      quoteUri: 'at://did:plc:quoted/app.bsky.feed.post/3jx',
      quoteCid: 'quoted-cid',
    });

    expect(embed).toEqual({
      $type: 'app.bsky.embed.record',
      record: {
        uri: 'at://did:plc:quoted/app.bsky.feed.post/3jx',
        cid: 'quoted-cid',
      },
    });
  });

  it('preserves standalone images behavior', () => {
    const embed = buildFirstPostEmbed({ images: [makeImage({ alt: 'img alt' })] });

    expect(embed).toEqual({
      $type: 'app.bsky.embed.images',
      images: [
        {
          image: {
            $type: 'blob',
            ref: { $link: 'blob-cid' },
            mimeType: 'image/png',
            size: 1234,
          },
          alt: 'img alt',
        },
      ],
    });
  });

  it('returns undefined when no media or quote is provided', () => {
    expect(buildFirstPostEmbed({})).toBeUndefined();
  });

  it('ignores quoteUri when quoteCid is undefined', () => {
    const embed = buildFirstPostEmbed({
      images: [makeImage()],
      quoteUri: 'at://did:plc:quoted/app.bsky.feed.post/3jx',
    });

    expect(embed).toEqual({
      $type: 'app.bsky.embed.images',
      images: [
        {
          image: {
            $type: 'blob',
            ref: { $link: 'blob-cid' },
            mimeType: 'image/png',
            size: 1234,
          },
          alt: '',
        },
      ],
    });
  });

  it('gives video priority over images when both are present', () => {
    const embed = buildFirstPostEmbed({
      video: makeVideo(),
      images: [makeImage()],
    });

    expect(embed?.$type).toBe('app.bsky.embed.video');
  });
});
