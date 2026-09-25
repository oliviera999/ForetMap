'use strict';

/**
 * Rôle trophique des fiches biodiversité.
 * Valeurs canoniques alignées sur l’ENUM SQL `plants.trophic_role` ; miroir ESM côté
 * interface : `src/utils/plantTrophicRole.js` (libellés et définitions pour les élèves). La
 * parité des deux listes et de l’ENUM est tenue par
 * `tests/plants-trophic-role-detritivore.test.js`.
 *
 * `detritivore` est ajouté par la migration 295 : l’animal qui fragmente la matière morte
 * (ver de terre, cloporte, collembole…) n’est pas un décomposeur au sens strict (bactéries,
 * champignons, qui la minéralisent).
 */

const TROPHIC_ROLE_VALUES = Object.freeze([
  'producteur',
  'consommateur',
  'detritivore',
  'decomposeur',
]);
const TROPHIC_ROLE_SET = new Set(TROPHIC_ROLE_VALUES);

/**
 * Normalise une valeur libre (formulaire, import) vers l’ENUM, ou `null`.
 * Casse et accents sont tolérés : « Détritivore » donne `detritivore`, là où l’ancienne
 * normalisation (minuscules seules) rejetait « Décomposeur » saisi avec son accent.
 */
function normalizeTrophicRole(value) {
  if (value == null) return null;
  const key = String(value)
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
  return TROPHIC_ROLE_SET.has(key) ? key : null;
}

module.exports = {
  TROPHIC_ROLE_VALUES,
  normalizeTrophicRole,
};
