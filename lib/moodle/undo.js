'use strict';

/**
 * Annulation d'une exécution (section 12.3) : le journal `sync_actions` est rejoué **à l'envers**
 * dans une seule transaction. Règles :
 *  - I-1 : un compte créé par la synchronisation est **désactivé**, jamais supprimé ; son
 *    identité externe est conservée (sinon l'exécution suivante recréerait un doublon
 *    que l'unicité de l'e-mail refuserait).
 *  - Un groupe ou une classe G&L créés par l'exécution sont supprimés s'ils sont vides
 *    après annulation, sinon désactivés.
 *  - Un groupe ou une classe seulement **désactivés** gardent leur lien `external_groups` :
 *    l'exécution suivante les réactive au lieu d'en créer un second (CDG-34).
 *  - Un compte marqué `sync_exempt` entre-temps n'est pas touché (listé dans `skippedExempt`).
 *  - Les écritures sortantes (cohortes Moodle, groupes de cours des miroirs d'équipes) sont
 *    inversées **après** la transaction, si un client est disponible ; sinon elles sont
 *    listées comme non annulées.
 *  - L'annulation prend le même verrou qu'une exécution (CDG-51).
 */

const { withTransaction, queryAll, queryOne, execute } = require('../../database');
const logger = require('../logger');
const { recomputeUserRole } = require('../effectiveRole');
const { refreshMembersHash } = require('./journal');
const { httpError } = require('../shared/httpError');

const USER_BOUND_KINDS = new Set([
  'user.create',
  'user.link',
  'user.deactivate',
  'user.reactivate',
  'group.member.add',
  'group.member.adopt',
  'group.member.remove',
]);

function userIdOf(action, before, after) {
  if (action.kind.startsWith('user.')) return String(action.target_id);
  return String(after.userId || before.userId || '');
}

async function isExemptUser(tx, userId, ctx) {
  if (!userId) return false;
  if (!ctx.exemptCache.has(userId)) {
    const row = await tx.queryOne('SELECT sync_exempt FROM users WHERE id = ? LIMIT 1', [userId]);
    ctx.exemptCache.set(userId, Number(row?.sync_exempt) === 1);
  }
  return ctx.exemptCache.get(userId);
}

function parseJson(text, fallback = null) {
  if (text == null || text === '') return fallback;
  if (typeof text === 'object') return text;
  try {
    return JSON.parse(text);
  } catch {
    return fallback;
  }
}

