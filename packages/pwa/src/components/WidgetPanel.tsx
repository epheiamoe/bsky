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
  const enabledWidgets = useMemo(() => {
    return availableWidgets.filter(w => enabledIds.includes(w.id));
  }, [availableWidgets, enabledIds]);

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
      {enabledWidgets.map((w, idx) => (
        <div key={w.id} className="border border-border rounded-xl bg-surface/50 relative">
          {/* Reorder buttons pinned top-right */}
          <div className="absolute top-2 right-2 z-10 flex items-center gap-0.5">
            {idx > 0 && (
              <button onClick={() => onReorderWidget?.(idx, idx - 1)} className="text-text-secondary/50 hover:text-primary transition-colors p-0.5" title="Move up">
                <Icon name="chevron-up" size={12} />
              </button>
            )}
            {idx < enabledWidgets.length - 1 && (
              <button onClick={() => onReorderWidget?.(idx, idx + 1)} className="text-text-secondary/50 hover:text-primary transition-colors p-0.5" title="Move down">
                <Icon name="chevron-down" size={12} />
              </button>
            )}
          </div>
          <div className="p-3 pt-6">
            {w.render({ onClose: () => onCloseWidget(w.id), context })}
          </div>
        </div>
      ))}
    </div>
  );
}

export default WidgetPanel;
