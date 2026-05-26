import React from 'react';
import { useI18n, formatThreadgateSummary } from '@bsky/app';
import type { ThreadgateRule } from '@bsky/core';
import { Modal } from './Modal.js';
import { Icon } from './Icon.js';

interface ThreadgateDetailModalProps {
  open: boolean;
  rules: ThreadgateRule[];
  listInfo?: Array<{ uri: string; name: string }>;
  allowQuote: boolean;
  onClose: () => void;
}

export function ThreadgateDetailModal({ open, rules, listInfo, allowQuote, onClose }: ThreadgateDetailModalProps) {
  const { t } = useI18n();

  return (
    <Modal open={open} onClose={onClose}>
      <div className="max-w-lg" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between p-4 border-b border-border">
          <h2 className="text-base font-bold text-text-primary">{t('thread.replyRestrictionDetails')}</h2>
          <button onClick={onClose} className="text-text-secondary hover:text-text-primary transition-colors p-0.5" aria-label={t('a11y.close')}><Icon name="x" size={18} /></button>
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          <div>
            <span className="text-xs font-semibold text-text-secondary uppercase tracking-wider">{t('thread.replyRestriction')}</span>
            <p className="text-sm text-text-primary mt-1">
              {rules.length === 0 ? t('thread.replyRestricted.nobody') : formatThreadgateSummary(rules, listInfo)}
            </p>
          </div>
          {rules.length > 0 && rules.map((rule, idx) => (
            <div key={idx} className="flex items-center gap-2">
              <Icon name="corner-down-right" size={14} className="text-text-secondary shrink-0" />
              <span className="text-sm text-text-primary">
                {rule.$type === 'app.bsky.feed.threadgate#mentionRule' && t('thread.replyRestricted.mentioned')}
                {rule.$type === 'app.bsky.feed.threadgate#followerRule' && t('thread.replyRestricted.followers')}
                {rule.$type === 'app.bsky.feed.threadgate#followingRule' && t('thread.replyRestricted.following')}
                {rule.$type === 'app.bsky.feed.threadgate#listRule' && (
                  listInfo?.find(l => l.uri === (rule as any).list)?.name || t('thread.replyRestricted.list')
                )}
              </span>
            </div>
          ))}
          <div>
            <span className="text-xs font-semibold text-text-secondary uppercase tracking-wider">{t('thread.allowQuote')}</span>
            <p className="text-sm text-text-primary mt-1">
              {allowQuote ? t('thread.allowQuoteYes') : t('thread.allowQuoteNo')}
            </p>
          </div>
        </div>
        <div className="p-4 border-t border-border flex justify-end">
          <button onClick={onClose} className="px-4 py-2 rounded-lg bg-primary hover:bg-primary-hover text-white text-sm font-semibold transition-colors">
            {t('action.close')}
          </button>
        </div>
      </div>
    </Modal>
  );
}
