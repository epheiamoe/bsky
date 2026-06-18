/**
 * PWA-specific moderation configuration storage (localStorage).
 * 
 * Stores:
 * - Global content label preferences (adult, sexual, nudity, graphic-media)
 * - Adult content toggle
 * - Subscribed labeler configurations
 * 
 * [v0.15.0] PDS Sync: moderation prefs are synced with Bluesky PDS.
 * - Standard labels + adult toggle → synced to PDS (bidirectional)
 * - Labeler subscriptions (DIDs) → synced to PDS (bidirectional)
 * - Per-labeler label preferences → localStorage only (PDS API limitation)
 * - Auto-pull on settings tab mount; manual sync button available
 * 
 * Built-in labelers (e.g., official @moderation.bsky.app) are always present
 * and cannot be removed by the user (only disabled via isActive).
 * 
 * Note: This is PWA-only. TUI has its own config store in packages/tui/src/config/.
 * Both use the same ModerationConfig interface from @bsky/core for consistency.
 */

import { useState, useCallback } from 'react';
import type { ModerationConfig, ContentLabelPref, LabelerConfig, LabelValueDefinition } from '@bsky/core';
import { DEFAULT_MODERATION_CONFIG, OFFICIAL_LABELER_DID } from '@bsky/core';
import type { BskyClient } from '@bsky/core';

const MODERATION_CONFIG_KEY = 'bsky_moderation_config';
const MODERATION_SYNC_KEY = 'bsky_moderation_sync';

export type SyncStatus = 'idle' | 'syncing' | 'error' | 'success';

export interface SyncState {
  status: SyncStatus;
  lastSyncedAt: number | null;
  error: string | null;
}

function loadConfig(): ModerationConfig {
  try {
    const raw = localStorage.getItem(MODERATION_CONFIG_KEY);
    const defaults = structuredClone(DEFAULT_MODERATION_CONFIG);
    
    if (!raw) return defaults;
    
    const parsed = JSON.parse(raw);
    
    // [v0.15.0] Migrate old values to 3-value system
    const migrateVisibility = (v: string): 'show' | 'warn' | 'hide' => {
      if (v === 'ignore') return 'show';
      if (v === 'badge') return 'warn'; // badge is now a render mode of warn
      if (v === 'show' || v === 'warn' || v === 'hide') return v;
      return 'warn'; // fallback
    };
    
    // Merge user config over defaults
    const merged: ModerationConfig = {
      ...defaults,
      adultContentEnabled: parsed.adultContentEnabled ?? defaults.adultContentEnabled,
      contentLabels: (parsed.contentLabels || defaults.contentLabels).map((l: ContentLabelPref) => ({
        ...l,
        visibility: migrateVisibility(l.visibility),
      })),
      labelers: [], // Rebuild below
    };
    
    // Rebuild labelers: start with built-in (preserving user overrides)
    const userLabelers = new Map<string, LabelerConfig>(
      (parsed.labelers || []).map((l: LabelerConfig) => {
        // Migrate labelPrefs
        const migratedPrefs: Record<string, 'show' | 'warn' | 'hide'> = {};
        for (const [key, val] of Object.entries(l.labelPrefs || {})) {
          migratedPrefs[key] = migrateVisibility(val as string);
        }
        return [l.did, { ...l, labelPrefs: migratedPrefs }];
      })
    );
    
    // Add built-in labelers (cannot be removed, only disabled)
    for (const builtin of defaults.labelers) {
      const user = userLabelers.get(builtin.did);
      if (user) {
        // User has modified this labeler — merge (preserve user prefs)
        merged.labelers.push({
          ...builtin,
          ...user,
          // Keep built-in name/description as fallback
          name: user.name || builtin.name,
          description: user.description || builtin.description,
          // Ensure failureBehavior has a default (v0.14.1 migration)
          failureBehavior: user.failureBehavior || builtin.failureBehavior || 'banner',
        });
        userLabelers.delete(builtin.did);
      } else {
        // User config missing built-in — restore it
        merged.labelers.push(builtin);
      }
    }
    
    // Add any remaining user-added labelers
    for (const [, userLabeler] of userLabelers) {
      merged.labelers.push({
        ...userLabeler,
        // Ensure failureBehavior has a default (v0.14.1 migration)
        failureBehavior: userLabeler.failureBehavior || 'banner',
      });
    }
    
    return merged;
  } catch {
    return structuredClone(DEFAULT_MODERATION_CONFIG);
  }
}

