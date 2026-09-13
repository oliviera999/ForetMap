'use strict';

/**
 * Application du plan (section 12.1, étapes 6 à 9) — lot M2.
 *
 *  - **Une transaction par cohorte** : un échec sur une cohorte annule ses écritures et laisse
 *    les autres intactes ; l'exécution est alors `failed` mais nommément, cohorte par cohorte.
 *  - Toutes les écritures passent par la connexion transactionnelle (`tx`) ; les helpers du
 *    dépôt qui travaillent sur le pool (`syncStudentRoleFromGroups`) sont rejoués **après**
 *    validation, pour ne pas attendre les verrous de la transaction en cours.
 *  - Chaque écriture est journalisée (`journal.js`) dans la même transaction.
 *  - Les écritures sortantes (`push_membership`) partent **après** les écritures locales.
 *  - Les empreintes `members_hash` / `members_json` sont recalculées en fin de cohorte.
 */

const crypto = require('node:crypto');
const { withTransaction, execute, queryOne } = require('../../database');
const logger = require('../logger');
const { syncStudentRoleFromGroups } = require('../groupRole');
const { getGameplaySettings } = require('../glSettings');
const { getDefaultVitalityFromSettings } = require('../glVitality');
const { PROVIDER } = require('./config');
const { createJournal, refreshMembersHash } = require('./journal');
const { slugify, createUserFromMember, linkUserToMember } = require('./writers');
const { sanitizePseudoBase } = require('../shared/pseudo');

const KIND_ORDER = [
  'group.ensure',
  'group.rename',
  'gl_class.ensure',
  'user.create',
  'user.link',
  'group.member.add',
  'group.member.adopt',
  'group.member.remove',
  'gl_player.ensure',
  'gl_player.move',
];

function orderActions(actions) {
  const rank = new Map(KIND_ORDER.map((k, i) => [k, i]));
  return [...actions].sort((a, b) => (rank.get(a.kind) ?? 99) - (rank.get(b.kind) ?? 99));
}

async function uniqueGroupSlug(db, base) {
  const root = (slugify(base) || 'groupe').slice(0, 80);
  let candidate = root;
  for (let i = 0; i < 50; i += 1) {
    const row = await db.queryOne('SELECT id FROM `groups` WHERE slug = ? LIMIT 1', [candidate]);
    if (!row) return candidate;
    candidate = `${root}-${i + 2}`;
  }
  return `${root}-${crypto.randomBytes(3).toString('hex')}`;
}

async function uniquePlayerPseudo(db, base) {
  const root = sanitizePseudoBase(base, 100).toLowerCase() || 'joueur';
  let candidate = root;
  for (let i = 0; i < 50; i += 1) {
    const row = await db.queryOne(
      'SELECT id FROM gl_players WHERE LOWER(pseudo) = LOWER(?) LIMIT 1',
      [candidate],
    );
    if (!row) return candidate;
    candidate = `${root}-${i + 2}`;
  }
  return `${root}-${crypto.randomBytes(2).toString('hex')}`;
}

/**
 * Contexte d'une cohorte pendant l'application : identifiants résolus au fil des écritures.
 */
function createCohortContext(cohort, eg) {
  return {
    cohort,
    externalGroupId: eg ? Number(eg.id) : null,
    groupId: eg?.group_id || null,
    glClassId: eg?.gl_class_id ? Number(eg.gl_class_id) : null,
    touchedUserIds: new Set(),
  };
}

async function ensureExternalGroupRow(tx, { issuer, cohort, ctx, policyKey }) {
  if (ctx.externalGroupId) {
    await tx.execute(
      `UPDATE external_groups SET external_idnumber = ?, external_name = ?, policy_key = ?, group_id = ?, updated_at = NOW()
        WHERE id = ?`,
      [cohort.idnumber, cohort.name, policyKey, ctx.groupId, ctx.externalGroupId],
    );
    return ctx.externalGroupId;
  }
  const result = await tx.execute(
    `INSERT INTO external_groups
       (provider, issuer, kind, external_id, external_idnumber, external_name, master, policy_key, group_id, gl_class_id)
     VALUES (?, ?, 'cohort', ?, ?, ?, 'moodle', ?, ?, ?)`,
    [
      PROVIDER,
      issuer,
      String(cohort.id),
      cohort.idnumber,
      cohort.name,
      policyKey,
      ctx.groupId,
      ctx.glClassId,
    ],
  );
  ctx.externalGroupId = Number(result.insertId);
  return ctx.externalGroupId;
}

