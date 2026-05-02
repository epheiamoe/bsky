import { useState, useCallback } from 'react';
import { BskyClient } from '@bsky/core';

export interface ComposeMedia {
  type: 'image' | 'video';
  blobRef: { $link: string; mimeType: string; size: number };
  alt: string;
}

/** @deprecated Use ComposeMedia instead */
export type ComposeImage = ComposeMedia;

export interface Draft {
  id: string;
  text: string;
  replyTo?: string;
  quoteUri?: string;
  createdAt: string;
  updatedAt: string;
}

export function useCompose(client: BskyClient | null, goBack: () => void, onSuccess?: () => void) {
  const [draft, setDraft] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [replyTo, setReplyTo] = useState<string | undefined>();
  const [quoteUri, setQuoteUri] = useState<string | undefined>();

  const submit = useCallback(async (text: string, replyUri?: string, media?: ComposeMedia[], qUri?: string) => {
    if (!client) return;
    setSubmitting(true);
    setError(null);
    try {
      const record: Record<string, unknown> = {
        text,
        createdAt: new Date().toISOString(),
      };

      if (replyUri) {
        const parts = uriToParts(replyUri);
        const rec = await client.getRecord(parts.did, parts.collection, parts.rkey);
        const cid = rec.cid ?? '';
        record.reply = {
          root: { uri: replyUri, cid },
          parent: { uri: replyUri, cid },
        };
      }

      // Handle embed: video OR images OR quote
      const effectiveQuoteUri = qUri ?? quoteUri;
      const video = media?.find(m => m.type === 'video');
      const images = media?.filter(m => m.type === 'image');

      if (video) {
        // Single video embed — Bluesky only allows one video, no images alongside
        record.embed = {
          $type: 'app.bsky.embed.video',
          video: {
            $type: 'blob',
            ref: { $link: video.blobRef.$link },
            mimeType: video.blobRef.mimeType,
            size: video.blobRef.size,
          },
        };
        if (video.alt) record.embed = { ...record.embed as object, alt: video.alt };
      } else if (effectiveQuoteUri) {
        const parts = uriToParts(effectiveQuoteUri);
        const rec = await client.getRecord(parts.did, parts.collection, parts.rkey);
        const quoteEmbed: Record<string, unknown> = {
          $type: 'app.bsky.embed.record',
          record: { uri: effectiveQuoteUri, cid: rec.cid ?? '' },
        };
        if (images && images.length > 0) {
          record.embed = {
            $type: 'app.bsky.embed.recordWithMedia',
            record: quoteEmbed,
            media: {
              $type: 'app.bsky.embed.images',
              images: images.map(img => ({
                image: {
                  $type: 'blob',
                  ref: { $link: img.blobRef.$link },
                  mimeType: img.blobRef.mimeType,
                  size: img.blobRef.size,
                },
                alt: img.alt,
              })),
            },
          };
        } else {
          record.embed = quoteEmbed;
        }
      } else if (images && images.length > 0) {
        record.embed = {
          $type: 'app.bsky.embed.images',
          images: images.map(img => ({
            image: {
              $type: 'blob',
              ref: { $link: img.blobRef.$link },
              mimeType: img.blobRef.mimeType,
              size: img.blobRef.size,
            },
            alt: img.alt,
          })),
        };
      }

      await client.createRecord(client.getDID(), 'app.bsky.feed.post', record);
      setDraft('');
      setQuoteUri(undefined);
      goBack();
      onSuccess?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSubmitting(false);
    }
  }, [client, goBack, onSuccess, quoteUri]);

  return { draft, setDraft, submitting, error, replyTo, setReplyTo, quoteUri, setQuoteUri, submit };
}

function uriToParts(uri: string) {
  const match = uri.match(/^at:\/\/(did:plc:[^/]+)\/([^/]+)\/([^/]+)$/);
  if (!match) throw new Error(`Invalid URI: ${uri}`);
  return { did: match[1]!, collection: match[2]!, rkey: match[3]! };
}
