'use strict';

/**
 * Annonce des badges nouvellement obtenus.
 *
 *  - **module allumé** (`ui.modules.rewards_enabled`) : une notification à l'obtention,
 *    **regroupée** quand plusieurs badges arrivent dans la même action ; `seen_at` est posé
 *    à l'ouverture de « Mes badges » (`POST /api/rewards/me/seen`) ;
 *  - **module éteint** : attribution silencieuse, aucune annonce (les badges apparaissent
 *    tous au rallumage) ;
 *  - **rattrapage initial** : une seule notification récapitulative par élève.
 */

const { isModuleEnabled } = require('../shared/moduleGate');
const { notifyUsers } = require('../notifications');
const { rewardAnnouncementText } = require('../shared/rewardsCore');

const NOTIFICATION_KIND = 'reward';

/** Texte d'une notification de badges (un seul ou plusieurs) : noyau commun aux produits. */
const rewardNotificationText = rewardAnnouncementText;

/**
 * Annonce les badges d'un élève (une notification au plus). Rien si le module est éteint.
 * @returns {Promise<boolean>} vrai si une notification a été créée
 */
async function announceRewards(userId, awarded, { recap = false, dedupeKey = null } = {}) {
  const text = rewardNotificationText(awarded, { recap });
  if (!userId || !text) return false;
  if (!(await isModuleEnabled('foret', 'rewards'))) return false;
  const result = await notifyUsers({
    userIds: [userId],
    kind: NOTIFICATION_KIND,
    title: text.title,
    body: text.body,
    dedupeKey,
  });
  return result.inserted > 0;
}

/**
 * Badges à annoncer dans une fenêtre (fin de séance, fresque) : tous si le module est
 * allumé, aucun sinon — ils sont pourtant enregistrés.
 */
async function announceableRewards(awarded) {
  if (!Array.isArray(awarded) || !awarded.length) return [];
  return (await isModuleEnabled('foret', 'rewards')) ? awarded : [];
}

module.exports = {
  NOTIFICATION_KIND,
  rewardNotificationText,
  announceRewards,
  announceableRewards,
};
