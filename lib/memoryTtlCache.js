'use strict';

const namedCaches = new Map();

function normalizePositiveInt(value, fallback) {
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function createMemoryTtlCache(options = {}) {
  const ttlMs = normalizePositiveInt(options.ttlMs, 20000);
  const maxEntries = normalizePositiveInt(options.maxEntries, 100);
  const entries = new Map();

  function pruneExpired(now = Date.now()) {
    for (const [key, item] of entries.entries()) {
      if (!item || item.expiresAt <= now) entries.delete(key);
    }
  }

  function evictIfNeeded() {
    while (entries.size > maxEntries) {
      const firstKey = entries.keys().next().value;
      if (firstKey === undefined) break;
      entries.delete(firstKey);
    }
  }

  return {
    get(key) {
      const item = entries.get(key);
      if (!item) return undefined;
      if (item.expiresAt <= Date.now()) {
        entries.delete(key);
        return undefined;
      }
      return item.value;
    },
    set(key, value, ttlOverrideMs) {
      const ttl = normalizePositiveInt(ttlOverrideMs, ttlMs);
      const now = Date.now();
      pruneExpired(now);
      entries.set(key, { value, expiresAt: now + ttl });
      evictIfNeeded();
      return value;
    },
    delete(key) {
      entries.delete(key);
    },
    clear() {
      entries.clear();
    },
  };
}

function getNamedMemoryTtlCache(name, options = {}) {
  const key = String(name || '').trim();
  if (!key) throw new Error('Cache name requis');
  if (!namedCaches.has(key)) {
    namedCaches.set(key, createMemoryTtlCache(options));
  }
  return namedCaches.get(key);
}

module.exports = {
  createMemoryTtlCache,
  getNamedMemoryTtlCache,
};
