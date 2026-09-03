'use strict';

/**
 * Surfaces d'affichage des lieux (lot 4 du plan de convergence,
 * `docs/AUDIT_CONVERGENCE_APPS_2026-09.md` §6) : un même lieu — zone ou repère — est
 * affiché sur la carte de travail ForetMap (`map`), la Visite (`visit`) et le Plan Lyautey
 * (`plan`). Ce module porte les règles pures (aucune I/O) partagées par les routes zones,
 * repères, catégories et par la charge publique du plan ; le pendant front est
 * `src/shared/ui/SurfaceVisibilityField.jsx`.
 *
 * Deux réglages se combinent (migration `208_location_surfaces_search_aliases.sql`) :
 * - `location_categories.surfaces` : surfaces où la catégorie **apparaît** (défaut : toutes) ;
 * - `zones.hidden_surfaces` / `map_markers.hidden_surfaces` : surfaces où ce lieu précis est
 *   **masqué**, quelle que soit sa catégorie (défaut : aucune).
 *
 * Un lieu est visible sur une surface s'il n'y est pas masqué et si, lorsqu'il porte des
 * catégories, au moins l'une d'elles y apparaît. Un lieu sans catégorie est visible partout
 * où il n'est pas masqué (les lieux historiques n'ont pas de catégorie).
 */

/** Identifiants de surface, dans l'ordre canonique (ordre du `SET` SQL). */
const SURFACES = Object.freeze(['map', 'visit', 'plan']);

/** Longueur maximale de la liste d'alias normalisée (colonne TEXT, mais on borne l'entrée). */
const SEARCH_ALIASES_MAX_LENGTH = 512;

/** Séparateur des alias de recherche (« CDI ; bibliothèque »). */
const SEARCH_ALIASES_SEPARATOR = ' ; ';

function isSurface(value) {
  return SURFACES.includes(value);
}

/**
 * Valeur SQL (`'map,plan'`), tableau ou vide → tableau de surfaces connues, dédoublonnées,
 * dans l'ordre canonique.
 * @param {unknown} value
 * @returns {string[]}
 */
function parseSurfaceSet(value) {
  if (value == null) return [];
  const raw = Array.isArray(value) ? value : String(value).split(',');
  const seen = new Set();
  for (const item of raw) {
    const id = String(item ?? '')
      .trim()
      .toLowerCase();
    if (isSurface(id)) seen.add(id);
  }
  return SURFACES.filter((id) => seen.has(id));
}

/**
 * Tableau de surfaces → valeur `SET` SQL (`'map,plan'`, `''` pour aucune).
 * @param {unknown} list
 */
function serializeSurfaceSet(list) {
  return parseSurfaceSet(list).join(',');
}

/**
 * Entrée d'API (`undefined` = non fourni) → tableau de surfaces, ou `null` si non fourni.
 * Accepte un tableau, une chaîne `'map,plan'`, `''` / `null` (= aucune) ; rejette le reste.
 * @param {unknown} value
 * @returns {{ ok: true, value: string[] | null } | { ok: false, error: string }}
 */
function normalizeSurfaceInput(value, { field = 'surfaces' } = {}) {
  if (value === undefined) return { ok: true, value: null };
  if (value === null || value === '') return { ok: true, value: [] };
  if (Array.isArray(value)) {
    for (const item of value) {
      if (typeof item !== 'string' || !isSurface(item.trim().toLowerCase())) {
        return { ok: false, error: `${field} : surface inconnue (${SURFACES.join(', ')})` };
      }
    }
    return { ok: true, value: parseSurfaceSet(value) };
  }
  if (typeof value === 'string') {
    const parts = value
      .split(',')
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean);
    if (parts.some((p) => !isSurface(p))) {
      return { ok: false, error: `${field} : surface inconnue (${SURFACES.join(', ')})` };
    }
    return { ok: true, value: parseSurfaceSet(parts) };
  }
  return { ok: false, error: `${field} doit être un tableau de surfaces` };
}

/**
 * Alias de recherche : chaîne « a ; b » ou tableau → liste nettoyée (trim, vides retirés,
 * doublons insensibles à la casse retirés, ordre conservé).
 * @param {unknown} raw
 * @returns {string[]}
 */
function searchAliasesToList(raw) {
  if (raw == null) return [];
  const parts = Array.isArray(raw) ? raw : String(raw).split(/[;\n]/);
  const out = [];
  const seen = new Set();
  for (const part of parts) {
    const alias = String(part ?? '')
      .replace(/\s+/g, ' ')
      .trim();
    if (!alias) continue;
    const key = alias.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(alias);
  }
  return out;
}

/**
 * Alias de recherche → forme stockée (« a ; b »), bornée à `SEARCH_ALIASES_MAX_LENGTH`
 * caractères (les alias au-delà de la borne sont abandonnés, jamais tronqués au milieu).
 * @param {unknown} raw
 * @returns {string}
 */
function normalizeSearchAliases(raw) {
  const list = searchAliasesToList(raw);
  const kept = [];
  let length = 0;
  for (const alias of list) {
    const next = length + alias.length + (kept.length ? SEARCH_ALIASES_SEPARATOR.length : 0);
    if (next > SEARCH_ALIASES_MAX_LENGTH) break;
    kept.push(alias);
    length = next;
  }
  return kept.join(SEARCH_ALIASES_SEPARATOR);
}

/**
 * Le lieu est-il visible sur `surface` ? (voir la règle en tête de module)
 * @param {{ hidden_surfaces?: unknown, categories?: Array<{ surfaces?: unknown }> }} entity
 * @param {string} surface
 */
function isVisibleOnSurface(entity, surface) {
  const target = String(surface || '')
    .trim()
    .toLowerCase();
  if (!isSurface(target)) return false;
  if (parseSurfaceSet(entity?.hidden_surfaces).includes(target)) return false;
  const categories = Array.isArray(entity?.categories) ? entity.categories : [];
  if (categories.length === 0) return true;
  return categories.some((c) => parseSurfaceSet(c?.surfaces).includes(target));
}

/**
 * Ligne SQL zone / repère → champs API des surfaces : `hidden_surfaces` (tableau) et
 * `search_aliases` (chaîne stockée, `''` si vide). Les autres champs sont conservés.
 */
function withLocationSurfaceFields(row) {
  if (!row || typeof row !== 'object') return row;
  return {
    ...row,
    hidden_surfaces: parseSurfaceSet(row.hidden_surfaces),
    search_aliases: row.search_aliases == null ? '' : String(row.search_aliases),
  };
}

/**
 * Paramètre `?surface=` d'une liste : `''` (non filtré), une surface connue, ou une erreur.
 * @param {unknown} raw
 * @returns {{ ok: true, value: string } | { ok: false, error: string }}
 */
function readSurfaceQuery(raw) {
  const value = String(raw ?? '')
    .trim()
    .toLowerCase();
  if (!value) return { ok: true, value: '' };
  if (!isSurface(value)) {
    return { ok: false, error: `surface doit valoir ${SURFACES.join(', ')}` };
  }
  return { ok: true, value };
}

module.exports = {
  SURFACES,
  SEARCH_ALIASES_MAX_LENGTH,
  SEARCH_ALIASES_SEPARATOR,
  isSurface,
  parseSurfaceSet,
  serializeSurfaceSet,
  normalizeSurfaceInput,
  searchAliasesToList,
  normalizeSearchAliases,
  isVisibleOnSurface,
  withLocationSurfaceFields,
  readSurfaceQuery,
};
