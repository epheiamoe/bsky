import React, { useState } from 'react';
import { useI18n } from '@bsky/app';
import type { BskyClient } from '@bsky/core';
import { Icon } from './Icon.js';
import { Modal } from './Modal.js';

interface ReportButtonProps {
  client: BskyClient;
  post: { uri: string; cid: string };
}

const REPORT_REASONS = [
  { value: 'com.atproto.moderation.defs#reasonSpam', label: 'Spam' },
  { value: 'com.atproto.moderation.defs#reasonViolation', label: 'Terms of Service Violation' },
  { value: 'com.atproto.moderation.defs#reasonMisleading', label: 'Misleading' },
  { value: 'com.atproto.moderation.defs#reasonSexual', label: 'Sexual Content' },
  { value: 'com.atproto.moderation.defs#reasonRude', label: 'Rude or Harassing' },
  { value: 'com.atproto.moderation.defs#reasonOther', label: 'Other' },
];

export function ReportButton({ client, post }: ReportButtonProps) {
  const { t } = useI18n();
  const [showModal, setShowModal] = useState(false);
  const [reasonType, setReasonType] = useState(REPORT_REASONS[0]!.value);
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);

  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      await client.createModerationReport({
        reasonType,
        reason: reason || undefined,
        subject: { uri: post.uri, cid: post.cid },
      });
      setSuccess(true);
      setTimeout(() => {
        setShowModal(false);
        setSuccess(false);
        setReason('');
        setReasonType(REPORT_REASONS[0]!.value);
      }, 2000);
    } catch (err) {
      console.error('Report failed:', err);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <button
        onClick={() => setShowModal(true)}
        className="hover:text-red-500 transition-colors"
        title={t('moderation.report')}
        aria-label={t('moderation.report')}
      >
        <Icon name="flag" size={18} />
      </button>

      <Modal open={showModal} onClose={() => setShowModal(false)}>
        <div className="space-y-4">
          <h3 className="text-lg font-semibold text-text-primary">{t('moderation.reportTitle')}</h3>
          {success ? (
            <div className="text-center py-4">
              <Icon name="check-circle" size={32} className="text-green-500 mx-auto mb-2" />
              <p className="text-text-primary">{t('moderation.reportSuccess')}</p>
            </div>
          ) : (
            <>
              <div>
                <label className="text-xs text-text-secondary mb-1 block">{t('moderation.reportReason')}</label>
                <select
                  value={reasonType}
                  onChange={e => setReasonType(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-border bg-surface text-text-primary text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                >
                  {REPORT_REASONS.map(r => (
                    <option key={r.value} value={r.value}>{r.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs text-text-secondary mb-1 block">{t('settings.customPrompt')}</label>
                <textarea
                  value={reason}
                  onChange={e => setReason(e.target.value)}
                  placeholder={t('settings.customPromptPlaceholder')}
                  rows={3}
                  className="w-full px-3 py-2 rounded-lg border border-border bg-surface text-text-primary text-sm placeholder:text-text-secondary/50 focus:outline-none focus:ring-2 focus:ring-primary resize-none"
                />
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => setShowModal(false)}
                  className="flex-1 py-2 rounded-lg border border-border text-text-secondary hover:text-text-primary text-sm font-medium transition-colors"
                >
                  {t('action.cancel')}
                </button>
                <button
                  onClick={handleSubmit}
                  disabled={submitting}
                  className="flex-1 py-2 rounded-lg bg-red-500 hover:bg-red-600 text-white text-sm font-medium disabled:opacity-50 transition-colors"
                >
                  {submitting ? t('action.sending') : t('moderation.reportSubmit')}
                </button>
              </div>
            </>
          )}
        </div>
      </Modal>
    </>
  );
}
