'use strict';

/**
 * Évaluateur des badges automatiques.
 *
 * `evaluateUser(userId, { families?, source?, dryRun? })` calcule les mesures de l'élève,
 * en déduit les paliers atteints et insère (`INSERT IGNORE`) ceux qui manquent, avec
 * `source_type` / `source_ref` (ex. `task` + identifiant de la tâche qui a fait franchir le
 * seuil quand il est connu, sinon `backfill`). Il renvoie les badges **nouvellement**
 * obtenus.
 *
 *  - un badge n'est **jamais retiré**, même si une tâche est ensuite dévalidée ;
 *  - les badges de tâches, de projets, d'exploration, de reportage, de savoirs et du
 *    collectif vont aux élèves au profil n3beur et à l'encadrement (admin, prof, prof de
 *    classe) : ni visiteurs, ni « personnel », ni compte partagé « mode collectif ». Les badges
 *    de séance gardent leur règle historique (tout compte qui termine une séance) ;
 *  - l'attribution ne dépend pas de l'interrupteur `ui.modules.rewards_enabled` : module
 *    éteint, les badges sont enregistrés en silence (décision du 25/09/2026) ;
 *  - `scheduleRewardsEvaluation` ne fait jamais échouer l'action qui l'a déclenchée : erreur
 *    journalisée (Pino), la passe de nuit rattrape.
 */

const database = require('../../database');
const logger = require('../logger');
const { CATALOGUE_BY_KEY } = require('./catalog');
const { foretRewards, STUDENT_ONLY_FAMILIES, isRewardEligibleStudent } = require('./foretEngine');

// Le calcul vit dans le moteur générique (`core/engine.js`) ; ce module garde les noms
// historiques de la forêt, utilisés par les routes, les crochets et les scripts.

/**
 * Badge décrit pour l'API : entrée du catalogue + palier / occurrence + date.
 * @returns {null|object}
 */
const describeReward = foretRewards.describeReward;

/**
 * Attribue un badge d'événement (fresque…) ou une clé déjà calculée, par le même chemin
 * d'insertion que l'évaluateur. Vrai seulement s'il vient d'être obtenu.
 */
function awardReward(userId, key, source = {}, db = database) {
  return foretRewards.award(userId, key, source, db);
}

/**
 * Valeurs des badges automatiques d'un élève (sans rien écrire).
 * @returns {Promise<Array<{ entry: object, value: number, reached: number }>>}
 */
function computeRewardValues(userId, { families = null, eligible = true, db = database } = {}) {
  return foretRewards.computeValues(userId, { families, eligible, db });
}

/**
 * Évalue un compte et attribue les paliers manquants.
 * @param {string} userId
 * @param {{ families?: string[], source?: { type?: string, ref?: string },
 *           dryRun?: boolean, db?: object }} [options]
 * @returns {Promise<object[]>} badges nouvellement obtenus (dry-run : ceux qui le seraient)
 */
function evaluateUser(
  userId,
  { families = null, source = null, dryRun = false, db = database } = {},
) {
  return foretRewards.evaluate(userId, { families, source, dryRun, db });
}

/**
 * Évaluation « lancée sans attendre » après une action (validation de tâche, quiz…) :
 * chaque compte est évalué puis annoncé (notification regroupée, module allumé) ; une
 * erreur est journalisée et n'interrompt jamais l'action appelante.
 * @param {string[]} userIds
 * @param {{ source?: object, families?: string[], reason?: string }} [options]
 * @returns {Promise<void>}
 */
function scheduleRewardsEvaluation(userIds, options = {}) {
  const ids = [...new Set((userIds || []).map((u) => String(u || '').trim()).filter(Boolean))];
  if (!ids.length) return Promise.resolve();
  const run = async () => {
    const { announceRewards } = require('./announce');
    for (const id of ids) {
      try {
        const awarded = await evaluateUser(id, options);
        if (awarded.length) await announceRewards(id, awarded);
      } catch (err) {
        logger.error(
          { err, userId: id, reason: options.reason || null },
          'rewards_evaluation_failed',
        );
      }
    }
  };
  return new Promise((resolve) => {
    setImmediate(() => {
      run().finally(resolve);
    });
  });
}

module.exports = {
  STUDENT_ONLY_FAMILIES,
  describeReward,
  isRewardEligibleStudent,
  awardReward,
  computeRewardValues,
  evaluateUser,
  scheduleRewardsEvaluation,
  CATALOGUE_BY_KEY,
};
