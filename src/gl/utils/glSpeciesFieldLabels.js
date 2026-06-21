/** Libellés UI alignés sur le modèle XLSX biocénose (lib/glSpeciesImport.js). */

export const GL_SPECIES_FIELD_LABELS = {
  species_code: 'Code espèce',
  biome_slug: 'Biome (slug)',
  type: 'Type',
  nom_commun: 'Nom commun',
  nom_scientifique: 'Nom scientifique',
  groupe: 'Groupe',
  famille: 'Famille',
  statut_iucn: 'Statut UICN',
  endemique: 'Endémique',
  role_ecologique: 'Rôle écologique',
  adaptations_cles: 'Adaptations clés',
  taille_adulte: 'Taille adulte',
  poids_adulte: 'Poids adulte',
  regime_alimentaire: 'Régime alimentaire',
  longevite: 'Longévité',
  reproduction: 'Reproduction',
  observation_terrain: 'Observation terrain',
  description_courte: 'Description courte',
  anecdote: 'Anecdote',
  present_dans_qcm: 'Présent dans le QCM',
  mots_cles: 'Mots-clés',
  wikipedia_title: 'Titre Wikipedia',
  wikipedia_url: 'Wikipedia',
  photo_url: 'Photo',
  photo_credit: 'Crédit photo',
  photo_licence: 'Licence photo',
  photo_licence_url: 'URL licence photo',
};

export const GL_SPECIES_TYPE_LABELS = {
  faune: 'Faune',
  flore: 'Flore',
};

/** Sections de la fiche modale : titre + clés affichées si non vides. */
export const GL_SPECIES_DETAIL_SECTIONS = [
  {
    id: 'ecologie',
    title: 'Écologie',
    fields: ['role_ecologique', 'adaptations_cles', 'regime_alimentaire'],
  },
  {
    id: 'morphologie',
    title: 'Morphologie et vie',
    fields: ['taille_adulte', 'poids_adulte', 'longevite', 'reproduction'],
  },
  {
    id: 'conservation',
    title: 'Conservation',
    fields: ['statut_iucn', 'endemique'],
  },
  {
    id: 'terrain',
    title: 'Terrain',
    fields: ['observation_terrain'],
  },
  {
    id: 'textes',
    title: 'Textes',
    fields: ['description_courte', 'anecdote'],
  },
  {
    id: 'ressources',
    title: 'Ressources',
    fields: [
      'wikipedia_url',
      'wikipedia_title',
      'photo_credit',
      'photo_licence',
      'photo_licence_url',
    ],
  },
  {
    id: 'jeu',
    title: 'Jeu',
    fields: ['present_dans_qcm'],
  },
  {
    id: 'reference',
    title: 'Référence catalogue',
    fields: ['species_code', 'biome_slug'],
  },
];

function asTrimmed(value) {
  if (value == null) return '';
  return String(value).trim();
}

export function hasGlSpeciesFieldValue(value) {
  return asTrimmed(value).length > 0;
}

export function getGlSpeciesFieldLabel(key) {
  return GL_SPECIES_FIELD_LABELS[key] || key;
}

/**
 * @param {string} key
 * @param {unknown} value
 * @param {{ biomeNom?: string }} [ctx]
 */
export function formatGlSpeciesFieldValue(key, value, ctx = {}) {
  const raw = asTrimmed(value);
  if (!raw) return '';

  if (key === 'type') {
    return GL_SPECIES_TYPE_LABELS[raw] || raw;
  }

  if (key === 'present_dans_qcm') {
    const lower = raw.toLowerCase();
    if (lower === 'oui' || lower === 'yes' || lower === '1' || lower === 'true') return 'Oui';
    if (lower === 'non' || lower === 'no' || lower === '0' || lower === 'false') return 'Non';
    return raw;
  }

  if (key === 'biome_slug' && ctx.biomeNom) {
    return `${ctx.biomeNom} (${raw})`;
  }

  return raw;
}

export function isGlSpeciesUrlField(key) {
  return key === 'wikipedia_url' || key === 'photo_licence_url';
}