async function applyGroupEnsure(tx, { action, ctx, local, journal, issuer }) {
  const { payload } = action;
  const groupId = crypto.randomUUID();
  const slug = await uniqueGroupSlug(tx, `moodle-${payload.idnumber}`);
  const defaultRoleId = payload.roleSlug
    ? (local.roleIdBySlug.get(String(payload.roleSlug)) ?? null)
    : null;
  await tx.execute(
    `INSERT INTO \`groups\`
       (id, slug, name, description, kind, parent_group_id, default_role_id, grants_n3beur_access, is_active, created_by)
     VALUES (?, ?, ?, ?, ?, NULL, ?, ?, 1, NULL)`,
    [
      groupId,
      slug,
      String(payload.name || payload.idnumber).slice(0, 180),
      `Groupe synchronisé depuis la cohorte Moodle ${payload.idnumber}`,
      payload.groupKind || 'class',
      defaultRoleId,
      payload.n3beur ? 1 : 0,
    ],
  );
  ctx.groupId = groupId;
  const externalGroupId = await ensureExternalGroupRow(tx, {
    issuer,
    cohort: ctx.cohort,
    ctx,
    policyKey: payload.policyKey,
  });
  await journal.record(tx, {
    kind: 'group.ensure',
    targetType: 'group',
    targetId: groupId,
    before: null,
    after: {
      groupId,
      slug,
      name: payload.name,
      kind: payload.groupKind,
      defaultRoleId,
      n3beur: Boolean(payload.n3beur),
      externalGroupId,
      cohort: ctx.cohort.idnumber,
    },
  });
}

async function applyGroupRename(tx, { action, ctx, journal }) {
  const { payload } = action;
  await tx.execute('UPDATE `groups` SET name = ?, updated_at = NOW() WHERE id = ?', [
    String(payload.to).slice(0, 180),
    payload.groupId,
  ]);
  if (ctx.externalGroupId) {
    await tx.execute(
      'UPDATE external_groups SET external_name = ?, updated_at = NOW() WHERE id = ?',
      [payload.to, ctx.externalGroupId],
    );
  }
  await journal.record(tx, {
    kind: 'group.rename',
    targetType: 'group',
    targetId: payload.groupId,
    before: { name: payload.from },
    after: { name: payload.to },
  });
}

async function applyGlClassEnsure(tx, { action, ctx, journal }) {
  const { payload } = action;
  if (!ctx.groupId) throw new Error(`Classe G&L ${payload.name} : groupe ForetMap absent`);
  const result = await tx.execute(
    `INSERT INTO gl_classes (name, school, created_by, is_active, foretmap_group_id, created_at, updated_at)
     VALUES (?, NULL, NULL, 1, ?, NOW(), NOW())`,
    [String(payload.name).slice(0, 180), ctx.groupId],
  );
  ctx.glClassId = Number(result.insertId);
  if (ctx.externalGroupId) {
    await tx.execute(
      'UPDATE external_groups SET gl_class_id = ?, updated_at = NOW() WHERE id = ?',
      [ctx.glClassId, ctx.externalGroupId],
    );
  }
  await journal.record(tx, {
    kind: 'gl_class.ensure',
    targetType: 'gl_class',
    targetId: ctx.glClassId,
    before: null,
    after: {
      glClassId: ctx.glClassId,
      name: payload.name,
      groupId: ctx.groupId,
      cohort: ctx.cohort.idnumber,
    },
  });
}

function resolveUserId(action, state) {
  if (action.userId) return String(action.userId);
  if (action.userRef && action.userRef.startsWith('ext:')) {
    return state.createdUsers.get(action.userRef.slice(4)) || null;
  }
  return null;
}

