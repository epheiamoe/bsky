import type { ThreadgateRule, ListViewBasic, BskyClient } from '@bsky/core';

export function formatThreadgateSummary(rules: ThreadgateRule[], listInfo?: Array<{ uri: string; name: string }>): string {
  if (rules.length === 0) return 'nobody';
  const labels: string[] = [];
  for (const rule of rules) {
    if (rule.$type === 'app.bsky.feed.threadgate#mentionRule') labels.push('mentioned');
    else if (rule.$type === 'app.bsky.feed.threadgate#followerRule') labels.push('followers');
    else if (rule.$type === 'app.bsky.feed.threadgate#followingRule') labels.push('following');
    else if (rule.$type === 'app.bsky.feed.threadgate#listRule') {
      const info = listInfo?.find(l => l.uri === rule.list);
      labels.push(info ? `list: ${info.name}` : 'list');
    }
  }
  return labels.join(' + ') || 'nobody';
}

export function buildThreadgateRules(type: string, listUri?: string): ThreadgateRule[] | null {
  switch (type) {
    case 'everyone': return null; // no threadgate
    case 'nobody': return [];
    case 'mentioned': return [{ $type: 'app.bsky.feed.threadgate#mentionRule' }];
    case 'followers': return [{ $type: 'app.bsky.feed.threadgate#followerRule' }];
    case 'following': return [{ $type: 'app.bsky.feed.threadgate#followingRule' }];
    case 'list':
      if (!listUri) return null;
      return [{ $type: 'app.bsky.feed.threadgate#listRule', list: listUri }];
    default: return null;
  }
}

/** Return the i18n key for a threadgate's display text. */
export function getThreadgateDisplayKey(rules: ThreadgateRule[], _listInfo?: Array<{ uri: string; name: string }>): string {
  if (rules.length === 0) return 'thread.replyRestricted.nobody';
  if (rules.length > 1) return 'thread.replyRestricted.multiple';
  const rule = rules[0]!;
  switch (rule.$type) {
    case 'app.bsky.feed.threadgate#followerRule': return 'thread.replyRestricted.followers';
    case 'app.bsky.feed.threadgate#followingRule': return 'thread.replyRestricted.following';
    case 'app.bsky.feed.threadgate#mentionRule': return 'thread.replyRestricted.mentioned';
    case 'app.bsky.feed.threadgate#listRule': return 'thread.replyRestricted.list';
  }
  return 'thread.replyRestricted.multiple';
}

export function rulesToThreadgateType(rules?: ThreadgateRule[] | null, listInfo?: Array<{ uri: string; name: string }>): { type: string; listUri?: string } {
  if (!rules || rules.length === 0) {
    if (rules?.length === 0) return { type: 'nobody' };
    return { type: 'everyone' };
  }
  if (rules.length === 1) {
    const r = rules[0]!;
    if (r.$type === 'app.bsky.feed.threadgate#mentionRule') return { type: 'mentioned' };
    if (r.$type === 'app.bsky.feed.threadgate#followerRule') return { type: 'followers' };
    if (r.$type === 'app.bsky.feed.threadgate#followingRule') return { type: 'following' };
    if (r.$type === 'app.bsky.feed.threadgate#listRule') return { type: 'list', listUri: r.list };
  }
  return { type: 'everyone' };
}
