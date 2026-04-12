'use strict';

/**
 * Socle Trefle (https://trefle.io/) — **désactivé par défaut**.
 * Sans `SPECIES_AUTOFILL_TREFLE=1` et `TREFLE_TOKEN`, aucun appel réseau.
 *
 * Mapping futur (commentaire) — champs JSON Trefle typiques → ForetMap :
 * - `common_name` / `scientific_name` → `name`, `scientific_name`
 * - `family` / `genus` → pistes pour `group_*` (à croiser avec GBIF/Wikidata)
 * - `observations` / `distribution` → `geographic_origin`, `habitat` (avec prudence)
 * - `growth` / `maximum_height` → `size`, `planting_recommendations`
 * Voir la doc officielle Trefle pour la forme exacte des payloads.
 */

function asTrimmedString(value) {
  if (value == null) return '';
  return String(value).trim();
}

function isTrefleAutofillEnabled() {
  const flag = asTrimmedString(process.env.SPECIES_AUTOFILL_TREFLE);
  const token = asTrimmedString(process.env.TREFLE_TOKEN);
  return flag === '1' && token.length > 0;
}

/**
 * @param {string|null|undefined} scientificName
 * @param {object} [options]
 * @param {typeof fetch} [options.fetchImpl]
 * @returns {Promise<object|null>} — pack mergeSources ou null
 */
async function fetchTrefleSpeciesTraits(scientificName, options = {}) {
  if (!isTrefleAutofillEnabled()) return null;
  const name = asTrimmedString(scientificName);
  if (!name) return null;
  // Implémentation HTTP / mapping : à brancher ici (GET https://trefle.io/api/v1/species/search?q=…).
  void options;
  return null;
}

module.exports = {
  fetchTrefleSpeciesTraits,
  isTrefleAutofillEnabled,
};
