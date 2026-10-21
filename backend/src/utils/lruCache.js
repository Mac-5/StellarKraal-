'use strict';

/**
 * Minimal in-memory LRU cache with per-entry TTL support.
 *
 * Entries are evicted when:
 *  - the cache exceeds `maxEntries` (least-recently-used first), or
 *  - the entry's TTL has elapsed (checked lazily on access).
 *
 * A `now` function can be injected so TTL behaviour is testable with a
 * mocked clock.
 */
class LRUCache {
  constructor({ maxEntries = 500, ttlMs = 60 * 60 * 1000, now = Date.now } = {}) {
    if (!Number.isInteger(maxEntries) || maxEntries <= 0) {
      throw new Error('maxEntries must be a positive integer');
    }
    if (typeof ttlMs !== 'number' || ttlMs <= 0) {
      throw new Error('ttlMs must be a positive number');
    }
    this.maxEntries = maxEntries;
    this.ttlMs = ttlMs;
    this.now = now;
    this.store = new Map();
  }

  /**
   * Retrieve a value if present and not expired.
   * Refreshes recency on hit. Expired entries are removed.
   */
  get(key) {
    const entry = this.store.get(key);
    if (!entry) return undefined;

    if (entry.expiresAt <= this.now()) {
      this.store.delete(key);
      return undefined;
    }

    // Refresh recency: delete + re-insert moves key to the end.
    this.store.delete(key);
    this.store.set(key, entry);
    return entry.value;
  }

  /**
   * Store a value with the cache's default TTL.
   */
  set(key, value, ttlMs = this.ttlMs) {
    if (this.store.has(key)) {
      this.store.delete(key);
    }
    this.store.set(key, { value, expiresAt: this.now() + ttlMs });
    this.evictIfNeeded();
    return this;
  }

  has(key) {
    return this.get(key) !== undefined;
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

  evictIfNeeded() {
    while (this.store.size > this.maxEntries) {
      const oldestKey = this.store.keys().next().value;
      this.store.delete(oldestKey);
    }
  }
}

module.exports = { LRUCache };
