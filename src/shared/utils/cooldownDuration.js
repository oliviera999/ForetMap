/**
 * Durées du verrou de re-tentative — miroir ESM de lib/shared/cooldownDurationCore.js.
 * Mêmes règles, mêmes textes : « 6 h », « 1 jour », « 1 j 12 h », « 45 min ».
 * Un test compare les deux implémentations (tests-ui/shared/cooldownDuration.test.js).
 */

export const MS_PER_MINUTE = 60 * 1000;
export const MS_PER_HOUR = 60 * MS_PER_MINUTE;
export const MS_PER_DAY = 24 * MS_PER_HOUR;
export const MAX_COOLDOWN_HOURS = 365 * 24;

export function clampCooldownHours(value, fallback = 6) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(0, Math.min(MAX_COOLDOWN_HOURS, Math.floor(n)));
}

export function hoursToMs(hours) {
  return clampCooldownHours(hours, 0) * MS_PER_HOUR;
}

export function remainingHours(remainingMs) {
  const ms = Number(remainingMs) || 0;
  if (ms <= 0) return 0;
  return Math.ceil(ms / MS_PER_HOUR);
}

export function remainingDays(remainingMs) {
  const ms = Number(remainingMs) || 0;
  if (ms <= 0) return 0;
  return Math.ceil(ms / MS_PER_DAY);
}

function plural(n, singular, pluralForm = `${singular}s`) {
  return n > 1 ? pluralForm : singular;
}

/** Libellé d'un DÉLAI réglé (heures entières). */
export function formatHoursLabel(hours) {
  const h = clampCooldownHours(hours, 0);
  if (h <= 0) return 'aucun délai';
  if (h < 24) return `${h} h`;
  const days = Math.floor(h / 24);
  const rest = h % 24;
  if (rest === 0) return `${days} ${plural(days, 'jour')}`;
  return `${days} j ${rest} h`;
}

/** Libellé d'un temps RESTANT (millisecondes), arrondi au supérieur. */
export function formatRemainingLabel(remainingMs) {
  const ms = Number(remainingMs) || 0;
  if (ms <= 0) return '';
  if (ms < MS_PER_HOUR) return `${Math.max(1, Math.ceil(ms / MS_PER_MINUTE))} min`;
  const hours = remainingHours(ms);
  if (hours < 24) return `${hours} h`;
  const days = Math.floor(hours / 24);
  const rest = hours % 24;
  if (rest === 0) return `${days} ${plural(days, 'jour')}`;
  return `${days} j ${rest} h`;
}

/**
 * Libellé du temps restant d'un bloc `cooldown` renvoyé par le serveur : préfère
 * `remaining_label` (calculé côté serveur), sinon recalcule depuis `remaining_ms`, puis
 * `remaining_hours`, puis l'ancien `remaining_days`.
 */
export function cooldownRemainingLabel(cooldown) {
  if (!cooldown) return '';
  if (cooldown.remaining_label) return String(cooldown.remaining_label);
  if (Number(cooldown.remaining_ms) > 0) return formatRemainingLabel(Number(cooldown.remaining_ms));
  if (Number(cooldown.remaining_hours) > 0) {
    return formatRemainingLabel(Number(cooldown.remaining_hours) * MS_PER_HOUR);
  }
  if (Number(cooldown.remaining_days) > 0) {
    return formatRemainingLabel(Number(cooldown.remaining_days) * MS_PER_DAY);
  }
  return '';
}

/**
 * Délai réglé (heures) d'un challenge ou d'un bloc `cooldown` : `retry_cooldown_hours`,
 * `retry_hours`, ou l'ancien `retry_days` × 24.
 */
export function cooldownRetryHours(source) {
  if (!source) return 0;
  const direct = source.retry_cooldown_hours ?? source.retry_hours ?? source.retryCooldownHours;
  if (direct != null && Number.isFinite(Number(direct))) return clampCooldownHours(direct, 0);
  const legacyDays = source.retry_cooldown_days ?? source.retry_days ?? source.retryCooldownDays;
  if (legacyDays != null && Number.isFinite(Number(legacyDays))) {
    return clampCooldownHours(Number(legacyDays) * 24, 0);
  }
  // Un challenge porte aussi le délai dans son bloc `cooldown` (serveurs antérieurs au lot 2).
  if (source.cooldown && typeof source.cooldown === 'object') {
    return cooldownRetryHours(source.cooldown);
  }
  return 0;
}
