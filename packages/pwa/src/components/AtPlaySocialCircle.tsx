import React, { useRef, useState, useEffect, useCallback } from 'react';
import type { BskyClient } from '@bsky/core';
import type { AppView, InteractorInfo, SocialCircleResult, SocialCircleState } from '@bsky/app';
import { useI18n, useSocialCircle } from '@bsky/app';
import { Icon } from './Icon.js';

interface AtPlaySocialCircleProps {
  client: BskyClient;
  goBack: () => void;
  goTo: (v: AppView) => void;
}

function MermaidGraph({ code }: { code: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [svg, setSvg] = useState<string | null>(null);
  const [mermaidError, setMermaidError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const mermaid = (await import('mermaid')).default;
        mermaid.initialize({ startOnLoad: false, theme: 'base', securityLevel: 'loose' });
        const { svg: rendered } = await mermaid.render('social-circle-graph', code);
        if (!cancelled) setSvg(rendered);
      } catch (err) {
        if (!cancelled) setMermaidError(err instanceof Error ? err.message : String(err));
      }
    })();
    return () => { cancelled = true; };
  }, [code]);

  if (mermaidError) {
    return (
      <pre className="text-text-secondary text-xs p-3 bg-surface rounded-lg overflow-auto max-h-64">
        {code}
      </pre>
    );
  }

  return (
    <div
      ref={containerRef}
      className="flex items-center justify-center p-2 bg-white dark:bg-[#1a1a1a] rounded-lg border border-border overflow-auto"
      dangerouslySetInnerHTML={svg ? { __html: svg } : undefined}
    >
      {!svg && (
        <div className="text-text-muted text-sm py-8">{'Loading graph...'}</div>
      )}
    </div>
  );
}

function InteractorRow({ info, rank, isCurrentUser }: { info: InteractorInfo; rank: number; isCurrentUser?: boolean }) {
  const { t } = useI18n();
  const maxWeight = 100; // Relative scale placeholder
  const barWidth = Math.min(100, Math.round((info.totalWeight / 20) * 100)) / 100 * 100;

  return (
    <div className="flex items-center gap-3 py-2 border-b border-border last:border-0">
      <span className="text-text-muted text-xs w-5 text-right">{rank}</span>
      {info.avatar ? (
        <img src={info.avatar} alt="" className="w-8 h-8 rounded-full flex-shrink-0" aria-hidden="true" />
      ) : (
        <div className="w-8 h-8 rounded-full bg-surface flex items-center justify-center flex-shrink-0">
          <Icon name="at-sign" size={14} />
        </div>
      )}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="text-text-primary text-sm font-medium truncate">
            {info.displayName || `@${info.handle}`}
          </span>
          {info.isMutual && (
            <span className="text-primary text-[10px] px-1.5 py-0.5 rounded-full bg-primary/10 flex-shrink-0">
              {t('atplay.mutual')}
            </span>
          )}
        </div>
        <span className="text-text-muted text-xs">@{info.handle}</span>
        <div className="flex items-center gap-2 mt-1">
          <div className="flex-1 h-1.5 bg-surface rounded-full overflow-hidden">
            <div
              className="h-full bg-primary rounded-full transition-all duration-500"
              style={{ width: `${barWidth}%` }}
            />
          </div>
          <span className="text-text-primary text-xs font-mono w-8 text-right">
            {info.totalWeight.toFixed(0)}
          </span>
        </div>
        <div className="flex gap-3 mt-0.5 text-[10px] text-text-muted">
          <span>{t('atplay.likes')}: {info.likeCount}</span>
          <span>{t('atplay.reposts')}: {info.repostCount}</span>
          <span>{t('atplay.replies')}: {info.replyCount}</span>
        </div>
      </div>
    </div>
  );
}

