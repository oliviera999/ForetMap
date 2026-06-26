const { queryAll, queryOne } = require('../database');
const {
  ensureRbacBootstrap,
  getRoleBySlug,
  getPrimaryRoleForUser,
  setPrimaryRole,
} = require('./rbac');

const GROUP_DEFAULT_SAFE_PERMISSION_KEYS = [
  'tasks.propose',
  'tasks.assign_self',
  'tasks.unassign_self',
  'tasks.done_self',
];

function isEleveRoleSlug(slug) {
  return String(slug || '')
    .toLowerCase()
    .startsWith('eleve_');
}

function isAllowedGroupDefaultRole(row) {
  if (!row) return false;
  const slug = String(row.slug || row.default_role_slug || '')
    .trim()
    .toLowerCase();
  if (!slug || slug === 'admin' || slug === 'prof' || slug.startsWith('gl_')) return false;
  if (Number(row.unsafe_permission_count || 0) > 0) return false;
  if (slug === 'visiteur' || isEleveRoleSlug(slug)) return true;
  const rank = Number(row.rank ?? row.default_role_rank);
  return Number.isFinite(rank) && rank >= 0 && rank < 400;
}

async function getAllowedGroupDefaultRole(roleId) {
  const normalized = Number(roleId);
  if (!Number.isFinite(normalized) || normalized <= 0) return null;
  const safePlaceholders = GROUP_DEFAULT_SAFE_PERMISSION_KEYS.map(() => '?').join(', ');
  const role = await queryOne(
    `SELECT r.id, r.slug, r.display_name, r.rank,
            SUM(CASE
                  WHEN rp.permission_key IS NOT NULL
                   AND rp.permission_key NOT IN (${safePlaceholders})
                  THEN 1 ELSE 0
                END) AS unsafe_permission_count
       FROM roles r
       LEFT JOIN role_permissions rp ON rp.role_id = r.id
      WHERE r.id = ?
      GROUP BY r.id, r.slug, r.display_name, r.rank
      LIMIT 1`,
    [...GROUP_DEFAULT_SAFE_PERMISSION_KEYS, normalized],
  );
  return isAllowedGroupDefaultRole(role) ? role : null;
}

/**
 * Groupe n3beur : flag explicite OU profil par défaut eleve_*.
 */
function isN3beurGroup(groupRow) {
  if (!groupRow) return false;
  if (Number(groupRow.grants_n3beur_access) === 1) return true;
  const slug = String(groupRow.default_role_slug || '').toLowerCase();
  return isEleveRoleSlug(slug);
}

async function getMemberN3beurGroups(userId) {
  const rows = await queryAll(
    `SELECT g.id, g.name, g.grants_n3beur_access, g.default_role_id,
            r.id AS default_role_id_resolved, r.slug AS default_role_slug,
            r.rank AS default_role_rank, r.display_name AS default_role_display_name
       FROM group_members gm
       INNER JOIN \`groups\` g ON g.id = gm.group_id
       LEFT JOIN roles r ON r.id = g.default_role_id
      WHERE gm.user_id = ?
        AND gm.user_type = 'student'
        AND g.is_active = 1`,
    [String(userId).trim()],
  );
  return rows.filter(isN3beurGroup);
}

async function resolveRoleFromGroupRow(groupRow) {
  if (groupRow?.default_role_id_resolved) {
    const allowedRole = await getAllowedGroupDefaultRole(groupRow.default_role_id_resolved);
    if (allowedRole) {
      return {
        roleId: allowedRole.id,
        roleSlug: allowedRole.slug,
        roleDisplayName: allowedRole.display_name,
        rank: Number(allowedRole.rank || 0),
      };
    }
  }
  if (isN3beurGroup(groupRow)) {
    const novice = await getRoleBySlug('eleve_novice');
    return {
      roleId: novice?.id ?? null,
      roleSlug: novice?.slug ?? 'eleve_novice',
      roleDisplayName: novice?.display_name ?? 'n3beur novice',
      rank: Number(novice?.rank || 100),
    };
  }
  const visitor = await getRoleBySlug('visiteur');
  return {
    roleId: visitor?.id ?? null,
    roleSlug: visitor?.slug ?? 'visiteur',
    roleDisplayName: visitor?.display_name ?? 'Visiteur',
    rank: Number(visitor?.rank || 50),
  };
}

/**
 * Rôle ForetMap attendu pour un élève selon ses groupes actifs.
 */
