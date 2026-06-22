const MIN_DICE_COUNT = 1;
const MAX_DICE_COUNT = 5;
const DICE_SIDES = 6;

/**
 * Valide un jet de dés virtuel (D6, 1 à 5 dés).
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

module.exports = {
  MIN_DICE_COUNT,
  MAX_DICE_COUNT,
  DICE_SIDES,
  parseDiceRollPayload,
};