async function applyMemberAdd(tx, { action, ctx, state, journal }) {
  const userId = resolveUserId(action, state);
  if (!userId)
    throw new Error(
      `Membre ${action.externalId || action.userRef} : compte non créé (cohorte précédente en échec ?)`,
    );
  if (!ctx.groupId || !ctx.externalGroupId) throw new Error('Ajout de membre sans groupe résolu');
  const user = await tx.queryOne('SELECT user_type FROM users WHERE id = ? LIMIT 1', [userId]);
  const existing = await tx.queryOne(
    'SELECT role_in_group FROM group_members WHERE group_id = ? AND user_id = ? LIMIT 1',
    [ctx.groupId, userId],
  );
  if (!existing) {
    await tx.execute(
      `INSERT INTO group_members (group_id, user_id, user_type, role_in_group) VALUES (?, ?, ?, 'member')`,
      [ctx.groupId, userId, user?.user_type || 'student'],
    );
  }
  await tx.execute(
    `INSERT INTO external_group_members (external_group_id, user_id, source, synced_at)
     VALUES (?, ?, 'sync', NOW())
     ON DUPLICATE KEY UPDATE synced_at = NOW()`,
    [ctx.externalGroupId, userId],
  );
  ctx.touchedUserIds.add(userId);
  await journal.record(tx, {
    kind: 'group.member.add',
    targetType: 'group_member',
    targetId: `${ctx.groupId}:${userId}`,
    before: { inGroup: Boolean(existing) },
    after: {
      groupId: ctx.groupId,
      userId,
      externalGroupId: ctx.externalGroupId,
      source: 'sync',
      cohort: ctx.cohort.idnumber,
    },
  });
}

async function applyMemberAdopt(tx, { action, ctx, journal }) {
  const userId = String(action.userId);
  if (!ctx.externalGroupId) throw new Error('Adoption de membre sans groupe externe résolu');
  await tx.execute(
    `INSERT INTO external_group_members (external_group_id, user_id, source, synced_at)
     VALUES (?, ?, 'manual', NOW())
     ON DUPLICATE KEY UPDATE synced_at = NOW()`,
    [ctx.externalGroupId, userId],
  );
  await journal.record(tx, {
    kind: 'group.member.adopt',
    targetType: 'group_member',
    targetId: `${ctx.groupId}:${userId}`,
    before: { tracked: false },
    after: {
      groupId: ctx.groupId,
      userId,
      externalGroupId: ctx.externalGroupId,
      source: 'manual',
      cohort: ctx.cohort.idnumber,
    },
  });
}

async function applyMemberRemove(tx, { action, ctx, journal }) {
  const userId = String(action.userId);
  const { payload } = action;
  const groupId = payload.groupId || ctx.groupId;
  let removedFromGroup = false;
  if (!payload.keepMembership && groupId) {
    const result = await tx.execute(
      'DELETE FROM group_members WHERE group_id = ? AND user_id = ?',
      [groupId, userId],
    );
    removedFromGroup = Number(result.affectedRows || 0) > 0;
  }
  if (ctx.externalGroupId) {
    await tx.execute(
      'DELETE FROM external_group_members WHERE external_group_id = ? AND user_id = ?',
      [ctx.externalGroupId, userId],
    );
  }
  ctx.touchedUserIds.add(userId);
  await journal.record(tx, {
    kind: 'group.member.remove',
    targetType: 'group_member',
    targetId: `${groupId}:${userId}`,
    before: {
      groupId,
      userId,
      externalGroupId: ctx.externalGroupId,
      source: payload.source,
      inGroup: Boolean(payload.inGroup),
    },
    after: {
      removedFromGroup,
      keepMembership: Boolean(payload.keepMembership),
      cohort: ctx.cohort.idnumber,
    },
  });
}