async function undoOne(tx, action, ctx) {
  const before = parseJson(action.before_json, {}) || {};
  const after = parseJson(action.after_json, {}) || {};
  if (USER_BOUND_KINDS.has(action.kind)) {
    const userId = userIdOf(action, before, after);
    if (await isExemptUser(tx, userId, ctx)) {
      ctx.skippedExempt.add(userId);
      return false;
    }
  }
  switch (action.kind) {
    case 'user.create': {
      const userId = String(action.target_id);
      await tx.execute('UPDATE users SET is_active = 0, updated_at = NOW() WHERE id = ?', [userId]);
      ctx.deactivatedCreated += 1;
      ctx.touchedUserIds.add(userId);
      return true;
    }
    case 'user.link': {
      const userId = String(action.target_id);
      await tx.execute(
        'UPDATE users SET email = ?, first_name = ?, last_name = ?, auth_provider = ?, updated_at = NOW() WHERE id = ?',
        [
          before.email ?? null,
          before.firstName ?? null,
          before.lastName ?? null,
          before.authProvider || 'local',
          userId,
        ],
      );
      if (after.identity?.id) {
        await tx.execute('DELETE FROM external_identities WHERE id = ?', [
          Number(after.identity.id),
        ]);
      }
      return true;
    }
    case 'user.deactivate': {
      await tx.execute('UPDATE users SET is_active = 1, updated_at = NOW() WHERE id = ?', [
        String(action.target_id),
      ]);
      ctx.touchedUserIds.add(String(action.target_id));
      return true;
    }
    case 'user.reactivate': {
      await tx.execute('UPDATE users SET is_active = 0, updated_at = NOW() WHERE id = ?', [
        String(action.target_id),
      ]);
      ctx.touchedUserIds.add(String(action.target_id));
      return true;
    }
    case 'group.ensure': {
      const groupId = String(action.target_id);
      if (after.reactivated) {
        await tx.execute('UPDATE `groups` SET is_active = 0, updated_at = NOW() WHERE id = ?', [
          groupId,
        ]);
        return true;
      }
      const remaining = await tx.queryOne(
        'SELECT COUNT(*) AS c FROM group_members WHERE group_id = ?',
        [groupId],
      );
      const linkedClass = await tx.queryOne(
        'SELECT id FROM gl_classes WHERE foretmap_group_id = ? LIMIT 1',
        [groupId],
      );
      if (Number(remaining?.c || 0) === 0 && !linkedClass) {
        if (after.externalGroupId) {
          await tx.execute('DELETE FROM external_groups WHERE id = ?', [
            Number(after.externalGroupId),
          ]);
          ctx.removedExternalGroupIds.add(Number(after.externalGroupId));
        }
        await tx.execute('DELETE FROM `groups` WHERE id = ?', [groupId]);
      } else {
        // Groupe encore peuplé : désactivé, et son lien à la cohorte conservé pour que
        // l'exécution suivante le réactive au lieu d'en créer un second (CDG-34).
        await tx.execute('UPDATE `groups` SET is_active = 0, updated_at = NOW() WHERE id = ?', [
          groupId,
        ]);
      }
      return true;
    }
    case 'group.rename': {
      await tx.execute('UPDATE `groups` SET name = ?, updated_at = NOW() WHERE id = ?', [
        String(before.name || '').slice(0, 180),
        String(action.target_id),
      ]);
      const eg = await tx.queryOne('SELECT id FROM external_groups WHERE group_id = ? LIMIT 1', [
        String(action.target_id),
      ]);
      if (eg)
        await tx.execute(
          'UPDATE external_groups SET external_name = ?, updated_at = NOW() WHERE id = ?',
          [before.name || null, eg.id],
        );
      return true;
    }
    case 'gl_class.ensure': {
      const classId = Number(action.target_id);
      if (after.reactivated) {
        await tx.execute('UPDATE gl_classes SET is_active = 0, updated_at = NOW() WHERE id = ?', [
          classId,
        ]);
        return true;
      }
      const players = await tx.queryOne('SELECT COUNT(*) AS c FROM gl_players WHERE class_id = ?', [
        classId,
      ]);
      if (Number(players?.c || 0) === 0) {
        await tx.execute(
          'UPDATE external_groups SET gl_class_id = NULL, updated_at = NOW() WHERE gl_class_id = ?',
          [classId],
        );
        await tx.execute('DELETE FROM gl_classes WHERE id = ?', [classId]);
      } else {
        // Classe encore peuplée : désactivée, lien conservé (réactivée à l'exécution suivante).
        await tx.execute('UPDATE gl_classes SET is_active = 0, updated_at = NOW() WHERE id = ?', [
          classId,
        ]);
      }
      return true;
    }
    case 'group.member.add': {
      const { groupId, userId, externalGroupId } = after;
      if (!groupId || !userId) return false;
      if (!before.inGroup) {
        await tx.execute('DELETE FROM group_members WHERE group_id = ? AND user_id = ?', [
          String(groupId),
          String(userId),
        ]);
      }
      if (externalGroupId) {
        await tx.execute(
          'DELETE FROM external_group_members WHERE external_group_id = ? AND user_id = ?',
          [Number(externalGroupId), String(userId)],
        );
        ctx.externalGroupIds.add(Number(externalGroupId));
      }
      ctx.touchedUserIds.add(String(userId));
      return true;
    }
    case 'group.member.adopt': {
      const { userId, externalGroupId } = after;
      if (externalGroupId && userId) {
        await tx.execute(
          'DELETE FROM external_group_members WHERE external_group_id = ? AND user_id = ?',
          [Number(externalGroupId), String(userId)],
        );
        ctx.externalGroupIds.add(Number(externalGroupId));
      }
      return true;
    }
    case 'group.member.remove': {
      const { groupId, userId, externalGroupId, source } = before;
      if (!userId) return false;
      if (after.removedFromGroup && groupId) {
        const user = await tx.queryOne('SELECT user_type FROM users WHERE id = ? LIMIT 1', [
          String(userId),
        ]);
        if (user) {
          await tx.execute(
            `INSERT INTO group_members (group_id, user_id, user_type) VALUES (?, ?, ?)
             ON DUPLICATE KEY UPDATE user_type = user_type`,
            [String(groupId), String(userId), user.user_type || 'student'],
          );
        }
      }
      if (externalGroupId) {
        const eg = await tx.queryOne('SELECT id FROM external_groups WHERE id = ? LIMIT 1', [
          Number(externalGroupId),
        ]);
        if (eg) {
          await tx.execute(
            `INSERT INTO external_group_members (external_group_id, user_id, source, synced_at) VALUES (?, ?, ?, NOW())
             ON DUPLICATE KEY UPDATE source = VALUES(source)`,
            [Number(externalGroupId), String(userId), source === 'manual' ? 'manual' : 'sync'],
          );
          ctx.externalGroupIds.add(Number(externalGroupId));
        }
      }
      ctx.touchedUserIds.add(String(userId));
      return true;
    }
    case 'gl_player.ensure': {
      const playerId = Number(action.target_id);
      try {
        await tx.execute('DELETE FROM gl_players WHERE id = ?', [playerId]);
      } catch (error) {
        // Contributions de jeu déjà rattachées (FK RESTRICT) : on désactive au lieu de supprimer.
        if (error?.errno === 1451 || error?.code === 'ER_ROW_IS_REFERENCED_2') {
          await tx.execute('UPDATE gl_players SET is_active = 0, updated_at = NOW() WHERE id = ?', [
            playerId,
          ]);
        } else {
          throw error;
        }
      }
      return true;
    }
    case 'gl_player.move': {
      await tx.execute(
        'UPDATE gl_players SET class_id = ?, team_id = ?, updated_at = NOW() WHERE id = ?',
        [
          Number(before.classId),
          before.teamId == null ? null : Number(before.teamId),
          Number(action.target_id),
        ],
      );
      return true;
    }
    case 'cohort.member.add':
    case 'cohort.member.remove':
    case 'course_group.create':
    case 'course_group.rename':
    case 'course_group.delete':
    case 'course_group.member.add':
    case 'course_group.member.remove':
      // Sortants : inversés hors transaction, ci-dessous.
      ctx.outbound.push(action);
      return true;
    default:
      ctx.unknown.push(action.kind);
      return false;
  }
}

