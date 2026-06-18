import React, { useState, useEffect } from 'react';
import { Modal } from './Modal.js';
import { Icon } from './Icon.js';
import { useI18n } from '@bsky/app';

interface ReplyOptionsModalProps {
  open: boolean;
  selectedTypes: string[];
  selectedListUri: string;
  allowQuote: boolean;
  userLists: Array<{ uri: string; name: string; count?: number }>;
  listsLoading?: boolean;
  listsError?: string | null;
  onClose: () => void;
  onChangeTypes: (types: string[], listUri?: string) => void;
}

const MUTUALLY_EXCLUSIVE = ['everyone', 'nobody'] as const;
const MULTI_SELECTABLE = ['mentioned', 'followers', 'following', 'list'] as const;

const OPTIONS = [
  { value: 'everyone', label: 'compose.everyone', exclusive: true },
  { value: 'nobody', label: 'compose.nobody', exclusive: true },
  { value: 'mentioned', label: 'compose.onlyMentioned', exclusive: false },
  { value: 'followers', label: 'compose.onlyFollowers', exclusive: false },
  { value: 'following', label: 'compose.onlyFollowing', exclusive: false },
  { value: 'list', label: 'compose.onlyLists', exclusive: false },
] as const;

export function ReplyOptionsModal({
  open,
  selectedTypes,
  selectedListUri,
  allowQuote,
  userLists,
  listsLoading,
  listsError,
  onClose,
  onChangeTypes,
}: ReplyOptionsModalProps) {
  const { t } = useI18n();
  const [types, setTypes] = useState<string[]>(selectedTypes);
  const [listUri, setListUri] = useState(selectedListUri);
  const [quote, setQuote] = useState(allowQuote);

  useEffect(() => {
    setTypes(selectedTypes);
    setListUri(selectedListUri);
    setQuote(allowQuote);
  }, [open, selectedTypes, selectedListUri, allowQuote]);

  const handleToggleType = (value: string, exclusive: boolean) => {
    let nextTypes: string[];

    if (exclusive) {
      // everyone/nobody: clear everything else
      nextTypes = [value];
      if (value !== 'list') {
        setListUri('');
      }
    } else {
      // multi-selectable options
      if (types.includes(value)) {
        nextTypes = types.filter(t => t !== value);
        if (value === 'list') {
          setListUri('');
        }
      } else {
        // Remove everyone/nobody when selecting a multi-selectable option
        nextTypes = [...types.filter(t => !MUTUALLY_EXCLUSIVE.includes(t as any)), value];
      }
    }

    setTypes(nextTypes);
    if (value === 'list') {
      onChangeTypes(nextTypes, types.includes(value) ? '' : listUri);
    } else {
      onChangeTypes(nextTypes, undefined);
    }
  };

  const handleListSelect = (uri: string) => {
    setListUri(uri);
    onChangeTypes(types, uri);
  };

  const handleSave = () => {
    onChangeTypes(types, listUri);
    onClose();
  };

  const isListSelected = types.includes('list');

  return (
    <Modal open={open} onClose={onClose}>
      <div>
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
          {OPTIONS.map(opt => {
            const isExclusive = opt.exclusive;
            const isChecked = types.includes(opt.value);

            return (
              <label
                key={opt.value}
                className="flex items-center gap-3 px-3 py-2.5 rounded-lg cursor-pointer hover:bg-surface-hover transition-colors"
              >
                <input
                  type={isExclusive ? 'radio' : 'checkbox'}
                  name={isExclusive ? 'reply-option-exclusive' : 'reply-option-multi'}
                  value={opt.value}
                  checked={isChecked}
                  onChange={() => handleToggleType(opt.value, isExclusive)}
                  className="accent-primary shrink-0"
                />
                <span className="text-sm text-text-primary">{t(opt.label)}</span>
              </label>
            );
          })}

          {/* List selection */}
          {isListSelected && (
            <div className="ml-8 pl-2 border-l-2 border-border space-y-1 max-h-40 overflow-y-auto mt-1">
              {listsLoading ? (
                <div className="flex items-center gap-2 py-2">
                  <svg className="animate-spin h-4 w-4 text-primary" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  <span className="text-xs text-text-secondary">{t('common.loading')}</span>
                </div>
              ) : listsError ? (
                <div role="alert" className="text-xs text-red-500 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg px-2 py-1.5">
                  {listsError}
                </div>
              ) : userLists.length === 0 ? (
                <p className="text-xs text-text-secondary py-2">{t('compose.noLists')}</p>
              ) : (
                userLists.map(list => (
                  <label key={list.uri} className="flex items-center gap-2 py-1 cursor-pointer hover:bg-surface-hover rounded px-2 transition-colors">
                    <input
                      type="radio"
                      name="reply-list"
                      value={list.uri}
                      checked={listUri === list.uri}
                      onChange={() => handleListSelect(list.uri)}
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
              className={`relative w-11 h-6 rounded-full transition-colors ${quote ? 'bg-primary' : 'bg-border'}`}
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
