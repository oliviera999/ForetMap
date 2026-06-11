'use strict';

/**
 * Cache mémoire des permissions par rôle (`getRolePermissions(roleId)`) — partagé entre
 * utilisateurs (clé = roleId), pour éviter la requête `role_permissions` à chaque requête
 * authentifiée (`buildAuthzPayload` via `hydrateAuthFromTokenClaims`).
 *
 * Sécurité-critique : l'invalidation DOIT être complète. Un précédent essai invalidait via
 * des hooks sur des helpers d'écriture précis ; il a été reverté car des chemins mutent les
 * tables RBAC en SQL direct (dédup, tests) sans passer par ces helpers → permissions périmées.
 * Ici on invalide au niveau de la COUCHE DONNÉES : tout `execute()` dont le SQL est une
 * écriture touchant une table RBAC incrémente un compteur de version global ; toute entrée de
 * cache taguée d'une version périmée est rechargée. La sur-invalidation (bump sur une écriture
 * RBAC non strictement liée à `role_permissions`) est SANS DANGER — elle ne fait que rater le
 * cache, jamais servir une valeur périmée.
 */

// Tables dont une écriture peut influer sur l'autorisation : on reste large (sur-invalidation sûre).
const RBAC_TABLES = ['role_permissions', 'user_roles', 'role_scopes', 'roles', 'permissions'];
const WRITE_VERB_RE = /^\s*(insert|update|delete|replace|truncate|alter|drop|create)\b/i;

let version = 0;
const rolePermissionsCache = new Map(); // String(roleId) -> { version, value }

function getRbacCacheVersion() {
  return version;
}

function bumpRbacCacheVersion() {
  version += 1;
  return version;
}

/** Vide le cache et incrémente la version (reset déterministe entre fichiers de test). */
function clearRbacCache() {
  rolePermissionsCache.clear();
  version += 1;
}

/**
 * Heuristique conservatrice : l'écriture touche-t-elle une table RBAC ?
 * @param {string} sql
 * @returns {boolean}
 */
function sqlTouchesRbacWrite(sql) {
  const text = String(sql || '');
  if (!WRITE_VERB_RE.test(text)) return false;
  const lower = text.toLowerCase();
  return RBAC_TABLES.some((t) => lower.includes(t));
}

/** Invalide le cache RBAC si le SQL est une écriture sur une table RBAC. */
function maybeInvalidateFromSql(sql) {
  if (sqlTouchesRbacWrite(sql)) bumpRbacCacheVersion();
}

/**
 * Lecture cachée des permissions d'un rôle. `loader` retourne le tableau de lignes.
 * Le tableau renvoyé est PARTAGÉ entre appelants : ne pas le muter (vérifié côté appelants
 * — `buildAuthzPayload`/`buildAutoProfilePromotionPayload` ne font que le parcourir).
 * @param {number|string} roleId
 * @param {() => Promise<Array>} loader
 * @returns {Promise<Array>}
 */
async function getCachedRolePermissions(roleId, loader) {
  const key = String(roleId);
  const cached = rolePermissionsCache.get(key);
  if (cached && cached.version === version) return cached.value;
  const versionAtRead = version;
  const value = await loader();
  // Ne mémorise que si aucune écriture RBAC n'a bumpé la version pendant la lecture (anti-périmé).
  if (version === versionAtRead) {
    rolePermissionsCache.set(key, { version: versionAtRead, value });
  }
  return value;
}

module.exports = {
  getRbacCacheVersion,
  bumpRbacCacheVersion,
  clearRbacCache,
  sqlTouchesRbacWrite,
  maybeInvalidateFromSql,
  getCachedRolePermissions,
};
