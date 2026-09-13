'use strict';

/**
 * Périmètre d'accès aux cartes — côté serveur.
 *
 * Jusqu'ici, la restriction par carte n'existait qu'à l'affichage : `src/utils/appMapScope.js`
 * masquait les cartes hors affiliation, mais `GET /api/maps` renvoyait tout le catalogue et
 * aucune route portant un `map_id` ne vérifiait quoi que ce soit. Le périmètre de groupe
 * (`group_scopes.map_id`), lui, ne servait qu'à filtrer des **élèves** dans les stats.
 *
 * Ce module fait des deux une vraie borne de lecture : `getAllowedMapIdsForAuth()` calcule le
 * périmètre d'un compte, `requireMapAccess()` refuse (403) une requête qui cible une carte
 * hors périmètre. La décision elle-même est dans `lib/shared/mapScopeCore.js` (pur) ; ici on
 * ne fait que lire la base et mémoriser.
 *
 * Ce qui n'est **pas** borné, volontairement : les lectures sans session (visite publique,
 * plan public — le périmètre cloisonne des classes entre elles, il ne ferme pas le site) et
 * les comptes profs/admin.
 */

const { queryAll, queryOne, getGroupScopeWriteVersion } = require('../database');
const { getUserDirectGroupIds } = require('./groupScope');
const logger = require('./logger');
const {
  normalizeMapId,
  allowedMapIdsFromAffiliation,
  intersectMapScopes,
  canBypassMapScope,
  resolveGroupMapScope,
} = require('./shared/mapScopeCore');

/**
 * Cache du périmètre de groupe, invalidé par la version d'écriture du scope groupes
 * (`groups`, `group_members`, `group_scopes`…) — même mécanique que `lib/groupScope.js`,
 * dont ce module reprend la clé. Sans lui, chaque lecture gardée coûterait trois requêtes.
 */
const groupScopeCache = new Map();
const GROUP_SCOPE_CACHE_MAX = 500;

function cacheGet(key) {
  const hit = groupScopeCache.get(key);
  if (hit && hit.version === getGroupScopeWriteVersion()) return hit;
  return undefined;
}

function cacheSet(key, value) {
  if (groupScopeCache.size >= GROUP_SCOPE_CACHE_MAX) groupScopeCache.clear();
  groupScopeCache.set(key, { version: getGroupScopeWriteVersion(), value });
}

/** Vide le cache (tests, et bascule de base). */
function clearMapAccessCache() {
  groupScopeCache.clear();
}

/** Périmètres cartes déclarés, par groupe. Les lignes « projet seul » (map_id NULL) sont ignorées. */
async function fetchMapScopesByGroup() {
  const rows = await queryAll(
    'SELECT group_id, map_id FROM group_scopes WHERE map_id IS NOT NULL ORDER BY group_id ASC, map_id ASC',
  );
  const byGroup = new Map();
  for (const row of rows) {
    const groupId = normalizeMapId(row.group_id);
    const mapId = normalizeMapId(row.map_id);
    if (!groupId || !mapId) continue;
    if (!byGroup.has(groupId)) byGroup.set(groupId, []);
    byGroup.get(groupId).push(mapId);
  }
  return byGroup;
}

/** Arbre des groupes, réduit à ce dont l'héritage de périmètre a besoin. */
async function fetchGroupParents() {
  return queryAll('SELECT id, parent_group_id FROM `groups`');
}

/**
 * Périmètre cartes issu des groupes d'un compte.
 * @returns {Promise<string[]|null>} `null` = non borné.
 */
async function getGroupMapScopeForUser(userId) {
  const normalized = normalizeMapId(userId);
  if (!normalized) return null;
  const cacheKey = `mapScope:${normalized}`;
  const cached = cacheGet(cacheKey);
  // Copie défensive : les appelants filtrent et trient le tableau retourné.
  if (cached) return cached.value === null ? null : [...cached.value];
  const directGroupIds = await getUserDirectGroupIds(normalized);
  let scope = null;
  if (directGroupIds.length > 0) {
    const [groups, scopesByGroup] = await Promise.all([
      fetchGroupParents(),
      fetchMapScopesByGroup(),
    ]);
    scope = resolveGroupMapScope({ directGroupIds, groups, scopesByGroup });
  }
  cacheSet(cacheKey, scope);
  return scope === null ? null : [...scope];
}

/**
 * Périmètre cartes issu de l'affiliation individuelle (élèves seulement : la colonne n'a pas
 * de sens pour un prof, et `routes/rbac.js` ne la renseigne que pour `user_type = 'student'`).
 * @returns {Promise<string[]|null>} `null` = non borné.
 */
