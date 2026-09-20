'use strict';

/**
 * Journal des écritures d'une exécution (`sync_actions`, section 12.3) : une ligne par
 * écriture, état avant / après en JSON, pour que `undo.js` puisse rejouer à l'envers.
 *
 * Le journal s'écrit dans la **même transaction** que l'écriture qu'il décrit : une cohorte
 * annulée par un échec n'a pas de lignes fantômes.
 */

const { membersHashOf } = require('./reconcile');
const { PROVIDER } = require('./config');

function toJson(value) {
  return value == null ? null : JSON.stringify(value);
}

function createJournal(runId, startSeq = 0) {
  let seq = Number(startSeq) || 0;
  return {
    runId,
    /**
     * @param {{ execute: Function }} db `tx` ou `database`
     * @param {{ kind: string, targetType: string, targetId?: string|number|null, before?: object|null, after?: object|null }} entry
     */
    async record(db, entry) {
      seq += 1;
      await db.execute(
        `INSERT INTO sync_actions (run_id, seq, kind, target_type, target_id, before_json, after_json)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          runId,
          seq,
          String(entry.kind),
          String(entry.targetType),
          entry.targetId == null ? null : String(entry.targetId),
          toJson(entry.before ?? null),
          toJson(entry.after ?? null),
        ],
      );
      return seq;
    },
    get count() {
      return seq;
    },
  };
}

/** SHA-256 de la liste triée des `users.id`, jointe par `\n` (section 9). */
function membersHash(userIds) {
  const sorted = [...new Set((userIds || []).map(String))].sort();
  return { hash: membersHashOf(sorted), json: JSON.stringify(sorted), sorted };
}

/** Recalcule `members_hash` / `members_json` d'un groupe externe depuis `external_group_members`. */
async function refreshMembersHash(db, externalGroupId) {
  const rows = await db.queryAll(
    'SELECT user_id FROM external_group_members WHERE external_group_id = ?',
    [Number(externalGroupId)],
  );
  const { hash, json } = membersHash(rows.map((r) => r.user_id));
  await db.execute(
    `UPDATE external_groups SET members_hash = ?, members_json = ?, last_synced_at = NOW(), updated_at = NOW()
      WHERE id = ?`,
    [hash, json, Number(externalGroupId)],
  );
  return { hash, json, count: rows.length };
}

/**
 * Écriture administrateur hors exécution (décision sur un rapprochement…) : ouvre sa propre
 * ligne `sync_runs` (mode `apply`, périmètre `scope`) et journalise dans `sync_actions`, pour
 * que l'annulation la rejoue comme n'importe quelle exécution (CDG-47).
 *
 * @param {{ scope: object, actorUserId?: string|null }} args
 * @param {(tx: object, journal: object) => Promise<any>} work
 * @returns {Promise<{ runId: number, result: any }>}
 */
async function withStandaloneRun({ scope, actorUserId = null }, work) {
  const { execute, withTransaction } = require('../../database');
  const opened = await execute(
    `INSERT INTO sync_runs (provider, mode, scope_json, status, actor_user_id, started_at)
     VALUES (?, 'apply', ?, 'running', ?, NOW())`,
    [PROVIDER, JSON.stringify(scope), actorUserId || null],
  );
  const runId = Number(opened.insertId);
  const journal = createJournal(runId);
  try {
    const result = await withTransaction((tx) => work(tx, journal));
    await execute(
      `UPDATE sync_runs SET status = 'succeeded', finished_at = NOW(), totals_json = ? WHERE id = ?`,
      [JSON.stringify({ applied: journal.count }), runId],
    );
    return { runId, result };
  } catch (error) {
    await execute(
      `UPDATE sync_runs SET status = 'failed', finished_at = NOW(), error_text = ? WHERE id = ?`,
      [String(error?.message || error).slice(0, 4000), runId],
    );
    throw error;
  }
}

module.exports = { createJournal, membersHash, refreshMembersHash, withStandaloneRun };