function saveConfig(config: ModerationConfig): void {
  localStorage.setItem(MODERATION_CONFIG_KEY, JSON.stringify(config));
}

function loadSyncState(): SyncState {
  try {
    const raw = localStorage.getItem(MODERATION_SYNC_KEY);
    if (!raw) return { status: 'idle', lastSyncedAt: null, error: null };
    const parsed = JSON.parse(raw);
    return {
      status: parsed.status || 'idle',
      lastSyncedAt: parsed.lastSyncedAt || null,
      error: parsed.error || null,
    };
  } catch {
    return { status: 'idle', lastSyncedAt: null, error: null };
  }
}

function saveSyncState(state: SyncState): void {
  localStorage.setItem(MODERATION_SYNC_KEY, JSON.stringify(state));
}

export function useModerationConfig() {
  const [config, setConfigState] = useState<ModerationConfig>(loadConfig);
  const [syncState, setSyncState] = useState<SyncState>(loadSyncState);

  const setConfig = useCallback((updater: (prev: ModerationConfig) => ModerationConfig) => {
    setConfigState(prev => {
      const next = updater(prev);
      saveConfig(next);
      return next;
    });
  }, []);

  /** Direct config update (for SettingsPage/WelcomeCard pass-through) */
  const updateConfig = useCallback((newConfig: ModerationConfig) => {
    setConfigState(newConfig);
    saveConfig(newConfig);
  }, []);

  const setSyncStatus = useCallback((updater: (prev: SyncState) => SyncState) => {
    setSyncState(prev => {
      const next = updater(prev);
      saveSyncState(next);
      return next;
    });
  }, []);

  /**
   * [v0.15.0] Pull moderation preferences from PDS and merge into local config.
   * 
   * Merge strategy:
   * - PDS adultContentEnabled → overwrites local
   * - PDS contentLabels (standard labels) → overwrites local
   * - PDS labelerDIDs → add missing labelers (but don't remove local-only ones)
   * - Local per-labeler labelPrefs → preserved (PDS doesn't store these)
   * - Local labeler failureBehavior → preserved
   */
  const syncFromPDS = useCallback(async (client: BskyClient | null) => {
    if (!client) return;

    setSyncStatus(prev => ({ ...prev, status: 'syncing', error: null }));

    try {
      const pdsPrefs = await client.getModerationPrefs();

      // [v0.14.0-fix] Fetch labeler details for any new labelers from PDS
      const existingDids = new Set(config.labelers.map(l => l.did));
      const newDids = pdsPrefs.labelerDids.filter(did => !existingDids.has(did));
      const newLabelerInfos = new Map<string, { name: string; labels: LabelValueDefinition[] }>();
      if (newDids.length > 0) {
        try {
          const { fetchLabelerInfos } = await import('@bsky/app');
          const infos = await fetchLabelerInfos(client, newDids);
          for (const [did, info] of infos) {
            newLabelerInfos.set(did, {
              name: info.view.creator.displayName || info.view.creator.handle,
              labels: info.policies?.labelValueDefinitions || [],
            });
          }
        } catch {
          // If fetch fails, fall back to minimal config
        }
      }

      setConfigState(prev => {
        // Merge PDS content labels (overwrite local for standard labels)
        const mergedContentLabels = [...prev.contentLabels];
        for (const pdsLabel of pdsPrefs.contentLabels) {
          const existingIndex = mergedContentLabels.findIndex(l => l.label === pdsLabel.label);
          if (existingIndex >= 0) {
            mergedContentLabels[existingIndex] = { ...mergedContentLabels[existingIndex], visibility: pdsLabel.visibility };
          } else {
            mergedContentLabels.push(pdsLabel);
          }
        }

        // Merge labeler DIDs: add PDS ones, keep local ones
        const existingLabelerDids = new Set(prev.labelers.map(l => l.did));
        const mergedLabelers = [...prev.labelers];
        for (const did of pdsPrefs.labelerDids) {
          if (!existingLabelerDids.has(did)) {
            const fetched = newLabelerInfos.get(did);
            mergedLabelers.push({
              did,
              name: fetched?.name || did,
              labels: fetched?.labels || [],
              labelPrefs: {},
              isActive: true,
              failureBehavior: 'banner',
            });
          }
        }

        const next: ModerationConfig = {
          ...prev,
          adultContentEnabled: pdsPrefs.adultContentEnabled,
          contentLabels: mergedContentLabels,
          labelers: mergedLabelers,
        };
        saveConfig(next);
        return next;
      });

      setSyncStatus(prev => ({ ...prev, status: 'success', lastSyncedAt: Date.now(), error: null }));
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      setSyncStatus(prev => ({ ...prev, status: 'error', error: errorMsg }));
    }
  }, [setSyncStatus]);

  /**
   * [v0.15.0] Push moderation preferences to PDS.
   * 
   * Only syncs:
   * - adultContentEnabled
   * - contentLabels (standard labels)
   * - labeler DIDs (not per-labeler prefs)
   */
  const saveToPDS = useCallback(async (client: BskyClient | null) => {
    if (!client) return;

    setSyncStatus(prev => ({ ...prev, status: 'syncing', error: null }));

    try {
      await client.putModerationPrefs({
        adultContentEnabled: config.adultContentEnabled,
        contentLabels: config.contentLabels,
        labelerDids: config.labelers.map(l => l.did),
      });

      setSyncStatus(prev => ({ ...prev, status: 'success', lastSyncedAt: Date.now(), error: null }));
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      setSyncStatus(prev => ({ ...prev, status: 'error', error: errorMsg }));
    }
  }, [config, setSyncStatus]);

  const setContentLabelVisibility = useCallback((label: string, visibility: 'show' | 'warn' | 'hide') => {
    setConfig(prev => {
      const existing = prev.contentLabels.findIndex(l => l.label === label);
      let contentLabels: ContentLabelPref[];
      if (existing >= 0) {
        contentLabels = prev.contentLabels.map((l, i) =>
          i === existing ? { ...l, visibility } : l
        );
      } else {
        contentLabels = [...prev.contentLabels, { label, visibility }];
      }
      return { ...prev, contentLabels };
    });
  }, [setConfig]);

  const setAdultContentEnabled = useCallback((enabled: boolean) => {
    setConfig(prev => ({ ...prev, adultContentEnabled: enabled }));
  }, [setConfig]);

  const addLabeler = useCallback((labeler: LabelerConfig) => {
    setConfig(prev => {
      if (prev.labelers.some(l => l.did === labeler.did)) return prev;
      return { ...prev, labelers: [...prev.labelers, labeler] };
    });
  }, [setConfig]);

  const removeLabeler = useCallback((did: string) => {
    setConfig(prev => ({
      ...prev,
      labelers: prev.labelers.filter(l => l.did !== did),
    }));
  }, [setConfig]);

  const updateLabelerPref = useCallback((did: string, label: string, visibility: 'show' | 'warn' | 'hide') => {
    setConfig(prev => ({
      ...prev,
      labelers: prev.labelers.map(l =>
        l.did === did
          ? { ...l, labelPrefs: { ...l.labelPrefs, [label]: visibility } }
          : l
      ),
    }));
  }, [setConfig]);

  const setLabelerActive = useCallback((did: string, isActive: boolean) => {
    setConfig(prev => ({
      ...prev,
      labelers: prev.labelers.map(l =>
        l.did === did ? { ...l, isActive } : l
      ),
    }));
  }, [setConfig]);

  return {
    config,
    syncState,
    setConfig,
    updateConfig,
    syncFromPDS,
    saveToPDS,
    setContentLabelVisibility,
    setAdultContentEnabled,
    addLabeler,
    removeLabeler,
    updateLabelerPref,
    setLabelerActive,
  };
}

/** Utility: Check if official labeler is already subscribed */
export function hasOfficialLabeler(config: ModerationConfig): boolean {
  return config.labelers.some(l => l.did === OFFICIAL_LABELER_DID);
}
