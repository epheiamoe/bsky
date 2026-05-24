import React, { useState, useCallback } from 'react';
import { useI18n } from '@bsky/app';
import type { ModerationConfig, LabelerConfig, ContentLabelPref } from '@bsky/core';
import { OFFICIAL_LABELER_DID, STANDARD_LABELS, isStandardLabel } from '@bsky/core';
import { useLabelerInfo, fetchLabelerInfos } from '@bsky/app';
import type { BskyClient } from '@bsky/core';
import { Icon } from './Icon.js';

interface ModerationSettingsTabProps {
  config: ModerationConfig;
  client: BskyClient | null;
  onChange: (config: ModerationConfig) => void;
}

type Visibility = 'hide' | 'warn' | 'ignore';

const VISIBILITY_OPTIONS: { value: Visibility; labelKey: string; color: string }[] = [
  { value: 'hide', labelKey: 'moderation.hide', color: 'text-red-500' },
  { value: 'warn', labelKey: 'moderation.warn', color: 'text-amber-500' },
  { value: 'ignore', labelKey: 'moderation.ignore', color: 'text-green-500' },
];

export function ModerationSettingsTab({ config, client, onChange }: ModerationSettingsTabProps) {
  const { t } = useI18n();
  const [newLabelerDid, setNewLabelerDid] = useState('');
  const [isAdding, setIsAdding] = useState(false);
  const [activeLabelerTab, setActiveLabelerTab] = useState<string | null>(null);

  // Ensure official labeler is in the list
  const officialLabeler = config.labelers.find(l => l.did === OFFICIAL_LABELER_DID);
  const thirdPartyLabelers = config.labelers.filter(l => l.did !== OFFICIAL_LABELER_DID);

  const handleVisibilityChange = useCallback((label: string, visibility: Visibility) => {
    const existing = config.contentLabels.findIndex(l => l.label === label);
    let contentLabels: ContentLabelPref[];
    if (existing >= 0) {
      contentLabels = config.contentLabels.map((l, i) =>
        i === existing ? { ...l, visibility } : l
      );
    } else {
      contentLabels = [...config.contentLabels, { label, visibility }];
    }
    onChange({ ...config, contentLabels });
  }, [config, onChange]);

  const handleAdultToggle = useCallback((enabled: boolean) => {
    onChange({ ...config, adultContentEnabled: enabled });
  }, [config, onChange]);

  const handleAddLabeler = useCallback(async () => {
    if (!client || !newLabelerDid.trim()) return;
    setIsAdding(true);
    try {
      const infos = await fetchLabelerInfos(client, [newLabelerDid.trim()]);
      const info = infos.get(newLabelerDid.trim());
      if (info) {
        const newLabeler: LabelerConfig = {
          did: newLabelerDid.trim(),
          name: info.view.creator.displayName || info.view.creator.handle,
          description: '',
          avatar: info.view.creator.avatar,
          labels: info.policies?.labelValueDefinitions || [],
          labelPrefs: {},
          isActive: true,
        };
        onChange({ ...config, labelers: [...config.labelers, newLabeler] });
        setNewLabelerDid('');
      }
    } catch (err) {
      console.error('Failed to add labeler:', err);
    } finally {
      setIsAdding(false);
    }
  }, [client, newLabelerDid, config, onChange]);

  const handleRemoveLabeler = useCallback((did: string) => {
    onChange({ ...config, labelers: config.labelers.filter(l => l.did !== did) });
  }, [config, onChange]);

  const handleLabelerPrefChange = useCallback((did: string, label: string, visibility: Visibility) => {
    onChange({
      ...config,
      labelers: config.labelers.map(l =>
        l.did === did
          ? { ...l, labelPrefs: { ...l.labelPrefs, [label]: visibility } }
          : l
      ),
    });
  }, [config, onChange]);

  const handleLabelerActiveToggle = useCallback((did: string, isActive: boolean) => {
    onChange({
      ...config,
      labelers: config.labelers.map(l =>
        l.did === did ? { ...l, isActive } : l
      ),
    });
  }, [config, onChange]);

  const getGlobalVisibility = (label: string): Visibility => {
    const pref = config.contentLabels.find(l => l.label === label);
    return pref?.visibility || 'warn';
  };

  return (
    <div className="space-y-6">
      {/* ── General Settings ── */}
      <section>
        <h3 className="text-sm font-semibold text-text-primary mb-3">{t('moderation.generalTitle')}</h3>
        
        {/* Adult Content Toggle */}
        <label className="flex items-center gap-3 cursor-pointer mb-4">
          <input
            type="checkbox"
            checked={config.adultContentEnabled}
            onChange={e => handleAdultToggle(e.target.checked)}
            className="w-4 h-4 accent-primary"
          />
          <span className="text-sm text-text-primary">{t('moderation.adultContent')}</span>
        </label>

        {/* Standard Labels Table */}
        <div className="border border-border rounded-lg overflow-hidden">
          <div className="grid grid-cols-4 gap-2 px-3 py-2 bg-surface/50 text-xs font-medium text-text-secondary border-b border-border">
            <span>{t('moderation.label')}</span>
            <span className="text-center">{t('moderation.hide')}</span>
            <span className="text-center">{t('moderation.warn')}</span>
            <span className="text-center">{t('moderation.ignore')}</span>
          </div>
          {STANDARD_LABELS.map(label => {
            const current = getGlobalVisibility(label);
            return (
              <div key={label} className="grid grid-cols-4 gap-2 px-3 py-2.5 border-b border-border last:border-b-0 items-center">
                <span className="text-sm text-text-primary capitalize">{t(`moderation.labels.${label}`) || label}</span>
                {VISIBILITY_OPTIONS.map(opt => (
                  <label key={opt.value} className="flex justify-center cursor-pointer">
                    <input
                      type="radio"
                      name={`label-${label}`}
                      value={opt.value}
                      checked={current === opt.value}
                      onChange={() => handleVisibilityChange(label, opt.value)}
                      className="w-4 h-4 accent-primary"
                    />
                  </label>
                ))}
              </div>
            );
          })}
        </div>
        <p className="text-xs text-text-secondary mt-2">{t('moderation.globalNote')}</p>
      </section>

      {/* ── Official Labeler ── */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-text-primary">{t('moderation.officialLabeler')}</h3>
          {officialLabeler && (
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={officialLabeler.isActive}
                onChange={e => handleLabelerActiveToggle(OFFICIAL_LABELER_DID, e.target.checked)}
                className="w-4 h-4 accent-primary"
              />
              <span className="text-xs text-text-secondary">{t('moderation.enabled')}</span>
            </label>
          )}
        </div>

        {officialLabeler ? (
          <OfficialLabelerPanel
            labeler={officialLabeler}
            onPrefChange={(label, visibility) => handleLabelerPrefChange(OFFICIAL_LABELER_DID, label, visibility)}
          />
        ) : (
          <p className="text-sm text-text-secondary">{t('moderation.officialNotLoaded')}</p>
        )}
      </section>

      {/* ── Third-Party Labelers ── */}
      <section>
        <h3 className="text-sm font-semibold text-text-primary mb-3">{t('moderation.thirdPartyLabelers')}</h3>

        {/* Add new labeler */}
        <div className="flex gap-2 mb-4">
          <input
            type="text"
            value={newLabelerDid}
            onChange={e => setNewLabelerDid(e.target.value)}
            placeholder="did:plc:..."
            className="flex-1 px-3 py-2 rounded-lg border border-border bg-surface text-text-primary text-sm placeholder:text-text-secondary/50 focus:outline-none focus:ring-2 focus:ring-primary"
          />
          <button
            onClick={handleAddLabeler}
            disabled={!newLabelerDid.trim() || isAdding}
            className="px-4 py-2 rounded-lg bg-primary hover:bg-primary-hover text-white text-sm font-medium disabled:opacity-50 transition-colors"
          >
            {isAdding ? t('action.loading') : t('action.add')}
          </button>
        </div>

        {/* Third-party labeler tabs */}
        {thirdPartyLabelers.length > 0 ? (
          <div className="space-y-2">
            {thirdPartyLabelers.map(labeler => (
              <ThirdPartyLabelerCard
                key={labeler.did}
                labeler={labeler}
                client={client}
                isExpanded={activeLabelerTab === labeler.did}
                onToggle={() => setActiveLabelerTab(activeLabelerTab === labeler.did ? null : labeler.did)}
                onPrefChange={(label, visibility) => handleLabelerPrefChange(labeler.did, label, visibility)}
                onActiveToggle={(isActive) => handleLabelerActiveToggle(labeler.did, isActive)}
                onRemove={() => handleRemoveLabeler(labeler.did)}
              />
            ))}
          </div>
        ) : (
          <p className="text-sm text-text-secondary text-center py-4">{t('moderation.noThirdPartyLabelers')}</p>
        )}
      </section>
    </div>
  );
}

/** Official labeler panel with dynamically fetched labels */
function OfficialLabelerPanel({
  labeler,
  onPrefChange,
}: {
  labeler: LabelerConfig;
  onPrefChange: (label: string, visibility: Visibility) => void;
}) {
  const { t } = useI18n();

  // Filter out standard labels (already shown in general settings)
  const extraLabels = labeler.labels.filter(l => !isStandardLabel(l.identifier));

  if (extraLabels.length === 0) {
    return <p className="text-sm text-text-secondary">{t('moderation.noExtraLabels')}</p>;
  }

  return (
    <div className="border border-border rounded-lg overflow-hidden">
      <div className="grid grid-cols-4 gap-2 px-3 py-2 bg-surface/50 text-xs font-medium text-text-secondary border-b border-border">
        <span>{t('moderation.label')}</span>
        <span className="text-center">{t('moderation.hide')}</span>
        <span className="text-center">{t('moderation.warn')}</span>
        <span className="text-center">{t('moderation.ignore')}</span>
      </div>
      {extraLabels.map(def => {
        const current = labeler.labelPrefs[def.identifier] || def.defaultSetting;
        return (
          <div key={def.identifier} className="grid grid-cols-4 gap-2 px-3 py-2.5 border-b border-border last:border-b-0 items-center">
            <div className="text-sm text-text-primary">
              <div>{def.locales?.[0]?.name || def.identifier}</div>
              {def.locales?.[0]?.description && (
                <div className="text-xs text-text-secondary/70">{def.locales[0].description}</div>
              )}
            </div>
            {VISIBILITY_OPTIONS.map(opt => (
              <label key={opt.value} className="flex justify-center cursor-pointer">
                <input
                  type="radio"
                  name={`official-${def.identifier}`}
                  value={opt.value}
                  checked={current === opt.value}
                  onChange={() => onPrefChange(def.identifier, opt.value)}
                  className="w-4 h-4 accent-primary"
                />
              </label>
            ))}
          </div>
        );
      })}
    </div>
  );
}

/** Third-party labeler expandable card */
function ThirdPartyLabelerCard({
  labeler,
  client,
  isExpanded,
  onToggle,
  onPrefChange,
  onActiveToggle,
  onRemove,
}: {
  labeler: LabelerConfig;
  client: BskyClient | null;
  isExpanded: boolean;
  onToggle: () => void;
  onPrefChange: (label: string, visibility: Visibility) => void;
  onActiveToggle: (isActive: boolean) => void;
  onRemove: () => void;
}) {
  const { t } = useI18n();
  const { view, isLoading } = useLabelerInfo(labeler.did, client);

  return (
    <div className="border border-border rounded-lg overflow-hidden">
      <div
        className="flex items-center justify-between px-3 py-2.5 bg-surface/50 cursor-pointer hover:bg-surface/80 transition-colors"
        onClick={onToggle}
      >
        <div className="flex items-center gap-2">
          {view?.creator.avatar ? (
            <img src={view.creator.avatar} alt="" className="w-6 h-6 rounded-full" />
          ) : (
            <div className="w-6 h-6 rounded-full bg-surface flex items-center justify-center text-xs">🛡</div>
          )}
          <div>
            <div className="text-sm font-medium text-text-primary">
              {view?.creator.displayName || view?.creator.handle || labeler.name}
            </div>
            <div className="text-xs text-text-secondary">{labeler.did}</div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-1.5 cursor-pointer"
            onClick={e => e.stopPropagation()}
          >
            <input
              type="checkbox"
              checked={labeler.isActive}
              onChange={e => onActiveToggle(e.target.checked)}
              className="w-4 h-4 accent-primary"
            />
            <span className="text-xs text-text-secondary">{t('moderation.enabled')}</span>
          </label>
          <button
            onClick={e => { e.stopPropagation(); onRemove(); }}
            className="p-1 text-text-secondary hover:text-red-500 transition-colors"
            title={t('action.remove')}
          >
            <Icon name="x" size={14} />
          </button>
          <Icon name="chevron-down" size={16} className={`text-text-secondary transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
        </div>
      </div>

      {isExpanded && (
        <div className="px-3 py-3 border-t border-border">
          {labeler.labels.length > 0 ? (
            <div className="border border-border rounded-lg overflow-hidden">
              <div className="grid grid-cols-4 gap-2 px-3 py-2 bg-surface/30 text-xs font-medium text-text-secondary border-b border-border">
                <span>{t('moderation.label')}</span>
                <span className="text-center">{t('moderation.hide')}</span>
                <span className="text-center">{t('moderation.warn')}</span>
                <span className="text-center">{t('moderation.ignore')}</span>
              </div>
              {labeler.labels.map(def => {
                const current = labeler.labelPrefs[def.identifier] || def.defaultSetting;
                return (
                  <div key={def.identifier} className="grid grid-cols-4 gap-2 px-3 py-2 border-b border-border last:border-b-0 items-center">
                    <div className="text-sm text-text-primary">
                      <div>{def.locales?.[0]?.name || def.identifier}</div>
                    </div>
                    {VISIBILITY_OPTIONS.map(opt => (
                      <label key={opt.value} className="flex justify-center cursor-pointer">
                        <input
                          type="radio"
                          name={`${labeler.did}-${def.identifier}`}
                          value={opt.value}
                          checked={current === opt.value}
                          onChange={() => onPrefChange(def.identifier, opt.value)}
                          className="w-4 h-4 accent-primary"
                        />
                      </label>
                    ))}
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-sm text-text-secondary">{isLoading ? t('action.loading') : t('moderation.noLabels')}</p>
          )}
        </div>
      )}
    </div>
  );
}