async function resolveDefaultRoleForStudent(userId) {
  await ensureRbacBootstrap();
  const n3Groups = await getMemberN3beurGroups(userId);
  if (!n3Groups.length) {
    const visitor = await getRoleBySlug('visiteur');
    return {
      roleId: visitor?.id ?? null,
      roleSlug: visitor?.slug ?? 'visiteur',
      roleDisplayName: visitor?.display_name ?? 'Visiteur',
      rank: Number(visitor?.rank || 50),
      source: 'visitor',
    };
  }

  let best = null;
  for (const groupRow of n3Groups) {
    const role = await resolveRoleFromGroupRow(groupRow);
    if (!role.roleId) continue;
    if (!best || role.rank > best.rank) {
      best = { ...role, source: 'group', groupId: groupRow.id };
    }
  }

  if (!best) {
    const novice = await getRoleBySlug('eleve_novice');
    return {
      roleId: novice?.id ?? null,
      roleSlug: novice?.slug ?? 'eleve_novice',
      roleDisplayName: novice?.display_name ?? 'n3beur novice',
      rank: Number(novice?.rank || 100),
      source: 'group',
    };
  }

  return {
    roleId: best.roleId,
    roleSlug: best.roleSlug,
    roleDisplayName: best.roleDisplayName,
    rank: best.rank,
    source: best.source,
    groupId: best.groupId,
  };
}

async function loadGroupWithDefaultRole(groupId) {
  return queryOne(
    `SELECT g.*, r.id AS default_role_id_resolved, r.slug AS default_role_slug,
            r.rank AS default_role_rank, r.display_name AS default_role_display_name
       FROM \`groups\` g
       LEFT JOIN roles r ON r.id = g.default_role_id
      WHERE g.id = ?
      LIMIT 1`,
    [String(groupId).trim()],
  );
}

/**
 * Synchronise le profil primaire élève depuis l'appartenance aux groupes.
 * @param {string} userId
 * @param {{ force?: boolean, groupId?: string|null }} [options]
 */
async function syncStudentRoleFromGroups(userId, options = {}) {
  const { force = false, groupId = null } = options;
  await ensureRbacBootstrap();

  const user = await queryOne(
    "SELECT id FROM users WHERE id = ? AND user_type = 'student' AND is_active = 1 LIMIT 1",
    [String(userId).trim()],
  );
  if (!user) {
    return { changed: false, reason: 'not_student' };
  }

  const current = await getPrimaryRoleForUser('student', userId);
  const currentSlug = String(current?.slug || '').toLowerCase();

  let resolved;
  if (force && groupId) {
    const group = await loadGroupWithDefaultRole(groupId);
    if (!group) return { changed: false, reason: 'group_not_found' };
    const role = await resolveRoleFromGroupRow(group);
    resolved = {
      roleId: role.roleId,
      roleSlug: role.roleSlug,
      roleDisplayName: role.roleDisplayName,
      rank: role.rank,
      source: 'group_force',
    };
  } else {
    resolved = await resolveDefaultRoleForStudent(userId);
  }

  if (!resolved?.roleId) {
    return { changed: false, reason: 'no_role', currentRoleSlug: currentSlug || null };
  }

  const resolvedSlug = String(resolved.roleSlug || '').toLowerCase();

  if (!force && current && !isEleveRoleSlug(currentSlug) && currentSlug !== 'visiteur') {
    return {
      changed: false,
      reason: 'custom_role_preserved',
      currentRoleSlug: currentSlug,
    };
  }

  if (!force && currentSlug === resolvedSlug) {
    return { changed: false, currentRoleSlug: currentSlug };
  }

  if (
    !force &&
    isEleveRoleSlug(currentSlug) &&
    isEleveRoleSlug(resolvedSlug) &&
    Number(current?.rank || 0) > Number(resolved?.rank || 0)
  ) {
    return {
      changed: false,
      reason: 'progression_preserved',
      currentRoleSlug: currentSlug,
    };
  }

  await setPrimaryRole('student', userId, resolved.roleId);
  return {
    changed: true,
    roleSlug: resolvedSlug,
    previousRoleSlug: currentSlug || null,
    source: resolved.source,
  };
}

async function syncStudentRolesForGroupMembers(groupId, options = {}) {
  const rows = await queryAll(
    `SELECT gm.user_id
       FROM group_members gm
       INNER JOIN users u ON u.id = gm.user_id
      WHERE gm.group_id = ?
        AND gm.user_type = 'student'
        AND u.is_active = 1`,
    [String(groupId).trim()],
  );
  const results = [];
  for (const row of rows) {
    results.push({
      userId: row.user_id,
      ...(await syncStudentRoleFromGroups(row.user_id, options)),
    });
  }
  return results;
}

module.exports = {
  isEleveRoleSlug,
  isAllowedGroupDefaultRole,
  getAllowedGroupDefaultRole,
  isN3beurGroup,
  getMemberN3beurGroups,
  resolveDefaultRoleForStudent,
  syncStudentRoleFromGroups,
  syncStudentRolesForGroupMembers,
  loadGroupWithDefaultRole,
  resolveRoleFromGroupRow,
};
