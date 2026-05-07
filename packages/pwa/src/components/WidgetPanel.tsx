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
        <div key={w.id} className="border border-border rounded-xl bg-surface/50">
          {w.render({
            onClose: () => onCloseWidget(w.id),
            context: {
              ...context,
              widgetIndex: idx,
              widgetCount: enabledWidgets.length,
              onMoveUp: () => onReorderWidget?.(idx, idx - 1),
              onMoveDown: () => onReorderWidget?.(idx, idx + 1),
            } as any,
          })}
        </div>
      ))}
    </div>
  );
}

export default WidgetPanel;
