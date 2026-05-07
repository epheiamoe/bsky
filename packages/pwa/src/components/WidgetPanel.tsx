import React, { useMemo } from 'react';
import { useI18n, getWidgetsForView } from '@bsky/app';
import type { WidgetContext } from '@bsky/app';
import { Icon } from './Icon.js';

interface WidgetPanelProps {
  viewType: string;
  enabledIds: string[];
  context?: WidgetContext;
  onCloseWidget: (id: string) => void;
  onReorderWidget?: (fromIdx: number, toIdx: number) => void;
}

export function WidgetPanel({ viewType, enabledIds, context, onCloseWidget, onReorderWidget }: WidgetPanelProps) {
  const { t } = useI18n();

  const availableWidgets = useMemo(() => getWidgetsForView(viewType), [viewType]);
  // Filter to visible widgets, keeping enabledIds order
  const widgetMap = useMemo(() => new Map(availableWidgets.map(w => [w.id, w])), [availableWidgets]);
  const enabledWidgets = useMemo(() => {
    return enabledIds.map(id => widgetMap.get(id)).filter((w): w is NonNullable<typeof w> => !!w);
  }, [widgetMap, enabledIds]);
  const showArrows = enabledWidgets.length > 1;

  if (availableWidgets.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-text-secondary/60 text-xs gap-2 p-4">
        <Icon name="astroid-as-AI-Button" size={20} />
        <span>{t('layout.aiSuggestions')}</span>
        <span>No widgets available for this view</span>
      </div>
    );
  }

  if (enabledWidgets.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-text-secondary/60 text-xs gap-2 p-4">
        <Icon name="astroid-as-AI-Button" size={20} />
        <span>No widgets active</span>
        <span>Click 组件 in sidebar to add</span>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 p-3 overflow-y-auto">
      {enabledWidgets.map((w, visualIdx) => {
        // Find the real index in the full enabledIds array (for reorder accuracy)
        const realIdx = enabledIds.indexOf(w.id);
        return (
          <div key={w.id} className="border border-border rounded-xl bg-surface/50">
            {/* Unified header: icon + title + arrows + close */}
            <div className="flex items-center justify-between px-3 pt-3 pb-0">
              <span className="text-xs font-semibold text-text-primary flex items-center gap-1.5">
                <Icon name={w.icon as any} size={14} />
                {t(w.titleKey)}
              </span>
              <div className="flex items-center gap-0.5">
                {showArrows && realIdx > 0 && (
                  <button onClick={() => onReorderWidget?.(realIdx, realIdx - 1)} className="text-text-secondary/60 hover:text-primary transition-colors p-0.5" title="Move up">
                    <Icon name="chevron-up" size={12} />
                  </button>
                )}
                {showArrows && realIdx >= 0 && realIdx < enabledIds.length - 1 && (
                  <button onClick={() => onReorderWidget?.(realIdx, realIdx + 1)} className="text-text-secondary/60 hover:text-primary transition-colors p-0.5" title="Move down">
                    <Icon name="chevron-down" size={12} />
                  </button>
                )}
                <button onClick={() => onCloseWidget(w.id)} className="text-text-secondary/60 hover:text-red-500 transition-colors p-0.5 ml-0.5" title="Close">
                  <Icon name="x" size={12} />
                </button>
              </div>
            </div>
            <div className="p-3">
              {w.render({ onClose: () => onCloseWidget(w.id), context })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default WidgetPanel;
