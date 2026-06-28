import type { ConvoView } from '@bsky/core';

function kindRecord(kind: NonNullable<ConvoView['kind']>): Record<string, unknown> {
  return kind as unknown as Record<string, unknown>;
}

/**
 * Detect whether a conversation view represents a group chat.
 *
 * The Bluesky chat lexicon represents `convoView.kind` as a union discriminated
 * by `$type`, not as a plain string. For backwards compatibility we also accept
 * the legacy plain-string shapes `'direct'` / `'group'`.
 */
export function isGroupConvo(convo: ConvoView): boolean {
  const kind = convo.kind;
  if (!kind) return false;
  if (typeof kind === 'string') return kind === 'group';
  return kindRecord(kind).$type === 'chat.bsky.convo.defs#groupConvo';
}

/** Detect whether a conversation view represents a 1:1 direct message. */
export function isDirectConvo(convo: ConvoView): boolean {
  const kind = convo.kind;
  if (!kind) return true; // default to direct when the server omits the field
  if (typeof kind === 'string') return kind === 'direct';
  return kindRecord(kind).$type === 'chat.bsky.convo.defs#directConvo';
}

/** Extract the group name if the conversation is a group chat. */
export function getGroupConvoName(convo: ConvoView): string | undefined {
  const kind = convo.kind;
  if (!kind || typeof kind === 'string') return undefined;
  if (kindRecord(kind).$type !== 'chat.bsky.convo.defs#groupConvo') return undefined;
  return kindRecord(kind).name as string | undefined;
}
