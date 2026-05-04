import React from 'react';
import { useI18n, getWidgets, getEnabledWidgetIds } from '@bsky/app';
import { Icon } from './Icon.js';

interface WidgetPickerProps {
  open: boolean;
  onClose: () => void;
  onToggleWidget: (id: string) => void;
}

export function WidgetPicker({ open, onClose, onToggleWidget }: WidgetPickerProps) {
  const { t } = useI18n();

  if (!open) return null;

  const allWidgets = getWidgets();
  const enabledIds = getEnabledWidgetIds();

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white dark:bg-[#121212] rounded-xl shadow-xl border border-border w-full max-w-sm max-h-[80vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h2 className="text-lg font-semibold text-text-primary">Components</h2>
          <button onClick={onClose} className="text-text-secondary hover:text-text-primary p-1">
            <Icon name="x" size={16} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          {allWidgets.length === 0 ? (
            <p className="text-text-secondary text-sm">No widgets registered.</p>
          ) : (
            allWidgets.map(w => {
              const isEnabled = enabledIds.includes(w.id);
              return (
                <div
                  key={w.id}
                  className={`flex items-center justify-between p-3 rounded-lg border transition-colors cursor-pointer ${
                    isEnabled
                      ? 'border-primary/40 bg-primary/5'
                      : 'border-border bg-surface hover:bg-surface-hover'
                  }`}
                  onClick={() => onToggleWidget(w.id)}
                >
                  <div className="flex items-center gap-3">
                    <Icon name={w.icon as any} size={18} />
                    <div>
                      <p className="text-sm font-medium text-text-primary">{t(w.titleKey)}</p>
                      <p className="text-xs text-text-secondary">
                        {w.views.length > 0
                          ? `Visible in: ${w.views.join(', ')}`
                          : 'Available in all views'}
                      </p>
                    </div>
                  </div>
                  <div
                    className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-colors ${
                      isEnabled
                        ? 'bg-primary border-primary text-white'
                        : 'border-text-secondary/30'
                    }`}
                  >
                    {isEnabled && <Icon name="badge-check" size={12} />}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}

export default WidgetPicker;
