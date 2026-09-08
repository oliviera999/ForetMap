'use strict';

/**
 * Fusion de deux comptes `users` (chantier Moodle, lot M2 ; section 8.4 « doublons probables »).
 *
 * Le compte **B** (`fromUserId`) est absorbé par le compte **A** (`intoUserId`) : toutes les lignes
 * qui référencent B sont réattribuées à A, puis B est supprimé. A garde son identité ; seules ses
 * cases **vides** (e-mail, mot de passe, `google_sub`, prénom/nom) sont complétées depuis B.
 *
 * Inventaire des tables :
 *  - **clés étrangères** vers `users.id`, découvertes dans `INFORMATION_SCHEMA` (jamais figées :
 *    une table ajoutée demain est prise en compte) ;
 *  - **colonnes polymorphes** `(xxx_user_type, xxx_user_id)` sans FK possible, listées ici
 *    (même inventaire que `lib/studentDeletion.js`).
 *
 * Les tables à contrainte d'unicité sur la colonne (appartenance à un groupe déjà partagée,
 * identité externe déjà portée…) sont traitées par `UPDATE IGNORE` : la ligne de B qui ne peut
 * pas bouger parce que A l'a déjà est **supprimée** avec B (cascade ou suppression explicite).
 *
 * Journal : une ligne `sync_runs` (`mode = 'apply'`, `scope.kind = 'account_merge'`) et une ligne
 * `sync_actions` par table touchée — visible dans l'historique des exécutions.
 */

const { withTransaction, queryAll, queryOne, execute } = require('../database');
const logger = require('./logger');
const { PROVIDER } = require('./moodle/config');

/** Colonnes polymorphes `(type, id)` : `type` vaut `users.user_type` du compte. */
const POLYMORPHIC_REFS = [
  { table: 'forum_threads', typeColumn: 'author_user_type', idColumn: 'author_user_id' },
  { table: 'forum_posts', typeColumn: 'author_user_type', idColumn: 'author_user_id' },
  { table: 'forum_reports', typeColumn: 'reporter_user_type', idColumn: 'reporter_user_id' },
  { table: 'forum_post_reactions', typeColumn: 'reactor_user_type', idColumn: 'reactor_user_id' },
  { table: 'context_comments', typeColumn: 'author_user_type', idColumn: 'author_user_id' },
  {
    table: 'context_comment_reports',
    typeColumn: 'reporter_user_type',
    idColumn: 'reporter_user_id',
  },
  {
    table: 'context_comment_reactions',
    typeColumn: 'reactor_user_type',
    idColumn: 'reactor_user_id',
  },
  {
    table: 'password_reset_tokens',
    typeColumn: 'user_type',
    idColumn: 'user_id',
    dropInstead: true,
  },
  { table: 'user_roles', typeColumn: 'user_type', idColumn: 'user_id', dropInstead: true },
  { table: 'elevation_audit', typeColumn: 'user_type', idColumn: 'user_id' },
  { table: 'security_events', typeColumn: 'actor_user_type', idColumn: 'actor_user_id' },
  { table: 'audit_log', typeColumn: 'actor_user_type', idColumn: 'actor_user_id' },
];

/** Colonnes FK à ne pas réattribuer aveuglément : elles portent une règle métier. */
const FK_SPECIAL = new Set(['gl_players.linked_foretmap_user_id']);

const IDENT_RE = /^[A-Za-z0-9_]+$/;

function q(identifier) {
  if (!IDENT_RE.test(identifier)) throw new Error(`Identifiant SQL invalide : ${identifier}`);
  return `\`${identifier}\``;
}

async function discoverForeignKeyRefs(db) {
  const rows = await db.queryAll(
    `SELECT k.TABLE_NAME AS table_name, k.COLUMN_NAME AS column_name
       FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE k
      WHERE k.TABLE_SCHEMA = DATABASE()
        AND k.REFERENCED_TABLE_SCHEMA = DATABASE()
        AND k.REFERENCED_TABLE_NAME = 'users'
        AND k.REFERENCED_COLUMN_NAME = 'id'
      ORDER BY k.TABLE_NAME, k.COLUMN_NAME`,
  );
  const seen = new Set();
  const refs = [];
  for (const r of rows) {
    const key = `${r.table_name}.${r.column_name}`;
    if (seen.has(key)) continue;
    seen.add(key);
    refs.push({
      table: String(r.table_name),
      column: String(r.column_name),
      special: FK_SPECIAL.has(key),
    });
  }
  return refs;
}

async function tableExists(db, table) {
  const row = await db.queryOne(
    'SELECT COUNT(*) AS c FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?',
    [table],
  );
  return Number(row?.c || 0) > 0;
}

