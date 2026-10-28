/**
 * Types d'espace d'un lieu innovant (migration 323) — miroir front de `ENOV_SPACE_TYPES`
 * (`lib/enovPlan.js`), verrouillé par `tests/enov-space-type.test.js`.
 *
 * Le cahier des charges du label e-nov (domaine 1, niveau 3) demande d'attester, par un plan
 * de l'établissement, que plusieurs espaces de types différents ont été aménagés. Ce type
 * range la légende du plan annoté imprimable et s'affiche dans la fiche du lieu.
 *
 * L'ordre est celui de la légende imprimée.
 */
export const ENOV_SPACE_TYPES = Object.freeze([
  Object.freeze({ id: 'exterieur', label: 'Espace extérieur' }),
  Object.freeze({ id: 'pedagogique', label: 'Espace pédagogique' }),
  Object.freeze({ id: 'sportif', label: 'Espace sportif' }),
  Object.freeze({ id: 'vie-scolaire', label: 'Vie scolaire et bien-être' }),
  Object.freeze({ id: 'administratif', label: 'Espace administratif' }),
  Object.freeze({ id: 'restauration', label: 'Restauration' }),
  Object.freeze({ id: 'autre', label: 'Autre espace' }),
]);

const LABELS = new Map(ENOV_SPACE_TYPES.map((type) => [type.id, type.label]));

/** Libellé d'un type d'espace, ou `''` s'il est vide ou inconnu. */
export function enovSpaceTypeLabel(id) {
  return LABELS.get(String(id || '').trim()) || '';
}
