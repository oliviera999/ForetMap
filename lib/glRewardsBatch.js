'use strict';

/**
 * Gnomes & Licornes — évaluation des badges en lot : passe de nuit (joueurs actifs sur 30
 * jours, appelée par le job `rewards_evaluate` de `lib/dailyJobs.js` après la forêt) et
 * rattrapage (`scripts/gl-rewards-backfill.js`). Dry-run : rien n'est écrit.
 */

const database = require('../database');
const logger = require('./logger');
const { glRewards } = require('./glRewards');

const ACTIVE_DAYS = 30;

/** Joueurs actifs : vus récemment, ou membres d'une partie qui a bougé récemment. */
async function listActiveGlPlayerIds({ days = ACTIVE_DAYS, db = database } = {}) {
  const rows = await db.queryAll(
    `SELECT p.id FROM gl_players p
      WHERE p.is_active = 1
        AND (p.last_seen >= DATE_SUB(NOW(), INTERVAL ? DAY)
             OR EXISTS (SELECT 1 FROM gl_team_members tm
                          INNER JOIN gl_games g ON g.id = tm.game_id
                         WHERE tm.player_id = p.id AND g.updated_at >= DATE_SUB(NOW(), INTERVAL ? DAY)))
      ORDER BY p.id`,
    [days, days],
  );
  return rows.map((r) => String(r.id));
}

/** Tous les joueurs actifs (rattrapage). */
async function listAllGlPlayerIds(db = database) {
  const rows = await db.queryAll('SELECT id FROM gl_players WHERE is_active = 1 ORDER BY id');
  return rows.map((r) => String(r.id));
}

/**
 * Évalue une liste de joueurs.
 * @returns {Promise<{ players: number, rewarded: number, awarded: number, failures: number,
 *   byKey: Record<string, number> }>}
 */
async function evaluateManyGl(playerIds, { dryRun = false, db = database } = {}) {
  const summary = { players: 0, rewarded: 0, awarded: 0, failures: 0, byKey: {} };
  for (const playerId of playerIds || []) {
    summary.players += 1;
    try {
      const awarded = await glRewards.evaluate(playerId, {
        dryRun,
        db,
        source: { type: 'backfill', ref: null },
      });
      if (!awarded.length) continue;
      summary.rewarded += 1;
      summary.awarded += awarded.length;
      for (const r of awarded) summary.byKey[r.key] = (summary.byKey[r.key] || 0) + 1;
    } catch (err) {
      summary.failures += 1;
      logger.error({ err }, 'gl_rewards_batch_evaluation_failed');
    }
  }
  return summary;
}

/** Passe de nuit G&L : joueurs actifs sur 30 jours. */
async function runGlRewardsEvaluateJob() {
  const ids = await listActiveGlPlayerIds();
  const { byKey: _byKey, ...counters } = await evaluateManyGl(ids);
  return counters;
}

module.exports = {
  ACTIVE_DAYS,
  listActiveGlPlayerIds,
  listAllGlPlayerIds,
  evaluateManyGl,
  runGlRewardsEvaluateJob,
};