async function getAffiliationMapScope(auth) {
  if (String(auth?.userType || '') !== 'student') return null;
  const userId = normalizeMapId(auth?.userId);
  if (!userId) return null;
  const row = await queryOne('SELECT affiliation FROM users WHERE id = ? LIMIT 1', [userId]);
  return allowedMapIdsFromAffiliation(row?.affiliation);
}

/**
 * Cartes qu'un compte a le droit de consulter.
 *
 * @param {object|null} auth `req.auth` (ou `null` pour une lecture anonyme).
 * @returns {Promise<string[]|null>} `null` = non borné (aucun filtrage à appliquer).
 */
async function getAllowedMapIdsForAuth(auth) {
  if (canBypassMapScope(auth)) return null;
  const [groupScope, affiliationScope] = await Promise.all([
    getGroupMapScopeForUser(auth.userId),
    getAffiliationMapScope(auth),
  ]);
  const combined = intersectMapScopes(groupScope, affiliationScope);
  if (Array.isArray(combined) && combined.length === 0) {
    // Configuration contradictoire (affiliation « n3 » dans un groupe borné à « foret ») :
    // on ne mure pas le compte — le cadre pédagogique du groupe fait foi et l'anomalie est
    // journalisée pour que l'administrateur la corrige.
    logger.warn(
      { userId: auth.userId, groupScope, affiliationScope, msg: 'map_scope_conflict' },
      'Périmètre cartes vide : affiliation et périmètre de groupe incompatibles',
    );
    return groupScope;
  }
  return combined;
}

/**
 * @returns {Promise<boolean>} Vrai si `mapId` est dans le périmètre de `auth`.
 */
async function canAccessMapId(auth, mapId) {
  const normalized = normalizeMapId(mapId);
  if (!normalized) return true;
  const allowed = await getAllowedMapIdsForAuth(auth);
  if (allowed == null) return true;
  return allowed.includes(normalized);
}

/** Cartes visibles par `auth` dans une liste déjà chargée. */
function filterMapsByAllowedIds(maps, allowedMapIds) {
  if (allowedMapIds == null) return Array.isArray(maps) ? maps : [];
  const allowed = new Set(allowedMapIds);
  return (Array.isArray(maps) ? maps : []).filter((map) => allowed.has(normalizeMapId(map?.id)));
}

/** Corps de refus commun (403) : un seul message et un seul code pour tout le périmètre. */
const MAP_OUT_OF_SCOPE = Object.freeze({
  error: 'Cette carte est hors de votre périmètre',
  code: 'MAP_OUT_OF_SCOPE',
});

/**
 * Filtre carte d'une **liste** : combine la carte demandée et le périmètre du compte.
 *
 * Les deux cas comptent. Une lecture qui cible une carte hors périmètre est refusée ; une
 * lecture sans `map_id` — `GET /api/zones` renvoie sinon les zones de toutes les cartes —
 * doit être ramenée au périmètre, sans quoi la garde ne tiendrait qu'à l'omission d'un
 * paramètre.
 *
 * @param {object|null} auth
 * @param {unknown} requestedMapId
 * @returns {Promise<{forbidden: true} | {forbidden: false, mapIds: string[]|null}>}
 *   `mapIds === null` = aucune restriction à appliquer à la requête.
 */
async function resolveScopedMapFilter(auth, requestedMapId) {
  const mapId = normalizeMapId(requestedMapId);
  const allowed = await getAllowedMapIdsForAuth(auth);
  if (mapId) {
    if (allowed != null && !allowed.includes(mapId)) return { forbidden: true };
    return { forbidden: false, mapIds: [mapId] };
  }
  return { forbidden: false, mapIds: allowed };
}

/**
 * Middleware : refuse une requête qui cible une carte hors périmètre.
 *
 * Exige que `req.auth` soit déjà hydraté (`authenticate` en amont) ; sans session, la
 * requête passe — cf. l'en-tête du module. Une requête sans `map_id` passe aussi : elle ne
 * cible pas une carte, c'est à la route de filtrer sa réponse si elle en renvoie plusieurs.
 *
 * @param {(req: import('express').Request) => unknown} [readMapId]
 */
function requireMapAccess(readMapId = (req) => req.query?.map_id) {
  return async (req, res, next) => {
    try {
      const mapId = normalizeMapId(readMapId(req));
      if (!mapId) return next();
      if (await canAccessMapId(req.auth || null, mapId)) return next();
      return res.status(403).json(MAP_OUT_OF_SCOPE);
    } catch (err) {
      return next(err);
    }
  };
}

module.exports = {
  MAP_OUT_OF_SCOPE,
  clearMapAccessCache,
  getGroupMapScopeForUser,
  getAffiliationMapScope,
  getAllowedMapIdsForAuth,
  canAccessMapId,
  filterMapsByAllowedIds,
  resolveScopedMapFilter,
  requireMapAccess,
};
