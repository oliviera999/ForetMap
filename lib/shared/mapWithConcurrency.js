'use strict';

/**
 * `Promise.all` borné : applique `mapper` à chaque élément avec au plus `limit` promesses en
 * vol, en conservant l'ordre des résultats. Sert aux hachages bcrypt d'un import (un coût 10
 * ≈ 80-100 ms chacun : séquentiels, trois cents comptes dépassent le timeout d'un proxy ;
 * sans borne, ils saturent le thread pool libuv).
 */
async function mapWithConcurrency(items, limit, mapper) {
  const list = Array.isArray(items) ? items : [];
  const results = new Array(list.length);
  const width = Math.max(1, Math.floor(Number(limit) || 1));
  let cursor = 0;
  async function worker() {
    while (cursor < list.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await mapper(list[index], index);
    }
  }
  const workers = [];
  for (let i = 0; i < Math.min(width, list.length); i += 1) workers.push(worker());
  await Promise.all(workers);
  return results;
}

module.exports = { mapWithConcurrency };
