/**
 * Rôle trophique des fiches biodiversité (UI).
 * Aligné sur l’ENUM SQL `plants.trophic_role` et sur `lib/plantTrophicRole.js` ; la parité
 * des deux listes est tenue par `tests/plants-trophic-role-detritivore.test.js`.
 *
 * `detritivore` (migration 295) sépare l’animal qui **fragmente** la matière morte — un
 * consommateur, et une proie — du décomposeur au sens strict (bactéries, champignons), qui
 * la **minéralise**. L’ordre suit la chaîne de la matière.
 */

export const TROPHIC_ROLE_VALUES = Object.freeze([
  'producteur',
  'consommateur',
  'detritivore',
  'decomposeur',
]);

export const TROPHIC_ROLE_LABELS = Object.freeze({
  producteur: 'Producteur',
  consommateur: 'Consommateur',
  detritivore: 'Détritivore',
  decomposeur: 'Décomposeur',
});

/**
 * Définitions courtes, écrites pour un élève de 11 ans (infobulle de la pastille, aide du
 * formulaire). Détritivore et décomposeur se lisent côte à côte : l’un fragmente, l’autre
 * rend les sels minéraux aux plantes.
 */
export const TROPHIC_ROLE_DEFINITIONS = Object.freeze({
  producteur: 'fabrique sa propre matière avec la lumière, l’eau, l’air et les sels minéraux',
  consommateur: 'se nourrit d’autres êtres vivants, plantes ou animaux',
  detritivore: 'se nourrit de matière organique morte (feuilles, bois, cadavres) qu’il fragmente',
  decomposeur: 'transforme la matière organique morte en sels minéraux utiles aux plantes',
});

const TROPHIC_ROLE_SET = new Set(TROPHIC_ROLE_VALUES);

/** Valeur canonique (`detritivore`…) ou chaîne vide ; tolère casse et accents. */
export function normalizeTrophicRole(value) {
  if (value == null) return '';
  const key = String(value)
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
  return TROPHIC_ROLE_SET.has(key) ? key : '';
}

/** « Détritivore » — ou chaîne vide pour une valeur inconnue. */
export function trophicRoleLabel(value) {
  const canonical = normalizeTrophicRole(value);
  return canonical ? TROPHIC_ROLE_LABELS[canonical] : '';
}

/** Définition courte du rôle, ou chaîne vide. */
export function trophicRoleDefinition(value) {
  const canonical = normalizeTrophicRole(value);
  return canonical ? TROPHIC_ROLE_DEFINITIONS[canonical] : '';
}
