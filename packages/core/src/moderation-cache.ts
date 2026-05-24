/**
 * Label cache with batching, TTL expiration, and per-provider failure tracking.
 * 
 * Reduces API calls by:
 * 1. Batching multiple URI queries into single com.atproto.label.queryLabels calls
 * 2. Caching results with configurable TTL
 * 3. Deduplicating in-flight requests
 * 4. [v0.14.1] Tracking per-labeler failures with retry
 */

import type { BskyClient } from './at/client.js';
import type { Label } from './at/types.js';

interface CacheEntry {
  labels: Label[];
  expiry: number;
}

/** [v0.14.1] Failure state for a labeler */
export interface LabelerFailureState {
  did: string;
  failed: boolean;
  retries: number;
  lastError: string;
  since: number; // timestamp
}

/** [v0.14.1] Retry configuration */
export interface RetryConfig {
  maxRetries: number;
  baseDelay: number; // ms
  maxDelay: number;  // ms
  backoffMultiplier: number;
}

const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxRetries: 3,
  baseDelay: 1000,
  maxDelay: 8000,
  backoffMultiplier: 2,
};

function calculateDelay(attempt: number, config: RetryConfig): number {
  return Math.min(
    config.baseDelay * Math.pow(config.backoffMultiplier, attempt - 1),
    config.maxDelay
  );
}

