'use strict';

/**
 * Cache mémoire à clé, invalidé par la **version d'écriture globale** (lot 4 du plan de
 * convergence — généralisation de `lib/visitContentCache.js`, qui en devient la façade).
 *
 * Usage : les agrégats publics coûteux et éditoriaux (`GET /api/visit/content`,
 * `GET /api/plan/content`) — plusieurs requêtes SQL par affichage, contenu qui change
 * quelques fois par mois. Invalidation : `writeVersion()` (`getDataWriteVersion()` de
 * `database.js`, incrémentée par tout INSERT/UPDATE/DELETE passé par les helpers), donc
 * toute écriture périme le cache instantanément, sans hook par route. Le TTL n'est qu'un
 * garde-fou pour les écritures que le compteur ne voit pas (scripts CLI, SQL direct).
 */

/** Garde-fou pour les écritures hors process, que la version globale ne voit pas. */
const DEFAULT_TTL_MS = 30000;
/** Peu de clés en pratique ; borne dure pour ne jamais laisser le cache enfler. */
const DEFAULT_MAX_ENTRIES = 8;

/**
 * @param {object} options
 * @param {() => number} options.writeVersion Version d'écriture globale (invalidation).
 * @param {() => number} [options.now] Horloge (tests).
 * @param {number} [options.ttlMs]
 * @param {number} [options.maxEntries]
 * @param {string} [options.name] Nom (messages d'erreur).
 */
function createWriteVersionCache({
  writeVersion,
  now = () => Date.now(),
  ttlMs = DEFAULT_TTL_MS,
  maxEntries = DEFAULT_MAX_ENTRIES,
  name = 'createWriteVersionCache',
} = {}) {
  if (typeof writeVersion !== 'function') {
    throw new TypeError(`${name} : writeVersion (fonction) est requis`);
  }
  const entries = new Map();

  return {
    /** @returns {unknown|null} Charge utile encore valable, ou `null`. */
    get(key) {
      const k = String(key || '');
      const hit = entries.get(k);
      if (!hit) return null;
      if (hit.writes !== writeVersion() || now() - hit.storedAt >= ttlMs) {
        entries.delete(k);
        return null;
      }
      return hit.payload;
    },
    set(key, payload) {
      const k = String(key || '');
      if (!k) return;
      // Purge globale plutôt qu'une politique d'éviction : le nombre de clés est petit
      // et une purge coûte moins qu'un suivi d'usage.
      if (!entries.has(k) && entries.size >= maxEntries) entries.clear();
      entries.set(k, { writes: writeVersion(), storedAt: now(), payload });
    },
    clear() {
      entries.clear();
    },
    size() {
      return entries.size;
    },
  };
}

module.exports = {
  DEFAULT_TTL_MS,
  DEFAULT_MAX_ENTRIES,
  createWriteVersionCache,
};
