'use strict';

/**
 * Fusion de comptes (`lib/accountMerge.js`) : préparation de `user_rewards` avant la
 * réattribution générique des clés étrangères (`UPDATE IGNORE`, qui supprime la ligne du
 * compte absorbé quand la clé existe déjà chez le compte cible).
 *
 *  - badge obtenu par les deux comptes : la date la plus **ancienne** est gardée ;
 *  - badges manuels (`manuel.<type>.<n>`) du compte absorbé : renumérotés à la suite de ceux
 *    du compte cible, pour qu'aucun ne soit perdu par collision de numéro ;
 *  - les colonnes ajoutées (mot, adulte, annonce vue) suivent la ligne déplacée.
 */

const { foretRewards } = require('./foretEngine');

/**
 * @param {{ queryAll: Function, execute: Function }} tx transaction de la fusion
 * @param {string} fromUserId compte absorbé
 * @param {string} intoUserId compte cible
 * @returns {Promise<{ keptOldestDates: number, renumbered: number }>}
 */
function prepareRewardsMerge(tx, fromUserId, intoUserId) {
  return foretRewards.prepareMerge(tx, fromUserId, intoUserId);
}

module.exports = { prepareRewardsMerge };
