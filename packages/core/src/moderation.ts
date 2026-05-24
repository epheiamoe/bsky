/**
 * Bluesky moderation decision engine.
 * 
 * [Debt: i18n] Warning text and badge labels should be localized via t() in the UI layer.
 * Core layer returns raw identifiers for maximum flexibility.
 * 
 * Architecture principle: Labelers are evaluated independently per-provider.
 * Each provider's configuration takes precedence for its own labels.
 * The most restrictive action across all providers wins.
 */

import type {
  Label,
  LabelValueDefinition,
  ContentLabelPref,
} from './at/types.js';

export type ModerationAction = 'hide' | 'warn' | 'blurMedia' | 'showBadge' | 'none';

export interface ModerationDecision {
  action: ModerationAction;
  /** Labels that contributed to this decision, grouped by labeler */
  sources: Array<{
    labelerDid: string;
    labelerName?: string;
    labels: Array<{
      val: string;
      name: string;
      description: string;
      severity: string;
      blurs: string;
    }>;
  }>;
  /** Raw warning text key (UI layer should localize via t()) */
  warningTextKey?: string;
  /** Badge identifiers to display */
  badges: string[];
}

export interface LabelerConfig {
  did: string;
  name: string;
  description?: string;
  avatar?: string;
  labels: LabelValueDefinition[];
  /** Per-label visibility override for this labeler */
  labelPrefs: Record<string, 'hide' | 'warn' | 'ignore'>;
  isActive: boolean;
  /** How to handle service failures for this labeler (v0.14.1) */
  failureBehavior: 'silent' | 'banner' | 'block';
}

export interface ModerationConfig {
  /** Global adult content toggle */
  adultContentEnabled: boolean;
  /** Global content label preferences (applies to all labelers unless overridden) */
  contentLabels: ContentLabelPref[];
  /** Subscribed labelers with their individual configurations */
  labelers: LabelerConfig[];
}

/**
 * Official Bluesky moderation labeler DID.
 * This is @moderation.bsky.app.
 */
export const OFFICIAL_LABELER_DID = 'did:plc:ar7c4by46qjdydhdevvrndac';

/** Standard label identifiers that appear in the global settings UI */
export const STANDARD_LABELS = ['porn', 'sexual', 'nudity', 'graphic-media'] as const;

/**
 * [v0.14.1] Built-in label definitions for official Bluesky moderation labels.
 * Ensures resolveModeration() works correctly even when label definitions
 * cannot be fetched from the API.
 */
export const BUILTIN_LABEL_DEFINITIONS: LabelValueDefinition[] = [
  {
    identifier: 'porn',
    severity: 'alert',
    blurs: 'content',
    defaultSetting: 'hide',
    adultOnly: true,
    locales: [{ lang: 'en', name: 'Adult Content', description: 'Explicit sexual images.' }],
  },
  {
    identifier: 'sexual',
    severity: 'alert',
    blurs: 'content',
    defaultSetting: 'warn',
    adultOnly: true,
    locales: [{ lang: 'en', name: 'Sexual', description: 'Sexual content (less intense).' }],
  },
  {
    identifier: 'nudity',
    severity: 'alert',
    blurs: 'content',
    defaultSetting: 'warn',
    adultOnly: true,
    locales: [{ lang: 'en', name: 'Nudity', description: 'E.g. artistic nudity.' }],
  },
  {
    identifier: 'graphic-media',
    severity: 'alert',
    blurs: 'content',
    defaultSetting: 'warn',
    adultOnly: true,
    locales: [{ lang: 'en', name: 'Graphic Media', description: 'Blood, gore, or other potentially disturbing media.' }],
  },
];

/** Lookup map for built-in label definitions */
const BUILTIN_DEF_MAP = new Map<string, LabelValueDefinition>();
for (const def of BUILTIN_LABEL_DEFINITIONS) {
  BUILTIN_DEF_MAP.set(def.identifier, def);
}

/** Default moderation configuration — conservative, warn-on-adult */
export const DEFAULT_MODERATION_CONFIG: ModerationConfig = {
  adultContentEnabled: false,
  contentLabels: [
    { label: 'porn', visibility: 'warn' },
    { label: 'sexual', visibility: 'warn' },
    { label: 'nudity', visibility: 'ignore' },
    { label: 'graphic-media', visibility: 'warn' },
  ],
  labelers: [
    {
      did: OFFICIAL_LABELER_DID,
      name: 'Bluesky Moderation Service',
      description: 'Official content moderation service handling spam, NSFW, hate speech, and other basic moderation labels.',
      labels: [],
      labelPrefs: {},
      isActive: true,
      failureBehavior: 'banner',
    },
  ],
};



