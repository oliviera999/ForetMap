'use strict';

/**
 * Construction & validation **pures** d'un patch d'édition en masse des feuillets
 * (carnet de Sélène). Seuls les champs de la liste blanche sont acceptés ; chaque
 * champ fourni est coercé/validé. Aucune I/O : sert la route bulk admin et ses tests.
 *
 * Champs éditables en masse :
 *   - lien_canal   (string | null)   canal de déblocage (ex. espece, espece_pays, intro_pays)
 *   - lien_ref     (string | null)   référence liée (ex. code espèce SPxxxx)
 *   - lien_pays    (int 1..5 | null)
 *   - biome_slug   (string | null)   validé hors-module contre le référentiel biomes
 *   - plateau_number (int 1..5 | null)
 *   - statut       ('actif' | 'inactif')
 *   - cout_gemme   (int >= 0)
 *   - gain_coeur   (int >= 0)
 *
 * Sémantique : une chaîne vide (ou null) sur un champ nullable => met la colonne à NULL.
 */

const BULK_FIELDS = [
  'lien_canal',
  'lien_ref',
  'lien_pays',
  'biome_slug',
  'plateau_number',
  'statut',
  'cout_gemme',
  'gain_coeur',
];

const NULLABLE_STRING_FIELDS = new Set(['lien_canal', 'lien_ref', 'biome_slug']);
const SMALL_INT_1_5_FIELDS = new Set(['lien_pays', 'plateau_number']);
const NON_NEG_INT_FIELDS = new Set(['cout_gemme', 'gain_coeur']);

function isEmpty(value) {
  return value === null || value === undefined || String(value).trim() === '';
}

function coerceField(field, rawValue) {
  if (NULLABLE_STRING_FIELDS.has(field)) {
    return { value: isEmpty(rawValue) ? null : String(rawValue).trim() };
  }
  if (SMALL_INT_1_5_FIELDS.has(field)) {
    if (isEmpty(rawValue)) return { value: null };
    const n = Number(rawValue);
    if (!Number.isInteger(n) || n < 1 || n > 5) {
      return { error: `${field} doit être un entier entre 1 et 5 (ou vide)` };
    }
    return { value: n };
  }
  if (NON_NEG_INT_FIELDS.has(field)) {
    if (isEmpty(rawValue)) return { value: 0 };
    const n = Number(rawValue);
    if (!Number.isInteger(n) || n < 0) {
      return { error: `${field} doit être un entier positif ou nul` };
    }
    return { value: n };
  }
  if (field === 'statut') {
    const s = String(rawValue || '').toLowerCase();
    if (s !== 'actif' && s !== 'inactif') {
      return { error: "statut doit valoir 'actif' ou 'inactif'" };
    }
    return { value: s };
  }
  return { error: `Champ non éditable en masse : ${field}` };
}

/**
 * @param {object} raw patch brut (clés = colonnes)
 * @returns {{ patch: Record<string, any>, errors: Array<{field:string, error:string}> }}
 *   `patch` ne contient QUE les champs explicitement fournis et valides.
 */
function buildBulkPatch(raw = {}) {
  const patch = {};
  const errors = [];
  for (const field of BULK_FIELDS) {
    if (!(field in (raw || {}))) continue; // champ non fourni => non modifié
    const { value, error } = coerceField(field, raw[field]);
    if (error) errors.push({ field, error });
    else patch[field] = value;
  }
  return { patch, errors };
}

/**
 * Construit le fragment SQL `col = ?, …` + params pour un patch partiel.
 * @returns {{ setSql: string, params: any[], columns: string[] }}
 */
function buildBulkUpdateSql(patch = {}) {
  const columns = Object.keys(patch).filter((k) => BULK_FIELDS.includes(k));
  const setSql = columns.map((c) => `${c} = ?`).join(', ');
  const params = columns.map((c) => patch[c]);
  return { setSql, params, columns };
}

module.exports = {
  BULK_FIELDS,
  buildBulkPatch,
  buildBulkUpdateSql,
};
