import React, { useState } from 'react';
import { useI18n, getWidgets, getEnabledWidgetIds, toggleWidget } from '@bsky/app';
import type { WidgetContext, AppView } from '@bsky/app';
import type { BskyClient } from '@bsky/core';
import { getAppConfig, saveAppConfig } from '../hooks/useAppConfig.js';
import { Icon } from './Icon.js';

interface ComponentsPageProps {
  goBack: () => void;
  goTo: (v: AppView) => void;
  client: BskyClient;
}

export function ComponentsPage({ goBack, goTo, client }: ComponentsPageProps) {
  const { t } = useI18n();
  const [tick, setTick] = useState(0);
  const allWidgets = getWidgets();
  const enabledIds = getEnabledWidgetIds();

  const context: WidgetContext = { viewType: 'components', goTo, client };

  if (allWidgets.length === 0) {
    return (
      <div className="min-h-screen bg-white dark:bg-[#0A0A0A] animate-fadeIn">
        <header className="sticky top-0 z-10 bg-white/80 dark:bg-[#0A0A0A]/80 backdrop-blur-md border-b border-border px-4 h-12 flex items-center">
          <button onClick={goBack} className="text-text-secondary hover:text-text-primary mr-3">
            <Icon name="arrow-big-left" size={20} />
          </button>
          <h1 className="font-semibold text-text-primary text-sm">组件</h1>
        </header>
        <main className="max-w-content mx-auto p-4">
          <p className="text-text-secondary text-sm">No widgets registered.</p>
        </main>
      </div>
    );
  }

  const isViewLimited = (w: any) => w.views.length > 0;

  return (
    <div className="min-h-screen bg-white dark:bg-[#0A0A0A] animate-fadeIn">
      <header className="sticky top-0 z-10 bg-white/80 dark:bg-[#0A0A0A]/80 backdrop-blur-md border-b border-border px-4 h-12 flex items-center">
        <button onClick={goBack} className="text-text-secondary hover:text-text-primary mr-3">
          <Icon name="arrow-big-left" size={20} />
        </button>
        <h1 className="font-semibold text-text-primary text-sm">组件</h1>
      </header>

      <main className="max-w-content mx-auto p-4">
        {allWidgets.filter(w => enabledIds.includes(w.id)).map(w => (
          <div key={w.id} className="mb-4 border border-border rounded-xl p-4 bg-surface/50">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <Icon name={w.icon as any} size={18} />
                <span className="text-sm font-semibold text-text-primary">{t(w.titleKey)}</span>
                {isViewLimited(w) && (
                  <span className="text-[10px] text-text-secondary/50 bg-surface-hover px-1.5 py-0.5 rounded">
                    {w.views.join(', ')}
                  </span>
                )}
              </div>
              <button
                onClick={() => {
                  toggleWidget(w.id);
                  setTick(t => t + 1);
                  const config = getAppConfig();
                  saveAppConfig({ ...config, enabledWidgets: getEnabledWidgetIds() });
                }}
                className={`text-xs px-2 py-0.5 rounded border transition-colors ${
                  getEnabledWidgetIds().includes(w.id)
                    ? 'text-red-500 border-red-300 hover:bg-red-50 dark:hover:bg-red-900/20'
                    : 'text-primary border-primary hover:bg-primary/10'
                }`}
              >
                {getEnabledWidgetIds().includes(w.id) ? t('action.disable') : t('action.enable')}
              </button>
            </div>
            {isViewLimited(w) ? (
              <p className="text-text-secondary/50 text-xs">
                {t('widget.viewLimited').replace('{view}', w.views.join(', '))} — 请在对应页面查看
              </p>
            ) : (
              <div className="mt-1">
                {w.render({
                  onClose: () => { toggleWidget(w.id); setTick(t => t + 1); },
                  context,
                })}
              </div>
            )}
          </div>
        ))}

        {allWidgets.filter(w => !enabledIds.includes(w.id)).length > 0 && (
          <>
            <h2 className="text-xs font-semibold text-text-secondary/60 uppercase tracking-wider mt-6 mb-3">已关闭的组件</h2>
            <div className="space-y-2">
              {allWidgets.filter(w => !enabledIds.includes(w.id)).map(w => (
                <div key={w.id} className="flex items-center justify-between p-3 rounded-lg border border-border bg-surface">
                  <div className="flex items-center gap-3">
                    <Icon name={w.icon as any} size={18} />
                    <div>
                      <p className="text-sm text-text-primary">{t(w.titleKey)}</p>
                      <p className="text-xs text-text-secondary">
                        {isViewLimited(w) ? `${w.views.join(', ')} only` : 'All views'}
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => { toggleWidget(w.id); setTick(t => t + 1); }}
                    className="text-xs px-3 py-1 rounded-full bg-primary text-white hover:bg-primary-hover transition-colors"
                  >
                    {t('action.enable')}
                  </button>
                </div>
              ))}
            </div>
          </>
        )}
      </main>
    </div>
  );
}

export default ComponentsPage;
