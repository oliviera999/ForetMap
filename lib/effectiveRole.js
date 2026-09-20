'use strict';

/**
 * Profil effectif d'un compte — **la** règle, écrite une fois.
 *
 * Deux notions, deux colonnes (migration 267) :
 *   - le profil **attribué** (`users.assigned_role_id`) : ce qu'un administrateur, un import
 *     ou la progression automatique a posé sur le compte ;
 *   - le profil **effectif** (`user_roles.is_primary = 1`) : ce que le compte peut faire,
 *     relu par l'hydratation de session et toutes les listes.
 *
 * Règle « le plus élevé l'emporte » (docs/reference/foretmap/comptes-roles-et-groupes.md) :
 *   1. un groupe actif qui **impose** son profil (`force_default_role`) l'emporte sur tout,
 *      pour ses membres élèves (`user_type = 'student'`) ; entre plusieurs groupes imposants,
 *      le profil le plus élevé ;
 *   2. sinon, le profil de rang le plus élevé entre le profil attribué et le profil par défaut
 *      de chacun des groupes actifs du compte — à rang égal, le profil attribué ;
 *   3. sans rien : le profil par défaut du type de compte (prof de classe / visiteur), qui est
 *      alors aussi posé comme profil attribué.
 *
 * Les profils du jeu Gnomes & Licornes (`gl_*`) ne sont jamais conférés par un groupe
 * ForetMap. Le recalcul est idempotent : il ne réécrit `user_roles` que si le profil effectif
 * change, et n'écrit jamais le profil attribué (sauf pour poser le défaut sur un compte qui
 * n'en a aucun).
 */

const { queryAll, queryOne, execute } = require('../database');
const {
  isGlRoleSlug,
  defaultRoleSlugForUserType,
  normalizeRoleSlug,
} = require('./shared/n3beurRolesCore');

const ROLE_FIELDS = 'id, slug, display_name, `rank`';

function rankOf(role) {
  const r = Number(role?.rank);
  return Number.isFinite(r) ? r : 0;
}

function toRoleView(row) {
  if (!row) return null;
  return {
    id: Number(row.id),
    slug: normalizeRoleSlug(row.slug),
    displayName: row.display_name ?? null,
    rank: rankOf(row),
  };
}

/**
 * Décision pure (testable sans base).
 *
 * @param {object} params
 * @param {string} params.userType 'student' | 'teacher'
 * @param {object|null} params.assigned ligne `roles` du profil attribué (ou `null`)
 * @param {Array<object>} params.conferred profils conférés par les groupes actifs :
 *   `{ id, slug, display_name, rank, group_id, group_name, force_default_role }`
 * @param {object|null} params.defaultRole ligne `roles` du profil par défaut du type
 * @returns {{ role: object, source: 'forced'|'assigned'|'group'|'default', groupId: string|null,
 *   groupName: string|null }|null}
 */
function pickEffectiveRole({ userType, assigned, conferred = [], defaultRole = null }) {
  const usable = (Array.isArray(conferred) ? conferred : []).filter(
    (row) => row && row.id != null && !isGlRoleSlug(row.slug),
  );
  const isStudent = String(userType || '').toLowerCase() === 'student';
  const forced = isStudent ? usable.filter((row) => Number(row.force_default_role) === 1) : [];
  if (forced.length > 0) {
    const best = forced.reduce((acc, row) =>
      rankOf(row) > rankOf(acc)
        ? row
        : rankOf(row) === rankOf(acc) && String(row.group_id) < String(acc.group_id)
          ? row
          : acc,
    );
    return {
      role: toRoleView(best),
      source: 'forced',
      groupId: String(best.group_id),
      groupName: best.group_name ?? null,
    };
  }
  let best = assigned
    ? { role: toRoleView(assigned), source: 'assigned', groupId: null, groupName: null }
    : null;
  for (const row of usable) {
    if (!best || rankOf(row) > best.role.rank) {
      best = {
        role: toRoleView(row),
        source: 'group',
        groupId: String(row.group_id),
        groupName: row.group_name ?? null,
      };
    }
  }
  if (!best && defaultRole) {
    best = { role: toRoleView(defaultRole), source: 'default', groupId: null, groupName: null };
  }
  return best;
}

