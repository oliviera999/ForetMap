/**
 * Noyau de la fiche rapide de glossaire — module pur partagé (lot 7 du plan de convergence,
 * `docs/AUDIT_CONVERGENCE_APPS_2026-09.md` §4.4).
 *
 * Les deux fiches — ForetMap (`components/pedago/GlossaryPopover.jsx`) et G&L
 * (`gl/components/GLGlossaryPopover.jsx`) — restent **deux composants distincts** : la fusion
 * a été écartée (leurs contenus, leurs actions et leurs thèmes diffèrent). Ce qu'elles
 * partagent vraiment tient ici : la durée de fermeture animée, les libellés de niveau, le
 * cache mémoire des fiches déjà chargées, et la résolution d'un accent de catégorie.
 *
 * Chaque produit garde **sa** palette : elle est passée en argument, jamais imposée.
 */

/** Durée (ms) de l'animation de fermeture, identique dans les deux fiches. */
export const GLOSSARY_CLOSE_MS = 200;

/** Libellés des niveaux de lecture, identiques dans les deux fiches. */
export const GLOSSARY_NIVEAU_LABELS = Object.freeze({
  base: 'Base',
  approfondissement: 'Approfondissement',
  avance: 'Avancé',
});

/**
 * Accent de couleur d'une catégorie, dans la palette du produit.
 * @param {string} categorie
 * @param {Record<string, string>} palette
 * @param {string} fallback couleur par défaut du produit.
 */
export function glossaryCategoryAccent(categorie, palette, fallback) {
  const key = String(categorie || '')
    .trim()
    .toLowerCase();
  return (palette && palette[key]) || fallback;
}

/**
 * Clé de cache d'une fiche : le code du terme, et le contexte qui change son contenu (les
 * biomes côté G&L). Deux contextes différents ne doivent pas se relire l'un l'autre.
 * @param {string} code
 * @param {string[]} [contextSlugs]
 */
export function glossaryCacheKey(code, contextSlugs = []) {
  const slugs = Array.isArray(contextSlugs) ? contextSlugs.filter(Boolean).join(',') : '';
  return `${String(code || '')}|${slugs}`;
}

/**
 * Cache mémoire des fiches déjà chargées : une fiche ouverte deux fois dans la même session
 * ne redemande pas le réseau. Chaque produit crée le sien (les codes ne se recouvrent pas,
 * et un vidage côté G&L ne doit pas vider celui de ForetMap).
 *
 * @returns {{ get: (key: string) => any, set: (key: string, value: any) => void,
 *   has: (key: string) => boolean, clear: () => void, size: () => number }}
 */
export function createGlossaryDetailCache() {
  const entries = new Map();
  return {
    get: (key) => entries.get(key),
    set: (key, value) => {
      entries.set(key, value);
    },
    has: (key) => entries.has(key),
    clear: () => entries.clear(),
    size: () => entries.size,
  };
}

/**
 * Termes voisins d'une fiche, en **une** liste : les relations sortantes
 * (`relatedTerms`) et entrantes (`incomingRelations`) réunies, dédoublonnées par code et
 * triées par libellé.
 *
 * Le corpus enregistre la plupart des relations dans les deux sens : rendues à la suite,
 * les deux listes affichaient chaque voisin **deux fois** sous le même intertitre
 * « Termes liés ». La direction d'une relation n'a pas de sens pour le lecteur d'une fiche
 * rapide — il veut savoir où aller ensuite.
 *
 * @param {Array<{glossary_code?: string, terme?: string}>} outgoing relations sortantes
 * @param {Array<{glossary_code?: string, terme?: string}>} incoming relations entrantes
 * @param {string} [excludeCode] code de la fiche affichée (jamais son propre voisin)
 * @returns {Array<object>}
 */
export function mergeGlossaryNeighbourTerms(outgoing, incoming, excludeCode = '') {
  const skip = String(excludeCode || '').trim();
  const byCode = new Map();
  for (const term of [...(outgoing || []), ...(incoming || [])]) {
    const code = String(term?.glossary_code || '').trim();
    if (!code || code === skip || byCode.has(code)) continue;
    byCode.set(code, term);
  }
  return [...byCode.values()].sort((a, b) =>
    String(a?.terme || '').localeCompare(String(b?.terme || ''), 'fr', { sensitivity: 'base' }),
  );
}
