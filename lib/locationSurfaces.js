'use strict';

/**
 * Surfaces d'affichage des lieux (lot 4 du plan de convergence,
 * `docs/AUDIT_CONVERGENCE_APPS_2026-09.md` §6) : un même lieu — zone ou repère — est
 * affiché sur la carte de travail ForetMap (`map`), la Visite (`visit`), le Plan Lyautey
 * public (`plan`), le plan des personnels (`staff`, proflyautey — migration `260`) et le
 * plan e-nov (`enov`, migration `313`). Ce
 * module porte les règles pures (aucune I/O) partagées par les routes zones, repères,
 * catégories et par les charges des deux plans ; le pendant front est
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
 *
 * Exception — les **catégories-labels** (`is_distinction`, migration `313`, label e-nov) :
 * elles signalent un lieu sans décider où il apparaît. Là où elles n'apparaissent pas, elles
 * sont transparentes : un lieu qui ne porte **que** des labels s'y comporte comme un lieu
 * sans catégorie. Là où elles apparaissent, elles comptent comme une catégorie ordinaire.
 */

/**
 * Identifiants de surface, dans l'ordre canonique (ordre du `SET` SQL). Toute surface
 * nouvelle s'ajoute **en fin de liste** : MySQL encode un `SET` par position de bit, et
 * l'insérer au milieu réécrirait la valeur de toutes les lignes existantes.
 */
const SURFACES = Object.freeze(['map', 'visit', 'plan', 'staff', 'enov']);

/**
 * Surfaces ouvertes sans authentification. La surface `staff` n'en fait pas partie : sa
 * charge n'est servie qu'à un lecteur identifié (permission RBAC) ou porteur du laissez-passer
 * de code, et son lecteur n'est jamais rétrogradé en « visiteur »
 * (`lib/locationAudience.js`, `resolveViewerRoleSlug`). Le plan e-nov est public, comme le
 * Plan Lyautey (code de diffusion facultatif).
 */
const PUBLIC_SURFACES = Object.freeze(['visit', 'plan', 'enov']);

/** La surface est-elle ouverte au public (lecteur anonyme traité en « visiteur ») ? */
function isPublicSurface(surface) {
  return PUBLIC_SURFACES.includes(
    String(surface || '')
      .trim()
      .toLowerCase(),
  );
}

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
  if (categories.some((c) => parseSurfaceSet(c?.surfaces).includes(target))) return true;
  // Aucune catégorie n'apparaît ici : si toutes sont des labels, le lieu est vu comme un lieu
  // sans catégorie (voir l'en-tête).
  return categories.every(isDistinctionCategory);
}

/** Catégorie-label (`is_distinction`, migration 313) ? */
function isDistinctionCategory(category) {
  const flag = category?.is_distinction;
  return flag === true || flag === 1 || flag === '1';
}

/**
 * Retire d'un lieu sérialisé les **catégories-labels** qui n'apparaissent pas sur `surface`
 * (et leurs identifiants de `category_ids`).
 *
 * Un label est tenu hors des surfaces qu'il ne déclare pas : la catégorie e-nov n'a rien à
 * faire sur la fiche d'un élève dans ForetMap ou dans la Visite. Les catégories ordinaires
 * ne sont pas touchées (comportement historique inchangé).
 *
 * @param {object} entity lieu portant `categories` (et éventuellement `category_ids`).
 * @param {string} surface surface servie.
 * @returns {object} le même objet s'il n'y a rien à retirer, sinon une copie.
 */
function stripDistinctionCategoriesOffSurface(entity, surface) {
  if (!entity || typeof entity !== 'object' || !Array.isArray(entity.categories)) return entity;
  const target = String(surface || '')
    .trim()
    .toLowerCase();
  const removed = new Set(
    entity.categories
      .filter((c) => isDistinctionCategory(c) && !parseSurfaceSet(c?.surfaces).includes(target))
      .map((c) => String(c?.id)),
  );
  if (removed.size === 0) return entity;
  const out = {
    ...entity,
    categories: entity.categories.filter((c) => !removed.has(String(c?.id))),
  };
  if (Array.isArray(entity.category_ids)) {
    out.category_ids = entity.category_ids.filter((id) => !removed.has(String(id)));
  }
  return out;
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
  PUBLIC_SURFACES,
  isPublicSurface,
  SEARCH_ALIASES_MAX_LENGTH,
  SEARCH_ALIASES_SEPARATOR,
  isSurface,
  parseSurfaceSet,
  serializeSurfaceSet,
  normalizeSurfaceInput,
  searchAliasesToList,
  normalizeSearchAliases,
  isVisibleOnSurface,
  isDistinctionCategory,
  stripDistinctionCategoriesOffSurface,
  withLocationSurfaceFields,
  readSurfaceQuery,
};
