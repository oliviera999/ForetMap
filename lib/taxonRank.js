'use strict';

/**
 * Rang taxonomique pédagogique (`taxon_rank` sur `plants` / `gl_species`).
 * Colonnes VARCHAR(16) (migration 222) — pas d'ENUM SQL.
 * Clés canoniques EN ; alias FR/EN acceptés à l'import.
 */

const { asTrimmedString } = require('./shared/stringHelpers');

const TAXON_RANK_VALUES = Object.freeze(['species', 'genus', 'family', 'clade', 'breed']);

/** Alias d'import → clé canonique (minuscules). */
const TAXON_RANK_ALIASES = Object.freeze({
  species: 'species',
  genus: 'genus',
  family: 'family',
  clade: 'clade',
  breed: 'breed',
  race: 'breed',
  races: 'breed',
});

/**
 * Normalise une valeur de rang taxonomique.
 * @param {*} value
 * @returns {string|null} clé canonique ou null si vide / inconnu
 */
function normalizeTaxonRank(value) {
  const s = asTrimmedString(value).toLowerCase();
  if (!s) return null;
  return TAXON_RANK_ALIASES[s] || null;
}

module.exports = {
  TAXON_RANK_VALUES,
  TAXON_RANK_ALIASES,
  normalizeTaxonRank,
};
