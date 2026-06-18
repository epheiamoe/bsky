import React from 'react';
import { Modal } from './Modal.js';
import { useI18n } from '@bsky/app';

interface ContentWarningModalProps {
  open: boolean;
  selectedLabels: string[];
  onClose: () => void;
  onChange: (labels: string[]) => void;
  hasMedia?: boolean;
}

export function ContentWarningModal({ open, selectedLabels, onClose, onChange, hasMedia }: ContentWarningModalProps) {
  const { t } = useI18n();

  const labelGroups = [
    {
      title: t('compose.adultContent'),
      labels: [
        { val: 'sexual', label: t('compose.labelSexual') },
        { val: 'nudity', label: t('compose.labelNudity') },
        { val: 'porn', label: t('compose.labelPorn') },
      ],
    },
    {
      title: t('compose.other'),
      labels: [
        { val: 'graphic-media', label: t('compose.labelGraphic') },
      ],
    },
  ];
  const toggleLabel = (val: string) => {
    if (selectedLabels.includes(val)) {
      onChange(selectedLabels.filter(l => l !== val));
    } else {
      onChange([...selectedLabels, val]);
    }
  };

  return (
    <Modal open={open} onClose={onClose}>
      <div>
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-border">
          <h2 className="text-base font-bold text-text-primary">{t('compose.contentWarningTitle')}</h2>
          <button onClick={onClose} className="text-text-secondary hover:text-text-primary transition-colors p-0.5" aria-label="Close">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 6L6 18M6 6l12 12"/>
            </svg>
          </button>
        </div>

        {/* Description */}
        <p className="text-sm text-text-secondary px-4 pt-3 pb-1">
          {t('compose.contentWarningDesc')}
        </p>

        {/* Label groups */}
        <div className="p-4 space-y-4">
          {labelGroups.map(group => (
            <div key={group.title}>
              <h3 className="text-sm font-semibold text-text-primary mb-2">{group.title}</h3>
              <div className="border border-border rounded-lg overflow-hidden">
                {group.labels.map((label, idx) => {
                  const disabled = label.val === 'graphic-media' && !hasMedia;
                  return (
                    <label
                      key={label.val}
                      className={`flex items-center gap-3 px-3 py-2.5 transition-colors ${
                        idx < group.labels.length - 1 ? 'border-b border-border' : ''
                      } ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer hover:bg-surface-hover'}`}
                    >
                      <input
                        type="checkbox"
                        checked={selectedLabels.includes(label.val)}
                        onChange={() => !disabled && toggleLabel(label.val)}
                        disabled={disabled}
                        className="w-4 h-4 accent-primary shrink-0"
                      />
                      <span className={`text-sm ${disabled ? 'text-text-secondary' : 'text-text-primary'}`}>{label.label}</span>
                    </label>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="flex justify-end p-4 border-t border-border">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg bg-primary hover:bg-primary-hover text-white text-sm font-semibold transition-colors"
          >
            {t('action.done')}
          </button>
        </div>
      </div>
    </Modal>
  );
}
