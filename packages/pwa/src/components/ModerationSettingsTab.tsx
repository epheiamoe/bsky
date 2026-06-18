import React, { useState, useCallback, useEffect } from 'react';
import { useI18n } from '@bsky/app';
import type { ModerationConfig, LabelerConfig, ContentLabelPref } from '@bsky/core';
import { OFFICIAL_LABELER_DID, STANDARD_LABELS } from '@bsky/core';
import { useLabelerInfo, fetchLabelerInfos, BUILTIN_LABELERS } from '@bsky/app';
import type { BskyClient } from '@bsky/core';
import { Icon } from './Icon.js';
import type { SyncState } from '../hooks/useModerationConfig.js';

interface ModerationSettingsTabProps {
  config: ModerationConfig;
  syncState: SyncState;
  client: BskyClient | null;
  onChange: (config: ModerationConfig) => void;
  onSyncFromPDS: () => Promise<void>;
  onSaveToPDS: () => Promise<void>;
}

type Visibility = 'show' | 'warn' | 'hide';

const VISIBILITY_OPTIONS: { value: Visibility; labelKey: string }[] = [
  { value: 'show', labelKey: 'moderation.show' },
  { value: 'warn', labelKey: 'moderation.warn' },
  { value: 'hide', labelKey: 'moderation.hide' },
];

/** [v0.15.0] Determine the middle button label based on label definition blurs field.
 *  warn + blurs=none   → displays as badge (e.g., impersonation)
 *  warn + blurs=content/media → displays as warning overlay
 */
function getMiddleButtonLabel(blurs: string | undefined): string {
  return blurs === 'none' ? 'moderation.badge' : 'moderation.warn';
}

