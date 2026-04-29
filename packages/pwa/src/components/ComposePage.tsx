import React, { useState, useEffect, useCallback } from 'react';
import { useCompose } from '@bsky/app';
import type { BskyClient } from '@bsky/core';

interface ComposePageProps {
  client: BskyClient;
  replyTo?: string;
  goBack: () => void;
  goHome: () => void;
}

export function ComposePage({ client, replyTo, goBack, goHome }: ComposePageProps) {
  const { draft, setDraft, submitting, error, setReplyTo, submit } = useCompose(
    client,
    goBack,
    goHome,
  );

  const [replyHandle, setReplyHandle] = useState<string | null>(null);

  useEffect(() => {
    if (replyTo) {
      setReplyTo(replyTo);
      const parts = replyTo.match(
        /^at:\/\/(did:plc:[^/]+)\/([^/]+)\/([^/]+)$/,
      );
      if (parts) {
        const { did, collection, rkey } = {
          did: parts[1]!,
          collection: parts[2]!,
          rkey: parts[3]!,
        };
        client
          .getRecord(did, collection, rkey)
          .then(() => {
            client
              .getProfile(did)
              .then((profile) => {
                setReplyHandle(profile.handle);
              })
              .catch(() => {
                setReplyHandle(did);
              });
          })
          .catch(() => {});
      }
    } else {
      setReplyTo(undefined);
      setReplyHandle(null);
    }
  }, [replyTo, client, setReplyTo]);

  const charLen = draft.length;
  const isEmpty = charLen === 0;

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      if (isEmpty || submitting) return;
      submit(draft.trim(), replyTo ?? undefined);
    },
    [draft, replyTo, isEmpty, submitting, submit],
  );

  return (
    <div className="min-h-screen bg-white dark:bg-[#0A0A0A]">
      <header className="sticky top-0 z-10 bg-white/80 dark:bg-[#0A0A0A]/80 backdrop-blur-md border-b border-border">
        <div className="max-w-content mx-auto px-4 h-14 flex items-center justify-between">
          <button
            onClick={goBack}
            className="text-sm text-text-secondary hover:text-text-primary transition-colors"
          >
            取消
          </button>
          <h1 className="text-lg font-semibold text-text-primary">
            {replyTo ? '✏️ 回复' : '✏️ 发帖'}
          </h1>
          <div className="w-10" />
        </div>
      </header>

      <main className="max-w-content mx-auto px-4 py-4">
        <form onSubmit={handleSubmit} className="space-y-4">
          {replyTo && replyHandle && (
            <div className="text-sm text-text-secondary bg-surface rounded-lg px-3 py-2 border border-border">
              回复: <span className="text-primary font-medium">@{replyHandle}</span>
            </div>
          )}

          <textarea
            value={draft}
            onChange={(e) => {
              if (e.target.value.length <= 300) {
                setDraft(e.target.value);
              }
            }}
            rows={4}
            maxLength={300}
            placeholder="此刻的想法..."
            disabled={submitting}
            className="w-full px-4 py-3 rounded-lg border border-border bg-surface text-text-primary placeholder:text-text-secondary/50 focus:outline-none focus:ring-2 focus:ring-primary disabled:opacity-50 resize-none text-base leading-relaxed"
          />

          <div className="flex items-center justify-between">
            <span
              className={`text-sm tabular-nums ${
                charLen >= 280
                  ? 'text-yellow-500'
                  : 'text-text-secondary'
              }`}
            >
              {charLen}/300
            </span>

            <button
              type="submit"
              disabled={isEmpty || submitting}
              className="px-6 py-2 rounded-full bg-primary hover:bg-primary-hover text-white font-semibold disabled:opacity-50 transition-colors text-sm"
            >
              {submitting ? '发送中...' : '发送'}
            </button>
          </div>

          {error && (
            <div className="text-red-500 text-sm bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg px-3 py-2">
              {error}
            </div>
          )}
        </form>
      </main>
    </div>
  );
}
