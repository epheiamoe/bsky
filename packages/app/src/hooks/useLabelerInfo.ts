/**
 * Hook for fetching labeler service information.
 * 
 * Fetches:
 * 1. app.bsky.labeler.getServices — basic view (creator, stats)
 * 2. app.bsky.labeler.service/self record — policies (label definitions)
 * 
 * Results are cached per-DID for the component lifetime.
 */

import { useState, useEffect, useCallback } from 'react';
import type { BskyClient, LabelerView, LabelerPolicies } from '@bsky/core';

interface LabelerInfo {
  view: LabelerView | null;
  policies: LabelerPolicies | null;
  isLoading: boolean;
  error: Error | null;
}

export function useLabelerInfo(did: string, client: BskyClient | null): LabelerInfo {
  const [info, setInfo] = useState<LabelerInfo>({
    view: null,
    policies: null,
    isLoading: false,
    error: null,
  });

  const fetchInfo = useCallback(async () => {
    if (!client || !did) return;

    setInfo(prev => ({ ...prev, isLoading: true, error: null }));

    try {
      // Fetch basic view
      const views = await client.getLabelerServices([did]);
      const view = views[0] || null;

      // Fetch service record for policies
      let policies: LabelerPolicies | null = null;
      if (view) {
        try {
          const record = await client.getRecord(did, 'app.bsky.labeler.service', 'self');
          const serviceRecord = record.value as { policies?: LabelerPolicies };
          policies = serviceRecord.policies || null;
        } catch {
          // Service record may not exist or be inaccessible
        }
      }

      setInfo({ view, policies, isLoading: false, error: null });
    } catch (err) {
      setInfo({
        view: null,
        policies: null,
        isLoading: false,
        error: err instanceof Error ? err : new Error(String(err)),
      });
    }
  }, [did, client]);

  useEffect(() => {
    fetchInfo();
  }, [fetchInfo]);

  return info;
}

/** Fetch multiple labelers at once — useful for initializing config */
export async function fetchLabelerInfos(
  client: BskyClient,
  dids: string[]
): Promise<Map<string, { view: LabelerView; policies: LabelerPolicies | null }>> {
  const result = new Map<string, { view: LabelerView; policies: LabelerPolicies | null }>();
  
  if (dids.length === 0) return result;

  try {
    const views = await client.getLabelerServices(dids);
    
    // Fetch policies for all in parallel
    const policyPromises = views.map(async view => {
      let policies: LabelerPolicies | null = null;
      try {
        const record = await client.getRecord(view.creator.did, 'app.bsky.labeler.service', 'self');
        const serviceRecord = record.value as { policies?: LabelerPolicies };
        policies = serviceRecord.policies || null;
      } catch {
        // Ignore
      }
      return { did: view.creator.did, view, policies };
    });

    const resolved = await Promise.all(policyPromises);
    for (const r of resolved) {
      result.set(r.did, { view: r.view, policies: r.policies });
    }
  } catch {
    // Ignore
  }

  return result;
}
