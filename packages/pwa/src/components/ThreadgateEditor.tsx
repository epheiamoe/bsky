import React, { useState, useEffect } from 'react';
import type { BskyClient, ThreadgateRule, ListView } from '@bsky/core';
import { useI18n, buildThreadgateRules, rulesToThreadgateType } from '@bsky/app';
import { Modal } from './Modal.js';
import { Icon } from './Icon.js';

interface ThreadgateEditorProps {
  client: BskyClient;
  postUri: string;
  currentRules: ThreadgateRule[] | null;
  listInfo?: Array<{ uri: string; name: string }>;
  onClose: () => void;
  onSaved: () => void;
}

const ALLOW_TYPES = ['everyone', 'nobody', 'mentioned', 'followers', 'following', 'list'] as const;
type AllowType = (typeof ALLOW_TYPES)[number];

export function ThreadgateEditor({ client, postUri, currentRules, listInfo, onClose, onSaved }: ThreadgateEditorProps) {
  const { t } = useI18n();
  const initial = rulesToThreadgateType(currentRules);
  const [selected, setSelected] = useState<AllowType>(initial.type as AllowType);
  const [selectedListUri, setSelectedListUri] = useState(initial.listUri ?? '');
  const [userLists, setUserLists] = useState<ListView[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (selected === 'list') {
      client.getLists(client.getHandle()).then(r => setUserLists(r.lists)).catch(() => {});
    }
  }, [selected, client]);

  const handleSave = async () => {
    setLoading(true);
    setError(null);
    try {
      if (selected === 'everyone') {
        await client.deleteThreadgate(postUri);
      } else {
        const rules = buildThreadgateRules(selected, selected === 'list' ? selectedListUri : undefined);
        if (rules) {
          await client.putThreadgate(postUri, rules);
        }
      }
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  const options: Array<{ value: AllowType; label: string }> = [
    { value: 'everyone', label: t('compose.everyone') },
    { value: 'nobody', label: t('compose.nobody') },
    { value: 'mentioned', label: t('compose.onlyMentioned') },
    { value: 'followers', label: t('compose.onlyFollowers') },
    { value: 'following', label: t('compose.onlyFollowing') },
    { value: 'list', label: t('compose.onlyLists') },
  ];

  return (
    <Modal open onClose={onClose}>
      <div className="max-w-sm" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between p-4 border-b border-border">
          <h2 className="text-base font-bold text-text-primary">{t('compose.replyRestriction')}</h2>
          <button onClick={onClose} className="text-text-secondary hover:text-text-primary transition-colors p-0.5"><Icon name="x" size={18} /></button>
        </div>
        <div className="p-4 space-y-2">
          {options.map(opt => (
            <label key={opt.value} className="flex items-start gap-2.5 py-1.5 cursor-pointer hover:bg-surface rounded-lg px-2 transition-colors">
              <input
                type="radio"
                name="threadgate"
                value={opt.value}
                checked={selected === opt.value}
                onChange={() => { setSelected(opt.value); if (opt.value !== 'list') setSelectedListUri(''); }}
                className="accent-primary mt-0.5"
              />
              <span className="text-sm text-text-primary leading-5">{opt.label}</span>
            </label>
          ))}
          {selected === 'list' && (
            <div className="ml-6 pl-2 border-l-2 border-border space-y-1.5 max-h-48 overflow-y-auto">
              {userLists.length === 0 ? (
                <p className="text-xs text-text-secondary py-2">{t('compose.noLists')}</p>
              ) : (
                userLists.map(list => (
                  <label key={list.uri} className="flex items-start gap-2 py-1 cursor-pointer hover:bg-surface rounded px-2 transition-colors">
                    <input
                      type="radio"
                      name="threadgate-list"
                      value={list.uri}
                      checked={selectedListUri === list.uri}
                      onChange={() => setSelectedListUri(list.uri)}
                      className="accent-primary mt-0.5"
                    />
                    <span className="text-sm text-text-primary leading-5">{list.name}</span>
                    <span className="text-xs text-text-secondary leading-5 ml-auto">{list.listItemCount ?? 0}</span>
                  </label>
                ))
              )}
            </div>
          )}
          {error && (
            <div role="alert" className="text-xs text-red-500 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg px-2 py-1.5">{error}</div>
          )}
        </div>
        <div className="flex items-center justify-end gap-2 p-4 border-t border-border">
          <button onClick={onClose} className="px-3 py-1.5 text-sm text-text-secondary hover:text-text-primary transition-colors">
            {t('action.cancel')}
          </button>
          <button
            onClick={handleSave}
            disabled={loading || (selected === 'list' && !selectedListUri)}
            className="px-3 py-1.5 rounded-lg bg-primary hover:bg-primary-hover text-white text-sm font-semibold transition-colors disabled:opacity-50"
          >
            {loading ? 'Saving...' : t('action.save')}
          </button>
        </div>
      </div>
    </Modal>
  );
}
