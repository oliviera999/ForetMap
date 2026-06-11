'use strict';

/**
 * O10 — couche service « tâches » : niveaux de champ (danger / difficulté / importance).
 * Logique pure extraite de `routes/tasks.js` (parsing entrée client ↔ valeur BDD ↔ clé API),
 * comportement identique. Aucune dépendance DB.
 */

const ALLOWED_TASK_DANGER_LEVELS = new Set(['safe', 'potential_danger', 'dangerous', 'very_dangerous']);
const ALLOWED_TASK_DIFFICULTY_LEVELS = new Set(['easy', 'medium', 'hard', 'very_hard']);
const ALLOWED_TASK_IMPORTANCE_LEVELS = new Set(['not_important', 'low', 'medium', 'high', 'absolute']);

function asTrimmedString(value) {
  if (value == null) return '';
  return String(value).trim();
}

/** Entrée client : absent / vide / null → non renseigné (null SQL) ; valeur invalide → { error }. */
function parseTaskDangerLevelFromClient(value) {
  if (value === undefined || value === null) return { level: null };
  const raw = asTrimmedString(value).toLowerCase();
  if (!raw) return { level: null };
  if (ALLOWED_TASK_DANGER_LEVELS.has(raw)) return { level: raw };
  return { error: 'Niveau de danger invalide' };
}

function parseTaskDifficultyLevelFromClient(value) {
  if (value === undefined || value === null) return { level: null };
  const raw = asTrimmedString(value).toLowerCase();
  if (!raw) return { level: null };
  if (ALLOWED_TASK_DIFFICULTY_LEVELS.has(raw)) return { level: raw };
  return { error: 'Niveau de difficulté invalide' };
}

function parseTaskImportanceLevelFromClient(value) {
  if (value === undefined || value === null) return { level: null };
  const raw = asTrimmedString(value).toLowerCase();
  if (!raw) return { level: null };
  if (ALLOWED_TASK_IMPORTANCE_LEVELS.has(raw)) return { level: raw };
  return { error: "Degré d'importance invalide" };
}

/** Valeur BDD → clé API ou null (jamais de défaut implicite). */
function taskDangerLevelForResponse(value) {
  if (value == null) return null;
  const raw = asTrimmedString(value).toLowerCase();
  if (!raw) return null;
  return ALLOWED_TASK_DANGER_LEVELS.has(raw) ? raw : null;
}

function taskDifficultyLevelForResponse(value) {
  if (value == null) return null;
  const raw = asTrimmedString(value).toLowerCase();
  if (!raw) return null;
  return ALLOWED_TASK_DIFFICULTY_LEVELS.has(raw) ? raw : null;
}

function taskImportanceLevelForResponse(value) {
  if (value == null) return null;
  const raw = asTrimmedString(value).toLowerCase();
  if (!raw) return null;
  return ALLOWED_TASK_IMPORTANCE_LEVELS.has(raw) ? raw : null;
}

module.exports = {
  ALLOWED_TASK_DANGER_LEVELS,
  ALLOWED_TASK_DIFFICULTY_LEVELS,
  ALLOWED_TASK_IMPORTANCE_LEVELS,
  parseTaskDangerLevelFromClient,
  parseTaskDifficultyLevelFromClient,
  parseTaskImportanceLevelFromClient,
  taskDangerLevelForResponse,
  taskDifficultyLevelForResponse,
  taskImportanceLevelForResponse,
};
