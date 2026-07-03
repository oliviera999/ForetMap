'use strict';

/**
 * Normalise une valeur en chaîne « rognée » (trim), en tolérant null/undefined.
 *
 * Source unique partagée : cette implémentation était auparavant recopiée à
 * l'identique dans ~22 modules `lib/`. Contrat : renvoie toujours une chaîne
 * (jamais null) ; `null`/`undefined` deviennent `''`. Pour obtenir `null` sur
 * valeur vide, voir `normalizeOptionalString` (sémantique distincte, propre à
 * chaque module appelant).
 *
 * @param {*} value
 * @returns {string}
 */
function asTrimmedString(value) {
  if (value == null) return '';
  return String(value).trim();
}

/**
 * Normalise un en-tête de colonne d'import tableur en identifiant `snake_case` ASCII
 * (minuscules, accents retirés via NFD, tout caractère non alphanumérique replié en `_`).
 *
 * Source unique partagée : même précédent qu'`asTrimmedString` — cette implémentation
 * était auparavant recopiée à l'identique dans 6 modules d'import (`fmQuizImport`,
 * `glQcmImport`, `glSpellsImport`, `glGlossaryImport`, `glLoreGlossaryImport`,
 * `glChapterCharteImport`).
 *
 * @param {*} value en-tête brut (cellule de tableur)
 * @returns {string} identifiant normalisé (chaîne vide si l'entrée est vide/null)
 */
function normalizeImportHeader(value) {
  return asTrimmedString(value)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

module.exports = { asTrimmedString, normalizeImportHeader };
