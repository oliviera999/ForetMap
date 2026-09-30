const crypto = require('node:crypto');

const MIN_DICE_COUNT = 1;
const MAX_DICE_COUNT = 5;
const DICE_SIDES = 6;

/**
 * Valide un jet de dés virtuel (D6, 1 à 5 dés).
 *
 * Conservé pour compatibilité : depuis l'audit sécurité 2026-09-30 (GL4), les valeurs
 * envoyées par le client ne sont PLUS utilisées — le serveur tire les dés
 * (`rollServerDice`). Seul le NOMBRE de dés est lu dans la requête (`parseDiceCount`).
 * @returns {{ values: number[], total: number } | null}
 */
function parseDiceRollPayload(body) {
  const values = body?.values;
  if (!Array.isArray(values) || values.length < MIN_DICE_COUNT || values.length > MAX_DICE_COUNT) {
    return null;
  }
  const nums = values.map((value) => Number(value));
  if (nums.some((n) => !Number.isInteger(n) || n < 1 || n > DICE_SIDES)) {
    return null;
  }
  const total = Number(body?.total);
  const expectedTotal = nums.reduce((sum, n) => sum + n, 0);
  if (!Number.isFinite(total) || total !== expectedTotal) {
    return null;
  }
  return { values: nums, total };
}

/**
 * Nombre de dés demandé : `count` (1 à 5), ou — compatibilité avec les anciens clients — la
 * longueur du tableau `values` (dont le contenu est ignoré).
 * @returns {number|null}
 */
function parseDiceCount(body) {
  const raw = body?.count ?? body?.diceCount;
  if (raw != null && raw !== '') {
    const n = Number(raw);
    return Number.isInteger(n) && n >= MIN_DICE_COUNT && n <= MAX_DICE_COUNT ? n : null;
  }
  const values = body?.values;
  if (Array.isArray(values) && values.length >= MIN_DICE_COUNT && values.length <= MAX_DICE_COUNT) {
    return values.length;
  }
  return null;
}

/**
 * Tire `count` D6 côté serveur (`crypto.randomInt`, uniforme). Le client n'impose plus son
 * résultat : un joueur envoyait `{ values: [6,6,6,6,6], total: 30 }` et avançait d'autant.
 * @returns {{ values: number[], total: number }}
 */
function rollServerDice(count, randomInt = crypto.randomInt) {
  const n = Math.min(MAX_DICE_COUNT, Math.max(MIN_DICE_COUNT, Number(count) || MIN_DICE_COUNT));
  const values = Array.from({ length: n }, () => randomInt(1, DICE_SIDES + 1));
  return { values, total: values.reduce((sum, v) => sum + v, 0) };
}

module.exports = {
  MIN_DICE_COUNT,
  MAX_DICE_COUNT,
  DICE_SIDES,
  parseDiceRollPayload,
  parseDiceCount,
  rollServerDice,
};
