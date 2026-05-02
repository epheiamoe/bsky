import React from 'react';
import { Text } from 'ink';
import type { PostView } from '@bsky/core';
import { getCdnImageUrl, getVideoThumbnailUrl, getVideoPlaylistUrl, useI18n } from '@bsky/app';
import { wrapLines } from '../utils/text.js';

export interface PostLine {
  text: string;
  isSelected: boolean;
  isName: boolean;
  quoteUri?: string;
}

export function postToLines(post: PostView, index: number, isSelected: boolean, cols: number, t: (key: string, params?: Record<string, string | number>) => string, locale: string): PostLine[] {
  const lines: PostLine[] = [];
  const name = post.author.displayName || post.author.handle;
  const text = post.record.text.replace(/\n/g, ' ');
  const dateLocale = locale === 'zh' ? 'zh-CN' : locale === 'ja' ? 'ja-JP' : 'en-US';
  const time = post.indexedAt ? new Date(post.indexedAt).toLocaleString(dateLocale, { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }) : '';

  // Author line
  lines.push({ text: `${name} @${post.author.handle} [${index}]`, isSelected, isName: true });

  // Text lines — CJK-aware wrapping
  const maxCols = Math.max(20, cols - 4);
  for (const l of wrapLines(text, maxCols)) {
    lines.push({ text: l, isSelected, isName: false });
  }

  // Videos — show clickable links (Ctrl+click opens in browser)
  const recordEmbed = post.record.embed as {
    $type?: string;
    video?: { ref: { $link: string }; mimeType: string };
    aspectRatio?: { width: number; height: number };
    alt?: string;
  } | undefined;

  if (recordEmbed?.$type === 'app.bsky.embed.video') {
    const viewVid = (post as any).embed as { thumbnail?: string; playlist?: string; cid?: string } | undefined;
    const vid = viewVid?.cid ?? recordEmbed.video?.ref?.$link ?? '';
    const playlistUrl = viewVid?.playlist || getVideoPlaylistUrl(post.author.did, vid);
    lines.push({ text: '\x1b]8;;' + playlistUrl + '\x07🎬 ' + t('post.videoHint') + '\x1b]8;;\x07', isSelected, isName: false });
  }

  // Image embed — show clickable URLs (Ctrl+click in terminal)
  const embed = post.record.embed as {
    $type?: string;
    images?: Array<{ image: { ref: { $link: string }; mimeType: string }; alt: string }>;
    media?: { $type?: string; images?: Array<{ image: { ref: { $link: string }; mimeType: string }; alt: string }> };
  } | undefined;
  const imageUrls: string[] = [];

  const extract = (e: typeof embed) => {
    if (!e) return;
    if (e.$type === 'app.bsky.embed.images' && e.images) {
      for (const img of e.images) {
        imageUrls.push(getCdnImageUrl(post.author.did, img.image.ref.$link, img.image.mimeType));
      }
    } else if (e.$type === 'app.bsky.embed.recordWithMedia' && e.media) {
      extract(e.media);
    }
  };
  extract(embed);

  // Quote embed — read from resolved top-level embed (NOT record.embed)
  const viewEmbed = (post as any).embed as {
    $type?: string;
    record?: { uri?: string; author?: { handle?: string; displayName?: string }; value?: { text?: string }; embeds?: Array<{ $type?: string; images?: Array<{ image: { ref: { $link: string }; mimeType: string }; alt: string }> }> };
  } | undefined;
  const isRecord = viewEmbed?.$type === 'app.bsky.embed.record#view' || viewEmbed?.$type === 'app.bsky.embed.record';
  const isRecordWithMedia = viewEmbed?.$type === 'app.bsky.embed.recordWithMedia#view' || viewEmbed?.$type === 'app.bsky.embed.recordWithMedia';
  if ((isRecord || isRecordWithMedia) && viewEmbed?.record?.uri) {
    const rec = viewEmbed.record;
    const qAuthor = rec.author?.displayName || rec.author?.handle || '';
    const qText = rec.value?.text?.replace(/\n/g, ' ') || '';
    const qUri = rec.uri;
    // │ @handle
    lines.push({ text: `│ @${qAuthor}`, isSelected, isName: false, quoteUri: qUri });
    // │ quoted text (wrapped)
    for (const l of wrapLines(qText, maxCols - 2)) {
      lines.push({ text: '│ ' + l, isSelected, isName: false, quoteUri: qUri });
    }
  }

  for (let i = 0; i < imageUrls.length; i++) {
    const url = imageUrls[i]!;
    // OSC 8 — clickable hyperlink in modern terminals
    lines.push({ text: '\x1b]8;;' + url + '\x07🖼 ' + t('post.imageCount', { n: imageUrls.length > 1 ? i + 1 : 1 }) + ' ' + t('image.cdnHint') + '\x1b]8;;\x07', isSelected, isName: false });
  }

  // Stats line
  lines.push({ text: `♥ ${post.likeCount ?? 0} ♺ ${post.repostCount ?? 0} 💬 ${post.replyCount ?? 0}${time ? ' · ' + time : ''}`, isSelected, isName: false });

  // Blank separator
  lines.push({ text: '', isSelected: false, isName: false });

  return lines;
}

export interface PostListItemProps {
  line: PostLine;
}

export function PostListItem({ line }: PostListItemProps) {
  if (!line.text) return <Text> </Text>;
  if (line.quoteUri) {
    return (
      <Text color="magenta" dimColor={!line.isSelected}>
        {line.text}
      </Text>
    );
  }
  return (
    <Text color={line.isSelected ? 'cyanBright' : line.isName ? 'green' : undefined} bold={line.isSelected && line.isName} dimColor={!line.isSelected && !line.isName}>
      {line.text}
    </Text>
  );
}

export function PostSkeleton({ t }: { t: (key: string) => string }) {
  return (
    <>
      <Text dimColor>─────</Text>
      <Text dimColor>{t('status.loading')}</Text>
      <Text dimColor>─────</Text>
    </>
  );
}
