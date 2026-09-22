/**
 * Helpers purs de valeurs de formulaire « fiche plante » — extraits de `foretmap-views.jsx` (O6).
 *
 * Normalisation de valeurs (`-`/vides → ''), détection du libellé générique « Potager »,
 * découpe de liens multi-valeurs (retours ligne / virgules) et fusion d'une URL uploadée avec
 * les liens existants (dédup + position). Logique non triviale isolée ici pour être testée.
 */

/** Valeur de champ nettoyée : `null`/`'-'`/vide → '' ; sinon la chaîne trimée. */
export function normalizedPlantValue(value) {
  if (value == null) return '';
  const s = String(value).trim();
  if (!s || s === '-') return '';
  return s;
}

/** Libellé « Potager » souvent identique sur toutes les fiches — masqué en pastille (pas le lien carte). */
export function isGenericPotagerLabel(value) {
  return normalizedPlantValue(value).toLowerCase() === 'potager';
}

/** Découpe une valeur multi-liens (retours ligne ou virgules) en liste trimée sans vides. */
export function parseLinkCandidates(value) {
  return normalizedPlantValue(value)
    .split(/\n|,\s*/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Fusionne une URL uploadée avec les liens déjà présents (évite les doublons). */
export function mergePlantPhotoFieldValue(prevValue, newUrl, position) {
  const url = String(newUrl || '').trim();
  if (!url) return normalizedPlantValue(prevValue);
  const existing = parseLinkCandidates(prevValue);
  if (existing.includes(url)) return existing.join('\n');
  if (existing.length === 0) return url;
  if (position === 'prepend') return [url, ...existing].join('\n');
  return [...existing, url].join('\n');
}

/** Formulaire « fiche plante » vierge (toutes les colonnes du modèle, valeurs vides). */
export const EMPTY_PLANT_FORM = {
  name: '',
  emoji: '🌱',
  description: '',
  second_name: '',
  scientific_name: '',
  accepted_scientific_name: '',
  taxon_kingdom: '',
  taxon_group: '',
  taxon_family: '',
  taxon_genus: '',
  taxon_phylum: '',
  taxon_class: '',
  taxon_order: '',
  taxon_family_latin: '',
  gbif_key: '',
  gbif_accepted_key: '',
  gbif_checked_at: '',
  habitat_type: '',
  trophic_role: '',
  life_cycle: '',
  is_edible: '',
  origin_status: '',
  iucn_status: '',
  temp_min_c: '',
  temp_max_c: '',
  ph_min: '',
  ph_max: '',
  habitat: '',
  photo: '',
  nutrition: '',
  remark_1: '',
  remark_2: '',
  remark_3: '',
  reproduction: '',
  size: '',
  sources: '',
  ecosystem_role: '',
  geographic_origin: '',
  human_utility: '',
  harvest_part: '',
  planting_recommendations: '',
  preferred_nutrients: '',
  identification_criteria: '',
  lookalike_species: '',
  identification_period: '',
  clade_id: '',
  toxicity_level: '',
  hazard_exposure: '',
  hazard_notes: '',
  hazard_reviewed: '',
  health_risk: '',
  health_notes: '',
  photo_credit: '',
  photo_licence: '',
  photo_species: '',
  photo_leaf: '',
  photo_flower: '',
  photo_fruit: '',
  photo_harvest_part: '',
  map_ids: [],
  map_site_notes: {},
};

/**
 * Construit les valeurs de formulaire à partir d'une fiche plante : chaque champ du modèle
 * est normalisé (`-`/vides → ''), l'emoji retombe sur '🌱' si absent.
 */
export function extractPlantForm(plant = {}) {
  const form = { ...EMPTY_PLANT_FORM };
  Object.keys(form).forEach((k) => {
    if (k === 'map_ids' || k === 'map_site_notes') return;
    form[k] = normalizedPlantValue(plant[k]);
  });
  if (!form.emoji) form.emoji = '🌱';
  form.map_ids = Array.isArray(plant.map_ids)
    ? [...new Set(plant.map_ids.map((id) => String(id || '').trim()).filter(Boolean))]
    : [];
  form.map_site_notes =
    plant.map_site_notes && typeof plant.map_site_notes === 'object'
      ? { ...plant.map_site_notes }
      : {};
  return form;
}

/** Persiste les notes de site (une requête par carte). */
export async function persistPlantMapSiteNotes(apiFn, plantId, mapIds, mapSiteNotes) {
  const id = Number(plantId);
  if (!Number.isInteger(id) || id <= 0 || typeof apiFn !== 'function') return;
  const ids = Array.isArray(mapIds) ? mapIds : [];
  const notes = mapSiteNotes && typeof mapSiteNotes === 'object' ? mapSiteNotes : {};
  await Promise.all(
    ids.map((mapId) => {
      const mid = String(mapId || '').trim();
      if (!mid) return Promise.resolve();
      const site_notes = notes[mid] != null ? String(notes[mid]) : '';
      return apiFn(`/api/plants/${id}/map-species/${encodeURIComponent(mid)}`, 'PUT', {
        site_notes,
      });
    }),
  );
}
