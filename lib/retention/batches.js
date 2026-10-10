'use strict';

/**
 * Lots bornés : une instruction `UPDATE`/`DELETE … LIMIT n` à la fois, répétée tant qu'elle
 * traite un lot plein. Chaque instruction est sa propre transaction (autocommit) : aucun verrou
 * n'est tenu sur toute une table, et une interruption laisse un état cohérent — la reprise
 * repart de ce qui reste.
 */

/** Plafond d'itérations : protège d'une boucle infinie si une condition ne converge pas. */
const MAX_BATCHES = 100000;

/**
 * @param {number} batchSize taille de lot (entier validé par l'appelant)
 * @param {(limit: number) => Promise<{ affectedRows?: number }>} step une instruction bornée
 * @returns {Promise<number>} lignes traitées au total
 */
async function runInBatches(batchSize, step) {
  const limit = Number(batchSize);
  if (!Number.isInteger(limit) || limit < 1)
    throw new Error(`Taille de lot invalide : ${batchSize}`);
  let total = 0;
  for (let i = 0; i < MAX_BATCHES; i += 1) {
    const result = await step(limit);
    const affected = Number(result?.affectedRows || 0);
    total += affected;
    if (affected < limit) return total;
  }
  throw new Error('Purge par lots interrompue : nombre maximal de lots atteint.');
}

module.exports = { MAX_BATCHES, runInBatches };