function userView(u) {
  if (!u) return null;
  return {
    userId: u.id,
    userType: u.user_type,
    displayName: u.display_name || `${u.first_name || ''} ${u.last_name || ''}`.trim() || null,
    email: u.email || null,
    pseudo: u.pseudo || null,
    authProvider: u.auth_provider,
    isActive: Number(u.is_active) === 1,
    hasPassword: Boolean(u.password_hash),
    hasGoogle: Boolean(u.google_sub),
    createdAt: u.created_at,
  };
}

/**
 * Inventaire des lignes à réattribuer, sans écrire.
 */
async function planMerge({ fromUserId, intoUserId }, db = { queryAll, queryOne }) {
  const from = String(fromUserId || '').trim();
  const into = String(intoUserId || '').trim();
  if (!from || !into)
    return { ok: false, status: 400, error: 'Deux identifiants de compte sont requis' };
  if (from === into)
    return { ok: false, status: 400, error: 'Un compte ne peut pas être fusionné avec lui-même' };
  const fromUser = await db.queryOne('SELECT * FROM users WHERE id = ? LIMIT 1', [from]);
  const intoUser = await db.queryOne('SELECT * FROM users WHERE id = ? LIMIT 1', [into]);
  if (!fromUser) return { ok: false, status: 404, error: 'Compte à absorber introuvable' };
  if (!intoUser) return { ok: false, status: 404, error: 'Compte cible introuvable' };

  const blockers = [];
  const warnings = [];
  if (fromUser.user_type !== intoUser.user_type) {
    blockers.push({
      code: 'user_type_mismatch',
      message: `Types de compte différents (${fromUser.user_type} → ${intoUser.user_type})`,
    });
  }
  if (Number(fromUser.sync_exempt) === 1 || Number(intoUser.sync_exempt) === 1) {
    warnings.push({
      code: 'sync_exempt',
      message: 'Un des deux comptes est marqué hors synchronisation',
    });
  }

  const tables = [];
  const fkRefs = await discoverForeignKeyRefs(db);
  for (const ref of fkRefs) {
    const row = await db.queryOne(
      `SELECT COUNT(*) AS c FROM ${q(ref.table)} WHERE ${q(ref.column)} = ?`,
      [from],
    );
    const count = Number(row?.c || 0);
    if (!count) continue;
    tables.push({
      table: ref.table,
      column: ref.column,
      rows: count,
      mode: ref.special ? 'special' : 'reassign',
    });
  }
  for (const ref of POLYMORPHIC_REFS) {
    if (!(await tableExists(db, ref.table))) continue;
    const row = await db.queryOne(
      `SELECT COUNT(*) AS c FROM ${q(ref.table)} WHERE ${q(ref.typeColumn)} = ? AND ${q(ref.idColumn)} = ?`,
      [fromUser.user_type, from],
    );
    const count = Number(row?.c || 0);
    if (!count) continue;
    tables.push({
      table: ref.table,
      column: ref.idColumn,
      rows: count,
      mode: ref.dropInstead ? 'drop' : 'reassign',
    });
  }

  // Joueur G&L : un seul par compte (index unique) ; deux joueurs = décision humaine préalable.
  const fromPlayer = await db.queryOne(
    'SELECT id, class_id FROM gl_players WHERE linked_foretmap_user_id = ? LIMIT 1',
    [from],
  );
  const intoPlayer = await db.queryOne(
    'SELECT id, class_id FROM gl_players WHERE linked_foretmap_user_id = ? LIMIT 1',
    [into],
  );
  if (fromPlayer && intoPlayer) {
    blockers.push({
      code: 'two_gl_players',
      message: `Les deux comptes ont un joueur G&L (#${fromPlayer.id} et #${intoPlayer.id}) : supprimer ou détacher l’un des deux d’abord`,
    });
  }

  // Identités externes : une par fournisseur/émetteur (index unique).
  const fromIdentities = await db.queryAll(
    'SELECT provider, issuer, external_id, origin FROM external_identities WHERE user_id = ?',
    [from],
  );
  const intoIdentities = await db.queryAll(
    'SELECT provider, issuer, external_id, origin FROM external_identities WHERE user_id = ?',
    [into],
  );
  const intoKeys = new Set(intoIdentities.map((i) => `${i.provider}|${i.issuer}`));
  for (const i of fromIdentities) {
    if (intoKeys.has(`${i.provider}|${i.issuer}`)) {
      warnings.push({
        code: 'identity_dropped',
        message: `Identité ${i.provider} ${i.external_id} du compte absorbé abandonnée : le compte cible en porte déjà une`,
      });
    }
  }

  const fills = {};
  if (!intoUser.email && fromUser.email) fills.email = fromUser.email;
  if (!intoUser.password_hash && fromUser.password_hash) fills.passwordHash = true;
  if (!intoUser.google_sub && fromUser.google_sub) fills.googleSub = true;
  if (!intoUser.first_name && fromUser.first_name) fills.firstName = fromUser.first_name;
  if (!intoUser.last_name && fromUser.last_name) fills.lastName = fromUser.last_name;
  if (intoUser.auth_provider === 'gl_bridge' && fromUser.auth_provider !== 'gl_bridge')
    fills.authProvider = fromUser.auth_provider;

  return {
    ok: true,
    dryRun: true,
    from: userView(fromUser),
    into: userView(intoUser),
    tables,
    fills,
    glPlayer:
      fromPlayer && !intoPlayer ? { playerId: Number(fromPlayer.id), reassigned: true } : null,
    warnings,
    blockers,
    canApply: blockers.length === 0,
  };
}

