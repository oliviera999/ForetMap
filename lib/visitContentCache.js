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
 * Mécanique (version d'écriture globale + TTL garde-fou) : `lib/shared/writeVersionCache.js`,
 * partagé avec la charge publique du plan (lot 4). Ce module n'est plus qu'une façade qui
 * conserve le nom historique et ses défauts.
 */

const {
  DEFAULT_TTL_MS,
  DEFAULT_MAX_ENTRIES,
  createWriteVersionCache,
} = require('./shared/writeVersionCache');

/**
 * @param {object} options
 * @param {() => number} options.writeVersion Version d'écriture globale (invalidation).
 * @param {() => number} [options.now] Horloge (tests).
 * @param {number} [options.ttlMs]
 * @param {number} [options.maxEntries]
 */
function createVisitContentCache(options = {}) {
  return createWriteVersionCache({ ...options, name: 'createVisitContentCache' });
}

module.exports = {
  DEFAULT_TTL_MS,
  DEFAULT_MAX_ENTRIES,
  createVisitContentCache,
};
