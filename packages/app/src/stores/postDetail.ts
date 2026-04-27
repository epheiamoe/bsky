import { BskyClient } from '@bsky/core';
import type { PostView } from '@bsky/core';

export interface PostDetailStore {
  post: PostView | null;
  flatThread: string;
  loading: boolean;
  error: string | null;
  translations: Map<string, string>;

  load(client: BskyClient, uri: string): Promise<void>;
  translate(client: BskyClient, text: string, aiKey: string, aiBaseUrl: string): Promise<string>;
  getCachedTranslation(text: string): string | undefined;

  _notify(): void;
  subscribe(fn: () => void): () => void;
  listener: (() => void) | null;
}

export function createPostDetailStore(): PostDetailStore {
  const store: PostDetailStore = {
    post: null,
    flatThread: '',
    loading: false,
    error: null,
    translations: new Map(),
    listener: null,

    async load(client, uri) {
      store.loading = true;
      store._notify();
      try {
        // Get full thread
        const thread = await client.getPostThread(uri, 3, 80);
        // Get the target post info
        const parts = uri.split('/');
        const rkey = parts[parts.length - 1];
        const didParts = uri.match(/did:plc:[^/]+/);
        const did = didParts ? didParts[0] : '';
        if (thread.thread.$type === 'app.bsky.feed.defs#threadViewPost') {
          store.post = (thread.thread as { post: PostView }).post;
        }

        // Also get flat representation
        // Build flat text from thread recursively
        store.flatThread = buildFlatThread(thread.thread);
      } catch (e) {
        store.error = e instanceof Error ? e.message : String(e);
      } finally {
        store.loading = false;
        store._notify();
      }
    },

    async translate(client, text, aiKey, aiBaseUrl) {
      const cached = store.translations.get(text);
      if (cached) return cached;

      const res = await fetch(`${aiBaseUrl}/v1/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${aiKey}` },
        body: JSON.stringify({
          model: 'deepseek-chat',
          messages: [
            { role: 'system', content: '你是一个专业翻译，将以下文本翻译成中文，保持原意，仅输出翻译结果，不做解释。' },
            { role: 'user', content: text },
          ],
          temperature: 0.3,
          max_tokens: 2000,
        }),
      });
      const data = await res.json() as { choices: Array<{ message: { content: string } }> };
      const result = data.choices[0]?.message?.content ?? '';
      store.translations.set(text, result);
      store._notify();
      return result;
    },

    getCachedTranslation(text) {
      return store.translations.get(text);
    },

    _notify() { if (store.listener) store.listener(); },
    subscribe(fn) {
      store.listener = fn;
      return () => { store.listener = null; };
    },
  };
  return store;
}

function buildFlatThread(thread: unknown, depth = 0, prefix = ''): string {
  if (typeof thread !== 'object' || !thread) return '';
  const t = thread as Record<string, unknown>;
  let result = '';

  if (t.$type === 'app.bsky.feed.defs#threadViewPost') {
    const post = t.post as PostView;
    const handle = post.author.handle;
    const text = post.record.text;
    const rkey = (post.uri as string).split('/').pop() ?? '';
    result += `${'  '.repeat(depth)}${prefix}${handle} (${rkey})\n${'  '.repeat(depth)}"${text}"\n`;

    if (t.replies && Array.isArray(t.replies)) {
      for (const r of t.replies as Array<unknown>) {
        result += buildFlatThread(r, depth + 1, '↳ ');
      }
    }
  }

  if (t.parent) {
    result = buildFlatThread(t.parent, depth - 1, '↰ ') + result;
  }

  return result;
}
