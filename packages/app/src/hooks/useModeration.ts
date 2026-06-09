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
  LabelerFailureState,
} from '@bsky/core';
import {
  resolveModeration,
  LabelCache,
  extractBlobReferences,
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

/** [v0.14.1] Information about a failed labeler */
export interface FailedLabelerInfo {
  did: string;
  name: string;
  behavior: 'silent' | 'banner' | 'block';
  error: string;
}

/** [v0.14.1] Result from batch moderation resolution */
export interface ModerationBatchResult {
  decisions: Map<string, ModerationDecision>;
  failedLabelers: FailedLabelerInfo[];
}

/** [v0.14.1] Result from useModerationBatch hook */
export interface UseModerationBatchResult {
  decisions: Map<string, ModerationDecision>;
  failedLabelers: FailedLabelerInfo[];
  isLoading: boolean;
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
 * Resolve moderation decisions with blob-level label support.
 *
 * Queries both post URIs and blob URIs (for media-level labels),
 * then merges results when resolving decisions.
 */
async function resolveModerationWithBlobs(
  posts: PostView[],
  config: ModerationConfig,
  client: BskyClient,
  cache: LabelCache,
  policiesCache: LabelerPoliciesCache
): Promise<{ decisions: Map<string, ModerationDecision>; failedLabelers: FailedLabelerInfo[] }> {
  const activeLabelers = config.labelers.filter(l => l.isActive);
  const activeDids = activeLabelers.map(l => l.did);

  // Collect all URIs to query: post URIs + blob URIs
  const allUris: string[] = [];
  const blobUriMap = new Map<string, string[]>(); // postUri -> blobUris

  for (const post of posts) {
    allUris.push(post.uri);

    // Extract blob URIs from embed
    const embed = post.record?.embed as Record<string, unknown> | undefined;
    const blobRefs = extractBlobReferences(post.uri, embed);
    if (blobRefs.length > 0) {
      const blobUris = blobRefs.map((r: import('@bsky/core').BlobReference) => r.uri);
      blobUriMap.set(post.uri, blobUris);
      allUris.push(...blobUris);
    }
  }

  // Batch fetch all labels (post + blob)
  if (allUris.length > 0) {
    await cache.getLabelsBatch(client, allUris, activeDids);
  }

  // Fetch policies once
  const definitions = await fetchLabelerPolicies(client, activeDids, policiesCache);

  // Build labeler name lookup
  const labelerNames = new Map<string, string>();
  for (const l of config.labelers) {
    labelerNames.set(l.did, l.name);
  }

  // Resolve decisions for each post (merging post + blob labels)
  const decisions = new Map<string, ModerationDecision>();
  for (const post of posts) {
    const postLabels = await cache.getLabels(client, post.uri, activeDids);

    // Get blob labels for this post
    const blobUris = blobUriMap.get(post.uri) || [];
    const blobLabels: Label[] = [];
    for (const blobUri of blobUris) {
      const labels = await cache.getLabels(client, blobUri, activeDids);
      blobLabels.push(...labels);
    }

    // Merge post + blob labels
    const allLabels = [...postLabels, ...blobLabels];
    const dec = resolveModeration(allLabels, config, definitions, labelerNames);
    decisions.set(post.uri, dec);
  }

  // Collect failed labelers
  const failedLabelers: FailedLabelerInfo[] = [];
  const failedStates = cache.getFailedLabelers();

  for (const state of failedStates) {
    const labeler = activeLabelers.find(l => l.did === state.did);
    if (labeler) {
      failedLabelers.push({
        did: state.did,
        name: labeler.name,
        behavior: labeler.failureBehavior,
        error: state.lastError,
      });
    }
  }

  return { decisions, failedLabelers };
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
 * [v0.14.1] Now returns failed labelers information.
 * [v0.15.0] Enhanced with blob-level label support.
 *
 * @returns ModerationBatchResult with decisions and failed labelers
 */
export async function resolveModerationBatch(
  subjects: Array<{ uri: string; labels?: Label[] }>,
  config: ModerationConfig,
  client: BskyClient,
  labelCache?: LabelCache,
  policiesCache?: LabelerPoliciesCache
): Promise<ModerationBatchResult> {
  const cache = labelCache || new LabelCache();
  const policiesCacheInstance: LabelerPoliciesCache = policiesCache || {};

  // Convert subjects to PostView-like objects for blob-aware resolution
  const posts = subjects.map(s => ({
    uri: s.uri,
    cid: '',
    author: { did: '', handle: '' } as any,
    record: { text: '', embed: (s as any).embed } as any,
    labels: s.labels,
  } as PostView));

  return resolveModerationWithBlobs(posts, config, client, cache, policiesCacheInstance);
}

/**
 * React hook for batch moderation decisions on a list of posts.
 * Automatically recalculates when posts, config, or client changes.
 *
 * [v0.14.1] Now returns failed labelers and loading state.
 * [v0.14.1] Incremental resolution: only processes new posts on each render,
 * reusing the LabelCache across batches for efficiency.
 *
 * @param posts — Array of posts/flatLines with uri and optional labels
 * @param config — User's moderation configuration
 * @param client — BskyClient instance
 * @returns UseModerationBatchResult with decisions, failures, and loading state
 */
export function useModerationBatch(
  posts: Array<{ uri: string; labels?: Label[] }>,
  config: ModerationConfig,
  client: BskyClient | null
): UseModerationBatchResult {
  const [result, setResult] = useState<UseModerationBatchResult>({
    decisions: new Map(),
    failedLabelers: [],
    isLoading: false,
  });

  // [v0.14.1] Persist label cache and processed URIs across renders for incremental resolution
  const labelCacheRef = useRef(new LabelCache());
  const processedUrisRef = useRef(new Set<string>());
  const policiesCacheRef = useRef<LabelerPoliciesCache>({});

  // Reset caches when config or client changes fundamentally
  useEffect(() => {
    labelCacheRef.current.clear();
    processedUrisRef.current.clear();
    policiesCacheRef.current = {};
    setResult({
      decisions: new Map(),
      failedLabelers: [],
      isLoading: false,
    });
  }, [config, client]);

  useEffect(() => {
    if (!client || posts.length === 0) {
      setResult({ decisions: new Map(), failedLabelers: [], isLoading: false });
      return;
    }

    // Only process posts we haven't seen before
    const newPosts = posts.filter(p => !processedUrisRef.current.has(p.uri));
    if (newPosts.length === 0) return;

    // Mark as processed before async to prevent duplicate in-flight requests
    newPosts.forEach(p => processedUrisRef.current.add(p.uri));

    setResult(prev => ({ ...prev, isLoading: true }));

    let cancelled = false;
    resolveModerationBatch(newPosts, config, client, labelCacheRef.current, policiesCacheRef.current)
      .then(res => {
        if (!cancelled) {
          setResult(prev => ({
            decisions: new Map([...prev.decisions, ...res.decisions]),
            // LabelCache maintains cumulative failure state across batches
            failedLabelers: res.failedLabelers,
            isLoading: false,
          }));
        }
      })
      .catch((err: unknown) => {
        console.error('Moderation batch failed:', err);
        if (!cancelled) {
          const activeLabelers = config.labelers.filter(l => l.isActive);
          setResult({
            decisions: new Map(),
            failedLabelers: activeLabelers.map(l => ({
              did: l.did,
              name: l.name,
              behavior: l.failureBehavior,
              error: 'Moderation unavailable',
            })),
            isLoading: false,
          });
        }
      });

    return () => { cancelled = true; };
  }, [posts, config, client]);

  return result;
}
