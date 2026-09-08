'use strict';

/**
 * Conflits de la comparaison à trois (section 9) : lecture et résolution.
 *
 * Résolutions (section 13) :
 *  - `keep_master`  : le maître a raison — pour une cohorte Moodle, ForetMap est ramené à l'état
 *                     Moodle (membre remis / retiré, nom rétabli) ;
 *  - `apply_other`  : le reflet a raison — l'écriture part vers Moodle (client requis) ;
 *  - `ignore`       : on s'aligne sur l'état courant de ForetMap **sans rien écrire**, et le
 *                     dernier état commun est recalculé pour ne plus signaler la divergence.
 */

const { queryAll, queryOne, withTransaction } = require('../../database');
const { syncStudentRoleFromGroups } = require('../groupRole');
const { PROVIDER } = require('./config');
const { refreshMembersHash } = require('./journal');

function httpError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function serialize(row) {
  return {
    id: Number(row.id),
    externalGroupId: Number(row.external_group_id),
    externalIdnumber: row.external_idnumber || null,
    externalName: row.external_name || null,
    externalId: row.external_id || null,
    groupId: row.group_id || null,
    groupName: row.group_name || null,
    master: row.master || 'moodle',
    userId: row.user_id || null,
    user: row.user_id
      ? {
          userId: row.user_id,
          displayName: row.user_display_name || null,
          email: row.user_email || null,
          pseudo: row.user_pseudo || null,
        }
      : null,
    kind: row.kind,
    moodleState: row.moodle_state || null,
    foretmapState: row.foretmap_state || null,
    detectedRunId: row.detected_run_id == null ? null : Number(row.detected_run_id),
    detectedAt: row.detected_at,
    resolvedAt: row.resolved_at,
    resolvedByUserId: row.resolved_by_user_id || null,
    resolution: row.resolution || null,
  };
}

const SELECT = `
  SELECT c.*, eg.external_idnumber, eg.external_name, eg.external_id, eg.group_id, eg.master,
         g.name AS group_name, u.display_name AS user_display_name, u.email AS user_email, u.pseudo AS user_pseudo
    FROM sync_conflicts c
    INNER JOIN external_groups eg ON eg.id = c.external_group_id
    LEFT JOIN \`groups\` g ON g.id = eg.group_id
    LEFT JOIN users u ON u.id = c.user_id`;

async function listConflicts({ includeResolved = false } = {}) {
  const rows = await queryAll(
    `${SELECT} WHERE eg.provider = ? ${includeResolved ? '' : 'AND c.resolved_at IS NULL'}
      ORDER BY c.detected_at DESC, c.id DESC LIMIT 500`,
    [PROVIDER],
  );
  return rows.map(serialize);
}

async function moodleUserIdFor(userId, issuer) {
  const row = await queryOne(
    'SELECT external_id FROM external_identities WHERE provider = ? AND issuer = ? AND user_id = ? LIMIT 1',
    [PROVIDER, issuer, String(userId)],
  );
  return row ? Number(row.external_id) : null;
}

/**
 * @param {number} id
 * @param {{ resolution: 'keep_master'|'apply_other'|'ignore', actorUserId?: string|null, client?: object|null }} args
 */