/**
 * @param {number} runId
 * @param {{ actorUserId?: string|null, client?: object|null, log?: object }} [options]
 */
/** Inverse une écriture sortante ; lève si Moodle refuse. */
async function revertOutbound(client, a) {
  const before = parseJson(a.before_json, {}) || {};
  const after = parseJson(a.after_json, {}) || {};
  switch (a.kind) {
    case 'cohort.member.add':
    case 'cohort.member.remove': {
      const [cohortid, userid] = String(a.target_id).split(':');
      const members = [{ cohortid: Number(cohortid), userid: Number(userid) }];
      if (a.kind === 'cohort.member.add') await client.deleteCohortMembers(members);
      else await client.addCohortMembers(members);
      return;
    }
    case 'course_group.create':
      await client.deleteGroups([Number(a.target_id)]);
      return;
    case 'course_group.rename':
      await client.updateGroups([
        { id: Number(a.target_id), name: before.name, idnumber: after.idnumber },
      ]);
      return;
    case 'course_group.delete':
      throw new Error('groupe de cours supprimé : non recréé (membres perdus côté Moodle)');
    case 'course_group.member.add':
    case 'course_group.member.remove': {
      const [groupid, userid] = String(a.target_id).split(':');
      const members = [{ groupid: Number(groupid), userid: Number(userid) }];
      if (a.kind === 'course_group.member.add') await client.deleteGroupMembers(members);
      else await client.addGroupMembers(members);
      return;
    }
    default:
      throw new Error(`écriture sortante inconnue (${a.kind})`);
  }
}

async function undoRun(runId, { actorUserId = null, client = null, log = logger } = {}) {
  // Même verrou qu'une exécution : pas d'annulation pendant une synchronisation, ni deux
  // annulations concurrentes (CDG-51).
  const { acquireLock, releaseLock } = require('./syncRun');
  await acquireLock();
  try {
    return await undoRunLocked(runId, { actorUserId, client, log });
  } finally {
    releaseLock();
  }
}

