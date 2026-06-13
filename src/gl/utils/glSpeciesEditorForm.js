// Logique pure de l'éditeur d'espèces GL (GLSpeciesEditorPanel).
// Normalisation / transformation du formulaire d'espèce et filtrage de la
// liste ; aucune dépendance React.

/** Champs rendus en zone de texte multiligne dans l'éditeur. */
export const TEXTAREA_FIELDS = new Set([
  'role_ecologique',
  'adaptations_cles',
  'regime_alimentaire',
  'reproduction',
  'observation_terrain',
  'description_courte',
  'anecdote',
]);

/** Formulaire d'espèce vierge (toutes les colonnes du modèle biocénose). */
export const EMPTY_FORM = {
  species_code: '',
  biome_slug: '',
  type: 'faune',
  nom_commun: '',
  nom_scientifique: '',
  groupe: '',
  famille: '',
  statut_iucn: '',
  endemique: '',
  role_ecologique: '',
  adaptations_cles: '',
  taille_adulte: '',
  poids_adulte: '',
  regime_alimentaire: '',
  longevite: '',
  reproduction: '',
  observation_terrain: '',
  description_courte: '',
  anecdote: '',
  present_dans_qcm: '',
  mots_cles: '',
  wikipedia_title: '',
  wikipedia_url: '',
  photo_url: '',
  photo_credit: '',
  photo_licence: '',
  photo_licence_url: '',
  statut: 'actif',
};

/**
 * Construit un formulaire à partir d'une fiche espèce : chaque colonne connue
 * est convertie en chaîne (les valeurs nulles deviennent une chaîne vide).
 * @param {object|null|undefined} species
 * @returns {object} formulaire normalisé
 */
export function speciesToForm(species) {
  if (!species) return { ...EMPTY_FORM };
  const next = { ...EMPTY_FORM };
  for (const key of Object.keys(EMPTY_FORM)) {
    next[key] = species[key] != null ? String(species[key]) : '';
  }
  return next;
}

/**
 * Prépare la charge utile envoyée à l'API : copie du formulaire dont on retire
 * `species_code` s'il est vide (création → code généré côté serveur).
 * @param {object} form
 * @returns {object} charge utile
 */
export function formToPayload(form) {
  const payload = { ...form };
  if (!payload.species_code.trim()) delete payload.species_code;
  return payload;
}

/**
 * Filtre la liste d'espèces par type puis par recherche texte (nom commun ou
 * code), sans muter la liste source.
 * @param {Array<object>} items
 * @param {{ type?: string, q?: string }} [filters]
 * @returns {Array<object>} liste filtrée
 */
export function filterSpeciesItems(items, { type = '', q = '' } = {}) {
  let list = Array.isArray(items) ? items : [];
  if (type) list = list.filter((row) => row.type === type);
  if (q.trim()) {
    const needle = q.trim().toLowerCase();
    list = list.filter((row) => {
      const hay = `${row.nom_commun} ${row.species_code}`.toLowerCase();
      return hay.includes(needle);
    });
  }
  return list;
}
