'use strict';

/**
 * Cache mémoire du contenu public de visite (`GET /api/visit/content`).
 *
 * Pourquoi : cet endpoint est le seul point d'entrée **non authentifié** qui agrège des
 * données — zones, repères, médias, photos de carte, tutoriels et packs mascotte, soit
 * huit requêtes SQL et autant de `JSON.parse` de packs à chaque affichage. Il est ouvert à
 * quiconque a l'URL de visite (QR code, lien partagé, robot d'indexation), alors que son
 * contenu est éditorial : il change quelques fois par mois, pas à chaque vue.
 *
 * Invalidation : la **version d'écriture globale** (`getDataWriteVersion()` de
 * `database.js`, incrémentée par tout INSERT/UPDATE/DELETE passé par les helpers) — même
 * principe que le cache RBAC. Une écriture rend donc le cache périmé instantanément, sans
 * hook par route. Le TTL n'est qu'un garde-fou pour les écritures que le compteur ne voit
 * pas (scripts CLI, SQL direct hors process).
 */

/** Garde-fou pour les écritures hors process, que la version globale ne voit pas. */
const DEFAULT_TTL_MS = 30000;
/** Peu de cartes en pratique ; borne dure pour ne jamais laisser le cache enfler. */
const DEFAULT_MAX_ENTRIES = 8;

/**
 * @param {object} options
 * @param {() => number} options.writeVersion Version d'écriture globale (invalidation).
 * @param {() => number} [options.now] Horloge (tests).
 * @param {number} [options.ttlMs]
 * @param {number} [options.maxEntries]
 */
function createVisitContentCache({
  writeVersion,
  now = () => Date.now(),
  ttlMs = DEFAULT_TTL_MS,
  maxEntries = DEFAULT_MAX_ENTRIES,
} = {}) {
  if (typeof writeVersion !== 'function') {
    throw new TypeError('createVisitContentCache : writeVersion (fonction) est requis');
  }
  const entries = new Map();

  return {
    /** @returns {unknown|null} Charge utile encore valable, ou `null`. */
    get(mapId) {
      const key = String(mapId || '');
      const hit = entries.get(key);
      if (!hit) return null;
      if (hit.writes !== writeVersion() || now() - hit.storedAt >= ttlMs) {
        entries.delete(key);
        return null;
      }
      return hit.payload;
    },
    set(mapId, payload) {
      const key = String(mapId || '');
      if (!key) return;
      // Purge globale plutôt qu'une politique d'éviction : le nombre de cartes est petit
      // et une purge coûte moins qu'un suivi d'usage.
      if (!entries.has(key) && entries.size >= maxEntries) entries.clear();
      entries.set(key, { writes: writeVersion(), storedAt: now(), payload });
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
  createVisitContentCache,
};
