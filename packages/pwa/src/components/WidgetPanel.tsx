import React, { useMemo } from 'react';
import { useI18n, getWidgetsForView } from '@bsky/app';
import type { WidgetContext } from '@bsky/app';
import { Icon } from './Icon.js';

interface WidgetPanelProps {
  viewType: string;
  enabledIds: string[];
  context?: WidgetContext;
  onCloseWidget: (id: string) => void;
}

export function WidgetPanel({ viewType, enabledIds, context, onCloseWidget }: WidgetPanelProps) {
  const { t } = useI18n();
  const availableWidgets = useMemo(() => getWidgetsForView(viewType), [viewType]);
  const enabledWidgets = useMemo(() => {
    const list = availableWidgets.filter(w => enabledIds.includes(w.id));
    // Pin view-limited widgets (views.length > 0) to top
    return [...list].sort((a, b) => {
      const aPinned = a.views.length > 0 ? 1 : 0;
      const bPinned = b.views.length > 0 ? 1 : 0;
      return bPinned - aPinned;
    });
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
      {enabledWidgets.map(w => (
        <div
          key={w.id}
          className="border border-border rounded-xl p-3 bg-surface/50"
        >
          {w.render({
            onClose: () => onCloseWidget(w.id),
            context,
          })}
        </div>
      ))}
    </div>
  );
}

export default WidgetPanel;
