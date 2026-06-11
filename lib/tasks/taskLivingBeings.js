'use strict';

/**
 * O10 — couche service « tâches » : êtres vivants associés (catalogue biodiversité),
 * comme les zones/repères. Logique pure extraite de `routes/tasks.js`, comportement identique.
 * Aucune dépendance DB.
 */

/** Liste de noms d’êtres vivants. Accepte tableau, JSON sérialisé, ou liste CSV. */
function normalizeTaskLivingBeingsInput(input, fallback = '') {
  const base = Array.isArray(input)
    ? input
    : typeof input === 'string' && input.trim()
      ? (() => {
        try {
          const parsed = JSON.parse(input);
          if (Array.isArray(parsed)) return parsed;
        } catch (_) {
          /* ignore */
        }
        return input.split(',');
      })()
      : [];
  const cleaned = [...new Set(base.map((v) => String(v || '').trim()).filter(Boolean))];
  if (cleaned.length === 0 && fallback && String(fallback).trim()) return [String(fallback).trim()];
  return cleaned;
}

function serializeTaskLivingBeingsForDb(input) {
  const arr = normalizeTaskLivingBeingsInput(input, '');
  return arr.length ? JSON.stringify(arr) : null;
}

function attachTaskLivingBeingsApiFields(task) {
  if (!task) return;
  task.living_beings_list = normalizeTaskLivingBeingsInput(task.living_beings, '');
  delete task.living_beings;
}

module.exports = {
  normalizeTaskLivingBeingsInput,
  serializeTaskLivingBeingsForDb,
  attachTaskLivingBeingsApiFields,
};