async function applyPlayerEnsure(tx, { action, ctx, state, journal, vitality }) {
  const userId = resolveUserId(action, state);
  if (!userId)
    throw new Error(`Joueur G&L pour ${action.externalId || action.userRef} : compte non créé`);
  const classId = action.payload.glClassId || ctx.glClassId;
  if (!classId) throw new Error(`Joueur G&L pour ${userId} : classe non résolue`);
  const existing = await tx.queryOne(
    'SELECT id, class_id FROM gl_players WHERE linked_foretmap_user_id = ? LIMIT 1',
    [userId],
  );
  if (existing) return; // Idempotence : un joueur est apparu entre le plan et l'application.
  const user = await tx.queryOne(
    'SELECT pseudo, first_name, last_name FROM users WHERE id = ? LIMIT 1',
    [userId],
  );
  if (!user) throw new Error(`Joueur G&L : compte ${userId} introuvable`);
  const pseudo = await uniquePlayerPseudo(
    tx,
    user.pseudo || `${user.first_name}.${user.last_name}`.toLowerCase(),
  );
  const result = await tx.execute(
    `INSERT INTO gl_players
       (class_id, team_id, first_name, last_name, pseudo, linked_foretmap_user_id, is_active, health_points, power_points, created_at, updated_at)
     VALUES (?, NULL, ?, ?, ?, ?, 1, ?, ?, NOW(), NOW())`,
    [
      Number(classId),
      user.first_name || '',
      user.last_name || '',
      pseudo,
      userId,
      vitality.health,
      vitality.power,
    ],
  );
  await journal.record(tx, {
    kind: 'gl_player.ensure',
    targetType: 'gl_player',
    targetId: Number(result.insertId),
    before: null,
    after: {
      playerId: Number(result.insertId),
      classId: Number(classId),
      userId,
      pseudo,
      cohort: ctx.cohort.idnumber,
    },
  });
}

async function applyPlayerMove(tx, { action, ctx, journal }) {
  const { payload } = action;
  const toClassId = payload.toClassId || ctx.glClassId;
  if (!toClassId)
    throw new Error(`Déplacement du joueur ${payload.playerId} : classe cible non résolue`);
  const current = await tx.queryOne(
    'SELECT id, class_id, team_id FROM gl_players WHERE id = ? LIMIT 1',
    [Number(payload.playerId)],
  );
  if (!current) return;
  if (Number(current.class_id) === Number(toClassId)) return;
  await tx.execute(
    'UPDATE gl_players SET class_id = ?, team_id = NULL, updated_at = NOW() WHERE id = ?',
    [Number(toClassId), Number(payload.playerId)],
  );
  await journal.record(tx, {
    kind: 'gl_player.move',
    targetType: 'gl_player',
    targetId: Number(payload.playerId),
    before: {
      classId: Number(current.class_id),
      teamId: current.team_id == null ? null : Number(current.team_id),
    },
    after: {
      classId: Number(toClassId),
      teamId: null,
      userId: action.userId,
      cohort: ctx.cohort.idnumber,
    },
  });
}

async function applyUserDeactivate(tx, { action, journal }) {
  const userId = String(action.userId);
  const before = await tx.queryOne('SELECT is_active FROM users WHERE id = ? LIMIT 1', [userId]);
  if (!before || Number(before.is_active) !== 1) return;
  await tx.execute('UPDATE users SET is_active = 0, updated_at = NOW() WHERE id = ?', [userId]);
  await journal.record(tx, {
    kind: 'user.deactivate',
    targetType: 'user',
    targetId: userId,
    before: { isActive: 1 },
    after: { isActive: 0, reason: action.payload?.reason || null },
  });
}