/**
 * Resolve moderation decision for a subject based on its labels and user config.
 * 
 * Decision hierarchy (most restrictive wins):
 *   hide > warn > blurMedia > showBadge > none
 * 
 * Logic:
 * 1. Group labels by labeler DID.
 * 2. For each label, resolve visibility preference:
 *    a. Check the labeler's labelPrefs[label.val] (if labeler is configured)
 *    b. Fall back to global contentLabels[label.val]
 *    c. Fall back to the label definition's defaultSetting
 * 3. If adult-only label and adultContentEnabled=false → force 'hide'
 * 4. Determine action from visibility + label definition:
 *    - hide → 'hide'
 *    - warn + blurs=content → 'warn'
 *    - warn + blurs=media → 'blurMedia'
 *    - warn + blurs=none + severity≠none → 'showBadge'
 *    - ignore → 'none'
 * 5. Combine: most restrictive action wins across all providers.
 * 6. Collect all contributing labels into sources for info display.
 */
export function resolveModeration(
  labels: Label[],
  config: ModerationConfig,
  labelDefinitions: Map<string, LabelValueDefinition[]>,
  labelerNames: Map<string, string> = new Map()
): ModerationDecision {
  // Handle empty / no labels
  if (!labels || labels.length === 0) {
    return { action: 'none', sources: [], badges: [] };
  }

  // Build global preference lookup
  const globalPrefs = new Map<string, 'hide' | 'warn' | 'ignore'>();
  for (const pref of config.contentLabels) {
    globalPrefs.set(pref.label, pref.visibility);
  }

  // Build labeler config lookup
  const labelerConfigs = new Map<string, LabelerConfig>();
  for (const lc of config.labelers) {
    if (lc.isActive) {
      labelerConfigs.set(lc.did, lc);
    }
  }

  // Track the most restrictive action and all contributing sources
  let finalAction: ModerationAction = 'none';
  const sources: ModerationDecision['sources'] = [];
  const badges = new Set<string>();

  // Group labels by labeler DID
  const byLabeler = new Map<string, Label[]>();
  for (const label of labels) {
    if (label.neg) continue; // Skip negated (retracted) labels
    const list = byLabeler.get(label.src) || [];
    list.push(label);
    byLabeler.set(label.src, list);
  }

  for (const [labelerDid, labelerLabels] of byLabeler) {
    const labelerConfig = labelerConfigs.get(labelerDid);
    const defs = labelDefinitions.get(labelerDid) || [];
    const defMap = new Map<string, LabelValueDefinition>();
    for (const d of defs) defMap.set(d.identifier, d);

    const contributingLabels: ModerationDecision['sources'][number]['labels'] = [];

    for (const label of labelerLabels) {
      // [v0.14.1] Use fetched definition if available, otherwise fall back to built-in
      const def = defMap.get(label.val) || BUILTIN_DEF_MAP.get(label.val);
      
      // Resolve visibility preference
      let visibility: 'hide' | 'warn' | 'ignore';
      
      // a. Labeler-specific override
      const labelerPref = labelerConfig?.labelPrefs[label.val];
      if (labelerPref) {
        visibility = labelerPref;
      }
      // b. Global fallback
      else if (globalPrefs.has(label.val)) {
        visibility = globalPrefs.get(label.val)!;
      }
      // c. Label definition default
      else if (def) {
        visibility = def.defaultSetting;
      }
      // d. Ultimate fallback
      else {
        visibility = 'warn';
      }

      // Adult content check
      if (def?.adultOnly && !config.adultContentEnabled) {
        visibility = 'hide';
      }

      // Determine action from visibility + definition
      let action: ModerationAction = 'none';
      if (visibility === 'hide') {
        action = 'hide';
      } else if (visibility === 'warn') {
        if (def?.blurs === 'content') action = 'warn';
        else if (def?.blurs === 'media') action = 'blurMedia';
        else if (def?.severity !== 'none') action = 'showBadge';
        else action = 'none';
      }

      // Update most restrictive action
      const actionRank = { hide: 4, warn: 3, blurMedia: 2, showBadge: 1, none: 0 };
      if (actionRank[action] > actionRank[finalAction]) {
        finalAction = action;
      }

      // Collect badge if applicable
      if (action !== 'none' && action !== 'hide') {
        const badgeName = def?.locales?.[0]?.name || label.val;
        badges.add(badgeName);
      }

      // Add to contributing labels for info display
      contributingLabels.push({
        val: label.val,
        name: def?.locales?.[0]?.name || label.val,
        description: def?.locales?.[0]?.description || '',
        severity: def?.severity || 'none',
        blurs: def?.blurs || 'none',
      });
    }

    if (contributingLabels.length > 0) {
      sources.push({
        labelerDid,
        labelerName: labelerNames.get(labelerDid) || labelerConfig?.name || labelerDid,
        labels: contributingLabels,
      });
    }
  }

  // Build warning text key based on action
  let warningTextKey: string | undefined;
  if (finalAction === 'hide') {
    warningTextKey = 'moderation.warning.hidden';
  } else if (finalAction === 'warn') {
    warningTextKey = 'moderation.warning.content';
  } else if (finalAction === 'blurMedia') {
    warningTextKey = 'moderation.warning.media';
  }

  return {
    action: finalAction,
    sources,
    warningTextKey,
    badges: Array.from(badges),
  };
}

/**
 * Determine if a label value is a "standard" label that appears in global settings.
 */
export function isStandardLabel(val: string): boolean {
  return STANDARD_LABELS.includes(val as typeof STANDARD_LABELS[number]);
}