async function resolveConflict(id, { resolution, actorUserId = null, client = null }) {
  const row = await queryOne(`${SELECT} WHERE c.id = ? LIMIT 1`, [Number(id)]);
  if (!row) throw httpError(404, 'Conflit introuvable');
  if (row.resolved_at) throw httpError(409, 'Conflit déjà résolu');
  if (!['keep_master', 'apply_other', 'ignore'].includes(resolution))
    throw httpError(400, 'Résolution invalide');
  const eg = await queryOne('SELECT * FROM external_groups WHERE id = ? LIMIT 1', [
    Number(row.external_group_id),
  ]);
  if (!eg) throw httpError(409, 'Groupe externe disparu');
  const userId = row.user_id ? String(row.user_id) : null;
  const touched = [];

  if (resolution === 'apply_other') {
    if (!client)
      throw httpError(503, 'Intégration Moodle non configurée : impossible d’écrire vers Moodle');
    if (row.kind === 'name_changed') {
      throw httpError(
        409,
        'Renommer une cohorte Moodle depuis ForetMap n’est pas pris en charge : résoudre côté Moodle',
      );
    }
    if (!userId) throw httpError(409, 'Conflit sans compte : rien à pousser');
    const moodleUserId = await moodleUserIdFor(userId, eg.issuer);
    if (!moodleUserId)
      throw httpError(409, 'Ce compte n’a pas d’identité Moodle : impossible de pousser');
    if (row.kind === 'member_removed_on_mirror') {
      await client.deleteCohortMembers([
        { cohortid: Number(eg.external_id), userid: moodleUserId },
      ]);
    } else {
      await client.addCohortMembers([{ cohortid: Number(eg.external_id), userid: moodleUserId }]);
    }
  }

  await withTransaction(async (tx) => {
    if (resolution === 'keep_master') {
      if (row.kind === 'name_changed' && eg.group_id) {
        await tx.execute('UPDATE `groups` SET name = ?, updated_at = NOW() WHERE id = ?', [
          String(eg.external_name || '').slice(0, 180),
          eg.group_id,
        ]);
      } else if (row.kind === 'member_removed_on_mirror' && userId && eg.group_id) {
        const user = await tx.queryOne('SELECT user_type FROM users WHERE id = ? LIMIT 1', [
          userId,
        ]);
        if (user) {
          await tx.execute(
            `INSERT INTO group_members (group_id, user_id, user_type, role_in_group) VALUES (?, ?, ?, 'member')
             ON DUPLICATE KEY UPDATE role_in_group = role_in_group`,
            [eg.group_id, userId, user.user_type || 'student'],
          );
          await tx.execute(
            `INSERT INTO external_group_members (external_group_id, user_id, source, synced_at) VALUES (?, ?, 'sync', NOW())
             ON DUPLICATE KEY UPDATE synced_at = NOW()`,
            [Number(eg.id), userId],
          );
          touched.push(userId);
        }
      } else if (row.kind === 'member_added_on_mirror' && userId && eg.group_id) {
        await tx.execute('DELETE FROM group_members WHERE group_id = ? AND user_id = ?', [
          eg.group_id,
          userId,
        ]);
        await tx.execute(
          'DELETE FROM external_group_members WHERE external_group_id = ? AND user_id = ?',
          [Number(eg.id), userId],
        );
        touched.push(userId);
      }
    } else if (resolution === 'apply_other' || resolution === 'ignore') {
      // L'état ForetMap devient le dernier état commun.
      if (userId) {
        if (row.kind === 'member_removed_on_mirror') {
          await tx.execute(
            'DELETE FROM external_group_members WHERE external_group_id = ? AND user_id = ?',
            [Number(eg.id), userId],
          );
        } else if (row.kind === 'member_added_on_mirror') {
          await tx.execute(
            `INSERT INTO external_group_members (external_group_id, user_id, source, synced_at) VALUES (?, ?, 'manual', NOW())
             ON DUPLICATE KEY UPDATE synced_at = NOW()`,
            [Number(eg.id), userId],
          );
        }
      }
      if (row.kind === 'name_changed' && resolution === 'ignore' && eg.group_id) {
        const g = await tx.queryOne('SELECT name FROM `groups` WHERE id = ? LIMIT 1', [
          eg.group_id,
        ]);
        if (g)
          await tx.execute(
            'UPDATE external_groups SET external_name = ?, updated_at = NOW() WHERE id = ?',
            [g.name, Number(eg.id)],
          );
      }
    }
    await refreshMembersHash(tx, Number(eg.id));
    await tx.execute(
      'UPDATE sync_conflicts SET resolved_at = NOW(), resolved_by_user_id = ?, resolution = ? WHERE id = ?',
      [actorUserId || null, resolution, Number(id)],
    );
  });

  for (const uid of touched) {
    try {
      await syncStudentRoleFromGroups(uid);
    } catch {
      // Le rôle sera recalculé à la prochaine exécution.
    }
  }
  const updated = await queryOne(`${SELECT} WHERE c.id = ? LIMIT 1`, [Number(id)]);
  return serialize(updated);
}

module.exports = { listConflicts, resolveConflict, serializeConflict: serialize };