async function applyCohortActions(
  tx,
  { cohort, actions, ctx, state, local, journal, issuer, vitality, snapshot },
) {
  for (const action of orderActions(actions)) {
    switch (action.kind) {
      case 'group.ensure':
        await applyGroupEnsure(tx, { action, ctx, local, journal, issuer });
        break;
      case 'group.rename':
        await applyGroupRename(tx, { action, ctx, journal });
        break;
      case 'gl_class.ensure':
        await applyGlClassEnsure(tx, { action, ctx, journal });
        break;
      case 'user.create': {
        const member = snapshot.users.get(String(action.externalId));
        if (!member) throw new Error(`Membre Moodle ${action.externalId} absent de la lecture`);
        const { userId } = await createUserFromMember(tx, {
          issuer,
          member,
          journal,
          cohort: cohort.idnumber,
        });
        state.createdUsers.set(String(action.externalId), userId);
        ctx.touchedUserIds.add(userId);
        break;
      }
      case 'user.link': {
        const member = snapshot.users.get(String(action.externalId));
        if (!member) throw new Error(`Membre Moodle ${action.externalId} absent de la lecture`);
        await linkUserToMember(tx, {
          issuer,
          member,
          userId: action.userId,
          rule: action.payload?.rule,
          journal,
          cohort: cohort.idnumber,
        });
        break;
      }
      case 'group.member.add':
        await applyMemberAdd(tx, { action, ctx, state, journal });
        break;
      case 'group.member.adopt':
        await applyMemberAdopt(tx, { action, ctx, journal });
        break;
      case 'group.member.remove':
        await applyMemberRemove(tx, { action, ctx, journal });
        break;
      case 'gl_player.ensure':
        await applyPlayerEnsure(tx, { action, ctx, state, journal, vitality });
        break;
      case 'gl_player.move':
        await applyPlayerMove(tx, { action, ctx, journal });
        break;
      default:
        throw new Error(`Action inconnue : ${action.kind}`);
    }
    state.actionsApplied += 1;
  }
  // Toute cohorte du périmètre laisse une ligne `external_groups` et une empreinte à jour,
  // même sans écriture (I-8 : l'exécution suivante saura que rien n'a bougé).
  if (!ctx.externalGroupId && ctx.groupId) {
    await ensureExternalGroupRow(tx, {
      issuer,
      cohort,
      ctx,
      policyKey: cohort.policy?.key || null,
    });
  }
  if (ctx.externalGroupId) {
    // Les identités vues dans cette cohorte : `last_seen_at`.
    const seen = cohort.memberIds.map(String);
    if (seen.length) {
      const placeholders = seen.map(() => '?').join(', ');
      await tx.execute(
        `UPDATE external_identities SET last_seen_at = NOW()
          WHERE provider = ? AND issuer = ? AND external_id IN (${placeholders})`,
        [PROVIDER, issuer, ...seen],
      );
    }
    await refreshMembersHash(tx, ctx.externalGroupId);
  }
}

/**
 * Écritures sortantes (`push_membership`) : après les écritures locales, jamais en transaction
 * (Moodle n'en a pas) ; chaque appel réussi est journalisé, chaque échec est rapporté.
 */
async function applyOutbound({ outbound, client, journal, failedCohortIds, log }) {
  const applied = [];
  const failed = [];
  const adds = outbound.filter(
    (o) => o.kind === 'cohort.member.add' && !failedCohortIds.has(o.cohortId),
  );
  const removes = outbound.filter(
    (o) => o.kind === 'cohort.member.remove' && !failedCohortIds.has(o.cohortId),
  );
  if (adds.length) {
    try {
      await client.addCohortMembers(
        adds.map((o) => ({ cohortid: o.cohortId, userid: o.payload.moodleUserId })),
      );
      for (const o of adds) {
        await journal.record(
          { execute },
          {
            kind: 'cohort.member.add',
            targetType: 'moodle_cohort_member',
            targetId: `${o.cohortId}:${o.payload.moodleUserId}`,
            before: { member: false },
            after: { member: true, userId: o.userId, cohort: o.cohort },
          },
        );
        applied.push(o);
      }
    } catch (error) {
      log.warn(
        { err: error, count: adds.length },
        'Ajouts sortants vers les cohortes Moodle en échec',
      );
      failed.push(...adds.map((o) => ({ ...o, error: error.message })));
    }
  }
  if (removes.length) {
    try {
      await client.deleteCohortMembers(
        removes.map((o) => ({ cohortid: o.cohortId, userid: o.payload.moodleUserId })),
      );
      for (const o of removes) {
        await journal.record(
          { execute },
          {
            kind: 'cohort.member.remove',
            targetType: 'moodle_cohort_member',
            targetId: `${o.cohortId}:${o.payload.moodleUserId}`,
            before: { member: true, userId: o.userId, cohort: o.cohort },
            after: { member: false },
          },
        );
        applied.push(o);
      }
    } catch (error) {
      log.warn(
        { err: error, count: removes.length },
        'Retraits sortants des cohortes Moodle en échec',
      );
      failed.push(...removes.map((o) => ({ ...o, error: error.message })));
    }
  }
  return { applied, failed };
}

