'use strict';

/**
 * Collateral appraisal service with in-memory LRU caching.
 *
 * Appraisals are expensive to compute off-chain, so results are cached by
 * collateral ID. The cache is bounded (configurable max entries), evicts the
 * least-recently-used entry when full, and expires entries after a TTL
 * (default 1 hour). Entries are invalidated whenever the collateral is updated.
 */

const DEFAULT_TTL_MS = 60 * 60 * 1000; // 1 hour
const DEFAULT_MAX_ENTRIES = 500;

class AppraisalCache {
  constructor({ ttlMs = DEFAULT_TTL_MS, maxEntries = DEFAULT_MAX_ENTRIES, now = () => Date.now() } = {}) {
    this.ttlMs = ttlMs;
    this.maxEntries = maxEntries;
    this.now = now;
    // Map preserves insertion order; we re-insert on access to track LRU.
    this.store = new Map();
  }

  get(collateralId) {
    const entry = this.store.get(collateralId);
    if (!entry) return undefined;

    if (this.now() >= entry.expiresAt) {
      this.store.delete(collateralId);
      return undefined;
    }

    // Refresh recency.
    this.store.delete(collateralId);
    this.store.set(collateralId, entry);
    return entry.value;
  }

  set(collateralId, value) {
    if (this.store.has(collateralId)) {
      this.store.delete(collateralId);
    }

    this.store.set(collateralId, {
      value,
      expiresAt: this.now() + this.ttlMs,
    });

    while (this.store.size > this.maxEntries) {
      const oldestKey = this.store.keys().next().value;
      this.store.delete(oldestKey);
    }
  }

  invalidate(collateralId) {
    this.store.delete(collateralId);
  }

  clear() {
    this.store.clear();
  }

  get size() {
    return this.store.size;
  }
}

class AppraisalService {
  constructor({ computeAppraisal, cacheOptions = {} } = {}) {
    if (typeof computeAppraisal !== 'function') {
      throw new TypeError('computeAppraisal must be a function');
    }
    this.computeAppraisal = computeAppraisal;
    this.cache = new AppraisalCache(cacheOptions);
  }

  /**
   * Return the appraisal for a collateral, using the cache when possible.
   * A cache hit avoids recomputation; a miss triggers a fresh appraisal.
   */
  async getAppraisal(collateralId, collateral) {
    const cached = this.cache.get(collateralId);
    if (cached !== undefined) {
      return cached;
    }

    const appraisal = await this.computeAppraisal(collateralId, collateral);
    this.cache.set(collateralId, appraisal);
    return appraisal;
  }

  /**
   * Invalidate the cached appraisal for a collateral. Call this whenever the
   * collateral is updated so stale appraisals are not served.
   */
  invalidate(collateralId) {
    this.cache.invalidate(collateralId);
  }
}

module.exports = {
  AppraisalService,
  AppraisalCache,
  DEFAULT_TTL_MS,
  DEFAULT_MAX_ENTRIES,
};
