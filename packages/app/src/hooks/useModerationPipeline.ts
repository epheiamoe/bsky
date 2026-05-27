/**
 * [v0.15.0] Unified moderation pipeline hook.
 *
 * Implements a loading strategy determined by the highest active failureBehavior level:
 * - block: Wait for safety verification before showing posts
 * - banner: Show posts immediately with "loading safety" banner
 * - silent: Show posts immediately, apply tags async in background
 *
 * All non-AI-tool post loading goes through this pipeline for consistent moderation.
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import type {
  BskyClient,
  Label,
  LabelValueDefinition,
  ModerationConfig,
  ModerationDecision,
  PostView,
} from '@bsky/core';
import {
  resolveModeration,
  LabelCache,
  extractBlobReferences,
} from '@bsky/core';

interface LabelerPoliciesCache {
  [did: string]: {
    policies: LabelValueDefinition[];
    fetchedAt: number;
  };
}

export interface FailedLabelerInfo {
  did: string;
  name: string;
  behavior: 'silent' | 'banner' | 'block';
  error: string;
}

export type PipelineStrategy = 'silent' | 'banner' | 'block';
export type PipelinePhase = 'idle' | 'loadingPosts' | 'loadingTags' | 'tagsApplied' | 'blocked';

export interface PipelineState {
  phase: PipelinePhase;
  strategy: PipelineStrategy;
  posts: PostView[];
  decisions: Map<string, ModerationDecision>;
  failedLabelers: FailedLabelerInfo[];
  isLoading: boolean;
  error?: string;
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

/** Determine the loading strategy from active labeler failure behaviors. */
function determineStrategy(config: ModerationConfig): PipelineStrategy {
  const activeLabelers = config.labelers.filter(l => l.isActive);
  if (activeLabelers.length === 0) return 'silent';

  const hasBlock = activeLabelers.some(l => l.failureBehavior === 'block');
  const hasBanner = activeLabelers.some(l => l.failureBehavior === 'banner');

  if (hasBlock) return 'block';
  if (hasBanner) return 'banner';
  return 'silent';
}

/**
 * [v0.15.0] Resolve moderation decisions with blob-level label support.
 *
 * Queries both post URIs and blob URIs (for media-level labels),
 * then merges results when resolving decisions.
 */