export function AtPlaySocialCircle({ client, goBack }: AtPlaySocialCircleProps) {
  const { t } = useI18n();
  const { state, analyze, reset } = useSocialCircle(client);
  const [handle, setHandle] = useState('');
  const [showOptions, setShowOptions] = useState(false);

  const handleAnalyze = useCallback(() => {
    const trimmed = handle.trim();
    if (!trimmed) return;
    analyze({ handle: trimmed, maxPosts: 30 });
  }, [handle, analyze]);

  const handleReset = useCallback(() => {
    reset();
    setHandle('');
  }, [reset]);

  const phaseLabel = (() => {
    switch (state.progress.phase) {
      case 'identity': return t('atplay.phase.identity');
      case 'posts': return t('atplay.phase.posts');
      case 'interactions': return t('atplay.phase.interactions', { current: String(state.progress.current), total: String(state.progress.total) });
      case 'graph': return t('atplay.phase.graph');
      case 'done': return t('atplay.phase.done');
    }
  })();

  const result = state.result;

  return (
    <div className="flex flex-col h-[calc(100vh-3rem)] animate-fadeIn">
      <div className="border-b border-border px-4 py-3 flex items-center gap-3 flex-shrink-0">
        <button
          onClick={goBack}
          aria-label={t('nav.back')}
          className="text-text-secondary hover:text-text-primary transition-colors"
        >
          <Icon name="arrow-big-left" size={20} />
        </button>
        <h1 className="text-text-primary font-semibold text-lg">{t('atplay.socialCircle')}</h1>
      </div>

      <div className="flex-1 overflow-y-auto">
        {/* ── Input Form ── */}
        <div className="p-4">
          <p className="text-text-secondary text-sm mb-4">{t('atplay.socialCircleDesc')}</p>

          <div className="flex gap-2">
            <input
              type="text"
              value={handle}
              onChange={e => setHandle(e.target.value)}
              placeholder={t('atplay.handlePlaceholder')}
              disabled={state.status === 'loading'}
              onKeyDown={e => { if (e.key === 'Enter') handleAnalyze(); }}
              className="flex-1 px-3 py-2 rounded-lg border border-border bg-surface text-text-primary text-sm placeholder:text-text-muted focus:outline-none focus:border-primary disabled:opacity-50"
            />
            <button
              onClick={handleAnalyze}
              disabled={state.status === 'loading' || !handle.trim()}
              className="px-4 py-2 rounded-lg bg-primary text-white text-sm font-medium hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex-shrink-0"
            >
              {state.status === 'loading' ? t('atplay.analyzing') : t('atplay.analyze')}
            </button>
          </div>

          <button
            onClick={() => setShowOptions(!showOptions)}
            className="text-text-muted text-xs mt-2 hover:text-text-secondary transition-colors flex items-center gap-1"
          >
            <Icon name={showOptions ? 'chevron-up' : 'chevron-down'} size={12} />
            Options
          </button>
          {showOptions && (
            <div className="mt-2 p-3 bg-surface rounded-lg border border-border text-xs text-text-muted space-y-1">
              <p>Posts to analyze: 30 (most recent, excluding replies & reposts)</p>
              <p>Interaction weights: Like x1.5 · Repost x2.0 · Reply x3.0</p>
              <p>Core circle: top 5 · Extended: next 10 · Potential: mutual follows</p>
            </div>
          )}
        </div>

        {/* ── Progress ── */}
        {state.status === 'loading' && (
          <div className="px-4 pb-4">
            <div className="flex items-center gap-3 text-sm text-text-secondary">
              <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
              <span>{phaseLabel}</span>
            </div>
            {state.progress.total > 0 && (
              <div className="mt-2 h-1 bg-surface rounded-full overflow-hidden">
                <div
                  className="h-full bg-primary rounded-full transition-all duration-300"
                  style={{ width: `${(state.progress.current / state.progress.total) * 100}%` }}
                />
              </div>
            )}
          </div>
        )}

        {/* ── Error ── */}
        {state.status === 'error' && (
          <div className="px-4 pb-4">
            <div className="p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 text-sm">
              {state.error}
            </div>
          </div>
        )}

        {/* ── Results ── */}
        {state.status === 'done' && result && (
          <div className="px-4 pb-6 space-y-4">
            <button
              onClick={handleReset}
              className="text-text-muted text-xs hover:text-text-secondary transition-colors flex items-center gap-1"
            >
              <Icon name="x" size={12} />
              New analysis
            </button>

            {/* Summary grid */}
            <div>
              <h2 className="text-text-primary font-semibold text-sm mb-2">{t('atplay.summary')}</h2>
              <div className="grid grid-cols-3 gap-2">
                <SummaryCard label={t('atplay.totalInteractions')} value={String(result.summary.totalInteractions)} />
                <SummaryCard label={t('atplay.uniqueInteractors')} value={String(result.summary.uniqueInteractors)} />
                <SummaryCard label={t('atplay.mutualFollows')} value={String(result.summary.mutualFollows)} />
                <SummaryCard label={t('atplay.coreCircle')} value={String(result.summary.coreCircleCount)} />
                <SummaryCard label={t('atplay.extendedCircle')} value={String(result.summary.extendedCircleCount)} />
                <SummaryCard label={t('atplay.postsAnalyzed')} value={String(result.summary.postsAnalyzed)} />
              </div>
            </div>

            {/* Core Circle */}
            {result.core.length > 0 && (
              <div>
                <h2 className="text-text-primary font-semibold text-sm mb-2">{t('atplay.coreCircle')}</h2>
                <div className="rounded-lg border border-border bg-surface divide-y divide-border">
                  {result.core.map((info, i) => (
                    <InteractorRow key={info.did} info={info} rank={i + 1} />
                  ))}
                </div>
              </div>
            )}

            {/* Extended Circle */}
            {result.extended.length > 0 && (
              <div>
                <h2 className="text-text-primary font-semibold text-sm mb-2">{t('atplay.extendedCircle')}</h2>
                <div className="rounded-lg border border-border bg-surface divide-y divide-border">
                  {result.extended.map((info, i) => (
                    <InteractorRow key={info.did} info={info} rank={result.core.length + i + 1} />
                  ))}
                </div>
              </div>
            )}

            {/* Potential Connections */}
            {result.potential.length > 0 && (
              <div>
                <h2 className="text-text-primary font-semibold text-sm mb-2">{t('atplay.potentialConnections')}</h2>
                <div className="rounded-lg border border-border bg-surface divide-y divide-border">
                  {result.potential.map((info, i) => (
                    <InteractorRow key={info.did} info={info} rank={i + 1} />
                  ))}
                </div>
              </div>
            )}

            {/* Social Graph */}
            <div>
              <h2 className="text-text-primary font-semibold text-sm mb-2">{t('atplay.socialGraph')}</h2>
              <MermaidGraph code={result.mermaidCode} />
            </div>

            {/* Data Source */}
            <div className="p-3 rounded-lg bg-surface border border-border">
              <h3 className="text-text-primary text-xs font-semibold mb-1">{t('atplay.dataSource')}</h3>
              <p className="text-text-muted text-xs leading-relaxed">{t('atplay.dataSourceDesc')}</p>
            </div>
          </div>
        )}

        {/* ── Empty state ── */}
        {state.status === 'idle' && (
          <div className="px-4 pb-8 text-center text-text-muted text-sm py-12">
            <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-surface flex items-center justify-center">
              <Icon name="users-round" size={28} />
            </div>
            <p>Enter a Bluesky handle above to start analyzing</p>
          </div>
        )}
      </div>
    </div>
  );
}

function SummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="p-3 rounded-lg bg-surface border border-border text-center">
      <div className="text-text-muted text-[10px] uppercase tracking-wide">{label}</div>
      <div className="text-text-primary text-lg font-bold mt-0.5">{value}</div>
    </div>
  );
}
