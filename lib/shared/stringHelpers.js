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

module.exports = { asTrimmedString };
