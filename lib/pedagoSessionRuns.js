'use strict';

/**
 * Preuve légère des séances pédagogiques : démarrage / fin par utilisateur connecté.
 * Point d'accroche unique pour une future ludification (badges, séries, déblocages) :
 * les règles s'ajoutent ici, pas dans le front.
 */

const { queryAll, queryOne, execute } = require('../database');

function toIsoOrNull(value) {
  if (value == null) return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function serializeRunRow(row) {
  if (!row) return null;
  const completionCount = Number(row.completion_count) || 0;
  return {
    sessionId: String(row.session_id),
    startCount: Number(row.start_count) || 0,
    completionCount,
    completed: completionCount > 0,
    firstStartedAt: toIsoOrNull(row.first_started_at),
    lastStartedAt: toIsoOrNull(row.last_started_at),
    firstCompletedAt: toIsoOrNull(row.first_completed_at),
    lastCompletedAt: toIsoOrNull(row.last_completed_at),
  };
}

/**
 * Agrège des lignes `pedago_session_runs` par séance (aucune donnée nominative en sortie).
 * @param {Array<object>} rows
 */
function summarizeRunStats(rows) {
  const bySession = new Map();
  for (const row of Array.isArray(rows) ? rows : []) {
    if (!row?.session_id) continue;
    const id = String(row.session_id);
    const entry = bySession.get(id) || {
      sessionId: id,
      startedUsers: 0,
      completedUsers: 0,
      lastCompletedAt: null,
    };
    if ((Number(row.start_count) || 0) > 0 || (Number(row.completion_count) || 0) > 0) {
      entry.startedUsers += 1;
    }
    if ((Number(row.completion_count) || 0) > 0) {
      entry.completedUsers += 1;
      const last = toIsoOrNull(row.last_completed_at);
      if (last && (!entry.lastCompletedAt || last > entry.lastCompletedAt)) {
        entry.lastCompletedAt = last;
      }
    }
    bySession.set(id, entry);
  }
  return [...bySession.values()];
}

const RUN_COLS = `session_id, user_id, first_started_at, last_started_at, start_count,
  first_completed_at, last_completed_at, completion_count`;

async function getRun(sessionId, userId) {
  return queryOne(
    `SELECT ${RUN_COLS} FROM pedago_session_runs WHERE session_id = ? AND user_id = ? LIMIT 1`,
    [sessionId, userId],
  );
}

async function recordRunStart(sessionId, userId) {
  await execute(
    `INSERT INTO pedago_session_runs
       (session_id, user_id, first_started_at, last_started_at, start_count)
     VALUES (?, ?, NOW(), NOW(), 1)
     ON DUPLICATE KEY UPDATE
       first_started_at = COALESCE(first_started_at, NOW()),
       last_started_at = NOW(),
       start_count = start_count + 1`,
    [sessionId, userId],
  );
  return serializeRunRow(await getRun(sessionId, userId));
}

async function recordRunComplete(sessionId, userId) {
  await execute(
    `INSERT INTO pedago_session_runs
       (session_id, user_id, first_started_at, last_started_at, start_count,
        first_completed_at, last_completed_at, completion_count)
     VALUES (?, ?, NOW(), NOW(), 1, NOW(), NOW(), 1)
     ON DUPLICATE KEY UPDATE
       first_completed_at = COALESCE(first_completed_at, NOW()),
       last_completed_at = NOW(),
       completion_count = completion_count + 1`,
    [sessionId, userId],
  );
  return serializeRunRow(await getRun(sessionId, userId));
}

async function listRunsForUser(userId) {
  const rows = await queryAll(
    `SELECT ${RUN_COLS} FROM pedago_session_runs WHERE user_id = ? ORDER BY last_started_at DESC`,
    [userId],
  );
  return rows.map(serializeRunRow);
}

function serializeStudentRunRow(row) {
  const run = row.session_id ? serializeRunRow(row) : null;
  return {
    userId: String(row.user_id),
    firstName: row.first_name || '',
    lastName: row.last_name || '',
    startCount: run?.startCount || 0,
    completionCount: run?.completionCount || 0,
    completed: !!run?.completed,
    lastStartedAt: run?.lastStartedAt || null,
    lastCompletedAt: run?.lastCompletedAt || null,
  };
}

/**
 * Suivi nominatif d'une séance (vue prof).
 * `studentIds === null` : tous les comptes ayant démarré la séance (vue globale) ;
 * sinon, tous les élèves du périmètre, y compris ceux qui ne l'ont pas encore ouverte.
 */
async function listRunsForSession(sessionId, studentIds = null) {
  if (studentIds === null) {
    const rows = await queryAll(
      `SELECT r.session_id, r.user_id, r.first_started_at, r.last_started_at, r.start_count,
              r.first_completed_at, r.last_completed_at, r.completion_count,
              u.first_name, u.last_name
         FROM pedago_session_runs r
         INNER JOIN users u ON u.id = r.user_id
        WHERE r.session_id = ?
        ORDER BY u.last_name ASC, u.first_name ASC
        LIMIT 1000`,
      [sessionId],
    );
    return rows.map(serializeStudentRunRow);
  }
  const ids = [...new Set(studentIds.map(String))].slice(0, 1000);
  if (!ids.length) return [];
  const rows = await queryAll(
    `SELECT u.id AS user_id, u.first_name, u.last_name,
            r.session_id, r.first_started_at, r.last_started_at, r.start_count,
            r.first_completed_at, r.last_completed_at, r.completion_count
       FROM users u
       LEFT JOIN pedago_session_runs r ON r.user_id = u.id AND r.session_id = ?
      WHERE u.id IN (${ids.map(() => '?').join(',')})
      ORDER BY u.last_name ASC, u.first_name ASC`,
    [sessionId, ...ids],
  );
  return rows.map(serializeStudentRunRow);
}

async function hasCompletedSession(userId, sessionId) {
  const row = await queryOne(
    `SELECT completion_count FROM pedago_session_runs WHERE session_id = ? AND user_id = ? LIMIT 1`,
    [sessionId, userId],
  );
  return (Number(row?.completion_count) || 0) > 0;
}

async function getRunStats() {
  const rows = await queryAll(
    `SELECT session_id, start_count, completion_count, last_completed_at FROM pedago_session_runs`,
  );
  return summarizeRunStats(rows);
}

module.exports = {
  serializeRunRow,
  serializeStudentRunRow,
  summarizeRunStats,
  listRunsForSession,
  recordRunStart,
  recordRunComplete,
  listRunsForUser,
  hasCompletedSession,
  getRunStats,
};
