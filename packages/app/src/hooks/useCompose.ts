import { useState, useCallback } from 'react';
import { BskyClient, type ThreadgateRule } from '@bsky/core';

export interface ComposeMedia {
  type: 'image' | 'video';
  blobRef: { $link: string; mimeType: string; size: number };
  alt: string;
}

/** @deprecated Use ComposeMedia instead */
export type ComposeImage = ComposeMedia;

export interface ComposePostItem {
  id: string;
  text: string;
}

export interface Draft {
  id: string;
  text: string;
  replyTo?: string;
  quoteUri?: string;
  createdAt: string;
  updatedAt: string;
}

export function useCompose(client: BskyClient | null, goBack: () => void, onSuccess?: (uris?: string[]) => void) {
  const [posts, setPosts] = useState<ComposePostItem[]>([{ id: crypto.randomUUID(), text: '' }]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [replyTo, setReplyTo] = useState<string | undefined>();
  const [quoteUri, setQuoteUri] = useState<string | undefined>();
  const [threadgateRules, setThreadgateRules] = useState<ThreadgateRule[] | null | undefined>(undefined);
  // undefined = "everyone" (no threadgate record created)
  // null = no explicit value set (treated as everyone)
  // [] = nobody can reply
  // [...rules] = restricted to specific rules

  const addPost = useCallback(() => {
    setPosts(prev => [...prev, { id: crypto.randomUUID(), text: '' }]);
  }, []);

  const removePost = useCallback((id: string) => {
    setPosts(prev => {
      if (prev.length <= 1) return prev;
      return prev.filter(p => p.id !== id);
    });
  }, []);

  const setPostText = useCallback((id: string, text: string) => {
    if (text.length > 300) text = text.slice(0, 300);
    setPosts(prev => prev.map(p => p.id === id ? { ...p, text } : p));
  }, []);

  const loadFromDraft = useCallback((draftPosts: { text: string }[], draftReplyTo?: string, draftQuoteUri?: string) => {
    setPosts(draftPosts.map(p => ({ id: crypto.randomUUID(), text: p.text || '' })));
    if (draftReplyTo !== undefined) setReplyTo(draftReplyTo);
    if (draftQuoteUri !== undefined) setQuoteUri(draftQuoteUri);
  }, []);

  const toDraftData = useCallback(() => ({
    posts: posts.map(p => ({ text: p.text })),
    replyTo,
    quoteUri,
  }), [posts, replyTo, quoteUri]);

  const submit = useCallback(async (mediaMap?: Map<string, ComposeMedia[]>) => {
    if (!client || posts.length === 0) return;
    const nonEmptyPosts = posts.filter(p => p.text.trim());
    if (nonEmptyPosts.length === 0) return;

    setSubmitting(true);
    setError(null);

    const createdUris: string[] = [];
    const createdCids: string[] = [];
    let rootUri: string | undefined;
    let rootCid: string | undefined;

    try {
      let threadgateApplied = false;
      for (let i = 0; i < nonEmptyPosts.length; i++) {
        const post = nonEmptyPosts[i]!;
        const record: Record<string, unknown> = {
          text: post.text.trim(),
          createdAt: new Date().toISOString(),
        };

        // Reply chain: first post has no reply (unless replyTo is set)
        // Subsequent posts reply to the previous post
        if (i === 0 && replyTo) {
          const parts = uriToParts(replyTo);
          const rec = await client.getRecord(parts.did, parts.collection, parts.rkey);
          const cid = rec.cid ?? '';
          record.reply = {
            root: { uri: replyTo, cid },
            parent: { uri: replyTo, cid },
          };
          rootUri = replyTo;
          rootCid = cid;
        } else if (i > 0 && rootUri && rootCid) {
          const parentUri = createdUris[i - 1]!;
          const parentCid = createdCids[i - 1]!;
          record.reply = {
            root: { uri: rootUri, cid: rootCid },
            parent: { uri: parentUri, cid: parentCid },
          };
        }

        // Embed: only for first post (quoteUri or media)
        const isFirstPost = i === 0;
        const effectiveQuoteUri = isFirstPost ? quoteUri : undefined;
        const media = mediaMap?.get(post.id);
        const video = media?.find(m => m.type === 'video');
        const images = media?.filter(m => m.type === 'image');

        if (isFirstPost && video) {
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
        } else if (isFirstPost && effectiveQuoteUri) {
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
        } else if (isFirstPost && images && images.length > 0) {
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
        } else if (!isFirstPost && ((video) || (images && images.length > 0))) {
          // Subsequent posts can have media too
          if (video) {
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
        }

        const res = await client.createRecord(client.getDID(), 'app.bsky.feed.post', record);
        createdUris.push(res.uri);
        createdCids.push(res.cid);

        // Apply threadgate to the first post (only for non-replies)
        if (i === 0 && !replyTo && threadgateRules !== undefined && threadgateRules !== null && !threadgateApplied) {
          await client.putThreadgate(res.uri, threadgateRules);
          threadgateApplied = true;
        }

        if (i === 0 && !replyTo) {
          rootUri = res.uri;
          rootCid = res.cid;
        }
      }

      setPosts([{ id: crypto.randomUUID(), text: '' }]);
      setReplyTo(undefined);
      setQuoteUri(undefined);
      setThreadgateRules(undefined);
      goBack();
      onSuccess?.(createdUris);
    } catch (e) {
      const created = createdUris.length;
      const remaining = nonEmptyPosts.length - created;
      if (created > 0 && remaining > 0) {
        setError(`已发布 ${created} 篇，剩余 ${remaining} 篇因错误未发布: ${e instanceof Error ? e.message : String(e)}`);
      } else {
        setError(e instanceof Error ? e.message : String(e));
      }
    } finally {
      setSubmitting(false);
    }
  }, [client, goBack, onSuccess, posts, replyTo, quoteUri]);

  return {
    posts,
    addPost,
    removePost,
    setPostText,
    submitting,
    error,
    replyTo,
    setReplyTo,
    quoteUri,
    setQuoteUri,
    threadgateRules,
    setThreadgateRules,
    submit,
    loadFromDraft,
    toDraftData,
  };
}

function uriToParts(uri: string) {
  const match = uri.match(/^at:\/\/(did:plc:[^/]+)\/([^/]+)\/([^/]+)$/);
  if (!match) throw new Error(`Invalid URI: ${uri}`);
  return { did: match[1]!, collection: match[2]!, rkey: match[3]! };
}
