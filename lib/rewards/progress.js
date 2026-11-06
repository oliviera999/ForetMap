'use strict';

/**
 * Progression vers le palier suivant, vitrine des professeurs et badges manuels.
 *
 *  - `buildRewardProgress(userId)` : badges obtenus, valeur actuelle, palier atteint, seuil
 *    suivant et reste à faire de chaque badge automatique (« encore 3 tâches de jardinage
 *    pour 🌼 Fleur ») ;
 *  - `buildGroupShowcase(students)` : élèves × familles (nombre de paliers), et « Qui est
 *    proche d'un palier ? » (à 1 du seuil). **Aucun classement** : ordre alphabétique ;
 *  - `awardManualReward(…)` : badge décerné par un adulte (`manuel.<type>.<n>`, `n`
 *    incrémenté), avec un mot obligatoire, journalisé.
 */

const database = require('../../database');
const { logAudit } = require('../auditLog');
const { NOTE_MAX, NEAR_THRESHOLD_GAP, RewardAwardError } = require('./core/engine');
const { foretRewards } = require('./foretEngine');

// Le calcul vit dans le moteur générique (`core/engine.js`) ; noms historiques conservés.

/** Catalogue public complet (paliers inclus), familles et paliers. */
const publicCatalogue = foretRewards.publicCatalogue;

/**
 * Progression d'un compte.
 * @returns {Promise<{ rewards: object[], progress: Array<{ key: string, family: string,
 *   value: number, tier: number, nextTier: number|null, nextThreshold: number|null,
 *   remaining: number|null }> }>}
 */
function buildRewardProgress(userId, { db = database } = {}) {
  return foretRewards.buildProgress(userId, { db });
}

/** Nombre de paliers / badges obtenus par famille. */
const countByFamily = foretRewards.countByFamily;

/** Badges à `NEAR_THRESHOLD_GAP` du palier suivant. */
const nearThresholds = foretRewards.nearThresholds;

/**
 * Vitrine d'un ensemble d'élèves (déjà filtrés sur le périmètre de l'appelant).
 * Tri alphabétique — jamais par nombre de badges.
 * @param {string[]} studentIds
 */
function buildGroupShowcase(studentIds, { db = database } = {}) {
  return foretRewards.buildShowcase(studentIds, { db });
}

/**
 * Décerne un badge manuel. Le contrôle de permission (`rewards.award`) et de périmètre est
 * fait par la route.
 * @param {{ studentId: string, type: string, note: string, awardedBy: string|null, req?: object }} input
 * @returns {Promise<object>} badge décrit
 */
async function awardManualReward({ studentId, type, note, awardedBy, req = null }, db = database) {
  const { reward, type: kind } = await foretRewards.awardManual(
    { ownerId: studentId, type, note, awardedBy },
    db,
  );
  logAudit('reward_award', 'user', studentId, `Badge décerné : ${reward.key}`, {
    req,
    payload: { reward_key: reward.key, type: kind },
  });
  return reward;
}

/** Marque comme vues les annonces de badges d'un compte ; renvoie le nombre de lignes. */
function markRewardsSeen(userId, db = database) {
  return foretRewards.markSeen(userId, db);
}

module.exports = {
  NOTE_MAX,
  NEAR_THRESHOLD_GAP,
  RewardAwardError,
  publicCatalogue,
  buildRewardProgress,
  countByFamily,
  nearThresholds,
  buildGroupShowcase,
  awardManualReward,
  markRewardsSeen,
};