async function loadRoleBySlug(slug) {
  return queryOne(`SELECT ${ROLE_FIELDS} FROM roles WHERE slug = ? LIMIT 1`, [slug]);
}

/** Profils conférés par les groupes actifs d'un compte (profil par défaut du groupe). */
async function loadConferredRoles(userId) {
  return queryAll(
    `SELECT r.id, r.slug, r.display_name, r.\`rank\`,
            g.id AS group_id, g.name AS group_name, g.force_default_role
       FROM group_members gm
       INNER JOIN \`groups\` g ON g.id = gm.group_id AND g.is_active = 1
       INNER JOIN roles r ON r.id = g.default_role_id
      WHERE gm.user_id = ?
      ORDER BY r.\`rank\` DESC, g.id ASC`,
    [String(userId)],
  );
}

/**
 * Résout le profil effectif d'un compte sans rien écrire.
 * @returns {Promise<null|{ userId: string, userType: string, isActive: boolean,
 *   assigned: object|null, conferred: object[], decision: object }>}
 */
async function resolveEffectiveRole(userId) {
  const id = String(userId || '').trim();
  if (!id) return null;
  const user = await queryOne(
    'SELECT id, user_type, is_active, assigned_role_id FROM users WHERE id = ? LIMIT 1',
    [id],
  );
  if (!user) return null;
  const userType = String(user.user_type || 'student').toLowerCase();
  const assigned = user.assigned_role_id
    ? await queryOne(`SELECT ${ROLE_FIELDS} FROM roles WHERE id = ? LIMIT 1`, [
        user.assigned_role_id,
      ])
    : null;
  const conferred = await loadConferredRoles(id);
  const defaultRole = assigned ? null : await loadRoleBySlug(defaultRoleSlugForUserType(userType));
  const decision = pickEffectiveRole({ userType, assigned, conferred, defaultRole });
  return {
    userId: id,
    userType,
    isActive: Number(user.is_active) !== 0,
    assigned: toRoleView(assigned),
    conferred: conferred
      .filter((row) => !isGlRoleSlug(row.slug))
      .map((row) => ({
        groupId: String(row.group_id),
        groupName: row.group_name ?? null,
        role: toRoleView(row),
        forced: Number(row.force_default_role) === 1,
      })),
    decision,
  };
}

/**
 * Recalcule et persiste le profil effectif d'un compte.
 * @returns {Promise<{ changed: boolean, reason?: string, userType?: string, roleId?: number,
 *   roleSlug?: string, roleRank?: number, roleDisplayName?: string|null, source?: string,
 *   groupId?: string|null, groupName?: string|null, previousRoleSlug?: string|null,
 *   assignedRoleSlug?: string|null }>}
 */
async function recomputeUserRole(userId) {
  // Import paresseux : `lib/rbac.js` dépend de ce module pour la progression.
  const rbac = require('./rbac');
  let resolved = await resolveEffectiveRole(userId);
  if (!resolved) return { changed: false, reason: 'not_found' };
  if (!resolved.assigned) {
    // Compte sans profil attribué mais avec un profil principal (données antérieures à la
    // migration 267, écriture directe de `user_roles`) : ce profil devient le profil attribué,
    // plutôt que de retomber sur le défaut du type.
    const legacy = await rbac.getPrimaryRoleForUser(resolved.userType, resolved.userId);
    if (legacy?.id && !isGlRoleSlug(legacy.slug)) {
      await execute(
        'UPDATE users SET assigned_role_id = ? WHERE id = ? AND assigned_role_id IS NULL',
        [legacy.id, resolved.userId],
      );
      resolved = await resolveEffectiveRole(userId);
    }
  }
  let { decision } = resolved;
  if (!decision)
    return { changed: false, reason: 'no_role_available', userType: resolved.userType };
  if (!resolved.assigned && decision.source === 'default') {
    // Un compte sans profil attribué reçoit le défaut de son type — une seule fois.
    await execute(
      'UPDATE users SET assigned_role_id = ? WHERE id = ? AND assigned_role_id IS NULL',
      [decision.role.id, resolved.userId],
    );
    resolved.assigned = decision.role;
    decision = { ...decision, source: 'assigned' };
  }
  const current = await rbac.getPrimaryRoleForUser(resolved.userType, resolved.userId);
  const changed = String(current?.id ?? '') !== String(decision.role.id);
  if (changed) {
    await rbac.setPrimaryRole(resolved.userType, resolved.userId, decision.role.id);
  }
  return {
    changed,
    userType: resolved.userType,
    roleId: decision.role.id,
    roleSlug: decision.role.slug,
    roleRank: decision.role.rank,
    roleDisplayName: decision.role.displayName,
    source: decision.source,
    groupId: decision.groupId,
    groupName: decision.groupName,
    previousRoleSlug: current?.slug ? normalizeRoleSlug(current.slug) : null,
    assignedRoleSlug: resolved.assigned?.slug ?? null,
  };
}

