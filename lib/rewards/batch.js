'use strict';

/**
 * Évaluation des badges en lot : passe de nuit (`rewards_evaluate`, élèves actifs sur
 * 30 jours) et rattrapage initial (`scripts/rewards-backfill.js --all`).
 *
 *  - passe de nuit : chaque élève reçoit, le cas échéant, une notification regroupée ;
 *  - rattrapage : **une seule** notification récapitulative par élève ;
 *  - dry-run : rien n'est écrit, la répartition par badge et par palier est renvoyée.
 */

const database = require('../../database');
const logger = require('../logger');
const { evaluateUser } = require('./evaluator');
const { announceRewards } = require('./announce');

const ACTIVE_DAYS = 30;

/** Comptes élèves actifs (connectés ou crédités d'une tâche) sur les `days` derniers jours. */
async function listActiveStudentIds({ days = ACTIVE_DAYS, db = database } = {}) {
  const rows = await db.queryAll(
    `SELECT u.id FROM users u
      WHERE u.user_type = 'student' AND u.is_active = 1
        AND (u.last_seen >= DATE_SUB(NOW(), INTERVAL ? DAY)
             OR EXISTS (
               SELECT 1 FROM task_assignments ta JOIN tasks t ON t.id = ta.task_id
                WHERE ta.student_id = u.id AND t.validated_at >= DATE_SUB(NOW(), INTERVAL ? DAY)
             ))
      ORDER BY u.id`,
    [days, days],
  );
  return rows.map((r) => r.id);
}

/** Tous les comptes élèves actifs (rattrapage initial). */
async function listAllStudentIds(db = database) {
  const rows = await db.queryAll(
    "SELECT id FROM users WHERE user_type = 'student' AND is_active = 1 ORDER BY id",
  );
  return rows.map((r) => r.id);
}

/**
 * Évalue une liste d'élèves.
 * @param {string[]} userIds
 * @param {{ dryRun?: boolean, announce?: 'each'|'recap'|'none', db?: object }} [options]
 * @returns {Promise<{ students: number, rewarded: number, awarded: number, notified: number,
 *   failures: number, byKey: Record<string, number> }>}
 */
async function evaluateMany(userIds, { dryRun = false, announce = 'each', db = database } = {}) {
  const summary = { students: 0, rewarded: 0, awarded: 0, notified: 0, failures: 0, byKey: {} };
  for (const userId of userIds || []) {
    summary.students += 1;
    try {
      const awarded = await evaluateUser(userId, {
        dryRun,
        db,
        source: { type: 'backfill', ref: null },
      });
      if (!awarded.length) continue;
      summary.rewarded += 1;
      summary.awarded += awarded.length;
      for (const r of awarded) summary.byKey[r.key] = (summary.byKey[r.key] || 0) + 1;
      if (!dryRun && announce !== 'none') {
        const recap = announce === 'recap';
        const sent = await announceRewards(userId, awarded, {
          recap,
          dedupeKey: recap ? 'rewards-backfill' : null,
        });
        if (sent) summary.notified += 1;
      }
    } catch (err) {
      summary.failures += 1;
      logger.error({ err, userId }, 'rewards_batch_evaluation_failed');
    }
  }
  return summary;
}

/** Passe de nuit : réévalue les élèves actifs sur 30 jours (rattrape les échecs en ligne). */
async function runRewardsEvaluateJob() {
  const ids = await listActiveStudentIds();
  const summary = await evaluateMany(ids, { announce: 'each' });
  const { byKey: _byKey, ...counters } = summary;
  return counters;
}

module.exports = {
  ACTIVE_DAYS,
  listActiveStudentIds,
  listAllStudentIds,
  evaluateMany,
  runRewardsEvaluateJob,
};