/**
 * Exécute la fusion dans une transaction, journalisée dans `sync_runs` / `sync_actions`.
 */
async function applyMerge({ fromUserId, intoUserId, actorUserId = null }) {
  const plan = await planMerge({ fromUserId, intoUserId });
  if (!plan.ok) return plan;
  if (!plan.canApply) {
    return {
      ok: false,
      status: 409,
      error: plan.blockers.map((b) => b.message).join(' ; '),
      blockers: plan.blockers,
    };
  }
  const from = plan.from.userId;
  const into = plan.into.userId;

  const runResult = await execute(
    `INSERT INTO sync_runs (provider, mode, scope_json, status, actor_user_id, started_at)
     VALUES (?, 'apply', ?, 'running', ?, NOW())`,
    [
      PROVIDER,
      JSON.stringify({ kind: 'account_merge', fromUserId: from, intoUserId: into }),
      actorUserId || null,
    ],
  );
  const runId = Number(runResult.insertId);
  let seq = 0;
  const journal = async (tx, entry) => {
    seq += 1;
    await tx.execute(
      `INSERT INTO sync_actions (run_id, seq, kind, target_type, target_id, before_json, after_json) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        runId,
        seq,
        entry.kind,
        entry.targetType,
        entry.targetId ?? null,
        JSON.stringify(entry.before ?? null),
        JSON.stringify(entry.after ?? null),
      ],
    );
  };

  try {
    const summary = await withTransaction(async (tx) => {
      const fromUser = await tx.queryOne('SELECT * FROM users WHERE id = ? LIMIT 1', [from]);
      const intoUser = await tx.queryOne('SELECT * FROM users WHERE id = ? LIMIT 1', [into]);
      if (!fromUser || !intoUser) throw new Error('Un des deux comptes a disparu');
      const moved = [];

      await journal(tx, {
        kind: 'account.merge',
        targetType: 'user',
        targetId: into,
        before: { from: userView(fromUser), into: userView(intoUser) },
        after: { fills: plan.fills },
      });

      const fkRefs = await discoverForeignKeyRefs(tx);
      for (const ref of fkRefs) {
        if (ref.special) continue;
        const result = await tx.execute(
          `UPDATE IGNORE ${q(ref.table)} SET ${q(ref.column)} = ? WHERE ${q(ref.column)} = ?`,
          [into, from],
        );
        const left = await tx.queryOne(
          `SELECT COUNT(*) AS c FROM ${q(ref.table)} WHERE ${q(ref.column)} = ?`,
          [from],
        );
        const leftover = Number(left?.c || 0);
        if (leftover)
          await tx.execute(`DELETE FROM ${q(ref.table)} WHERE ${q(ref.column)} = ?`, [from]);
        if (Number(result.affectedRows || 0) || leftover) {
          moved.push({
            table: ref.table,
            column: ref.column,
            moved: Number(result.affectedRows || 0),
            dropped: leftover,
          });
          await journal(tx, {
            kind: 'account.merge.table',
            targetType: 'table',
            targetId: `${ref.table}.${ref.column}`,
            before: { userId: from },
            after: { userId: into, moved: Number(result.affectedRows || 0), dropped: leftover },
          });
        }
      }

      for (const ref of POLYMORPHIC_REFS) {
        if (!(await tableExists(tx, ref.table))) continue;
        if (ref.dropInstead) {
          const r = await tx.execute(
            `DELETE FROM ${q(ref.table)} WHERE ${q(ref.typeColumn)} = ? AND ${q(ref.idColumn)} = ?`,
            [fromUser.user_type, from],
          );
          if (Number(r.affectedRows || 0)) {
            moved.push({
              table: ref.table,
              column: ref.idColumn,
              moved: 0,
              dropped: Number(r.affectedRows),
            });
            await journal(tx, {
              kind: 'account.merge.table',
              targetType: 'table',
              targetId: `${ref.table}.${ref.idColumn}`,
              before: { userId: from },
              after: { dropped: Number(r.affectedRows) },
            });
          }
          continue;
        }
        const r = await tx.execute(
          `UPDATE IGNORE ${q(ref.table)} SET ${q(ref.idColumn)} = ? WHERE ${q(ref.typeColumn)} = ? AND ${q(ref.idColumn)} = ?`,
          [into, fromUser.user_type, from],
        );
        const left = await tx.queryOne(
          `SELECT COUNT(*) AS c FROM ${q(ref.table)} WHERE ${q(ref.typeColumn)} = ? AND ${q(ref.idColumn)} = ?`,
          [fromUser.user_type, from],
        );
        const leftover = Number(left?.c || 0);
        if (leftover)
          await tx.execute(
            `DELETE FROM ${q(ref.table)} WHERE ${q(ref.typeColumn)} = ? AND ${q(ref.idColumn)} = ?`,
            [fromUser.user_type, from],
          );
        if (Number(r.affectedRows || 0) || leftover) {
          moved.push({
            table: ref.table,
            column: ref.idColumn,
            moved: Number(r.affectedRows || 0),
            dropped: leftover,
          });
          await journal(tx, {
            kind: 'account.merge.table',
            targetType: 'table',
            targetId: `${ref.table}.${ref.idColumn}`,
            before: { userId: from },
            after: { userId: into, moved: Number(r.affectedRows || 0), dropped: leftover },
          });
        }
      }

      // Joueur G&L : réattribué seulement si A n'en a pas (garanti par `planMerge`).
      if (plan.glPlayer) {
        await tx.execute(
          'UPDATE gl_players SET linked_foretmap_user_id = ?, updated_at = NOW() WHERE id = ?',
          [into, plan.glPlayer.playerId],
        );
        moved.push({
          table: 'gl_players',
          column: 'linked_foretmap_user_id',
          moved: 1,
          dropped: 0,
        });
        await journal(tx, {
          kind: 'account.merge.table',
          targetType: 'gl_player',
          targetId: plan.glPlayer.playerId,
          before: { userId: from },
          after: { userId: into },
        });
      }

      // Cases vides de A complétées depuis B (jamais d'écrasement).
      const f = plan.fills;
      const sets = [];
      const params = [];
      if (f.email) {
        // L'e-mail est unique : il faut d'abord le libérer de B.
        await tx.execute('UPDATE users SET email = NULL WHERE id = ?', [from]);
        sets.push('email = ?');
        params.push(f.email);
      }
      if (f.passwordHash) {
        sets.push('password_hash = ?');
        params.push(fromUser.password_hash);
      }
      if (f.googleSub) {
        await tx.execute('UPDATE users SET google_sub = NULL WHERE id = ?', [from]);
        sets.push('google_sub = ?');
        params.push(fromUser.google_sub);
      }
      if (f.firstName) {
        sets.push('first_name = ?');
        params.push(f.firstName);
      }
      if (f.lastName) {
        sets.push('last_name = ?');
        params.push(f.lastName);
      }
      if (f.authProvider) {
        sets.push('auth_provider = ?');
        params.push(f.authProvider);
      }
      if (sets.length) {
        params.push(into);
        await tx.execute(
          `UPDATE users SET ${sets.join(', ')}, updated_at = NOW() WHERE id = ?`,
          params,
        );
      }

      await tx.execute('DELETE FROM users WHERE id = ?', [from]);
      await journal(tx, {
        kind: 'account.merge.delete',
        targetType: 'user',
        targetId: from,
        before: userView(fromUser),
        after: null,
      });
      return { moved };
    });

    await execute(
      `UPDATE sync_runs SET status = 'succeeded', finished_at = NOW(), totals_json = ? WHERE id = ?`,
      [
        JSON.stringify({
          tables: summary.moved.length,
          moved: summary.moved.reduce((s, m) => s + m.moved, 0),
          dropped: summary.moved.reduce((s, m) => s + m.dropped, 0),
        }),
        runId,
      ],
    );
    logger.info({ runId, tables: summary.moved.length }, 'Fusion de comptes appliquée');
    return {
      ok: true,
      dryRun: false,
      runId,
      from: plan.from,
      into: plan.into,
      tables: summary.moved,
      fills: plan.fills,
      warnings: plan.warnings,
    };
  } catch (error) {
    await execute(
      `UPDATE sync_runs SET status = 'failed', finished_at = NOW(), error_text = ? WHERE id = ?`,
      [String(error.message).slice(0, 4000), runId],
    );
    if (error?.errno === 1451 || error?.code === 'ER_ROW_IS_REFERENCED_2') {
      return {
        ok: false,
        status: 409,
        error: 'Une ligne référence encore le compte absorbé (contrainte stricte) : fusion refusée',
        runId,
      };
    }
    throw error;
  }
}

module.exports = { planMerge, applyMerge, discoverForeignKeyRefs, POLYMORPHIC_REFS };
