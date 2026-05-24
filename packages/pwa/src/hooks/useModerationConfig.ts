/**
 * PWA-specific moderation configuration storage (localStorage).
 * 
 * Stores:
 * - Global content label preferences (adult, sexual, nudity, graphic-media)
 * - Adult content toggle
 * - Subscribed labeler configurations
 * 
 * Built-in labelers (e.g., official @moderation.bsky.app) are always present
 * and cannot be removed by the user (only disabled via isActive).
 * 
 * Note: This is PWA-only. TUI has its own config store in packages/tui/src/config/.
 * Both use the same ModerationConfig interface from @bsky/core for consistency.
 */

import { useState, useCallback } from 'react';
import type { ModerationConfig, ContentLabelPref, LabelerConfig } from '@bsky/core';
import { DEFAULT_MODERATION_CONFIG, OFFICIAL_LABELER_DID } from '@bsky/core';

const MODERATION_CONFIG_KEY = 'bsky_moderation_config';

function loadConfig(): ModerationConfig {
  try {
    const raw = localStorage.getItem(MODERATION_CONFIG_KEY);
    const defaults = structuredClone(DEFAULT_MODERATION_CONFIG);
    
    if (!raw) return defaults;
    
    const parsed = JSON.parse(raw);
    
    // Merge user config over defaults
    const merged: ModerationConfig = {
      ...defaults,
      adultContentEnabled: parsed.adultContentEnabled ?? defaults.adultContentEnabled,
      contentLabels: parsed.contentLabels ?? defaults.contentLabels,
      labelers: [], // Rebuild below
    };
    
    // Rebuild labelers: start with built-in (preserving user overrides)
    const userLabelers = new Map<string, LabelerConfig>(
      (parsed.labelers || []).map((l: LabelerConfig) => [l.did, l])
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
        });
        userLabelers.delete(builtin.did);
      } else {
        // User config missing built-in — restore it
        merged.labelers.push(builtin);
      }
    }
    
    // Add any remaining user-added labelers
    for (const [, userLabeler] of userLabelers) {
      merged.labelers.push(userLabeler);
    }
    
    return merged;
  } catch {
    return structuredClone(DEFAULT_MODERATION_CONFIG);
  }
}

function saveConfig(config: ModerationConfig): void {
  localStorage.setItem(MODERATION_CONFIG_KEY, JSON.stringify(config));
}

export function useModerationConfig() {
  const [config, setConfigState] = useState<ModerationConfig>(loadConfig);

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

  const setContentLabelVisibility = useCallback((label: string, visibility: 'hide' | 'warn' | 'ignore') => {
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

  const updateLabelerPref = useCallback((did: string, label: string, visibility: 'hide' | 'warn' | 'ignore') => {
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
    setConfig,
    updateConfig,
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
