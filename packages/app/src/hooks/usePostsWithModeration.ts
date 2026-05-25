/**
 * [v0.15.0] Unified posts with moderation hook.
 *
 * All post loading flows through this hook. It automatically:
 * 1. Queries labels for all posts (post-level + blob-level)
 * 2. Resolves moderation decisions
 * 3. Returns posts augmented with moderation decisions
 *
 * Rendering layers don't care HOW moderation works,
 * they just read the decision and render accordingly.
 *
 * Usage:
 *   const { posts } = useTimeline(client);
 *   const moderated = usePostsWithModeration(posts, config, client);
 *   // moderated[0].moderationDecision contains the decision
 */

import { useState, useEffect, useRef } from 'react';
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

const POLICIES_TTL = 30 * 60 * 1000;

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
      // Silently fail
    }
  }

  return result;
}

async function resolveModerationWithBlobs(
  posts: Array<{ uri: string; record?: { embed?: Record<string, unknown> }; labels?: Label[] }>,
  config: ModerationConfig,
  client: BskyClient,
  policiesCache: LabelerPoliciesCache
): Promise<{
  decisions: Map<string, ModerationDecision>;
  failedLabelers: FailedLabelerInfo[];
}> {
  const cache = new LabelCache();
  const activeLabelers = config.labelers.filter(l => l.isActive);
  const activeDids = activeLabelers.map(l => l.did);

  // Collect all URIs: post URIs + blob URIs
  const allUris: string[] = [];
  const blobUriMap = new Map<string, string[]>();

  for (const post of posts) {
    allUris.push(post.uri);

    const embed = post.record?.embed;
    const blobRefs = extractBlobReferences(post.uri, embed);
    if (blobRefs.length > 0) {
      const blobUris = blobRefs.map(r => r.uri);
      blobUriMap.set(post.uri, blobUris);
      allUris.push(...blobUris);
    }
  }

  // Batch fetch all labels
  if (allUris.length > 0) {
    await cache.getLabelsBatch(client, allUris, activeDids);
  }

  // Fetch policies
  const definitions = await fetchLabelerPolicies(client, activeDids, policiesCache);

  // Build labeler name lookup
  const labelerNames = new Map<string, string>();
  for (const l of config.labelers) {
    labelerNames.set(l.did, l.name);
  }

  // Resolve decisions
  const decisions = new Map<string, ModerationDecision>();
  for (const post of posts) {
    const postLabels = post.labels || [];
    const blobUris = blobUriMap.get(post.uri) || [];
    const blobLabels: Label[] = [];

    for (const blobUri of blobUris) {
      const labels = await cache.getLabels(client, blobUri, activeDids);
      blobLabels.push(...labels);
    }

    const allLabels = [...postLabels, ...blobLabels];
    const dec = resolveModeration(allLabels, config, definitions, labelerNames);
    decisions.set(post.uri, dec);
  }

  // Collect failures
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

export type PostWithModeration<T> = T & {
  moderationDecision: ModerationDecision;
};

export interface UsePostsWithModerationResult<T> {
  posts: PostWithModeration<T>[];
  failedLabelers: FailedLabelerInfo[];
  isLoading: boolean;
}

/**
 * [v0.15.0] Augment posts with moderation decisions.
 *
 * @param posts — Array of posts with at least a `uri` field
 * @param config — User's moderation configuration
 * @param client — BskyClient instance
 * @returns Posts augmented with `moderationDecision` field
 */
/**
 * [v0.15.0] Hook for single post moderation (e.g., ThreadView focused post).
 * Same blob-level label querying as usePostsWithModeration.
 */
export function usePostModeration(
  post: { uri: string; record?: { embed?: Record<string, unknown> }; labels?: Label[] } | null | undefined,
  config: ModerationConfig,
  client: BskyClient | null
): { decision: ModerationDecision; isLoading: boolean } {
  const [decision, setDecision] = useState<ModerationDecision>({
    action: 'none',
    contentAction: 'none',
    mediaAction: 'none',
    sources: [],
    badges: [],
  });
  const [isLoading, setIsLoading] = useState(false);
  const policiesCacheRef = useRef<LabelerPoliciesCache>({});

  useEffect(() => {
    if (!client || !post) {
      setDecision({ action: 'none', contentAction: 'none', mediaAction: 'none', sources: [], badges: [] });
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    let cancelled = false;

    resolveModerationWithBlobs([post], config, client, policiesCacheRef.current)
      .then(({ decisions }) => {
        if (cancelled) return;
        const dec = decisions.get(post.uri);
        if (dec) setDecision(dec);
        setIsLoading(false);
      })
      .catch(() => {
        if (cancelled) return;
        setIsLoading(false);
      });

    return () => { cancelled = true; };
  }, [post?.uri, post?.labels?.length, config, client]);

  return { decision, isLoading };
}

export function usePostsWithModeration<T extends { uri: string }>(
  posts: T[],
  config: ModerationConfig,
  client: BskyClient | null
): UsePostsWithModerationResult<T> {
  const [result, setResult] = useState<UsePostsWithModerationResult<T>>({
    posts: [],
    failedLabelers: [],
    isLoading: false,
  });

  const policiesCacheRef = useRef<LabelerPoliciesCache>({});

  useEffect(() => {
    if (!client || posts.length === 0) {
      setResult({ posts: posts.map(p => ({ ...p, moderationDecision: { action: 'none', contentAction: 'none', mediaAction: 'none', sources: [], badges: [] } as ModerationDecision })), failedLabelers: [], isLoading: false });
      return;
    }

    setResult(prev => ({ ...prev, isLoading: true }));

    let cancelled = false;

    // Cast to PostView-like for blob extraction
    const postsWithEmbed = posts as Array<T & { record?: { embed?: Record<string, unknown> }; labels?: Label[] }>;

    resolveModerationWithBlobs(postsWithEmbed, config, client, policiesCacheRef.current)
      .then(({ decisions, failedLabelers }) => {
        if (cancelled) return;

        const augmented = posts.map(post => ({
          ...post,
          moderationDecision: decisions.get(post.uri) || {
            action: 'none',
            contentAction: 'none',
            mediaAction: 'none',
            sources: [],
            badges: [],
          },
        }));

        setResult({
          posts: augmented as PostWithModeration<T>[],
          failedLabelers,
          isLoading: false,
        });
      })
      .catch(() => {
        if (cancelled) return;
        setResult({
          posts: posts.map(p => ({ ...p, moderationDecision: { action: 'none', contentAction: 'none', mediaAction: 'none', sources: [], badges: [] } as ModerationDecision })) as PostWithModeration<T>[],
          failedLabelers: [],
          isLoading: false,
        });
      });

    return () => { cancelled = true; };
  }, [posts, config, client]);

  return result;
}

// Re-export for backward compatibility
export { useModerationPipeline } from './useModerationPipeline.js';
export type { PipelineState, PipelineStrategy, PipelinePhase } from './useModerationPipeline.js';
