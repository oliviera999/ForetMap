'use strict';

/**
 * Recalcul du profil n3beur d'après le nombre de tâches validées — en masse ou individuellement.
 *
 * Complète les deux déclencheurs automatiques existants (validation d'une tâche, rattachement à
 * un groupe n3beur) par une opération explicite de rattrapage côté n3boss : « attribuer le profil
 * qui correspond au nombre de tâches réalisées » pour tout le monde, pour un groupe, ou pour un
 * compte. Sert à réparer un parc de profils désaligné (paliers remis à plat, seuils modifiés
 * après coup, comptes importés).
 *
 * Périmètre : uniquement les comptes élèves actifs **membres d'au moins un groupe n3beur** (le
 * groupe est ce qui ouvre l'accès aux tâches). Les profils hors échelle n3beur (n3boss, admin,
 * MJ, prof de classe, profil maison) ne sont jamais touchés — c'est `syncStudentPrimaryRoleFromProgress`
 * qui refuse, et le compte est reporté en « ignoré » avec son motif.
 */

const { queryAll, queryOne } = require('../database');
const {
  getStudentProgressionConfig,
  syncStudentPrimaryRoleFromProgress,
  countValidatedAssignmentsForStudent,
} = require('./rbac');

/** Élèves actifs membres d'au moins un groupe actif conférant l'accès n3beur. */
const N3BEUR_MEMBERS_SQL = `
  SELECT DISTINCT u.id, u.first_name, u.last_name, r.slug AS role_slug,
         r.display_name AS role_display_name
    FROM users u
    INNER JOIN group_members gm ON gm.user_id = u.id AND gm.user_type = 'student'
    INNER JOIN \`groups\` g ON g.id = gm.group_id AND g.is_active = 1
    LEFT JOIN roles gr ON gr.id = g.default_role_id
    LEFT JOIN user_roles ur ON ur.user_id = u.id AND ur.user_type = 'student' AND ur.is_primary = 1
    LEFT JOIN roles r ON r.id = ur.role_id
   WHERE u.user_type = 'student'
     AND u.is_active = 1
     AND (g.grants_n3beur_access = 1 OR gr.slug LIKE 'eleve\\_%')`;

const VALID_SCOPES = new Set(['all', 'group', 'user']);

function displayNameOf(row) {
  return (
    [row?.first_name, row?.last_name].filter(Boolean).join(' ').trim() || String(row?.id || '')
  );
}

/** Comptes concernés par un périmètre de recalcul. */
async function listProgressionCandidates({ scope, groupId = null, userId = null }) {
  if (scope === 'group') {
    return queryAll(
      `${N3BEUR_MEMBERS_SQL} AND g.id = ? ORDER BY u.last_name ASC, u.first_name ASC`,
      [String(groupId).trim()],
    );
  }
  if (scope === 'user') {
    return queryAll(
      `${N3BEUR_MEMBERS_SQL} AND u.id = ? ORDER BY u.last_name ASC, u.first_name ASC`,
      [String(userId).trim()],
    );
  }
  return queryAll(`${N3BEUR_MEMBERS_SQL} ORDER BY u.last_name ASC, u.first_name ASC`);
}

/**
 * Recalcule les profils d'un périmètre.
 *
 * @param {{scope: 'all'|'group'|'user', groupId?: string|null, userId?: string|null,
 *   allowDemotion?: boolean, dryRun?: boolean}} params
 * @returns {Promise<{ok: true, scope: string, dryRun: boolean, allowDemotion: boolean,
 *   scanned: number, changed: number, skipped: number, results: object[]}
 *   | {ok: false, status: number, error: string}>}
 */
async function recomputeStudentProfilesFromValidatedTasks(params = {}) {
  const scope = String(params.scope || 'all').trim();
  if (!VALID_SCOPES.has(scope)) {
    return { ok: false, status: 400, error: 'scope invalide (all, group ou user)' };
  }
  const groupId = params.groupId == null ? null : String(params.groupId).trim();
  const userId = params.userId == null ? null : String(params.userId).trim();
  if (scope === 'group' && !groupId) {
    return { ok: false, status: 400, error: 'group_id requis pour le périmètre « group »' };
  }
  if (scope === 'user' && !userId) {
    return { ok: false, status: 400, error: 'user_id requis pour le périmètre « user »' };
  }
  if (scope === 'group') {
    const group = await queryOne('SELECT id FROM `groups` WHERE id = ? LIMIT 1', [groupId]);
    if (!group) return { ok: false, status: 404, error: 'Groupe introuvable' };
  }
  if (scope === 'user') {
    const student = await queryOne(
      "SELECT id FROM users WHERE id = ? AND user_type = 'student' LIMIT 1",
      [userId],
    );
    if (!student) return { ok: false, status: 404, error: 'Élève introuvable' };
  }

  const allowDemotion = !!params.allowDemotion;
  const dryRun = !!params.dryRun;
  const candidates = await listProgressionCandidates({ scope, groupId, userId });

  // Un compte hors groupe n3beur (ou inactif) n'entre pas dans le périmètre : le dire
  // explicitement plutôt que de renvoyer un recalcul vide et silencieux.
  if (scope === 'user' && candidates.length === 0) {
    return {
      ok: true,
      scope,
      dryRun,
      allowDemotion,
      scanned: 0,
      changed: 0,
      skipped: 1,
      results: [
        {
          userId,
          displayName: null,
          changed: false,
          reason: 'not_n3beur_member',
          done: await countValidatedAssignmentsForStudent(userId),
          previousRoleSlug: null,
          roleSlug: null,
        },
      ],
    };
  }

  // Config lue une fois : évite N lectures de réglages sur un recalcul de parc entier.
  const config = await getStudentProgressionConfig();
  const results = [];
  for (const row of candidates) {
    const sync = await syncStudentPrimaryRoleFromProgress(row.id, null, config, {
      manual: true,
      allowDemotion,
      // Sans alignement strict, aucune baisse de palier : pas même le rattrapage d'un palier
      // attribué au-dessus du compteur réel, qui reste une rétrogradation vu du compte.
      allowOverAssignedCatchUp: allowDemotion,
      dryRun,
    });
    results.push({
      userId: row.id,
      displayName: displayNameOf(row),
      changed: !!sync.changed,
      reason: sync.reason || null,
      done: sync.done ?? null,
      previousRoleSlug: sync.changed ? sync.previousRoleSlug || row.role_slug || null : null,
      previousRoleDisplayName: sync.changed
        ? sync.previousRoleDisplayName || row.role_display_name || null
        : null,
      roleSlug: sync.currentRoleSlug || null,
      roleDisplayName: sync.currentRoleDisplayName || null,
    });
  }

  const changed = results.filter((r) => r.changed).length;
  return {
    ok: true,
    scope,
    dryRun,
    allowDemotion,
    scanned: results.length,
    changed,
    skipped: results.length - changed,
    results,
  };
}

module.exports = {
  N3BEUR_MEMBERS_SQL,
  listProgressionCandidates,
  recomputeStudentProfilesFromValidatedTasks,
};
