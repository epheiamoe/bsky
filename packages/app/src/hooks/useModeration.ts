/**
 * Hook for resolving moderation decisions on posts/profiles.
 * Pure logic — no storage dependencies. Platform-specific config storage lives in PWA/TUI.
 * 
 * Usage:
 *   const decision = useModeration(post, config, client);
 *   if (decision.action === 'hide') renderHiddenPlaceholder();
 * 
 * [Debt: Performance] For large timelines, prefer getLabelsBatch() over individual useModeration()
 * calls to avoid N+1 API requests. See TimelineStore integration notes in plan.
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import type {
  BskyClient,
  Label,
  LabelValueDefinition,
  ModerationConfig,
  ModerationDecision,
  PostView,
  ProfileViewBasic,
} from '@bsky/core';
import {
  resolveModeration,
  LabelCache,
} from '@bsky/core';

export interface ModerationSubject {
  uri: string;
  labels?: Label[];
}

interface LabelerPoliciesCache {
  [did: string]: {
    policies: LabelValueDefinition[];
    fetchedAt: number;
  };
}

const POLICIES_TTL = 30 * 60 * 1000; // 30 minutes

/** Fetches labeler service policies (label definitions) for all configured labelers. */
async function fetchLabelerPolicies(
  client: BskyClient,
  labelerDids: string[],
  cache: LabelerPoliciesCache
): Promise<Map<string, LabelValueDefinition[]>> {
  const result = new Map<string, LabelValueDefinition[]>();
  const toFetch: string[] = [];

  for (const did of labelerDids) {
    const cached = cache[did];
    if (cached && cached.fetchedAt > Date.now() - POLICIES_TTL) {
      result.set(did, cached.policies);
    } else {
      toFetch.push(did);
    }
  }

  if (toFetch.length > 0) {
    try {
      const views = await client.getLabelerServices(toFetch);
      for (const view of views) {
        const defs = view.policies?.labelValueDefinitions || [];
        result.set(view.creator.did, defs);
        cache[view.creator.did] = { policies: defs, fetchedAt: Date.now() };
      }
    } catch {
      // Silently fail — we'll use defaults
    }
  }

  return result;
}

/**
 * React hook for moderation decisions.
 * 
 * @param subject — The post or profile to evaluate
 * @param config — User's moderation configuration
 * @param client — BskyClient instance (for fetching labels if not present)
 * @returns ModerationDecision or null while loading
 */
export function useModeration(
  subject: ModerationSubject | PostView | null,
  config: ModerationConfig,
  client: BskyClient | null
): ModerationDecision | null {
  const [decision, setDecision] = useState<ModerationDecision | null>(null);
  const labelCacheRef = useRef(new LabelCache());
  const policiesCacheRef = useRef<LabelerPoliciesCache>({});

  const resolve = useCallback(async () => {
    if (!subject || !client) {
      setDecision(null);
      return;
    }

    const uri = subject.uri;
    const existingLabels = 'labels' in subject ? subject.labels : undefined;

    let labels: Label[];
    if (existingLabels && existingLabels.length > 0) {
      labels = existingLabels;
    } else {
      // Fetch labels from API
      const activeLabelers = config.labelers
        .filter(l => l.isActive)
        .map(l => l.did);
      labels = await labelCacheRef.current.getLabels(client, uri, activeLabelers);
    }

    // Fetch labeler policies for all active labelers
    const activeDids = config.labelers.filter(l => l.isActive).map(l => l.did);
    const definitions = await fetchLabelerPolicies(
      client,
      activeDids,
      policiesCacheRef.current
    );

    // Build labeler name lookup
    const labelerNames = new Map<string, string>();
    for (const l of config.labelers) {
      labelerNames.set(l.did, l.name);
    }

    const dec = resolveModeration(labels, config, definitions, labelerNames);
    setDecision(dec);
  }, [subject, config, client]);

  useEffect(() => {
    resolve();
  }, [resolve]);

  return decision;
}

/**
 * Batch-resolve moderation decisions for multiple subjects.
 * More efficient than individual useModeration() for timelines.
 * 
 * @returns Map from URI to decision
 */
export async function resolveModerationBatch(
  subjects: Array<{ uri: string; labels?: Label[] }>,
  config: ModerationConfig,
  client: BskyClient
): Promise<Map<string, ModerationDecision>> {
  const cache = new LabelCache();
  const policiesCache: LabelerPoliciesCache = {};

  const activeDids = config.labelers.filter(l => l.isActive).map(l => l.did);

  // Batch fetch all missing labels
  const urisNeedingFetch = subjects
    .filter(s => !s.labels || s.labels.length === 0)
    .map(s => s.uri);

  if (urisNeedingFetch.length > 0) {
    await cache.getLabelsBatch(client, urisNeedingFetch, activeDids);
  }

  // Fetch policies once
  const definitions = await fetchLabelerPolicies(client, activeDids, policiesCache);

  const labelerNames = new Map<string, string>();
  for (const l of config.labelers) {
    labelerNames.set(l.did, l.name);
  }

  const results = new Map<string, ModerationDecision>();
  for (const subject of subjects) {
    const labels = subject.labels || (await cache.getLabels(client, subject.uri, activeDids));
    const dec = resolveModeration(labels, config, definitions, labelerNames);
    results.set(subject.uri, dec);
  }

  return results;
}

/**
 * React hook for batch moderation decisions on a list of posts.
 * Automatically recalculates when posts, config, or client changes.
 * 
 * @param posts — Array of posts/flatLines with uri and optional labels
 * @param config — User's moderation configuration
 * @param client — BskyClient instance
 * @returns Map from URI to ModerationDecision
 */
export function useModerationBatch(
  posts: Array<{ uri: string; labels?: Label[] }>,
  config: ModerationConfig,
  client: BskyClient | null
): Map<string, ModerationDecision> {
  const [decisions, setDecisions] = useState<Map<string, ModerationDecision>>(new Map());

  useEffect(() => {
    if (!client || posts.length === 0) {
      setDecisions(new Map());
      return;
    }

    let cancelled = false;
    resolveModerationBatch(posts, config, client).then(results => {
      if (!cancelled) setDecisions(results);
    }).catch(() => {
      // Silently fail — moderation is best-effort
      if (!cancelled) setDecisions(new Map());
    });

    return () => { cancelled = true; };
  }, [posts, config, client]);

  return decisions;
}
