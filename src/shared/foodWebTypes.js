/**
 * Types d'interaction biotique — version frontend (ESM).
 *
 * Parité avec le noyau backend `lib/shared/foodWebCore.js` et l'ENUM SQL des
 * tables `species_interactions` / `gl_species_interactions`. Garder les listes
 * ET les métadonnées d'orientation synchronisées en cas d'ajout d'un type.
 */

/** Types communs aux deux produits (ENUM de `gl_species_interactions`). */
export const INTERACTION_TYPES_CORE = [
  'pollinisation',
  'herbivorie',
  'predation',
  'plante_hote',
  'decomposition',
  'nitrification',
  'symbiose',
  'competition',
  'detritivorie',
  'frugivorie',
  'granivorie',
  'parasitisme',
  'excretion',
  'assimilation',
];

/** Types ForetMap : le socle commun, plus les cinq de la migration 272. */
export const INTERACTION_TYPES = [
  ...INTERACTION_TYPES_CORE,
  'mutualisme',
  'commensalisme',
  'mycophagie',
  'allelopathie',
  'facilitation',
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
  detritivorie: 'Détritivorie',
  frugivorie: 'Frugivorie',
  granivorie: 'Granivorie',
  parasitisme: 'Parasitisme',
  excretion: 'Excrétion',
  assimilation: 'Assimilation',
  mutualisme: 'Mutualisme',
  commensalisme: 'Commensalisme',
  mycophagie: 'Mycophagie',
  allelopathie: 'Allélopathie',
  facilitation: 'Facilitation',
};

/** Niveaux de preuve d'un lien (migration 272) — miroir du noyau backend. */
export const EVIDENCE_LEVELS = ['bibliographie', 'observe_site', 'hypothese'];

export const EVIDENCE_LEVEL_LABELS = {
  bibliographie: 'Documenté',
  observe_site: 'Observé sur le site',
  hypothese: 'Hypothèse',
};

export const DEFAULT_EVIDENCE_LEVEL = 'bibliographie';

/** Efficacité d'un pollinisateur — ne s'applique qu'au type `pollinisation`. */
export const POLLINATION_EFFICACIES = ['efficace', 'accessoire', 'visiteur', 'voleur_nectar'];

export const POLLINATION_EFFICACY_LABELS = {
  efficace: 'Pollinisateur efficace',
  accessoire: 'Pollinisateur accessoire',
  visiteur: 'Simple visiteur',
  voleur_nectar: 'Voleur de nectar',
};

export const POLLINATION_TYPE = 'pollinisation';

/**
 * Orientation, libellé de relation et sens du flux de matière par type — miroir de
 * `lib/shared/foodWebCore.js`, qui porte la documentation complète de `matterFlow`.
 *
 * Convention : `from` = acteur, `to` = cible. La flèche affichée suit le sens
 * écologique « est mangée par » (flux d'énergie de la ressource vers le
 * consommateur), d'où l'inversion sur les types trophiques (`consumed`).
 *
 * `matterFlow` dit dans quel sens la matière circule le long du lien stocké :
 * `to_from` pour les flux trophiques ordinaires, `from_to` quand l'acteur alimente sa
 * cible (excrétion, nitrification, assimilation), `none` pour un service. C'est cette
 * inversion, invisible tant que `nitrification` mélangeait trois relations, que le type
 * rend désormais explicite.
 */
export const INTERACTION_TYPE_META = {
  pollinisation: { orientation: 'directed', relation: 'pollinise', matterFlow: 'none' },
  herbivorie: { orientation: 'consumed', relation: 'est mangée par', matterFlow: 'to_from' },
  predation: { orientation: 'consumed', relation: 'est mangée par', matterFlow: 'to_from' },
  plante_hote: { orientation: 'directed', relation: 'héberge', matterFlow: 'none' },
  decomposition: { orientation: 'consumed', relation: 'est décomposée par', matterFlow: 'to_from' },
  nitrification: { orientation: 'directed', relation: 'enrichit', matterFlow: 'from_to' },
  symbiose: { orientation: 'mutual', relation: 'en symbiose avec', matterFlow: 'none' },
  competition: { orientation: 'mutual', relation: 'en compétition avec', matterFlow: 'none' },
  detritivorie: { orientation: 'consumed', relation: 'est fragmentée par', matterFlow: 'to_from' },
  frugivorie: { orientation: 'consumed', relation: 'est mangée par', matterFlow: 'to_from' },
  granivorie: { orientation: 'consumed', relation: 'est mangée par', matterFlow: 'to_from' },
  parasitisme: { orientation: 'consumed', relation: 'est parasitée par', matterFlow: 'to_from' },
  excretion: {
    orientation: 'directed',
    relation: 'enrichit par ses déjections',
    matterFlow: 'from_to',
  },
  assimilation: { orientation: 'directed', relation: 'est assimilé par', matterFlow: 'from_to' },
  // Migration 272 : quatre rapports sans transfert de matière, et la mycophagie, qui en est
  // un — brouter un mycélium vivant n'est pas fragmenter de la matière morte.
  mutualisme: { orientation: 'mutual', relation: 'en mutualisme avec', matterFlow: 'none' },
  commensalisme: { orientation: 'directed', relation: 'profite de', matterFlow: 'none' },
  mycophagie: { orientation: 'consumed', relation: 'est consommée par', matterFlow: 'to_from' },
  allelopathie: {
    orientation: 'directed',
    relation: 'inhibe par ses substances',
    matterFlow: 'none',
  },
  facilitation: {
    orientation: 'directed',
    relation: 'facilite l’installation de',
    matterFlow: 'none',
  },
};

const DEFAULT_INTERACTION_META = {
  orientation: 'directed',
  relation: 'interagit avec',
  matterFlow: 'none',
};

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

/** Sens du flux de matière d'un type (`to_from` / `from_to` / `none`). */
export function interactionMatterFlow(type) {
  return interactionTypeMeta(type).matterFlow || 'none';
}

/** Libellé FR d'un niveau de preuve, avec repli sur « Documenté ». */
export function evidenceLevelLabel(level) {
  const key = String(level || '')
    .trim()
    .toLowerCase();
  return EVIDENCE_LEVEL_LABELS[key] || EVIDENCE_LEVEL_LABELS[DEFAULT_EVIDENCE_LEVEL];
}

/** Libellé FR d'une efficacité de pollinisation (chaîne vide si non renseignée). */
export function pollinationEfficacyLabel(efficacy) {
  const key = String(efficacy || '')
    .trim()
    .toLowerCase();
  return POLLINATION_EFFICACY_LABELS[key] || '';
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
