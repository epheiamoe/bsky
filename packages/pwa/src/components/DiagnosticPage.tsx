import React, { useState, useEffect, useCallback } from 'react';
import { useI18n } from '@bsky/app';
import { getAppConfig } from '../hooks/useAppConfig.js';
import { getSession } from '../hooks/useSessionPersistence.js';
import type { BskyClient } from '@bsky/core';

interface TestResult {
  name: string;
  status: 'pending' | 'running' | 'ok' | 'fail';
  detail: string;
  duration?: number;
}

export function DiagnosticPage({ client, goBack }: { client: BskyClient | null; goBack: () => void }) {
  const { t } = useI18n();
  const [results, setResults] = useState<TestResult[]>([]);
  const [running, setRunning] = useState(false);

  const addResult = (r: TestResult) => setResults(prev => [...prev, r]);
  const updateResult = (name: string, update: Partial<TestResult>) =>
    setResults(prev => prev.map(r => r.name === name ? { ...r, ...update } : r));

  // Session info via client API
  const session = getSession();
  const cfg = getAppConfig();
  const handle = client?.getHandle?.() ?? '(not logged in)';
  const pdsUrl = client?.pdsUrl ?? '(unknown)';
  const jwt = session?.accessJwt ?? '';
  const imageDescModel = cfg.scenarioModels?.imageDescription || '(off)';

  // Fetch one image URL from timeline
  const [imageInfo, setImageInfo] = useState<{ url: string; did: string; cid: string; alt: string } | null>(null);

  useEffect(() => {
    if (!client) return;
    (async () => {
      try {
        const timeline = await (client as any).publicKy.get('app.bsky.feed.getTimeline', {
          searchParams: { limit: 10 },
        }).json();
        for (const item of timeline?.feed ?? []) {
          const post = item.post;
          const embeds = (post as any).embed;
          if (!embeds) continue;
          const images = embeds.images ?? embeds?.media?.images;
          if (!images?.[0]) continue;
          const img = images[0];
          const did = (post as any).author?.did ?? '';
          // Try fullsize first, then construct CDN URL
          let url: string;
          if ((img as any).fullsize) {
            url = (img as any).fullsize;
          } else {
            const cid = (img as any).image?.ref?.$link ?? (img as any).cid ?? '';
            const mime = (img as any).image?.mimeType ?? (img as any).mimeType ?? 'image/jpeg';
            const ext = mime?.includes('gif') ? 'gif' : mime?.split('/')[1] || 'jpeg';
            url = `https://cdn.bsky.app/img/feed_fullsize/plain/${encodeURIComponent(did)}/${encodeURIComponent(cid)}@${ext}`;
          }
          // Extract DID + CID from URL
          const m = url.match(/\/plain\/([^/]+)\/([^@]+)/);
          const parsedDid = m ? decodeURIComponent(m[1]!) : did;
          const parsedCid = m ? decodeURIComponent(m[2]!) : '';
          const alt = img.alt ?? '';
          setImageInfo({ url, did: parsedDid, cid: parsedCid, alt });
          break;
        }
      } catch (e) { /* no images found */ }
    })();
  }, [client]);

  const runTests = useCallback(async () => {
    if (!imageInfo || running) return;
    setRunning(true);
    setResults([]);

    const allResults: TestResult[] = [
      { name: 'CDN fetch', status: 'pending', detail: '' },
      { name: 'PDS getBlob (auto-discovered)', status: 'pending', detail: '' },
      { name: 'bsky.social getBlob', status: 'pending', detail: '' },
      { name: 'LLM API error CORS', status: 'pending', detail: '' },
    ];
    setResults(allResults);

    // ── Test 1: CDN fetch ──
    updateResult('CDN fetch', { status: 'running' });
    const t1 = performance.now();
    try {
      const res = await fetch(imageInfo.url);
      const dur = Math.round(performance.now() - t1);
      const ct = res.headers.get('content-type') ?? '?';
      const cl = res.headers.get('content-length') ?? '?';
      updateResult('CDN fetch', { status: 'ok', detail: `HTTP ${res.status}, type=${ct}, size=${cl}, ${dur}ms`, duration: dur });
    } catch (e: any) {
      const dur = Math.round(performance.now() - t1);
      updateResult('CDN fetch', { status: 'fail', detail: `${e.message} (${dur}ms)`, duration: dur });
    }

    // ── Test 2: PDS getBlob via auto-discovered ──
    updateResult('PDS getBlob (auto-discovered)', { status: 'running' });
    const t2 = performance.now();
    try {
      const blobUrl = `${pdsUrl}/xrpc/com.atproto.sync.getBlob?did=${encodeURIComponent(imageInfo.did)}&cid=${encodeURIComponent(imageInfo.cid)}`;
      const headers: Record<string, string> = {};
      if (jwt) headers['Authorization'] = `Bearer ${jwt}`;
      const res = await fetch(blobUrl, { headers });
      const dur = Math.round(performance.now() - t2);
      if (res.ok) {
        updateResult('PDS getBlob (auto-discovered)', { status: 'ok', detail: `HTTP ${res.status}, ${dur}ms`, duration: dur });
      } else {
        const err = await res.text().catch(() => '');
        updateResult('PDS getBlob (auto-discovered)', { status: 'fail', detail: `HTTP ${res.status}: ${err.slice(0, 150)} (${dur}ms)`, duration: dur });
      }
    } catch (e: any) {
      const dur = Math.round(performance.now() - t2);
      updateResult('PDS getBlob (auto-discovered)', { status: 'fail', detail: `${e.message} (${dur}ms)`, duration: dur });
    }

    // ── Test 3: bsky.social getBlob ──
    updateResult('bsky.social getBlob', { status: 'running' });
    const t3 = performance.now();
    try {
      const blobUrl = `https://bsky.social/xrpc/com.atproto.sync.getBlob?did=${encodeURIComponent(imageInfo.did)}&cid=${encodeURIComponent(imageInfo.cid)}`;
      const headers: Record<string, string> = {};
      if (jwt) headers['Authorization'] = `Bearer ${jwt}`;
      const res = await fetch(blobUrl, { headers });
      const dur = Math.round(performance.now() - t3);
      if (res.ok) {
        updateResult('bsky.social getBlob', { status: 'ok', detail: `HTTP ${res.status}, ${dur}ms`, duration: dur });
      } else {
        const err = await res.text().catch(() => '');
        updateResult('bsky.social getBlob', { status: 'fail', detail: `HTTP ${res.status}: ${err.slice(0, 150)} (${dur}ms)`, duration: dur });
      }
    } catch (e: any) {
      const dur = Math.round(performance.now() - t3);
      updateResult('bsky.social getBlob', { status: 'fail', detail: `${e.message} (${dur}ms)`, duration: dur });
    }

    // ── Test 4: LLM API error CORS ──
    updateResult('LLM API error CORS', { status: 'running' });
    const t4 = performance.now();
    try {
      // Use the selected imageDescription model, or default to DeepSeek
      const model = cfg.scenarioModels?.imageDescription || cfg.aiConfig?.model || 'deepseek-v4-flash';
      const baseUrl = cfg.aiConfig?.baseUrl || 'https://api.deepseek.com';
      const res = await fetch(`${baseUrl}/v1/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer bad_test_key' },
        body: JSON.stringify({ model, messages: [{ role: 'user', content: 'hi' }], max_tokens: 1 }),
      });
      const dur = Math.round(performance.now() - t4);
      // Try to read the response body — success means CORS works even for errors
      const text = await res.text().catch(() => '(body unreadable)');
      updateResult('LLM API error CORS', { status: 'ok', detail: `HTTP ${res.status}, body readable (${text.length} chars), ${dur}ms`, duration: dur });
    } catch (e: any) {
      const dur = Math.round(performance.now() - t4);
      // TypeError here means the browser blocked response body access
      const corsBlocked = e instanceof TypeError && e.message.includes('Failed to fetch');
      updateResult('LLM API error CORS', {
        status: corsBlocked ? 'fail' : 'ok',
        detail: corsBlocked ? `CORS blocked: ${e.message} (${dur}ms)` : `${e.message} (${dur}ms)`,
        duration: dur,
      });
    }

    setRunning(false);
  }, [imageInfo, running, pdsUrl, jwt, cfg]);

  return (
    <div className="min-h-[100dvh] bg-background animate-fadeIn">
      <header className="sticky top-0 z-10 bg-white/80 dark:bg-[#0A0A0A]/80 backdrop-blur-md border-b border-border px-4 h-12 flex items-center">
        <button onClick={goBack} className="text-text-secondary hover:text-text-primary mr-3" aria-label="Back">
          <span className="text-lg leading-none">&#8592;</span>
        </button>
        <h1 className="text-text-primary font-semibold text-lg">Image Download Diagnostic</h1>
      </header>

      <div className="max-w-content mx-auto p-4 space-y-4 text-sm">
        {/* Session info */}
        <div className="p-3 rounded-lg border border-border bg-surface/50 space-y-1 font-mono text-xs">
          <div><span className="text-text-secondary">Handle:</span> <span className="text-text-primary">{handle}</span></div>
          <div><span className="text-text-secondary">PDS:</span> <span className="text-text-primary">{pdsUrl}</span></div>
          <div><span className="text-text-secondary">Image Desc Model:</span> <span className="text-text-primary">{imageDescModel || '(off)'}</span></div>
        </div>

        {/* Image info */}
        {imageInfo ? (
          <div className="p-3 rounded-lg border border-border bg-surface/50 space-y-1 font-mono text-xs break-all">
            <div className="text-text-secondary font-semibold mb-1">Test Image</div>
            <div><span className="text-text-secondary">URL:</span> <span className="text-text-primary">{imageInfo.url}</span></div>
            <div><span className="text-text-secondary">DID:</span> <span className="text-text-primary">{imageInfo.did}</span></div>
            <div><span className="text-text-secondary">CID:</span> <span className="text-text-primary">{imageInfo.cid}</span></div>
            {imageInfo.alt && <div><span className="text-text-secondary">ALT:</span> <span className="text-text-primary">{imageInfo.alt}</span></div>}
          </div>
        ) : client ? (
          <div className="p-3 rounded-lg border border-border bg-surface/50 text-text-secondary text-xs">Searching timeline for an image...</div>
        ) : (
          <div className="p-3 rounded-lg border border-border bg-surface/50 text-text-secondary text-xs">Not logged in.</div>
        )}

        {/* Run button */}
        <button
          onClick={runTests}
          disabled={!imageInfo || running}
          className="w-full py-2 rounded-lg bg-primary hover:bg-primary-hover text-white text-sm font-medium transition-colors disabled:opacity-50"
        >
          {running ? 'Running...' : 'Run Diagnostics'}
        </button>

        {/* Results */}
        {results.length > 0 && (
          <div className="space-y-2">
            {results.map(r => (
              <div key={r.name} className={`p-3 rounded-lg border text-xs ${
                r.status === 'fail' ? 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800 text-red-600 dark:text-red-400' :
                r.status === 'ok' ? 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800 text-green-600 dark:text-green-400' :
                r.status === 'running' ? 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800 text-blue-600 dark:text-blue-400 animate-pulse' :
                'bg-surface/50 border-border text-text-secondary'
              }`}>
                <div className="font-semibold mb-0.5">
                  {r.status === 'ok' ? '\u2713' : r.status === 'fail' ? '\u2717' : r.status === 'running' ? '\u25CB' : '\u25CC'} {r.name}
                  {r.duration != null && <span className="ml-2 font-normal opacity-60">{r.duration}ms</span>}
                </div>
                {r.detail && <div className="break-all opacity-80">{r.detail}</div>}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