async function resolveModerationWithBlobs(
  posts: PostView[],
  config: ModerationConfig,
  client: BskyClient,
  policiesCache: LabelerPoliciesCache
): Promise<{ decisions: Map<string, ModerationDecision>; failedLabelers: FailedLabelerInfo[] }> {
  const cache = new LabelCache();
  const activeLabelers = config.labelers.filter(l => l.isActive);
  const activeDids = activeLabelers.map(l => l.did);

  // Collect all URIs to query: post URIs + blob URIs
  const allUris: string[] = [];
  const postUriSet = new Set<string>();
  const blobUriMap = new Map<string, string[]>(); // postUri -> blobUris

  for (const post of posts) {
    allUris.push(post.uri);
    postUriSet.add(post.uri);

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
 * [v0.15.0] Unified moderation pipeline hook.
 *
 * @param fetchPosts — Async function that returns posts to moderate
 * @param config — User's moderation configuration
 * @param client — BskyClient instance
 * @returns PipelineState with posts, decisions, and loading state
 */
export function useModerationPipeline(
  fetchPosts: () => Promise<PostView[]>,
  config: ModerationConfig,
  client: BskyClient | null
): PipelineState & { refresh: () => void } {
  const [state, setState] = useState<PipelineState>({
    phase: 'idle',
    strategy: 'silent',
    posts: [],
    decisions: new Map(),
    failedLabelers: [],
    isLoading: false,
  });

  const policiesCacheRef = useRef<LabelerPoliciesCache>({});
  const refreshKeyRef = useRef(0);

  const execute = useCallback(async () => {
    if (!client) {
      setState({
        phase: 'idle',
        strategy: 'silent',
        posts: [],
        decisions: new Map(),
        failedLabelers: [],
        isLoading: false,
      });
      return;
    }

    const strategy = determineStrategy(config);
    const currentRefreshKey = ++refreshKeyRef.current;

    // BLOCK strategy: wait for tags before showing posts
    if (strategy === 'block') {
      setState({
        phase: 'loadingPosts',
        strategy: 'block',
        posts: [],
        decisions: new Map(),
        failedLabelers: [],
        isLoading: true,
      });

      try {
        const posts = await fetchPosts();
        if (currentRefreshKey !== refreshKeyRef.current) return;

        setState(prev => ({
          ...prev,
          phase: 'loadingTags',
          posts,
        }));

        const { decisions, failedLabelers } = await resolveModerationWithBlobs(
          posts,
          config,
          client,
          policiesCacheRef.current
        );
        if (currentRefreshKey !== refreshKeyRef.current) return;

        setState({
          phase: 'tagsApplied',
          strategy: 'block',
          posts,
          decisions,
          failedLabelers,
          isLoading: false,
        });
      } catch (err) {
        if (currentRefreshKey !== refreshKeyRef.current) return;
        setState({
          phase: 'blocked',
          strategy: 'block',
          posts: [],
          decisions: new Map(),
          failedLabelers: [],
          isLoading: false,
          error: err instanceof Error ? err.message : 'Failed to load content safely',
        });
      }
      return;
    }

    // BANNER strategy: show posts immediately, fetch tags in background
    if (strategy === 'banner') {
      setState({
        phase: 'loadingPosts',
        strategy: 'banner',
        posts: [],
        decisions: new Map(),
        failedLabelers: [],
        isLoading: true,
      });

      try {
        const posts = await fetchPosts();
        if (currentRefreshKey !== refreshKeyRef.current) return;

        setState({
          phase: 'loadingTags',
          strategy: 'banner',
          posts,
          decisions: new Map(),
          failedLabelers: [],
          isLoading: true,
        });

        const { decisions, failedLabelers } = await resolveModerationWithBlobs(
          posts,
          config,
          client,
          policiesCacheRef.current
        );
        if (currentRefreshKey !== refreshKeyRef.current) return;

        setState({
          phase: 'tagsApplied',
          strategy: 'banner',
          posts,
          decisions,
          failedLabelers,
          isLoading: false,
        });
      } catch (err) {
        if (currentRefreshKey !== refreshKeyRef.current) return;
        setState({
          phase: 'idle',
          strategy: 'banner',
          posts: [],
          decisions: new Map(),
          failedLabelers: [],
          isLoading: false,
          error: err instanceof Error ? err.message : 'Failed to load posts',
        });
      }
      return;
    }

    // SILENT strategy: show posts immediately, fetch tags async
    setState({
      phase: 'loadingPosts',
      strategy: 'silent',
      posts: [],
      decisions: new Map(),
      failedLabelers: [],
      isLoading: true,
    });

    try {
      const posts = await fetchPosts();
      if (currentRefreshKey !== refreshKeyRef.current) return;

      setState({
        phase: 'tagsApplied',
        strategy: 'silent',
        posts,
        decisions: new Map(),
        failedLabelers: [],
        isLoading: true,
      });

      const { decisions, failedLabelers } = await resolveModerationWithBlobs(
        posts,
        config,
        client,
        policiesCacheRef.current
      );
      if (currentRefreshKey !== refreshKeyRef.current) return;

      setState({
        phase: 'tagsApplied',
        strategy: 'silent',
        posts,
        decisions,
        failedLabelers,
        isLoading: false,
      });
    } catch (err) {
      if (currentRefreshKey !== refreshKeyRef.current) return;
      setState({
        phase: 'idle',
        strategy: 'silent',
        posts: [],
        decisions: new Map(),
        failedLabelers: [],
        isLoading: false,
        error: err instanceof Error ? err.message : 'Failed to load posts',
      });
    }
  }, [fetchPosts, config, client]);

  useEffect(() => {
    execute();
  }, [execute]);

  const refresh = useCallback(() => {
    refreshKeyRef.current++;
    execute();
  }, [execute]);

  return { ...state, refresh };
}

/**
 * [v0.15.0] Batch-resolve moderation decisions for multiple subjects (backward compat).
 *
 * Enhanced with blob-level label support.
 */
export async function resolveModerationBatch(
  subjects: Array<{ uri: string; labels?: Label[] }>,
  config: ModerationConfig,
  client: BskyClient
): Promise<{ decisions: Map<string, ModerationDecision>; failedLabelers: FailedLabelerInfo[] }> {
  // Convert subjects to PostView-like objects for resolveModerationWithBlobs
  const posts = subjects.map(s => ({
    uri: s.uri,
    cid: '',
    author: { did: '', handle: '' } as any,
    record: { text: '' } as any,
    labels: s.labels,
  } as PostView));

  return resolveModerationWithBlobs(posts, config, client, {});
}

/**
 * [v0.15.0] React hook for batch moderation decisions (backward compat).
 *
 * Enhanced with blob-level label support.
 */
export function useModerationBatch(
  posts: Array<{ uri: string; labels?: Label[] }>,
  config: ModerationConfig,
  client: BskyClient | null
): { decisions: Map<string, ModerationDecision>; failedLabelers: FailedLabelerInfo[]; isLoading: boolean } {
  const [result, setResult] = useState({
    decisions: new Map<string, ModerationDecision>(),
    failedLabelers: [] as FailedLabelerInfo[],
    isLoading: false,
  });
  const prevPostsRef = useRef(new Set<string>());
  const prevConfigRef = useRef(config);
  const prevClientRef = useRef(client);

  useEffect(() => {
    if (!client || posts.length === 0) {
      setResult({ decisions: new Map(), failedLabelers: [], isLoading: false });
      prevPostsRef.current = new Set();
      return;
    }

    const configChanged = prevConfigRef.current !== config;
    const clientChanged = prevClientRef.current !== client;
    prevConfigRef.current = config;
    prevClientRef.current = client;

    // Full re-computation when config or client changes
    if (configChanged || clientChanged) {
      setResult(prev => ({ ...prev, isLoading: true }));
      let cancelled = false;
      resolveModerationBatch(posts, config, client).then(res => {
        if (!cancelled) setResult({
          decisions: res.decisions,
          failedLabelers: res.failedLabelers,
          isLoading: false,
        });
        prevPostsRef.current = new Set(posts.map(p => p.uri));
      }).catch(() => {
        if (!cancelled) setResult({
          decisions: new Map(),
          failedLabelers: [],
          isLoading: false,
        });
      });
      return () => { cancelled = true; };
    }

    // Incremental: only resolve new posts
    const prevUris = prevPostsRef.current;
    const newPosts = posts.filter(p => !prevUris.has(p.uri));

    if (newPosts.length === 0) {
      // No new posts, but some may have been removed
      const currentUris = new Set(posts.map(p => p.uri));
      const newDecisions = new Map(result.decisions);
      for (const uri of newDecisions.keys()) {
        if (!currentUris.has(uri)) newDecisions.delete(uri);
      }
      if (newDecisions.size !== result.decisions.size) {
        setResult(prev => ({ ...prev, decisions: newDecisions }));
      }
      return;
    }

    setResult(prev => ({ ...prev, isLoading: true }));

    let cancelled = false;
    resolveModerationBatch(newPosts, config, client).then(res => {
      if (cancelled) return;
      const mergedDecisions = new Map(result.decisions);
      for (const [uri, decision] of res.decisions) {
        mergedDecisions.set(uri, decision);
      }
      setResult({
        decisions: mergedDecisions,
        failedLabelers: res.failedLabelers,
        isLoading: false,
      });
      prevPostsRef.current = new Set(posts.map(p => p.uri));
    }).catch(() => {
      if (!cancelled) setResult(prev => ({ ...prev, isLoading: false }));
    });

    return () => { cancelled = true; };
  }, [posts, config, client]);

  return result;
}
