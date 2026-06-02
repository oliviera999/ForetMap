export const MIN_DICE_COUNT = 1;
export const MAX_DICE_COUNT = 5;
export const DICE_SIDES = 6;
export const DICE_ROLL_ANIMATION_MS = 900;

const STORAGE_KEY = 'gl_virtual_dice_count';

export function clampDiceCount(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return MIN_DICE_COUNT;
  return Math.max(MIN_DICE_COUNT, Math.min(MAX_DICE_COUNT, Math.floor(n)));
}

function randomIntInclusive(min, max) {
  const span = max - min + 1;
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    const buf = new Uint32Array(1);
    crypto.getRandomValues(buf);
    return min + (buf[0] % span);
  }
  return min + Math.floor(Math.random() * span);
}

export function rollDie() {
  return randomIntInclusive(1, DICE_SIDES);
}

export function rollDice(count) {
  const safeCount = clampDiceCount(count);
  const values = [];
  for (let i = 0; i < safeCount; i += 1) {
    values.push(rollDie());
  }
  const total = values.reduce((sum, v) => sum + v, 0);
  return { values, total };
}

export function readStoredDiceCount() {
  if (typeof localStorage === 'undefined') return MIN_DICE_COUNT;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw == null || raw === '') return MIN_DICE_COUNT;
    return clampDiceCount(Number(raw));
  } catch (_) {
    return MIN_DICE_COUNT;
  }
}

export function writeStoredDiceCount(count) {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, String(clampDiceCount(count)));
  } catch (_) {
    // noop
  }
}

export function formatDiceBreakdown(values) {
  if (!Array.isArray(values) || values.length === 0) return '';
  return values.join(' + ');
}