/** Enregistre les conflits détectés par le plan (section 9) sans doublonner ceux déjà ouverts. */
async function persistConflicts({ runId, conflicts }) {
  let inserted = 0;
  for (const c of conflicts) {
    if (!c.externalGroupId) continue;
    const open = await queryOne(
      `SELECT id FROM sync_conflicts
        WHERE external_group_id = ? AND (user_id <=> ?) AND kind = ? AND resolved_at IS NULL LIMIT 1`,
      [Number(c.externalGroupId), c.userId || null, c.kind],
    );
    if (open) continue;
    await execute(
      `INSERT INTO sync_conflicts (external_group_id, user_id, kind, moodle_state, foretmap_state, detected_run_id)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        Number(c.externalGroupId),
        c.userId || null,
        c.kind,
        c.moodleState || null,
        c.foretmapState || null,
        runId,
      ],
    );
    inserted += 1;
  }
  return inserted;
}

/** Persiste les rapprochements en attente (section 8.1, règle 3) pour l'écran administrateur. */
async function persistPendingMatches({ runId, issuer, pendingMatches }) {
  let inserted = 0;
  for (const p of pendingMatches) {
    const externalId = String(p.member?.externalId || '');
    if (!externalId) continue;
    const existing = await queryOne(
      'SELECT id, resolved_at FROM sync_pending_matches WHERE provider = ? AND issuer = ? AND external_id = ? LIMIT 1',
      [PROVIDER, issuer, externalId],
    );
    if (existing && existing.resolved_at == null) {
      await execute(
        `UPDATE sync_pending_matches SET external_snapshot_json = ?, cohort_idnumber = ?, reason = ?, candidates_json = ?, detected_run_id = ?
          WHERE id = ?`,
        [
          JSON.stringify(p.member),
          p.cohort || null,
          p.reason,
          JSON.stringify(p.candidates || []),
          runId,
          existing.id,
        ],
      );
      continue;
    }
    if (existing) continue; // Déjà tranché par un administrateur : on ne rouvre pas.
    await execute(
      `INSERT INTO sync_pending_matches
         (provider, issuer, external_id, external_snapshot_json, cohort_idnumber, reason, candidates_json, detected_run_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        PROVIDER,
        issuer,
        externalId,
        JSON.stringify(p.member),
        p.cohort || null,
        p.reason,
        JSON.stringify(p.candidates || []),
        runId,
      ],
    );
    inserted += 1;
  }
  return inserted;
}

/**
 * @param {object} args
 * @param {number} args.runId
 * @param {object} args.plan sortie de `buildPlan`
 * @param {object} args.snapshot lecture Moodle
 * @param {object} args.local état local
 * @param {object} args.settings
 * @param {object} args.client client Moodle (écritures sortantes)
 * @param {object} [args.log]
 */