export function ModerationSettingsTab({ config, syncState, client, onChange, onSyncFromPDS, onSaveToPDS }: ModerationSettingsTabProps) {
  const { t } = useI18n();
  const [newLabelerDid, setNewLabelerDid] = useState('');
  const [isAdding, setIsAdding] = useState(false);
  const [activeLabelerTab, setActiveLabelerTab] = useState<string | null>(null);
  const [addError, setAddError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const officialLabeler = config.labelers.find(l => l.did === OFFICIAL_LABELER_DID);
  const thirdPartyLabelers = config.labelers.filter(l => l.did !== OFFICIAL_LABELER_DID);

  // Subscribed DIDs + handles for filtering recommendations
  const subscribedDids = new Set(config.labelers.map(l => l.did));
  const subscribedHandles = new Set(config.labelers.map(l => {
    // Extract handle from DID or try to find matching builtin
    const builtin = BUILTIN_LABELERS.find(b => b.did === l.did);
    return builtin?.handle || l.did;
  }));

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
    setAddError(null);
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
          failureBehavior: 'banner',
        };
        onChange({ ...config, labelers: [...config.labelers, newLabeler] });
        setNewLabelerDid('');
      } else {
        setAddError('无法获取标签提供商信息');
      }
    } catch (err) {
      setAddError(err instanceof Error ? err.message : '添加失败');
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

  const handleFailureBehaviorChange = useCallback((did: string, behavior: 'silent' | 'banner' | 'block') => {
    onChange({
      ...config,
      labelers: config.labelers.map(l =>
        l.did === did ? { ...l, failureBehavior: behavior } : l
      ),
    });
  }, [config, onChange]);

  const handleAddRecommended = useCallback(async (handle: string) => {
    if (!client) return;
    setIsAdding(true);
    setFeedback(null);
    try {
      // Step 1: resolve handle
      let did: string;
      try {
        const resolved = await client.resolveHandle(handle);
        did = resolved.did;
      } catch (err) {
        setFeedback({ type: 'error', message: t('moderation.resolveFailed') || `无法解析 @${handle}，请检查 handle 是否正确` });
        return;
      }

      if (subscribedDids.has(did)) {
        setFeedback({ type: 'error', message: t('moderation.alreadyAdded') || '该标签提供商已添加' });
        return;
      }

      // Step 2: get labeler services
      let views: any[];
      try {
        views = await client.getLabelerServices([did]);
      } catch (err: any) {
        setFeedback({ type: 'error', message: t('moderation.serviceFetchFailed') || `获取标签服务失败: ${err.message || err}` });
        return;
      }

      if (!views || views.length === 0) {
        setFeedback({ type: 'error', message: t('moderation.notALabeler') || '该账户未注册标签服务' });
        return;
      }

      const view = views[0];

      // Step 3: get policies
      let policies: any = null;
      try {
        const record = await client.getRecord(did, 'app.bsky.labeler.service', 'self');
        policies = (record.value as any)?.policies || null;
      } catch {
        // Policies may not exist — not fatal
      }

      const newLabeler: LabelerConfig = {
        did,
        name: view.creator.displayName || view.creator.handle,
        description: '',
        avatar: view.creator.avatar,
        labels: policies?.labelValueDefinitions || [],
        labelPrefs: {},
        isActive: true,
        failureBehavior: 'banner',
      };
      onChange({ ...config, labelers: [...config.labelers, newLabeler] });
      setFeedback({ type: 'success', message: t('moderation.addSuccess') || '标签提供商已添加' });
    } catch (err) {
      setFeedback({ type: 'error', message: err instanceof Error ? err.message : t('moderation.addFailed') || '添加失败' });
    } finally {
      setIsAdding(false);
      setTimeout(() => setFeedback(null), 3000);
    }
  }, [client, config, onChange, subscribedDids, t]);

  const getGlobalVisibility = (label: string): Visibility => {
    const pref = config.contentLabels.find(l => l.label === label);
    return pref?.visibility || 'warn';
  };

  // [v0.15.0] Auto-pull from PDS on mount
  const hasSyncedRef = React.useRef(false);
  useEffect(() => {
    if (client && !hasSyncedRef.current) {
      hasSyncedRef.current = true;
      onSyncFromPDS();
    }
  }, [client, onSyncFromPDS]);

  const formatLastSync = (timestamp: number | null): string => {
    if (!timestamp) return t('moderation.neverSynced') || '从未同步';
    const date = new Date(timestamp);
    return date.toLocaleString('zh-CN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div className="space-y-6">
      {/* ── Content Filters ── */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-text-primary">{t('moderation.generalTitle')}</h3>
          <div className="flex items-center gap-2">
            {syncState.status === 'syncing' && (
              <span className="text-xs text-text-secondary flex items-center gap-1">
                <span className="w-3 h-3 border border-primary border-t-transparent rounded-full animate-spin" />
                {t('moderation.syncing') || '同步中...'}
              </span>
            )}
            {syncState.status === 'error' && (
              <span className="text-xs text-red-500" title={syncState.error || ''}>
                {t('moderation.syncError') || '同步失败'}
              </span>
            )}
            {syncState.status === 'success' && (
              <span className="text-xs text-green-500">
                {t('moderation.lastSynced') || '上次同步'}: {formatLastSync(syncState.lastSyncedAt)}
              </span>
            )}
            <button
              onClick={onSaveToPDS}
              disabled={syncState.status === 'syncing' || !client}
              className="px-2 py-1 rounded-md bg-primary/10 hover:bg-primary/20 text-primary text-xs font-medium disabled:opacity-50 transition-colors flex items-center gap-1"
            >
              <Icon name="upload-cloud" size={12} />
              {t('moderation.syncToPDS') || '同步到服务器'}
            </button>
            <button
              onClick={onSyncFromPDS}
              disabled={syncState.status === 'syncing' || !client}
              className="px-2 py-1 rounded-md bg-surface hover:bg-surface-tertiary text-text-secondary text-xs font-medium disabled:opacity-50 transition-colors flex items-center gap-1"
            >
              <Icon name="refresh-cw" size={12} />
              {t('moderation.syncFromPDS') || '从服务器拉取'}
            </button>
          </div>
        </div>
        
        {/* Adult content master toggle */}
        <div className="flex items-center justify-between p-3 rounded-lg bg-surface/50 border border-border mb-4">
          <span className="text-sm text-text-primary">{t('moderation.adultContent')}</span>
          <div className="flex items-center gap-2">
            <span className="text-xs text-text-secondary">
              {config.adultContentEnabled ? t('moderation.adultEnabled') : t('moderation.adultDisabled')}
            </span>
            <button
              onClick={() => handleAdultToggle(!config.adultContentEnabled)}
              className={`relative w-11 h-6 rounded-full transition-colors ${config.adultContentEnabled ? 'bg-primary' : 'bg-surface-tertiary'}`}
              role="switch"
              aria-checked={config.adultContentEnabled}
            >
              <span
                className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow-sm transition-transform ${config.adultContentEnabled ? 'translate-x-5' : 'translate-x-0'}`}
              />
            </button>
          </div>
        </div>

        {/* Per-label controls — only visible when adult content is enabled */}
        {config.adultContentEnabled && (
          <div className="space-y-3">
            {STANDARD_LABELS.map(label => {
              const current = getGlobalVisibility(label);
              return (
                <div key={label} className="p-3 rounded-lg border border-border bg-surface/30">
                  <div className="mb-2">
                    <div className="text-sm font-medium text-text-primary">{t(`moderation.labels.${label}`) || label}</div>
                    <div className="text-xs text-text-secondary/70 mt-0.5">{t(`moderation.labelDesc.${label}`)}</div>
                  </div>
                  <div className="grid grid-cols-3 gap-1">
                    {VISIBILITY_OPTIONS.map(opt => (
                      <button
                        key={opt.value}
                        onClick={() => handleVisibilityChange(label, opt.value)}
                        className={`px-2 py-1.5 rounded-md text-xs font-medium transition-colors ${
                          current === opt.value
                            ? 'bg-primary text-white'
                            : 'bg-surface hover:bg-surface-tertiary text-text-secondary'
                        }`}
                      >
                        {t(opt.labelKey)}
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
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

        {officialLabeler && (
          <OfficialLabelerPanel
            labeler={officialLabeler}
            client={client}
            onPrefChange={(label, visibility) => handleLabelerPrefChange(OFFICIAL_LABELER_DID, label, visibility)}
          />
        )}
      </section>

      {/* ── Third-Party Labelers ── */}
      <section>
        <h3 className="text-sm font-semibold text-text-primary mb-3">{t('moderation.thirdPartyLabelers')}</h3>

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
        {addError && (
          <div className="mb-3 p-2 rounded-lg bg-red-500/10 border border-red-500/20 text-sm text-red-500">
            {addError}
          </div>
        )}

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
                onFailureBehaviorChange={(behavior) => handleFailureBehaviorChange(labeler.did, behavior)}
              />
            ))}
          </div>
        ) : (
          <p className="text-sm text-text-secondary text-center py-4">{t('moderation.noThirdPartyLabelers')}</p>
        )}
      </section>

      {/* ── Feedback banner ── */}
      {feedback && (
        <div className={`p-3 rounded-lg border text-sm ${
          feedback.type === 'success'
            ? 'bg-green-500/10 border-green-500/20 text-green-500'
            : 'bg-red-500/10 border-red-500/20 text-red-500'
        }`}>
          {feedback.message}
        </div>
      )}

      {/* ── Recommended Labelers ── */}
      <section>
        <h3 className="text-sm font-semibold text-text-primary mb-3">{t('moderation.recommendedLabelers') || '推荐标签提供商'}</h3>
        <div className="space-y-2">
          {BUILTIN_LABELERS.filter(b => 
            b.handle !== 'moderation.bsky.app' && 
            !subscribedDids.has(b.did || '') &&
            !subscribedHandles.has(b.handle)
          ).map(builtin => (
            <div key={builtin.handle} className="flex items-center justify-between p-3 rounded-lg border border-border bg-surface/30">
              <div>
                <div className="text-sm font-medium text-text-primary">{builtin.name}</div>
                <div className="text-xs text-text-secondary">@{builtin.handle}</div>
                <div className="text-xs text-text-secondary/70 mt-0.5">{builtin.description}</div>
              </div>
              <button
                onClick={() => handleAddRecommended(builtin.handle)}
                disabled={isAdding}
                className="px-3 py-1.5 rounded-lg bg-primary/10 hover:bg-primary/20 text-primary text-sm font-medium disabled:opacity-50 transition-colors"
              >
                {t('action.add')}
              </button>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

/** Official labeler panel with dynamically fetched labels */
function OfficialLabelerPanel({
  labeler,
  client,
  onPrefChange,
}: {
  labeler: LabelerConfig;
  client: BskyClient | null;
  onPrefChange: (label: string, visibility: Visibility) => void;
}) {
  const { t } = useI18n();
  const { view, policies, isLoading, error } = useLabelerInfo(labeler.did, client);
  const [retryKey, setRetryKey] = useState(0);

  const defs = policies?.labelValueDefinitions || [];
  // Filter out standard labels (already shown in general settings)
  const extraLabels = defs.filter(d => !STANDARD_LABELS.includes(d.identifier as any));

  if (error) {
    return (
      <div className="border border-border rounded-lg p-4 bg-surface/50">
        <div className="flex items-center gap-2 mb-2">
          <Icon name="alert-circle" size={16} className="text-red-500" />
          <span className="text-sm text-text-primary">{t('moderation.loadError') || '无法获取标签列表'}</span>
        </div>
        <button
          onClick={() => setRetryKey(k => k + 1)}
          className="text-sm text-primary hover:text-primary-hover transition-colors"
        >
          {t('action.refresh') || '重新加载'}
        </button>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="border border-border rounded-lg p-4 bg-surface/50">
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          <span className="text-sm text-text-secondary">{t('action.loading')}</span>
        </div>
      </div>
    );
  }

  if (extraLabels.length === 0) {
    return (
      <div className="border border-border rounded-lg p-3">
        <div className="flex items-center gap-2 mb-2">
          {view?.creator.avatar ? (
            <img src={view.creator.avatar} alt="" className="w-6 h-6 rounded-full" />
          ) : (
            <div className="w-6 h-6 rounded-full bg-surface flex items-center justify-center text-xs">🛡</div>
          )}
          <div>
            <div className="text-sm font-medium text-text-primary">{view?.creator.displayName || view?.creator.handle || labeler.name}</div>
            <div className="text-xs text-text-secondary">@{view?.creator.handle || 'moderation.bsky.app'}</div>
          </div>
        </div>
        <p className="text-sm text-text-secondary">{t('moderation.noExtraLabels')}</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {extraLabels.map(def => {
        const current = labeler.labelPrefs[def.identifier] || def.defaultSetting;
        return (
          <div key={def.identifier} className="p-3 rounded-lg border border-border bg-surface/30">
            <div className="mb-2">
              <div className="text-sm font-medium text-text-primary">{def.locales?.[0]?.name || def.identifier}</div>
              {def.locales?.[0]?.description && (
                <div className="text-xs text-text-secondary/70 mt-0.5">{def.locales[0].description}</div>
              )}
            </div>
            <div className="grid grid-cols-3 gap-1">
              {VISIBILITY_OPTIONS.map(opt => (
                <button
                  key={opt.value}
                  onClick={() => onPrefChange(def.identifier, opt.value)}
                  className={`px-2 py-1.5 rounded-md text-xs font-medium transition-colors ${
                    current === opt.value
                      ? 'bg-primary text-white'
                      : 'bg-surface hover:bg-surface-tertiary text-text-secondary'
                  }`}
                >
                  {t(opt.value === 'warn' ? getMiddleButtonLabel(def.blurs) : opt.labelKey)}
                </button>
              ))}
            </div>
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
  onFailureBehaviorChange,
}: {
  labeler: LabelerConfig;
  client: BskyClient | null;
  isExpanded: boolean;
  onToggle: () => void;
  onPrefChange: (label: string, visibility: Visibility) => void;
  onActiveToggle: (isActive: boolean) => void;
  onRemove: () => void;
  onFailureBehaviorChange?: (behavior: 'silent' | 'banner' | 'block') => void;
}) {
  const { t } = useI18n();
  const { view, policies, isLoading } = useLabelerInfo(labeler.did, client);
  // [v0.14.0-fix] Use real-time fetched label definitions instead of cached config.
  // app.bsky.labeler.getServices does not include policies, so config.labels may be stale.
  const liveLabels = policies?.labelValueDefinitions || labeler.labels;

  return (
    <div className="border border-border rounded-lg overflow-clip">
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
            <div className="text-xs text-text-secondary">@{view?.creator.handle || labeler.did}</div>
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
          {/* Failure behavior selector */}
          {onFailureBehaviorChange && (
            <div className="mb-3 flex items-center gap-2">
              <span className="text-xs text-text-secondary">{t('moderation.failureBehavior')}:</span>
              <select
                value={labeler.failureBehavior}
                onChange={e => onFailureBehaviorChange(e.target.value as 'silent' | 'banner' | 'block')}
                className="text-xs bg-surface border border-border rounded px-2 py-1 text-text-primary"
              >
                <option value="silent">{t('moderation.failureBehavior.silent')}</option>
                <option value="banner">{t('moderation.failureBehavior.banner')}</option>
                <option value="block">{t('moderation.failureBehavior.block')}</option>
              </select>
              <span className="text-xs text-text-secondary/70">
                {labeler.failureBehavior === 'silent' && t('moderation.failureBehavior.silentDesc')}
                {labeler.failureBehavior === 'banner' && t('moderation.failureBehavior.bannerDesc')}
                {labeler.failureBehavior === 'block' && t('moderation.failureBehavior.blockDesc')}
              </span>
            </div>
          )}
          {liveLabels.length > 0 ? (
            <div className="space-y-3">
              {liveLabels.map(def => {
                const current = labeler.labelPrefs[def.identifier] || def.defaultSetting;
                return (
                  <div key={def.identifier} className="p-3 rounded-lg border border-border bg-surface/30">
                    <div className="mb-2">
                      <div className="text-sm font-medium text-text-primary">{def.locales?.[0]?.name || def.identifier}</div>
                      {def.locales?.[0]?.description && (
                        <div className="text-xs text-text-secondary/70 mt-0.5">{def.locales[0].description}</div>
                      )}
                    </div>
                    <div className="grid grid-cols-3 gap-1">
                      {VISIBILITY_OPTIONS.map(opt => (
                        <button
                          key={opt.value}
                          onClick={() => onPrefChange(def.identifier, opt.value)}
                          className={`px-2 py-1.5 rounded-md text-xs font-medium transition-colors ${
                            current === opt.value
                              ? 'bg-primary text-white'
                              : 'bg-surface hover:bg-surface-tertiary text-text-secondary'
                          }`}
                        >
                          {t(opt.value === 'warn' ? getMiddleButtonLabel(def.blurs) : opt.labelKey)}
                        </button>
                      ))}
                    </div>
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
