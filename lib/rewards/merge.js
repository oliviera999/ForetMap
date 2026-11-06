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

const { parseRewardKey } = require('./catalog');

/**
 * @param {{ queryAll: Function, execute: Function }} tx transaction de la fusion
 * @param {string} fromUserId compte absorbé
 * @param {string} intoUserId compte cible
 * @returns {Promise<{ keptOldestDates: number, renumbered: number }>}
 */
async function prepareRewardsMerge(tx, fromUserId, intoUserId) {
  const dated = await tx.execute(
    `UPDATE user_rewards a
       JOIN user_rewards b ON b.reward_key = a.reward_key AND b.user_id = ?
        SET a.awarded_at = LEAST(a.awarded_at, b.awarded_at)
      WHERE a.user_id = ?`,
    [fromUserId, intoUserId],
  );
  const manualRows = await tx.queryAll(
    `SELECT user_id, reward_key, awarded_at FROM user_rewards
      WHERE user_id IN (?, ?) AND reward_key LIKE 'manuel.%'
      ORDER BY awarded_at ASC, reward_key ASC`,
    [fromUserId, intoUserId],
  );
  const maxByType = new Map();
  for (const row of manualRows) {
    if (row.user_id !== intoUserId) continue;
    const parsed = parseRewardKey(row.reward_key);
    if (!parsed?.occurrence) continue;
    maxByType.set(
      parsed.entry.key,
      Math.max(maxByType.get(parsed.entry.key) || 0, parsed.occurrence),
    );
  }
  // Deux passes : clés temporaires d'abord, pour qu'une renumérotation ne heurte pas une
  // autre ligne du même compte (manuel.guide.1 → .2 alors que .2 existe encore).
  const plan = [];
  for (const row of manualRows) {
    if (row.user_id !== fromUserId) continue;
    const parsed = parseRewardKey(row.reward_key);
    if (!parsed?.occurrence) continue;
    const next = (maxByType.get(parsed.entry.key) || 0) + 1;
    maxByType.set(parsed.entry.key, next);
    const nextKey = `${parsed.entry.key}.${next}`;
    if (nextKey !== row.reward_key) plan.push({ from: row.reward_key, to: nextKey });
  }
  for (let i = 0; i < plan.length; i += 1) {
    plan[i].tmp = `merge-tmp-${i}`;
    await tx.execute(
      'UPDATE user_rewards SET reward_key = ? WHERE user_id = ? AND reward_key = ?',
      [plan[i].tmp, fromUserId, plan[i].from],
    );
  }
  for (const step of plan) {
    await tx.execute(
      'UPDATE user_rewards SET reward_key = ? WHERE user_id = ? AND reward_key = ?',
      [step.to, fromUserId, step.tmp],
    );
  }
  const renumbered = plan.length;
  return { keptOldestDates: Number(dated?.affectedRows) || 0, renumbered };
}

module.exports = { prepareRewardsMerge };
