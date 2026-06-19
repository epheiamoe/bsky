import React, { useState } from 'react';
import { useI18n } from '@bsky/app';
import { getComposeDraftForWidgets, replaceComposeDraft } from '@bsky/app';
import type { WidgetProps, WidgetContext } from '@bsky/app';
import type { AIConfig } from '@bsky/core';
import { polishDraft } from '@bsky/core';
import { Icon } from '../Icon.js';
import { ThinkingCard } from '../ai/ThinkingCard.js';

interface PolishWidgetContext extends WidgetContext {
  polishConfig?: AIConfig;
}

export function PolishWidget({ onClose, context }: WidgetProps) {
  const { t } = useI18n();
  const wtContext = context as PolishWidgetContext | undefined;
  // Prefer context-supplied draft (from modal), fallback to module-level bridge (right panel)
  const draft = wtContext?.composeDraft ?? getComposeDraftForWidgets();
  const onReplace = wtContext?.onComposeDraftChange ?? replaceComposeDraft;
  const polishConfig = wtContext?.polishConfig;

  const [requirement, setRequirement] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [reasoning, setReasoning] = useState<string | null>(null);
  const [thinkingExpanded, setThinkingExpanded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const handlePolish = async () => {
    if (!draft.trim() || !requirement.trim() || !polishConfig) return;
    setLoading(true);
    setError(null);
    setResult(null);
    setReasoning(null);
    setThinkingExpanded(false);
    try {
      const { polished, reasoning: r } = await polishDraft(polishConfig, draft, requirement);
      setResult(polished);
      if (r) setReasoning(r);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = async () => {
    if (!result) return;
    try {
      await navigator.clipboard.writeText(result);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* ignore */ }
  };

  const handleReplace = () => {
    if (!result) return;
    onReplace(result);
  };

  return (
    <div className="flex flex-col gap-3 text-sm">

      <div className="text-xs text-text-secondary">
        {draft ? draft.slice(0, 120) + (draft.length > 120 ? '…' : '') : t('action.polish') + ' (no draft)'}
      </div>

      <div>
        <input
          type="text"
          value={requirement}
          onChange={e => setRequirement(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !loading) handlePolish(); }}
          placeholder="更正式 / 更精简 / 更幽默 / 英文..."
          className="w-full px-3 py-2 rounded-lg border border-border bg-surface text-text-primary text-sm placeholder:text-text-secondary/50 focus:outline-none focus:ring-2 focus:ring-purple-400"
        />
      </div>

      <button
        onClick={handlePolish}
        disabled={loading || !draft.trim() || !requirement.trim() || !polishConfig}
        className="w-full py-2 rounded-lg bg-purple-500 hover:bg-purple-600 text-white text-sm font-medium disabled:opacity-50 transition-colors"
      >
        {loading ? t('status.loading') : t('action.polish')}
      </button>

      {error && (
        <div className="text-red-500 text-xs">{error}</div>
      )}

      {result && (
        <div className="border border-purple-200 dark:border-purple-800 rounded-lg bg-purple-50 dark:bg-purple-900/20 space-y-2">
          {reasoning && (
            <ThinkingCard
              content={reasoning}
              expanded={thinkingExpanded}
              onToggle={() => setThinkingExpanded(v => !v)}
              compact
            />
          )}
          <div className="max-h-60 overflow-y-auto px-3 pb-3">
            <div className="text-text-primary whitespace-pre-wrap break-words text-sm leading-relaxed">
              {result}
            </div>
          </div>
          <div className="flex gap-2 px-3 pb-3">
            <button
              onClick={handleCopy}
              className="flex-1 py-1.5 rounded-lg border border-border bg-surface hover:bg-surface-hover text-text-primary text-xs font-medium transition-colors"
            >
              {copied ? 'Copied!' : t('action.copy')}
            </button>
            <button
              onClick={handleReplace}
              className="flex-1 py-1.5 rounded-lg bg-primary hover:bg-primary-hover text-white text-xs font-medium transition-colors"
            >
              {t('action.replace')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default PolishWidget;