/** Recalcule le profil effectif de plusieurs comptes (identifiants dédupliqués). */
async function recomputeUsersRoles(userIds) {
  const ids = [...new Set((userIds || []).map((v) => String(v || '').trim()).filter(Boolean))];
  const results = [];
  for (const id of ids) {
    results.push({ userId: id, ...(await recomputeUserRole(id)) });
  }
  return results;
}

/** Recalcule le profil effectif de tous les membres d'un groupe (élèves et enseignants). */
async function recomputeGroupMembersRoles(groupId) {
  const rows = await queryAll('SELECT user_id FROM group_members WHERE group_id = ?', [
    String(groupId || '').trim(),
  ]);
  return recomputeUsersRoles(rows.map((row) => row.user_id));
}

/**
 * Pose le profil attribué d'un compte et recalcule son profil effectif. Aucune garde ici :
 * c'est `lib/rbacRoleAssignment.js` (`assignRole`) qui décide si l'acteur a le droit.
 * @param {string} userId
 * @param {number|null} roleId `null` = retour au profil par défaut du type de compte
 */
async function setAssignedRole(userId, roleId) {
  const id = String(userId);
  let nextRoleId = roleId == null ? null : Number(roleId);
  if (nextRoleId == null) {
    // « Aucun profil attribué » = retour explicite au défaut du type (et non adoption du
    // profil effectif courant, réservée aux données antérieures à la migration 267).
    const user = await queryOne('SELECT user_type FROM users WHERE id = ? LIMIT 1', [id]);
    if (!user) return { changed: false, reason: 'not_found' };
    const fallback = await loadRoleBySlug(defaultRoleSlugForUserType(user.user_type));
    nextRoleId = fallback?.id ?? null;
  }
  await execute('UPDATE users SET assigned_role_id = ?, updated_at = NOW() WHERE id = ?', [
    nextRoleId,
    id,
  ]);
  return recomputeUserRole(id);
}

/**
 * Vue « fiche » : profil attribué, profil effectif et groupes qui confèrent un profil.
 */
async function describeUserRoles(userId) {
  const rbac = require('./rbac');
  const resolved = await resolveEffectiveRole(userId);
  if (!resolved) return null;
  const current = await rbac.getPrimaryRoleForUser(resolved.userType, resolved.userId);
  return {
    assigned: resolved.assigned,
    effective: current
      ? {
          id: Number(current.id),
          slug: normalizeRoleSlug(current.slug),
          displayName: current.display_name ?? null,
          rank: rankOf(current),
          source: resolved.decision?.source ?? null,
          groupId: resolved.decision?.groupId ?? null,
          groupName: resolved.decision?.groupName ?? null,
        }
      : null,
    conferring: resolved.conferred,
  };
}

module.exports = {
  pickEffectiveRole,
  resolveEffectiveRole,
  recomputeUserRole,
  recomputeUsersRoles,
  recomputeGroupMembersRoles,
  setAssignedRole,
  describeUserRoles,
};
