/**
 * Types d'interaction biotique — version frontend (ESM).
 *
 * Parité avec le noyau backend `lib/shared/foodWebCore.js` et l'ENUM SQL des
 * tables `species_interactions` / `gl_species_interactions`. Garder les listes
 * ET les métadonnées d'orientation synchronisées en cas d'ajout d'un type.
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

/**
 * Orientation + libellé de relation par type — voir `lib/shared/foodWebCore.js`.
 *
 * Convention : `from` = acteur, `to` = cible. La flèche affichée suit le sens
 * écologique « est mangée par » (flux d'énergie de la ressource vers le
 * consommateur), d'où l'inversion sur les types trophiques (`consumed`).
 */
export const INTERACTION_TYPE_META = {
  pollinisation: { orientation: 'directed', relation: 'pollinise' },
  herbivorie: { orientation: 'consumed', relation: 'est mangée par' },
  predation: { orientation: 'consumed', relation: 'est mangée par' },
  plante_hote: { orientation: 'directed', relation: 'héberge' },
  decomposition: { orientation: 'consumed', relation: 'est décomposée par' },
  nitrification: { orientation: 'directed', relation: 'enrichit' },
  symbiose: { orientation: 'mutual', relation: 'en symbiose avec' },
  competition: { orientation: 'mutual', relation: 'en compétition avec' },
};

const DEFAULT_INTERACTION_META = { orientation: 'directed', relation: 'interagit avec' };

export function interactionTypeLabel(type) {
  const key = String(type || '')
    .trim()
    .toLowerCase();
  return INTERACTION_TYPE_LABELS[key] || type || 'Interaction';
}

/** Métadonnées (orientation + relation) d'un type, avec repli neutre. */
export function interactionTypeMeta(type) {
  const key = String(type || '')
    .trim()
    .toLowerCase();
  return INTERACTION_TYPE_META[key] || DEFAULT_INTERACTION_META;
}

/**
 * Oriente une interaction pour l'affichage (sens écologique de la flèche).
 *
 * @returns {{ tailId: number|null, headId: number|null, symmetric: boolean, relation: string }}
 *   `tailId` = origine (sans tête de flèche), `headId` = pointe de la flèche.
 */
export function orientInteraction(fromId, toId, type) {
  const meta = interactionTypeMeta(type);
  const from = fromId == null ? null : Number(fromId);
  const to = toId == null ? null : Number(toId);
  if (meta.orientation === 'consumed') {
    return { tailId: to, headId: from, symmetric: false, relation: meta.relation };
  }
  return {
    tailId: from,
    headId: to,
    symmetric: meta.orientation === 'mutual',
    relation: meta.relation,
  };
}
