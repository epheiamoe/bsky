import React, { useState, useEffect } from 'react';
import { Modal } from './Modal.js';
import { Icon } from './Icon.js';
import { useI18n } from '@bsky/app';

interface ReplyOptionsModalProps {
  open: boolean;
  selectedType: string;
  selectedListUri: string;
  allowQuote: boolean;
  userLists: Array<{ uri: string; name: string; count?: number }>;
  onClose: () => void;
  onSave: (type: string, listUri: string, allowQuote: boolean) => void;
}

const OPTIONS = [
  { value: 'everyone', label: 'Everyone' },
  { value: 'nobody', label: 'Nobody' },
  { value: 'mentioned', label: 'Mentioned users only' },
  { value: 'followers', label: 'Your followers' },
  { value: 'following', label: 'People you follow' },
  { value: 'list', label: 'Choose from your lists' },
];

export function ReplyOptionsModal({
  open,
  selectedType,
  selectedListUri,
  allowQuote,
  userLists,
  onClose,
  onSave,
}: ReplyOptionsModalProps) {
  const { t } = useI18n();
  const [type, setType] = useState(selectedType);
  const [listUri, setListUri] = useState(selectedListUri);
  const [quote, setQuote] = useState(allowQuote);

  useEffect(() => {
    setType(selectedType);
    setListUri(selectedListUri);
    setQuote(allowQuote);
  }, [open, selectedType, selectedListUri, allowQuote]);

  const handleSave = () => {
    onSave(type, listUri, quote);
    onClose();
  };

  return (
    <Modal open={open} onClose={onClose}>
      <div className="max-w-sm">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-border">
          <h2 className="text-base font-bold text-text-primary">{t('compose.replyOptionsTitle')}</h2>
          <button onClick={onClose} className="text-text-secondary hover:text-text-primary transition-colors p-0.5" aria-label="Close">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 6L6 18M6 6l12 12"/>
            </svg>
          </button>
        </div>

        {/* Who can reply */}
        <div className="p-4 space-y-1">
          <p className="text-sm font-semibold text-text-primary mb-2">{t('compose.whoCanReply')}</p>
          {OPTIONS.map(opt => (
            <label
              key={opt.value}
              className="flex items-center gap-3 px-3 py-2.5 rounded-lg cursor-pointer hover:bg-surface-hover transition-colors"
            >
              <input
                type="radio"
                name="reply-option"
                value={opt.value}
                checked={type === opt.value}
                onChange={() => { setType(opt.value); if (opt.value !== 'list') setListUri(''); }}
                className="accent-primary shrink-0"
              />
              <span className="text-sm text-text-primary">{opt.label}</span>
            </label>
          ))}

          {/* List selection */}
          {type === 'list' && (
            <div className="ml-8 pl-2 border-l-2 border-border space-y-1 max-h-40 overflow-y-auto mt-1">
              {userLists.length === 0 ? (
                <p className="text-xs text-text-secondary py-2">You have no lists yet</p>
              ) : (
                userLists.map(list => (
                  <label key={list.uri} className="flex items-center gap-2 py-1 cursor-pointer hover:bg-surface-hover rounded px-2 transition-colors">
                    <input
                      type="radio"
                      name="reply-list"
                      value={list.uri}
                      checked={listUri === list.uri}
                      onChange={() => setListUri(list.uri)}
                      className="accent-primary mt-0.5"
                    />
                    <span className="text-sm text-text-primary">{list.name}</span>
                    <span className="text-xs text-text-secondary ml-auto">{list.count ?? 0}</span>
                  </label>
                ))
              )}
            </div>
          )}
        </div>

        {/* Allow quote toggle */}
        <div className="px-4 pb-4">
          <div className="flex items-center justify-between py-3 px-3 rounded-lg bg-surface">
            <div className="flex items-center gap-2">
              <Icon name="corner-down-right" size={16} className="text-text-secondary" />
              <span className="text-sm text-text-primary">{t('compose.allowQuote')}</span>
            </div>
            <button
              onClick={() => setQuote(!quote)}
              className={`relative w-11 h-6 rounded-full transition-colors ${quote ? 'bg-primary' : 'bg-gray-300 dark:bg-gray-600'}`}
              role="switch"
              aria-checked={quote}
            >
              <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${quote ? 'translate-x-5' : ''}`} />
            </button>
          </div>
        </div>

        {/* Default settings hint */}
        <p className="text-xs text-text-secondary px-4 pb-2">{t('compose.defaultSettings')}</p>

        {/* Footer */}
        <div className="p-4 border-t border-border">
          <button
            onClick={handleSave}
            className="w-full px-4 py-2.5 rounded-lg bg-primary hover:bg-primary-hover text-white text-sm font-semibold transition-colors"
          >
            {t('action.save')}
          </button>
        </div>
      </div>
    </Modal>
  );
}
