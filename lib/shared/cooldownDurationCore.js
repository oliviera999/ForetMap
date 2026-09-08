'use strict';

// =====================================================================
// Durées du verrou de re-tentative — 100 % pur, COMMUN aux deux produits.
//
// Le délai se règle en HEURES (défaut 1 h) depuis le lot 2 de l'audit
// docs/AUDIT_VALIDATION_QUIZ_2026-09.md ; il se réglait en jours (défaut 3 j), ce qui
// faisait du verrou une sanction plutôt qu'un temps de relecture. Toutes les phrases
// affichées à l'élève et au professeur passent par `formatHoursLabel` /
// `formatRemainingLabel` : une seule façon d'écrire « 6 h », « 1 j 12 h », « 45 min ».
//
// Miroir ESM pour le front : src/shared/utils/cooldownDuration.js (mêmes règles, mêmes
// textes — un test compare les deux).
// =====================================================================

const MS_PER_MINUTE = 60 * 1000;
const MS_PER_HOUR = 60 * MS_PER_MINUTE;
const MS_PER_DAY = 24 * MS_PER_HOUR;
/** Borne haute du réglage : 365 jours. */
const MAX_COOLDOWN_HOURS = 365 * 24;

/**
 * Delai de verrou par defaut, en heures — SOURCE UNIQUE.
 *
 * Il valait 3 jours, puis 6 heures, et le nombre etait recopie a la main dans une dizaine
 * d'endroits (catalogue des reglages, resolveur de cascade, replis du front, editeurs).
 * Chaque changement de defaut demandait donc de les retrouver tous : le catalogue, les
 * formulaires et les phrases d'aide pouvaient annoncer trois valeurs differentes. Tout le
 * monde lit desormais cette constante (son miroir ESM pour le front).
 */
const DEFAULT_RETRY_COOLDOWN_HOURS = 1;

/** Borne le délai en heures (0 = pas de verrou). Valeur illisible → `fallback`. */
function clampCooldownHours(value, fallback = DEFAULT_RETRY_COOLDOWN_HOURS) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(0, Math.min(MAX_COOLDOWN_HOURS, Math.floor(n)));
}

/** Heures → millisecondes. */
function hoursToMs(hours) {
  return clampCooldownHours(hours, 0) * MS_PER_HOUR;
}

/** Heures restantes, arrondies au supérieur (0 si rien ne reste). */
function remainingHours(remainingMs) {
  const ms = Number(remainingMs) || 0;
  if (ms <= 0) return 0;
  return Math.ceil(ms / MS_PER_HOUR);
}

/** Jours restants, arrondis au supérieur — conservé pour les clients qui le lisaient. */
function remainingDays(remainingMs) {
  const ms = Number(remainingMs) || 0;
  if (ms <= 0) return 0;
  return Math.ceil(ms / MS_PER_DAY);
}

function plural(n, singular, pluralForm = `${singular}s`) {
  return n > 1 ? pluralForm : singular;
}

/**
 * Libellé d'un DÉLAI réglé (heures entières) : « aucun délai », « 6 h », « 1 jour »,
 * « 2 jours », « 1 j 12 h ».
 */
function formatHoursLabel(hours) {
  const h = clampCooldownHours(hours, 0);
  if (h <= 0) return 'aucun délai';
  if (h < 24) return `${h} h`;
  const days = Math.floor(h / 24);
  const rest = h % 24;
  if (rest === 0) return `${days} ${plural(days, 'jour')}`;
  return `${days} j ${rest} h`;
}

/**
 * Libellé d'un temps RESTANT (millisecondes) : « 45 min », « 3 h », « 1 j 2 h ».
 * Arrondi au supérieur pour ne jamais promettre une levée plus tôt que la vraie.
 */
function formatRemainingLabel(remainingMs) {
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

module.exports = {
  MS_PER_MINUTE,
  MS_PER_HOUR,
  MS_PER_DAY,
  MAX_COOLDOWN_HOURS,
  DEFAULT_RETRY_COOLDOWN_HOURS,
  clampCooldownHours,
  hoursToMs,
  remainingHours,
  remainingDays,
  formatHoursLabel,
  formatRemainingLabel,
};
