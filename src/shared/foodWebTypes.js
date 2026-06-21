/**
 * Types d'interaction biotique — version frontend (ESM).
 *
 * Parité avec le noyau backend `lib/shared/foodWebCore.js` et l'ENUM SQL des
 * tables `species_interactions` / `gl_species_interactions`. Garder les deux
 * listes synchronisées en cas d'ajout d'un type.
 */

export const INTERACTION_TYPES = [
  'pollinisation',
  'herbivorie',
  'predation',
  'plante_hote',
  'decomposition',
  'nitrification',
  'symbiose',
  'competition',
];

export const INTERACTION_TYPE_LABELS = {
  pollinisation: 'Pollinisation',
  herbivorie: 'Herbivorie',
  predation: 'Prédation',
  plante_hote: 'Plante hôte',
  decomposition: 'Décomposition',
  nitrification: 'Nitrification',
  symbiose: 'Symbiose',
  competition: 'Compétition',
};

export function interactionTypeLabel(type) {
  const key = String(type || '')
    .trim()
    .toLowerCase();
  return INTERACTION_TYPE_LABELS[key] || type || 'Interaction';
}
