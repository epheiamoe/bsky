import { useState, useCallback } from 'react';
import { BskyClient } from '@bsky/core';

export function useCompose(client: BskyClient | null, goBack: () => void, onSuccess?: () => void) {
  const [draft, setDraft] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [replyTo, setReplyTo] = useState<string | undefined>();

  const submit = useCallback(async (text: string, replyUri?: string) => {
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
      await client.createRecord(client.getDID(), 'app.bsky.feed.post', record);
      setDraft('');
      goBack();
      onSuccess?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSubmitting(false);
    }
  }, [client, goBack, onSuccess]);

  return { draft, setDraft, submitting, error, replyTo, setReplyTo, submit };
}

function uriToParts(uri: string) {
  const match = uri.match(/^at:\/\/(did:plc:[^/]+)\/([^/]+)\/([^/]+)$/);
  if (!match) throw new Error(`Invalid URI: ${uri}`);
  return { did: match[1]!, collection: match[2]!, rkey: match[3]! };
}
