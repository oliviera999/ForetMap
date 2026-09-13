'use strict';

/**
 * Cœur pur du **périmètre cartes** : quelles cartes un compte a le droit de voir.
 *
 * Deux sources de restriction, combinées par intersection :
 *   1. le **périmètre de groupe** (`group_scopes.map_id`, migration 079) — jusqu'ici une
 *      simple donnée de filtrage d'élèves dans les stats (`lib/groupScope.js`), désormais
 *      aussi une borne d'accès ;
 *   2. l'**affiliation** individuelle (`users.affiliation`, migrations 024 puis 076) —
 *      jusqu'ici appliquée côté client seulement (`src/utils/mapAffiliation.js`).
 *
 * Convention partagée dans tout le module : `null` = **non borné** (aucune restriction),
 * un tableau = la liste exhaustive des cartes autorisées. Un tableau vide n'est jamais
 * produit : un périmètre qui n'autorise rien serait un compte muré.
 *
 * Aucune dépendance (ni SQL, ni Express) : `lib/mapAccess.js` fournit les données, ce
 * module décide. Testable sans base (`tests/map-scope-core.test.js`).
 */

/** Même expression que `src/utils/mapAffiliation.js` (miroir CJS, cf. `normalizeMapId`). */
const MAP_AFFILIATION_SLUG_RE = /^[a-z0-9][a-z0-9_-]{0,30}$/;

/** Identifiant exploitable (carte ou groupe), ou `null`. */
function normalizeId(value) {
  if (value == null) return null;
  const s = String(value).trim();
  return s || null;
}

/** Alias explicite pour les appelants qui normalisent un `map_id`. */
const normalizeMapId = normalizeId;

function uniqueIds(values) {
  const out = [];
  const seen = new Set();
  for (const value of Array.isArray(values) ? values : []) {
    const id = normalizeId(value);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

/**
 * Cartes autorisées par l'affiliation d'un élève.
 *
 * **Miroir CJS** de `allowedMapIdsFromAffiliation` (`src/utils/mapAffiliation.js`, ESM,
 * consommé par le bundle Vite) : le front et le serveur doivent trancher à l'identique,
 * sinon une carte masquée dans l'UI resterait lisible par l'API (ou l'inverse, plus
 * pénible : une carte affichée dont toutes les lectures sont refusées). L'équivalence des
 * deux implémentations est vérifiée par `tests/map-scope-core.test.js`, qui importe le
 * module ESM et compare les deux sorties sur le même jeu de valeurs.
 *
 * @param {string|null|undefined} affiliation
 * @returns {string[]|null} `null` = non borné.
 */
function allowedMapIdsFromAffiliation(affiliation) {
  const normalized = String(affiliation || 'both').toLowerCase();
  if (normalized === 'n3') return ['n3'];
  if (normalized === 'foret') return ['foret'];
  if (normalized === 'both') return null;
  if (MAP_AFFILIATION_SLUG_RE.test(normalized)) return [normalized];
  return null;
}

/**
 * Intersection de deux périmètres, `null` valant « non borné » (élément neutre).
 *
 * Une intersection vide est ramenée à `[]` **volontairement conservée** : l'appelant doit
 * pouvoir distinguer « aucune carte commune » (configuration contradictoire : affiliation
 * `n3` dans un groupe borné à `foret`) de « non borné ». `lib/mapAccess.js` journalise ce
 * cas plutôt que de murer le compte.
 *
 * @param {string[]|null} a
 * @param {string[]|null} b
 * @returns {string[]|null}
 */
function intersectMapScopes(a, b) {
  if (a == null) return b == null ? null : uniqueIds(b);
  if (b == null) return uniqueIds(a);
  const right = new Set(uniqueIds(b));
  return uniqueIds(a).filter((id) => right.has(id));
}

/**
 * Comptes qui ne sont jamais bornés : session absente (visite publique, lecture anonyme —
 * le périmètre est un cloisonnement pédagogique entre classes, pas une fermeture du site),
 * profs (`teacher.access`, la même règle que `isTeacher` côté client) et rôle `admin`.
 *
 * @param {{ userId?: string|null, roleSlug?: string|null, permissions?: string[] }|null} auth
 */
function canBypassMapScope(auth) {
  if (!auth || auth.userId == null || auth.userId === '') return true;
  const permissions = Array.isArray(auth.permissions) ? auth.permissions : [];
  if (permissions.includes('teacher.access')) return true;
  return String(auth.roleSlug || '').toLowerCase() === 'admin';
}

/**
 * Périmètre hérité d'un groupe : son propre scope cartes, sinon celui de l'ancêtre le plus
 * proche qui en porte un. Un sous-groupe sans périmètre propre suit donc sa classe, mais un
 * sous-groupe qui en déclare un **n'est pas** élargi par le silence de son parent.
 *
 * @returns {string[]|null} `null` = ce groupe ne borne rien.
 */
function nearestGroupScope(groupId, parentOf, scopesByGroup) {
  const visited = new Set();
  let current = normalizeId(groupId);
  while (current && !visited.has(current)) {
    visited.add(current);
    const own = uniqueIds(scopesByGroup.get(current));
    if (own.length > 0) return own;
    current = parentOf.get(current) || null;
  }
  return null;
}

/**
 * Périmètre cartes issu des groupes d'un compte : union des périmètres de ses groupes
 * d'appartenance **directe** (les descendants, eux, élargissent la vue d'un responsable sur
 * des élèves — pas son propre accès aux cartes).
 *
 * Sémantique reprise telle quelle de `lib/groupScope.js` : **un groupe sans périmètre n'est
 * pas borné**, et comme les appartenances s'additionnent, un seul groupe sans périmètre
 * suffit à ne rien borner. C'est la lecture qui préserve l'existant — aucune installation
 * ne perd d'accès tant qu'aucun `group_scopes` n'est posé — et la seule cohérente avec le
 * filtrage d'élèves déjà en place (`NOT EXISTS (...) OR EXISTS (...)`).
 *
 * @param {object} params
 * @param {string[]} params.directGroupIds Groupes d'appartenance directe (actifs).
 * @param {Array<{id: string, parent_group_id?: string|null}>} params.groups Tous les groupes.
 * @param {Map<string, string[]>} params.scopesByGroup Périmètres cartes par groupe.
 * @returns {string[]|null} `null` = non borné.
 */
function resolveGroupMapScope({ directGroupIds = [], groups = [], scopesByGroup } = {}) {
  const seeds = uniqueIds(directGroupIds);
  // Aucun groupe : aucune restriction (visiteur inscrit en autonomie, compte hors classe).
  if (seeds.length === 0) return null;
  const scopes = scopesByGroup instanceof Map ? scopesByGroup : new Map();
  const parentOf = new Map();
  for (const row of Array.isArray(groups) ? groups : []) {
    const id = normalizeId(row?.id);
    if (!id) continue;
    parentOf.set(id, normalizeId(row?.parent_group_id));
  }
  const allowed = [];
  for (const groupId of seeds) {
    const scope = nearestGroupScope(groupId, parentOf, scopes);
    if (scope == null) return null;
    allowed.push(...scope);
  }
  return uniqueIds(allowed);
}

module.exports = {
  MAP_AFFILIATION_SLUG_RE,
  normalizeId,
  normalizeMapId,
  uniqueIds,
  allowedMapIdsFromAffiliation,
  intersectMapScopes,
  canBypassMapScope,
  nearestGroupScope,
  resolveGroupMapScope,
};
