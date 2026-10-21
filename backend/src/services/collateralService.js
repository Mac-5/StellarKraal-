'use strict';

/**
 * Collateral service with in-memory LRU appraisal cache (TTL 1 hour).
 *
 * Appraisals are expensive to compute off-chain, so results are cached by
 * collateral ID. The cache is bounded (configurable max entries), evicts the
 * least-recently-used entry when full, expires entries after a TTL, and is
 * invalidated whenever the underlying collateral is updated.
 */

const DEFAULT_TTL_MS = 60 * 60 * 1000; // 1 hour
const DEFAULT_MAX_ENTRIES = 1000;

class LruAppraisalCache {
  constructor({ ttlMs = DEFAULT_TTL_MS, maxEntries = DEFAULT_MAX_ENTRIES, now = () => Date.now() } = {}) {
    if (!Number.isInteger(maxEntries) || maxEntries <= 0) {
      throw new Error('maxEntries must be a positive integer');
    }
    if (!Number.isFinite(ttlMs) || ttlMs <= 0) {
      throw new Error('ttlMs must be a positive number');
    }
    this.ttlMs = ttlMs;
    this.maxEntries = maxEntries;
    this.now = now;
    // Map preserves insertion order; we re-insert on access to track recency.
    this.store = new Map();
  }

  get(key) {
    const entry = this.store.get(key);
    if (!entry) return undefined;
    if (entry.expiresAt <= this.now()) {
      this.store.delete(key);
      return undefined;
    }
    // Refresh recency.
    this.store.delete(key);
    this.store.set(key, entry);
    return entry.value;
  }

  set(key, value) {
    if (this.store.has(key)) {
      this.store.delete(key);
    }
    this.store.set(key, { value, expiresAt: this.now() + this.ttlMs });
    while (this.store.size > this.maxEntries) {
      const oldestKey = this.store.keys().next().value;
      this.store.delete(oldestKey);
    }
    return value;
  }

  delete(key) {
    return this.store.delete(key);
  }

  clear() {
    this.store.clear();
  }

  get size() {
    return this.store.size;
  }
}

class CollateralService {
  constructor({ repository, appraise, cacheOptions = {} } = {}) {
    if (!repository) throw new Error('repository is required');
    if (typeof appraise !== 'function') throw new Error('appraise function is required');
    this.repository = repository;
    this.appraise = appraise;
    this.cache = new LruAppraisalCache(cacheOptions);
  }

  /**
   * Return the appraisal for a collateral, using the cache when possible.
   * A cache hit avoids recomputation; a miss triggers a fresh appraisal.
   */
  async getAppraisal(collateralId) {
    const cached = this.cache.get(collateralId);
    if (cached !== undefined) {
      return cached;
    }

    const collateral = await this.repository.findById(collateralId);
    if (!collateral) {
      throw new Error(`Collateral not found: ${collateralId}`);
    }

    const appraisal = await this.appraise(collateral);
    this.cache.set(collateralId, appraisal);
    return appraisal;
  }

  /**
   * Update a collateral and invalidate its cached appraisal so the next read
   * recomputes against the new state.
   */
  async updateCollateral(collateralId, updates) {
    const updated = await this.repository.update(collateralId, updates);
    this.cache.delete(collateralId);
    return updated;
  }

  invalidate(collateralId) {
    return this.cache.delete(collateralId);
  }
}

module.exports = {
  CollateralService,
  LruAppraisalCache,
  DEFAULT_TTL_MS,
  DEFAULT_MAX_ENTRIES,
};
