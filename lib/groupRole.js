const { queryAll, queryOne } = require('../database');
const {
  ensureRbacBootstrap,
  getRoleBySlug,
  getPrimaryRoleForUser,
  setPrimaryRole,
  syncStudentPrimaryRoleFromProgress,
} = require('./rbac');
const { getSettingValue } = require('./settings');
const { isVisitorLikeSlug } = require('./shared/visitorRoles');
// Extraits dans `lib/groupDefaultRole.js` (sans dépendance RBAC) pour que `lib/rbac.js` puisse
// lire les groupes imposants sans cycle. Ré-exportés ici : l'API du module ne bouge pas.
const {
  GROUP_DEFAULT_SAFE_PERMISSION_KEYS,
  isAllowedGroupDefaultRole,
  getAllowedGroupDefaultRole,
  getForcedRoleGroupForStudent,
} = require('./groupDefaultRole');

function isEleveRoleSlug(slug) {
  return String(slug || '')
    .toLowerCase()
    .startsWith('eleve_');
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
 *
 * Un groupe qui **impose** son profil (`force_default_role`, migration 265) passe devant tout
 * le reste : son profil est autoritaire, et non plus un simple plancher relevé ensuite par la
 * progression. Entre plusieurs groupes imposants, le profil le plus élevé l'emporte —
 * `lib/groupDefaultRole.js` les rend déjà triés.
 */
async function resolveDefaultRoleForStudent(userId) {
  await ensureRbacBootstrap();
  const forcedGroup = await getForcedRoleGroupForStudent(userId);
  if (forcedGroup) {
    return {
      roleId: forcedGroup.roleId,
      roleSlug: forcedGroup.roleSlug,
      roleDisplayName: forcedGroup.roleDisplayName,
      rank: forcedGroup.rank,
      source: 'group_forced',
      forced: true,
      groupId: forcedGroup.groupId,
      groupName: forcedGroup.groupName,
    };
  }
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
 * Pose le profil primaire élève dérivé de l'appartenance aux groupes (plancher).
 * Étage interne : le recalage sur les tâches validées est fait par
 * `syncStudentRoleFromGroups`, qui enveloppe cette fonction.
 *
 * Deux façons de forcer, qui lèvent les gardes anti-rétrogradation :
 * - `options.force` — geste délibéré d'un n3boss (« Appliquer à tous les membres ») ;
 * - un groupe qui **impose** son profil (`force_default_role`) : la résolution revient alors
 *   marquée `forced`, et le profil du groupe s'applique même en baisse, à chaque
 *   synchronisation, sans qu'il faille recliquer sur le bouton.
 *
 * Dans les deux cas un profil **hors échelle** (n3boss, admin, prof de classe, profil sur
 * mesure) reste protégé du forçage automatique : seul le geste explicite (`options.force`)
 * peut l'écraser. Un groupe ne rétrograde pas l'encadrant qui en est membre.
 * @param {string} userId
 * @param {{ force?: boolean, groupId?: string|null }} [options]
 */
async function applyGroupDefaultRoleForStudent(userId, options = {}) {
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
  // Profil imposé par un groupe : même levée de gardes que le bouton, mais rejouée à chaque
  // synchronisation. Le `custom_role_preserved` ci-dessous en reste exclu, à dessein.
  const forced = force || resolved.forced === true;
  const forcedByGroupId = resolved.forced === true ? (resolved.groupId ?? null) : null;

  if (!force && current && !isEleveRoleSlug(currentSlug) && !isVisitorLikeSlug(currentSlug)) {
    return {
      changed: false,
      reason: 'custom_role_preserved',
      currentRoleSlug: currentSlug,
      forced,
      forcedByGroupId,
    };
  }

  if (!force && currentSlug === resolvedSlug) {
    return { changed: false, currentRoleSlug: currentSlug, forced, forcedByGroupId };
  }

  // Ne pas rétrograder un profil élève (novice/avancé/chevronné) vers visiteur/personnel
  // quand on rattache un groupe sans accès n3beur (ex. import CSV + classe créée).
  if (!forced && isEleveRoleSlug(currentSlug) && isVisitorLikeSlug(resolvedSlug)) {
    return {
      changed: false,
      reason: 'eleve_preserved_over_visitor',
      currentRoleSlug: currentSlug,
      forced,
      forcedByGroupId,
    };
  }

  if (
    !forced &&
    isEleveRoleSlug(currentSlug) &&
    isEleveRoleSlug(resolvedSlug) &&
    Number(current?.rank || 0) > Number(resolved?.rank || 0)
  ) {
    return {
      changed: false,
      reason: 'progression_preserved',
      currentRoleSlug: currentSlug,
      forced,
      forcedByGroupId,
    };
  }

  await setPrimaryRole('student', userId, resolved.roleId);
  return {
    changed: true,
    roleSlug: resolvedSlug,
    previousRoleSlug: currentSlug || null,
    source: resolved.source,
    forced,
    forcedByGroupId,
  };
}

/** Profils dont le rattachement à un groupe n3beur déclenche un recalage par tâches validées. */
function isProgressionEligibleSlug(slug) {
  return isEleveRoleSlug(slug) || isVisitorLikeSlug(slug);
}

/**
 * Synchronise le profil primaire élève depuis l'appartenance aux groupes, puis **aligne le
 * palier sur le nombre de tâches validées**.
 *
 * Le profil par défaut du groupe n'est qu'un plancher : sans ce second étage, un compte
 * rattaché (ou re-synchronisé) repartait au palier du groupe — c'est ce qui remettait tous
 * les n3beurs au niveau novice — et un visiteur rejoignant un groupe n3beur n'obtenait jamais
 * le palier correspondant à ses tâches validées. Montée seule : un palier acquis n'est jamais
 * perdu ici (l'alignement strict passe par le recalcul manuel, cf. `lib/studentProgressionSync.js`).
 *
 * Ce second étage ne s'applique pas aux membres d'un groupe qui **impose** son profil : leur
 * profil est celui du groupe, point — c'est ce que règle `force_default_role`.
 *
 * @param {string} userId
 * @param {{ force?: boolean, groupId?: string|null }} [options]
 */
async function syncStudentRoleFromGroups(userId, options = {}) {
  const result = await applyGroupDefaultRoleForStudent(userId, options);
  if (result?.reason === 'not_student' || result?.reason === 'group_not_found') return result;
  // `force` = « appliquer le profil par défaut du groupe », action délibérée d'un n3boss :
  // elle ne se fait pas doubler par un recalage sur les tâches validées.
  if (options.force) return result;
  // Profil imposé par un groupe : c'est tout l'objet du réglage — le palier issu des tâches
  // validées ne vient pas le relever dans la foulée.
  if (result?.forced) return result;

  const alignOnJoin = await getSettingValue('rbac.progression_align_on_group_join', true);
  if (!alignOnJoin) return result;

  const currentSlug = String(result?.roleSlug || result?.currentRoleSlug || '').toLowerCase();
  if (!isProgressionEligibleSlug(currentSlug)) return result;

  const n3Groups = await getMemberN3beurGroups(userId);
  if (!n3Groups.length) return result;

  const progression = await syncStudentPrimaryRoleFromProgress(userId, null, null, {
    includeVisitorLike: true,
    allowOverAssignedCatchUp: false,
  });
  if (!progression?.changed) return result;
  return {
    ...result,
    changed: true,
    roleSlug: progression.currentRoleSlug,
    previousRoleSlug: result?.previousRoleSlug ?? currentSlug ?? null,
    progressionApplied: true,
    validatedTaskCount: progression.done ?? null,
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
  isProgressionEligibleSlug,
  applyGroupDefaultRoleForStudent,
  isAllowedGroupDefaultRole,
  getAllowedGroupDefaultRole,
  getForcedRoleGroupForStudent,
  GROUP_DEFAULT_SAFE_PERMISSION_KEYS,
  isN3beurGroup,
  getMemberN3beurGroups,
  resolveDefaultRoleForStudent,
  syncStudentRoleFromGroups,
  syncStudentRolesForGroupMembers,
  loadGroupWithDefaultRole,
  resolveRoleFromGroupRow,
};
