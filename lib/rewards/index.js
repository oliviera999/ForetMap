'use strict';

/**
 * Badges (ludification) — point d'entrée public. Le catalogue et les règles vivent ici,
 * jamais dans le front :
 *  - `catalog.js`        catalogue, paliers, familles, clés ;
 *  - `creditedTasks.js`  règle de crédit d'une tâche (seule source des badges de tâches) ;
 *  - `metrics.js`        mesures agrégées par élève ;
 *  - `evaluator.js`      attribution (`INSERT IGNORE`, jamais de retrait) ;
 *  - `announce.js`       notifications (module allumé), récapitulatif du rattrapage ;
 *  - `progress.js`       progression vers le palier suivant, vitrine, badges manuels ;
 *  - `foretEngine.js`    instance ForetMap du moteur générique `core/engine.js` (commun
 *                        avec Gnomes & Licornes : voir `docs/REWARDS_ENGINE.md`).
 *
 * Les exports historiques (`REWARD_CATALOGUE`, `describeReward`, `sessionRewardKeysFor`,
 * `awardReward`, `evaluateSessionRewards`, `announceableRewards`, `listRewardsForUser`) sont
 * conservés : séances et fresque passent par le même évaluateur.
 */

const database = require('../../database');
const catalog = require('./catalog');
const evaluator = require('./evaluator');
const announce = require('./announce');
const { foretRewards } = require('./foretEngine');

/**
 * Règles pures historiques : badges mérités après une fin de séance (conservé pour les
 * appels et tests existants ; l'évaluateur calcule les mêmes badges depuis les agrégats).
 * @param {{ completionCount: number, distinctCompleted: number, level?: string }} facts
 * @returns {string[]}
 */
function sessionRewardKeysFor(facts) {
  const keys = [];
  const distinct = Number(facts?.distinctCompleted) || 0;
  if (distinct >= 1) keys.push('session_first');
  if (distinct >= 3) keys.push('session_three');
  if ((Number(facts?.completionCount) || 0) >= 2) keys.push('session_replay');
  if (facts?.level === 'lycee') keys.push('session_lycee');
  return keys;
}

/**
 * Évalue les badges après une fin de séance (famille « séances », par l'évaluateur commun).
 * Renvoie uniquement les badges nouvellement obtenus.
 * @param {string} userId
 * @param {{ run: { sessionId: string, completionCount: number }, level?: string }} ctx
 */
async function evaluateSessionRewards(userId, { run } = {}) {
  if (!userId || !run) return [];
  return evaluator.evaluateUser(userId, {
    families: ['seances'],
    source: { type: 'pedago_session', ref: run.sessionId },
  });
}

/** Badges obtenus par un compte, dans l'ordre d'obtention (mot de l'adulte compris). */
function listRewardsForUser(userId, db = database) {
  return foretRewards.listRewards(userId, db);
}

module.exports = {
  ...catalog,
  describeReward: evaluator.describeReward,
  awardReward: evaluator.awardReward,
  evaluateUser: evaluator.evaluateUser,
  computeRewardValues: evaluator.computeRewardValues,
  isRewardEligibleStudent: evaluator.isRewardEligibleStudent,
  scheduleRewardsEvaluation: evaluator.scheduleRewardsEvaluation,
  announceRewards: announce.announceRewards,
  announceableRewards: announce.announceableRewards,
  rewardNotificationText: announce.rewardNotificationText,
  sessionRewardKeysFor,
  evaluateSessionRewards,
  listRewardsForUser,
  foretRewards,
};