async function applyPlan({ runId, plan, snapshot, local, client, log = logger }) {
  const issuer = client.baseUrl;
  const journal = createJournal(runId);
  const state = { createdUsers: new Map(), actionsApplied: 0 };
  const failedCohorts = [];
  const failedCohortIds = new Set();
  const touchedUserIds = new Set();
  const cohortResults = [];
  const vitality = getDefaultVitalityFromSettings(await getGameplaySettings().catch(() => ({})));

  const actionsByCohort = new Map();
  const globalActions = [];
  for (const action of plan.actions) {
    if (action.cohortId == null) {
      globalActions.push(action);
      continue;
    }
    const list = actionsByCohort.get(action.cohortId) || [];
    list.push(action);
    actionsByCohort.set(action.cohortId, list);
  }

  for (const cohort of snapshot.cohorts) {
    const entry = plan.cohorts.find((c) => c.cohortId === cohort.id);
    if (entry?.skipped) continue;
    const actions = actionsByCohort.get(cohort.id) || [];
    const eg = local.externalGroupsByKey.get(`cohort:${cohort.id}`) || null;
    const ctx = createCohortContext(cohort, eg);
    const before = state.actionsApplied;
    try {
      await withTransaction((tx) =>
        applyCohortActions(tx, {
          cohort,
          actions,
          ctx,
          state,
          local,
          journal,
          issuer,
          vitality,
          snapshot,
        }),
      );
      for (const id of ctx.touchedUserIds) touchedUserIds.add(id);
      cohortResults.push({
        cohort: cohort.idnumber,
        cohortId: cohort.id,
        actions: state.actionsApplied - before,
        groupId: ctx.groupId,
        glClassId: ctx.glClassId,
      });
    } catch (error) {
      // Les créations de comptes de cette cohorte ont été annulées : oublier leurs identifiants.
      for (const a of actions) {
        if (a.kind === 'user.create') state.createdUsers.delete(String(a.externalId));
      }
      state.actionsApplied = before;
      failedCohorts.push({ cohort: cohort.idnumber, cohortId: cohort.id, error: error.message });
      failedCohortIds.add(cohort.id);
      log.error(
        { err: error, cohortId: cohort.id },
        'Cohorte Moodle en échec : transaction annulée',
      );
    }
  }

  // Désactivations (I-1 : jamais de suppression), dans leur propre transaction.
  let deactivated = 0;
  if (globalActions.length) {
    try {
      await withTransaction(async (tx) => {
        for (const action of globalActions) {
          if (action.kind === 'user.deactivate') {
            await applyUserDeactivate(tx, { action, journal });
            deactivated += 1;
            state.actionsApplied += 1;
          }
        }
      });
    } catch (error) {
      failedCohorts.push({ cohort: '(désactivations)', cohortId: null, error: error.message });
      log.error({ err: error }, 'Désactivations Moodle en échec : transaction annulée');
    }
  }

  // Rôles ForetMap déduits des groupes, hors transaction (helpers sur le pool).
  const roleSync = { changed: 0, errors: 0 };
  for (const userId of touchedUserIds) {
    try {
      const r = await syncStudentRoleFromGroups(userId);
      if (r?.changed) roleSync.changed += 1;
    } catch (error) {
      roleSync.errors += 1;
      log.warn({ err: error }, 'Recalcul du rôle élève après synchronisation en échec');
    }
  }

  const cohortIdToExternalGroupId = new Map();
  for (const eg of local.externalGroups)
    cohortIdToExternalGroupId.set(Number(eg.external_id), Number(eg.id));
  const conflicts = plan.conflicts.map((c) => ({
    ...c,
    externalGroupId:
      c.externalGroupId ||
      cohortIdToExternalGroupId.get(
        Number(snapshot.cohorts.find((k) => k.idnumber === c.cohort)?.id),
      ) ||
      null,
  }));
  const conflictsInserted = await persistConflicts({ runId, conflicts });
  const pendingInserted = await persistPendingMatches({
    runId,
    issuer,
    pendingMatches: plan.lists.pendingMatches,
  });

  const outboundResult = await applyOutbound({
    outbound: plan.outbound,
    client,
    journal,
    failedCohortIds,
    log,
  });

  return {
    actionsApplied: state.actionsApplied,
    journalEntries: journal.count,
    cohorts: cohortResults,
    failedCohorts,
    deactivated,
    createdUsers: state.createdUsers.size,
    roleSync,
    conflictsInserted,
    pendingInserted,
    outbound: { applied: outboundResult.applied.length, failed: outboundResult.failed },
  };
}

module.exports = { applyPlan, persistConflicts, persistPendingMatches, orderActions, KIND_ORDER };
