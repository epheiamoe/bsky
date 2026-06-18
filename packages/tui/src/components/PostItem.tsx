import React from 'react';
import { Text } from 'ink';
import type { PostView } from '@bsky/core';
import { useI18n, extractImages, extractVideo, extractQuotedPost, extractGallery } from '@bsky/app';
import { wrapLines } from '../utils/text.js';

export interface PostLine {
  text: string;
  isSelected: boolean;
  isName: boolean;
  quoteUri?: string;
}

export function postToLines(post: PostView, index: number, isSelected: boolean, cols: number, t: (key: string, params?: Record<string, string | number>) => string, locale: string, galleryIdx?: number): PostLine[] {
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

  // Videos — show clickable links when a playlist is available; otherwise
  // indicate the video is still processing or unavailable (raw blob / failed processing).
  const vidData = extractVideo(post);
  if (vidData) {
    if (vidData.playlistUrl) {
      lines.push({ text: '\x1b]8;;' + vidData.playlistUrl + '\x07🎬 ' + t('post.videoHint') + '\x1b]8;;\x07', isSelected, isName: false });
    } else {
      const label = vidData.processing ? t('video.processing') : t('video.unavailable');
      lines.push({ text: '🎬 ' + label, isSelected, isName: false });
    }
  }

  // Image embed — show clickable URLs (Ctrl+click in terminal)
  const imageUrls = extractImages(post);

  // Quote embed — read from resolved top-level embed (NOT record.embed)
  const qPost = extractQuotedPost(post);
  if (qPost) {
    const qAuthor = qPost.displayName || qPost.handle;
    const qText = qPost.text.replace(/\n/g, ' ');
    const qUri = qPost.uri;
    lines.push({ text: `│ @${qAuthor}`, isSelected, isName: false, quoteUri: qUri });
    for (const l of wrapLines(qText, maxCols - 2)) {
      lines.push({ text: '│ ' + l, isSelected, isName: false, quoteUri: qUri });
    }
  }

  for (let i = 0; i < imageUrls.length; i++) {
    const img = imageUrls[i]!;
    // OSC 8 — clickable hyperlink in modern terminals
    lines.push({ text: '\x1b]8;;' + img.url + '\x07🖼 ' + t('post.imageCount', { n: imageUrls.length > 1 ? i + 1 : 1 }) + ' ' + t('image.cdnHint') + '\x1b]8;;\x07', isSelected, isName: false });
  }

  // Gallery embed — [v0.14.3] text-based navigator (terminal can't display images)
  const gallery = extractGallery(post);
  if (gallery && gallery.images.length > 0) {
    const cur = galleryIdx ?? 0;
    const total = gallery.images.length;
    const curImg = gallery.images[cur]!;
    const navHint = isSelected ? ' ← h · l →' : '';
    const countLabel = t('gallery.slideN', { current: cur + 1, total });
    lines.push({ text: `🖼 [${countLabel}]${navHint}`, isSelected, isName: false });
    // Show current image details: ALT text
    if (curImg.alt) {
      lines.push({ text: `   ALT: ${curImg.alt}`, isSelected, isName: false });
    }
    // Show aspect ratio if available
    if (curImg.aspectRatio) {
      lines.push({ text: `   📐 ${curImg.aspectRatio.width}×${curImg.aspectRatio.height}`, isSelected, isName: false });
    }
    // Clickable link to fullsize image via OSC 8
    if (curImg.fullsize) {
      lines.push({ text: '\x1b]8;;' + curImg.fullsize + '\x07   🔗 ' + t('image.cdnHint') + '\x1b]8;;\x07', isSelected, isName: false });
    }
  }

  // @handle and #tag — OSC 8 clickable links
  const handleRegex = /@[a-zA-Z0-9._-]+(?:\.[a-zA-Z]{2,})+/g;
  const tagRegex = /#[\p{L}\p{N}_]+/gu;
  let m: RegExpExecArray | null;
  const shown = new Set<string>();

  while ((m = handleRegex.exec(text)) !== null) {
    const h = m[0]!.slice(1);
    if (!shown.has(h)) {
      shown.add(h);
      const url = 'https://bsky.app/profile/' + encodeURIComponent(h);
      lines.push({ text: '\x1b]8;;' + url + '\x07👤 ' + m[0] + ' ' + t('image.cdnHint') + '\x1b]8;;\x07', isSelected, isName: false });
    }
  }

  while ((m = tagRegex.exec(text)) !== null) {
    const tag = m[0]!.slice(1);
    if (!shown.has('#' + tag)) {
      shown.add('#' + tag);
      const url = 'https://bsky.app/search?q=' + encodeURIComponent('#' + tag);
      lines.push({ text: '\x1b]8;;' + url + '\x07🏷 ' + m[0] + ' ' + t('image.cdnHint') + '\x1b]8;;\x07', isSelected, isName: false });
    }
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
