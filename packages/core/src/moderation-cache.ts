/**
 * Label cache with batching and TTL expiration.
 * 
 * Reduces API calls by:
 * 1. Batching multiple URI queries into single com.atproto.label.queryLabels calls
 * 2. Caching results with configurable TTL
 * 3. Deduplicating in-flight requests
 */

import type { BskyClient } from './at/client.js';
import type { Label } from './at/types.js';

interface CacheEntry {
  labels: Label[];
  expiry: number;
}

export class LabelCache {
  private cache = new Map<string, CacheEntry>();
  private pending = new Map<string, Promise<Label[]>>();
  private ttlMs: number;

  constructor(ttlMs = 5 * 60 * 1000) {
    this.ttlMs = ttlMs;
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
      const uriPatterns = batch.map(uri => `${uri}*`); // prefix match

      try {
        const res = await client.queryLabels({
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
      } catch (err) {
        // On error, return empty labels for this batch but don't cache failure
        for (const uri of batch) {
          result.set(uri, []);
        }
      }
    }

    return result;
  }

  private async fetchLabels(
    client: BskyClient,
    uri: string,
    labelerDids?: string[]
  ): Promise<Label[]> {
    try {
      const res = await client.queryLabels({
        uriPatterns: [`${uri}*`],
        sources: labelerDids,
        limit: 50,
      });

      const labels = res.labels || [];
      this.cache.set(uri, {
        labels,
        expiry: Date.now() + this.ttlMs,
      });

      return labels;
    } catch {
      return [];
    }
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
  }

  /** Get cache statistics for debugging */
  getStats(): { size: number; pending: number } {
    return {
      size: this.cache.size,
      pending: this.pending.size,
    };
  }
}
