'use strict';

// Noyau partagé ForetMap / GL : contenu éditable stocké en base **par-dessus** un
// fichier de défauts versionné (`data/*.json`).
//
// Les deux produits appliquent exactement le même mécanisme de lecture :
//   1. charger les défauts depuis un JSON du dépôt (cache mémoire + clone défensif) ;
//   2. lire la surcharge enregistrée en base ;
//   3. la normaliser au modèle du produit, en retombant sur les défauts si la
//      valeur stockée est absente ou illisible.
//
// Seuls la **table de réglages** (`app_settings` vs `gl_settings`), les colonnes
// d'audit et le **modèle de contenu** (normalisation) diffèrent : ils restent
// chez l'appelant. Conformément à la règle du projet, on factorise le noyau,
// pas la plomberie — l'écriture (upsert) reste donc côté produit.
//
// Consommateurs : `lib/helpContent.js` (ForetMap), `lib/glHelp.js` (GL).

const fs = require('fs');

/**
 * Construit un chargeur de défauts JSON avec cache mémoire.
 *
 * Le fichier n'est lu qu'une fois ; chaque appel renvoie une **copie profonde**,
 * de sorte qu'un appelant qui mute le résultat ne corrompt pas le cache.
 *
 * @param {string} absolutePath chemin absolu du fichier JSON de défauts
 * @returns {() => object} chargeur renvoyant une copie des défauts
 */
function createDefaultsLoader(absolutePath) {
  let cache = null;
  return function loadDefaults() {
    if (!cache) {
      cache = JSON.parse(fs.readFileSync(absolutePath, 'utf8'));
    }
    return JSON.parse(JSON.stringify(cache));
  };
}

/**
 * Résout une configuration à partir d'une valeur stockée en base.
 *
 * Toute valeur absente, vide ou illisible (JSON invalide) retombe sur les
 * défauts — jamais d'exception propagée à l'appelant, jamais de configuration
 * partielle servie.
 *
 * @param {string|object|null|undefined} storedValue valeur brute lue en base (`value_json`)
 * @param {object} options
 * @param {() => object} options.loadDefaults chargeur de défauts (cf. `createDefaultsLoader`)
 * @param {(raw: object) => object} options.normalize normalisation au modèle du produit
 * @returns {object} configuration normalisée
 */
function resolveStoredConfig(storedValue, { loadDefaults, normalize }) {
  if (!storedValue) return loadDefaults();
  try {
    const parsed = typeof storedValue === 'string' ? JSON.parse(storedValue) : storedValue;
    return normalize(parsed);
  } catch (_) {
    return loadDefaults();
  }
}

module.exports = {
  createDefaultsLoader,
  resolveStoredConfig,
};
