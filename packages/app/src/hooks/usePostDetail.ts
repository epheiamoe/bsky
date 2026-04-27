import { useState, useEffect, useCallback, useRef } from 'react';
import { createPostDetailStore } from '../stores/postDetail.js';
import type { AppView } from '../state/navigation.js';
import type { BskyClient } from '@bsky/core';

export interface PostDetailActions {
  like: () => void;
  repost: () => void;
  reply: () => void;
  translate: () => void;
  openAI: () => void;
  viewThread: () => void;
}

export function usePostDetail(
  client: BskyClient | null,
  uri: string | undefined,
  goTo: (v: AppView) => void,
  aiKey: string,
  aiBaseUrl: string,
) {
  const [store] = useState(() => createPostDetailStore());
  const [, force] = useState(0);
  const tick = useCallback(() => force(n => n + 1), []);
  const loaded = useRef('');

  useEffect(() => {
    if (client && uri && uri !== loaded.current) {
      loaded.current = uri;
      store.load(client, uri);
    }
  }, [client, uri, store]);

  useEffect(() => store.subscribe(tick), [store, tick]);

  const actions: PostDetailActions = {
    like: () => {
      if (!client || !uri) return;
      import('@bsky/core').then(({ BskyClient: _ }) => {
        // Like requires confirmation flow in TUI
      });
    },
    repost: () => {},
    reply: () => {
      if (uri) goTo({ type: 'compose', replyTo: uri });
    },
    translate: () => {
      if (store.post && client) {
        const text = store.post.record.text;
        void store.translate(client, text, aiKey, aiBaseUrl);
      }
    },
    openAI: () => {
      if (uri) goTo({ type: 'aiChat', contextUri: uri });
    },
    viewThread: () => {
      if (uri) goTo({ type: 'thread', uri });
    },
  };

  return {
    post: store.post,
    flatThread: store.flatThread,
    loading: store.loading,
    error: store.error,
    translations: store.translations,
    translate: (text: string) => client ? store.translate(client, text, aiKey, aiBaseUrl) : Promise.resolve(''),
    actions,
  };
}
