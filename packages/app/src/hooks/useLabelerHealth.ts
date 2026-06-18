/**
 * Hook for monitoring labeler service health status.
 *
 * Polls active labelers periodically, tracking response times and
 * success/failure counts to determine health status.
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import type { BskyClient, LabelerView } from '@bsky/core';

export interface LabelerHealth {
  did: string;
  name: string;
  status: 'healthy' | 'degraded' | 'down';
  lastSuccess: number;
  lastFailure: number;
  consecutiveFailures: number;
  consecutiveSuccesses: number;
  averageResponseTime: number;
}

interface InternalHealthState extends LabelerHealth {
  responseTimes: number[];
}

const DEFAULT_INTERVAL = 30000;
const MAX_RESPONSE_TIME_HISTORY = 10;

function determineStatus(
  success: boolean,
  prevStatus: LabelerHealth['status'],
  prevConsecutiveFailures: number,
  prevConsecutiveSuccesses: number
): LabelerHealth['status'] {
  if (success) {
    const newConsecutiveSuccesses = prevConsecutiveSuccesses + 1;

    // Recovery: back to healthy after 2 consecutive successes
    if (newConsecutiveSuccesses >= 2) {
      return 'healthy';
    }

    // Single success with few prior failures
    if (prevConsecutiveFailures <= 1) {
      return 'healthy';
    }

    // Single success after degradation — need one more to recover
    return prevStatus;
  }

  const newConsecutiveFailures = prevConsecutiveFailures + 1;

  if (newConsecutiveFailures >= 4) return 'down';
  if (newConsecutiveFailures >= 2) return 'degraded';
  return 'healthy';
}

export function useLabelerHealth(
  client: BskyClient | null,
  labelerDids: string[],
  intervalMs: number = DEFAULT_INTERVAL
): {
  health: Map<string, LabelerHealth>;
  isChecking: boolean;
  checkNow: () => void;
} {
  const [healthMap, setHealthMap] = useState<Map<string, InternalHealthState>>(
    new Map()
  );
  const [isChecking, setIsChecking] = useState(false);
  const isCheckingRef = useRef(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const checkHealth = useCallback(async () => {
    if (!client || labelerDids.length === 0 || isCheckingRef.current) {
      return;
    }

    isCheckingRef.current = true;
    setIsChecking(true);

    try {
      // Check each labeler individually for precise per-DID timing
      const checkPromises = labelerDids.map(async (did) => {
        const checkStart = performance.now();

        try {
          const views = await client.getLabelerServices([did]);
          const view = views[0] ?? null;
          const responseTime = performance.now() - checkStart;

          return { did, success: true as const, view, responseTime };
        } catch {
          const responseTime = performance.now() - checkStart;

          return {
            did,
            success: false as const,
            view: null as LabelerView | null,
            responseTime,
          };
        }
      });

      const results = await Promise.all(checkPromises);
      const now = Date.now();

      setHealthMap((prev) => {
        const next = new Map(prev);

        for (const result of results) {
          const existing = next.get(result.did);
          const name =
            result.view?.creator.displayName ||
            result.view?.creator.handle ||
            existing?.name ||
            result.did;

          let health: InternalHealthState;

          if (existing) {
            const status = determineStatus(
              result.success,
              existing.status,
              existing.consecutiveFailures,
              existing.consecutiveSuccesses
            );

            const responseTimes = [
              ...existing.responseTimes,
              result.responseTime,
            ];
            if (responseTimes.length > MAX_RESPONSE_TIME_HISTORY) {
              responseTimes.shift();
            }

            const averageResponseTime =
              responseTimes.reduce((a, b) => a + b, 0) /
              responseTimes.length;

            health = {
              ...existing,
              name,
              status,
              lastSuccess: result.success ? now : existing.lastSuccess,
              lastFailure: result.success ? existing.lastFailure : now,
              consecutiveFailures: result.success
                ? 0
                : existing.consecutiveFailures + 1,
              consecutiveSuccesses: result.success
                ? existing.consecutiveSuccesses + 1
                : 0,
              averageResponseTime,
              responseTimes,
            };
          } else {
            const status = determineStatus(result.success, 'healthy', 0, 0);
            const responseTimes = [result.responseTime];

            health = {
              did: result.did,
              name,
              status,
              lastSuccess: result.success ? now : 0,
              lastFailure: result.success ? 0 : now,
              consecutiveFailures: result.success ? 0 : 1,
              consecutiveSuccesses: result.success ? 1 : 0,
              averageResponseTime: result.responseTime,
              responseTimes,
            };
          }

          next.set(result.did, health);
        }

        return next;
      });
    } finally {
      isCheckingRef.current = false;
      setIsChecking(false);
    }
  }, [client, labelerDids]);

  // Set up polling interval
  useEffect(() => {
    if (!client || labelerDids.length === 0) return;

    // Run immediately on mount or when dependencies change
    checkHealth();

    intervalRef.current = setInterval(checkHealth, intervalMs);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [client, labelerDids, intervalMs, checkHealth]);

  // Clean up health records for removed labelers
  useEffect(() => {
    setHealthMap((prev) => {
      const didSet = new Set(labelerDids);
      let changed = false;

      for (const did of prev.keys()) {
        if (!didSet.has(did)) {
          changed = true;
          break;
        }
      }

      if (!changed) return prev;

      const next = new Map(prev);
      for (const did of next.keys()) {
        if (!didSet.has(did)) {
          next.delete(did);
        }
      }

      return next;
    });
  }, [labelerDids]);

  // Build public health map (without internal responseTimes array)
  const publicHealth = new Map<string, LabelerHealth>();
  for (const [did, health] of healthMap) {
    const { responseTimes: _ignored, ...publicData } = health;
    publicHealth.set(did, publicData);
  }

  return {
    health: publicHealth,
    isChecking,
    checkNow: checkHealth,
  };
}