async function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export class LabelCache {
  private cache = new Map<string, CacheEntry>();
  private pending = new Map<string, Promise<Label[]>>();
  /** [v0.14.1] Per-labeler failure tracking */
  private failures = new Map<string, LabelerFailureState>();
  private ttlMs: number;
  private retryConfig: RetryConfig;

  constructor(ttlMs = 5 * 60 * 1000, retryConfig: Partial<RetryConfig> = {}) {
    this.ttlMs = ttlMs;
    this.retryConfig = { ...DEFAULT_RETRY_CONFIG, ...retryConfig };
  }

  /**
   * Query labels for a single URI.
   * Uses cache if available and not expired.
   */
  async getLabels(
    client: BskyClient,
    uri: string,
    labelerDids?: string[]
  ): Promise<Label[]> {
    const cached = this.cache.get(uri);
    if (cached && cached.expiry > Date.now()) {
      // Filter by requested labelers if specified
      if (labelerDids) {
        return cached.labels.filter(l => labelerDids.includes(l.src));
      }
      return cached.labels;
    }

    // Check for in-flight request
    const pending = this.pending.get(uri);
    if (pending) {
      const labels = await pending;
      if (labelerDids) {
        return labels.filter(l => labelerDids.includes(l.src));
      }
      return labels;
    }

    // Fetch from API
    const promise = this.fetchLabels(client, uri, labelerDids);
    this.pending.set(uri, promise);

    try {
      const labels = await promise;
      return labels;
    } finally {
      this.pending.delete(uri);
    }
  }

  /**
   * Query labels for multiple URIs in a single batch call.
   * More efficient than individual getLabels() calls.
   */
  async getLabelsBatch(
    client: BskyClient,
    uris: string[],
    labelerDids?: string[]
  ): Promise<Map<string, Label[]>> {
    const result = new Map<string, Label[]>();
    const toFetch: string[] = [];

    // Check cache first
    for (const uri of uris) {
      const cached = this.cache.get(uri);
      if (cached && cached.expiry > Date.now()) {
        const labels = labelerDids
          ? cached.labels.filter(l => labelerDids.includes(l.src))
          : cached.labels;
        result.set(uri, labels);
      } else {
        toFetch.push(uri);
      }
    }

    if (toFetch.length === 0) {
      return result;
    }

    // Batch fetch remaining URIs
    // queryLabels supports up to 250 uriPatterns per call
    const batchSize = 250;
    for (let i = 0; i < toFetch.length; i += batchSize) {
      const batch = toFetch.slice(i, i + batchSize);
      const uriPatterns = batch.map(uri => `${uri}`); // exact URI match (wildcards not supported by all servers)

      try {
        const res = await this.fetchWithRetry(client, {
          uriPatterns,
          sources: labelerDids,
          limit: 250,
        });

        // Group results by URI
        const byUri = new Map<string, Label[]>();
        for (const label of res.labels || []) {
          const list = byUri.get(label.uri) || [];
          list.push(label);
          byUri.set(label.uri, list);
        }

        // Store in cache and results
        for (const uri of batch) {
          const labels = byUri.get(uri) || [];
          this.cache.set(uri, {
            labels,
            expiry: Date.now() + this.ttlMs,
          });
          result.set(uri, labels);
        }

        // [v0.14.1] Clear failures on success
        if (labelerDids) {
          for (const did of labelerDids) {
            this.clearFailure(did);
          }
        }
      } catch (err) {
        // [v0.14.1] Track failure per labeler
        const errorMessage = err instanceof Error ? err.message : 'Unknown error';
        if (labelerDids) {
          for (const did of labelerDids) {
            this.recordFailure(did, errorMessage);
          }
        }
        
        // On error, return empty labels for this batch but don't cache failure
        for (const uri of batch) {
          result.set(uri, []);
        }
      }
    }

    return result;
  }

  /** [v0.14.1] Get all currently failed labelers */
  getFailedLabelers(): LabelerFailureState[] {
    return Array.from(this.failures.values()).filter(f => f.failed);
  }

  /** [v0.14.1] Check if a specific labeler has failed */
  isFailed(did: string): boolean {
    return this.failures.get(did)?.failed ?? false;
  }

  /** [v0.14.1] Get failure state for a labeler */
  getFailureState(did: string): LabelerFailureState | undefined {
    return this.failures.get(did);
  }

  /** [v0.14.1] Clear failure state (e.g., on manual retry) */
  clearFailure(did: string): void {
    this.failures.delete(did);
  }

  /** [v0.14.1] Clear all failure states */
  clearAllFailures(): void {
    this.failures.clear();
  }

  private async fetchLabels(
    client: BskyClient,
    uri: string,
    labelerDids?: string[]
  ): Promise<Label[]> {
    try {
      const res = await this.fetchWithRetry(client, {
        uriPatterns: [`${uri}`],
        sources: labelerDids,
        limit: 50,
      });

      const labels = res.labels || [];
      this.cache.set(uri, {
        labels,
        expiry: Date.now() + this.ttlMs,
      });

      // Clear failures on success
      if (labelerDids) {
        for (const did of labelerDids) {
          this.clearFailure(did);
        }
      }

      return labels;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      if (labelerDids) {
        for (const did of labelerDids) {
          this.recordFailure(did, errorMessage);
        }
      }
      return [];
    }
  }

  /** [v0.14.1] Fetch with retry logic */
  private async fetchWithRetry(
    client: BskyClient,
    params: { uriPatterns: string[]; sources?: string[]; limit?: number }
  ): Promise<{ labels: Label[]; cursor?: string }> {
    let lastError: Error | undefined;
    
    for (let attempt = 1; attempt <= this.retryConfig.maxRetries; attempt++) {
      try {
        const res = await client.queryLabels(params);
        return res;
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));
        
        if (attempt < this.retryConfig.maxRetries) {
          const delay = calculateDelay(attempt, this.retryConfig);
          await sleep(delay);
        }
      }
    }
    
    throw lastError || new Error('All retry attempts failed');
  }

  /** [v0.14.1] Record a failure for a labeler */
  private recordFailure(did: string, error: string): void {
    const existing = this.failures.get(did);
    this.failures.set(did, {
      did,
      failed: true,
      retries: (existing?.retries ?? 0) + 1,
      lastError: error,
      since: existing?.since ?? Date.now(),
    });
  }

  /** Remove expired entries to prevent unbounded growth */
  prune(): void {
    const now = Date.now();
    for (const [uri, entry] of this.cache) {
      if (entry.expiry <= now) {
        this.cache.delete(uri);
      }
    }
  }

  /** Clear all cached entries */
  clear(): void {
    this.cache.clear();
    this.pending.clear();
    this.failures.clear();
  }

  /** Get cache statistics for debugging */
  getStats(): { size: number; pending: number; failures: number } {
    return {
      size: this.cache.size,
      pending: this.pending.size,
      failures: this.failures.size,
    };
  }
}
