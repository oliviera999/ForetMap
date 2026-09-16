'use strict';

/**
 * Attribution du profil principal (rôle RBAC) à un compte — garde + application.
 *
 * Extrait de `PUT /api/rbac/users/:userType/:userId/role` (routes/rbac.js) pour être rejoué
 * à l'identique par l'attribution **en lot** (`POST /api/rbac/users/bulk-role`). Les règles
 * anti-escalade (seul un admin touche un admin, jamais le dernier administrateur) sont donc
 * écrites **une seule fois** : une action en lot ne peut pas contourner ce qu'une action
 * unitaire refuse.
 */

const { queryOne } = require('../database');
const { setPrimaryRole, getPrimaryRoleForUser } = require('./rbac');

/** Nombre d'administrateurs enseignants encore porteurs du rôle en primaire. */
async function countPrimaryAdmins() {
  const row = await queryOne(
    `SELECT COUNT(*) AS c
       FROM user_roles ur
       INNER JOIN roles r ON r.id = ur.role_id
      WHERE ur.is_primary = 1 AND ur.user_type = 'teacher' AND r.slug = 'admin'`,
  );
  return Number(row?.c || 0);
}

/**
 * Vérifie qu'un acteur peut attribuer `roleId` à un compte, sans rien écrire.
 *
 * @param {object} params
 * @param {object} params.auth `req.auth` de l'acteur
 * @param {string} params.userType 'teacher' | 'student' (déjà résolu)
 * @param {string} params.userId identifiant `users.id` (déjà résolu)
 * @param {number} params.roleId profil visé
 * @param {{ slug?: string }} [params.nextRole] profil visé, s'il est déjà chargé
 * @returns {Promise<{ ok: true }|{ ok: false, status: number, error: string }>}
 */
async function checkRoleAssignmentAllowed({ auth, userType, userId, roleId, nextRole }) {
  const target =
    nextRole || (await queryOne('SELECT slug FROM roles WHERE id = ? LIMIT 1', [roleId]));
  const currentRole = await getPrimaryRoleForUser(userType, userId);
  const actorRoleSlug = String(auth?.roleSlug || '')
    .trim()
    .toLowerCase();
  if (actorRoleSlug !== 'admin' && (target?.slug === 'admin' || currentRole?.slug === 'admin')) {
    return {
      ok: false,
      status: 403,
      error: 'Seul un admin peut attribuer ou retirer le rôle admin',
    };
  }
  const leavingAdmin = currentRole?.slug === 'admin' && target?.slug !== 'admin';
  if (leavingAdmin && (await countPrimaryAdmins()) <= 1) {
    return { ok: false, status: 409, error: 'Action refusée: dernier administrateur actif' };
  }
  return { ok: true };
}

/**
 * Applique l'attribution après contrôle. Ne valide pas l'existence du profil : l'appelant
 * l'a déjà fait (404 « Profil introuvable »).
 * @returns {Promise<{ ok: true }|{ ok: false, status: number, error: string }>}
 */
async function assignPrimaryRole({ auth, userType, userId, roleId, nextRole }) {
  const allowed = await checkRoleAssignmentAllowed({ auth, userType, userId, roleId, nextRole });
  if (!allowed.ok) return allowed;
  await setPrimaryRole(userType, userId, roleId);
  return { ok: true };
}

module.exports = { countPrimaryAdmins, checkRoleAssignmentAllowed, assignPrimaryRole };
