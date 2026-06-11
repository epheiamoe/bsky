import { useState, useCallback } from 'react';
import { BskyClient, type ThreadgateRule } from '@bsky/core';

export interface ComposeMedia {
  type: 'image' | 'video';
  blobRef: { $link: string; mimeType: string; size: number };
  alt: string;
  /** For video: uploaded caption blob refs */
  captions?: Array<{ lang: string; blobRef: { $link: string; mimeType: string; size: number } }>;
  /** For video: aspect ratio { width, height } */
  aspectRatio?: { width: number; height: number };
}

/** @deprecated Use ComposeMedia instead */
export type ComposeImage = ComposeMedia;

function buildVideoEmbed(video: ComposeMedia): Record<string, unknown> {
  const embed: Record<string, unknown> = {
    $type: 'app.bsky.embed.video',
    video: {
      $type: 'blob',
      ref: { $link: video.blobRef.$link },
      mimeType: video.blobRef.mimeType,
      size: video.blobRef.size,
    },
  };
  if (video.alt) embed.alt = video.alt;
  if (video.aspectRatio) {
    embed.aspectRatio = {
      width: video.aspectRatio.width,
      height: video.aspectRatio.height,
    };
  }
  if (video.captions && video.captions.length > 0) {
    embed.captions = video.captions.map(cap => ({
      lang: cap.lang,
      file: {
        $type: 'blob',
        ref: { $link: cap.blobRef.$link },
        mimeType: cap.blobRef.mimeType,
        size: cap.blobRef.size,
      },
    }));
  }
  return embed;
}

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

export function useCompose(client: BskyClient | null, onSuccess?: (uris?: string[]) => void) {
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

  /** [v0.15.0] Self-labels for content moderation (per-post) */
  const [selfLabelsMap, setSelfLabelsMap] = useState<Map<string, string[]>>(new Map());

  /** [v0.16.0] Language tags for posts */
  const [langs, setLangs] = useState<string[]>([]);

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

  const submit = useCallback(async (mediaMap?: Map<string, ComposeMedia[]>, quoteMap?: Map<string, string>) => {
    if (!client || posts.length === 0) return;
    // Allow posts with text OR media (images/video) to be submitted
    const nonEmptyPosts = posts.filter(p => p.text.trim() || (mediaMap?.get(p.id)?.length ?? 0) > 0);
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
          const parentCid = rec.cid ?? '';

          // FIX: Find the true root post by checking if parent has its own reply
          const parentRecord = rec.value as Record<string, unknown>;
          const parentReply = parentRecord?.reply as { root?: { uri: string; cid: string }; parent?: { uri: string; cid: string } } | undefined;

          if (parentReply?.root) {
            // Parent post is itself a reply — use its root as our root
            rootUri = parentReply.root.uri;
            rootCid = parentReply.root.cid;
          } else {
            // Parent post is the root — use it directly
            rootUri = replyTo;
            rootCid = parentCid;
          }

          record.reply = {
            root: { uri: rootUri, cid: rootCid },
            parent: { uri: replyTo, cid: parentCid },
          };
        } else if (i > 0 && rootUri && rootCid) {
          const parentUri = createdUris[i - 1]!;
          const parentCid = createdCids[i - 1]!;
          record.reply = {
            root: { uri: rootUri, cid: rootCid },
            parent: { uri: parentUri, cid: parentCid },
          };
        }

        // Embed: per-post quote via quoteMap, or first post gets navigation quoteUri
        const isFirstPost = i === 0;
        const effectiveQuoteUri = quoteMap?.get(post.id) ?? (isFirstPost ? quoteUri : undefined);
        const media = mediaMap?.get(post.id);
        const video = media?.find(m => m.type === 'video');
        const images = media?.filter(m => m.type === 'image');

        if (isFirstPost && video) {
          record.embed = buildVideoEmbed(video);
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
            record.embed = buildVideoEmbed(video);
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

        // [v0.15.0] Add self-labels if selected (per-post)
        const postLabels = selfLabelsMap.get(post.id) ?? [];
        if (postLabels.length > 0) {
          record.labels = {
            $type: 'com.atproto.label.defs#selfLabels',
            values: postLabels.map(val => ({ val })),
          };
        }

        // [v0.16.0] Add language tags if selected (only for first post)
        if (i === 0 && langs.length > 0) {
          record.langs = langs.slice(0, 3);
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
      setSelfLabelsMap(new Map());
      setLangs([]);
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
  }, [client, onSuccess, posts, replyTo, quoteUri, selfLabelsMap, langs, threadgateRules]);

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
    selfLabelsMap,
    setSelfLabelsMap,
    langs,
    setLangs,
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
