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

const NOTIFICATION_KIND = 'reward';

function tierLabel(reward) {
  const tier =
    reward?.tiers && reward.tier ? ['🌸 Bourgeon', '🌼 Fleur', '🍎 Fruit'][reward.tier - 1] : '';
  return tier ? ` — ${tier}` : '';
}

/** Texte d'une notification de badges (un seul ou plusieurs). */
function rewardNotificationText(awarded, { recap = false } = {}) {
  const list = (awarded || []).filter(Boolean);
  if (!list.length) return null;
  if (recap) {
    return {
      title: `Tes badges sont arrivés : ${list.length} badge${list.length > 1 ? 's' : ''} !`,
      body: 'Ouvre « Mes badges » pour découvrir ce que ton travail t’a déjà rapporté.',
    };
  }
  if (list.length === 1) {
    const r = list[0];
    return {
      title: `Nouveau badge : ${r.emoji} ${r.title}${tierLabel(r)}`,
      body: r.description,
    };
  }
  return {
    title: `${list.length} nouveaux badges !`,
    body: list.map((r) => `${r.emoji} ${r.title}${tierLabel(r)}`).join(' · '),
  };
}

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