async function undoRunLocked(runId, { actorUserId, client, log }) {
  const run = await queryOne('SELECT * FROM sync_runs WHERE id = ? LIMIT 1', [Number(runId)]);
  if (!run) throw httpError(404, 'Exécution introuvable');
  if (run.mode !== 'apply') throw httpError(409, 'Seule une exécution réelle peut être annulée');
  if (run.status === 'undone') throw httpError(409, 'Exécution déjà annulée');
  if (run.status === 'running') throw httpError(409, 'Exécution en cours');
  if (String(run.scope_json || '').includes('"kind":"account_merge"')) {
    throw httpError(
      409,
      'Une fusion de comptes ne s’annule pas : la restaurer depuis une sauvegarde',
    );
  }
  const later = await queryOne(
    `SELECT id FROM sync_runs
      WHERE mode = 'apply' AND status IN ('succeeded','failed') AND id > ?
        AND (scope_json IS NULL OR scope_json NOT LIKE '%"kind":"account_merge"%')
      LIMIT 1`,
    [Number(runId)],
  );
  if (later) {
    throw httpError(
      409,
      `Une exécution réelle plus récente (#${later.id}) existe : annuler d’abord la plus récente`,
    );
  }
  const actions = await queryAll(
    'SELECT * FROM sync_actions WHERE run_id = ? AND undone_at IS NULL ORDER BY seq DESC',
    [Number(runId)],
  );

  const ctx = {
    deactivatedCreated: 0,
    touchedUserIds: new Set(),
    externalGroupIds: new Set(),
    removedExternalGroupIds: new Set(),
    skippedExempt: new Set(),
    exemptCache: new Map(),
    outbound: [],
    unknown: [],
  };
  let undone = 0;
  await withTransaction(async (tx) => {
    for (const action of actions) {
      const ok = await undoOne(tx, action, ctx);
      if (ok) {
        await tx.execute('UPDATE sync_actions SET undone_at = NOW() WHERE id = ?', [
          Number(action.id),
        ]);
        undone += 1;
      }
    }
    for (const egId of ctx.externalGroupIds) {
      if (ctx.removedExternalGroupIds.has(egId)) continue;
      const exists = await tx.queryOne('SELECT id FROM external_groups WHERE id = ? LIMIT 1', [
        egId,
      ]);
      if (exists) await refreshMembersHash(tx, egId);
    }
    await tx.execute(
      `UPDATE sync_runs SET status = 'undone', error_text = CONCAT(COALESCE(error_text, ''), ?) WHERE id = ?`,
      [
        ` | annulée le ${new Date().toISOString()}${actorUserId ? ` par ${actorUserId}` : ''}`,
        Number(runId),
      ],
    );
  });

  for (const userId of ctx.touchedUserIds) {
    try {
      await recomputeUserRole(userId);
    } catch (error) {
      log.warn({ err: error }, 'Recalcul du rôle élève après annulation en échec');
    }
  }

  // Décision sur un rapprochement annulée : la ligne redevient « à trancher ».
  const scope = parseJson(run.scope_json, {}) || {};
  if (scope.kind === 'pending_match' && scope.pendingMatchId && undone > 0) {
    const { reopenPendingMatch } = require('./pendingMatches');
    await reopenPendingMatch(scope.pendingMatchId);
  }

  const outbound = { reverted: 0, skipped: [] };
  if (ctx.outbound.length) {
    if (!client) {
      outbound.skipped = ctx.outbound.map((a) => ({
        kind: a.kind,
        targetId: a.target_id,
        reason: 'client_indisponible',
      }));
    } else {
      for (const a of ctx.outbound) {
        try {
          await revertOutbound(client, a);
          outbound.reverted += 1;
        } catch (error) {
          outbound.skipped.push({ kind: a.kind, targetId: a.target_id, reason: error.message });
        }
      }
    }
  }

  await execute(
    `UPDATE sync_runs SET totals_json = JSON_SET(COALESCE(totals_json, '{}'), '$.undone', ?) WHERE id = ?`,
    [undone, Number(runId)],
  );
  log.info(
    {
      moodleRunId: Number(runId),
      undone,
      deactivatedCreated: ctx.deactivatedCreated,
      skippedExempt: ctx.skippedExempt.size,
    },
    'Exécution Moodle annulée',
  );
  return {
    runId: Number(runId),
    undone,
    total: actions.length,
    deactivatedCreated: ctx.deactivatedCreated,
    skippedExempt: [...ctx.skippedExempt],
    outbound,
    unknownKinds: [...new Set(ctx.unknown)],
  };
}

module.exports = { undoRun };
