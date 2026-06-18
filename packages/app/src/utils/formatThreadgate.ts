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

export function buildThreadgateRules(types: string | string[], listUri?: string): ThreadgateRule[] | null {
  const typeArray = Array.isArray(types) ? types : [types];

  // 'everyone' means no threadgate — only if it's the sole selection
  if (typeArray.length === 1 && typeArray[0] === 'everyone') return null;

  // 'nobody' is mutually exclusive and takes precedence
  if (typeArray.includes('nobody')) return [];

  const rules: ThreadgateRule[] = [];
  const seen = new Set<string>();

  for (const type of typeArray) {
    if (seen.has(type)) continue;
    seen.add(type);

    switch (type) {
      case 'mentioned':
        rules.push({ $type: 'app.bsky.feed.threadgate#mentionRule' });
        break;
      case 'followers':
        rules.push({ $type: 'app.bsky.feed.threadgate#followerRule' });
        break;
      case 'following':
        rules.push({ $type: 'app.bsky.feed.threadgate#followingRule' });
        break;
      case 'list':
        if (listUri) rules.push({ $type: 'app.bsky.feed.threadgate#listRule', list: listUri });
        break;
    }
  }

  return rules.length > 0 ? rules : null;
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

export function rulesToThreadgateType(rules?: ThreadgateRule[] | null): { type: string; types: string[]; listUri?: string } {
  if (!rules) {
    return { type: 'everyone', types: ['everyone'] };
  }
  if (rules.length === 0) {
    return { type: 'nobody', types: ['nobody'] };
  }

  const types: string[] = [];
  let listUri: string | undefined;

  for (const r of rules) {
    switch (r.$type) {
      case 'app.bsky.feed.threadgate#mentionRule':
        types.push('mentioned');
        break;
      case 'app.bsky.feed.threadgate#followerRule':
        types.push('followers');
        break;
      case 'app.bsky.feed.threadgate#followingRule':
        types.push('following');
        break;
      case 'app.bsky.feed.threadgate#listRule':
        types.push('list');
        listUri = r.list;
        break;
    }
  }

  if (types.length === 1) {
    return { type: types[0]!, types, listUri };
  }

  return { type: 'multiple', types, listUri };
}
