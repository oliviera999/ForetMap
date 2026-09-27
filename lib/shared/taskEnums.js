/* Fichier généré par scripts/sync-shared-cores.js — ne pas éditer. */
/* Source : src/shared/enums/taskEnums.js — régénérer avec `npm run sync:shared-cores`. */
'use strict';

/**
 * Référentiel des valeurs énumérées — domaine **tâches**. Les colonnes sont des `varchar(32)`
 * ; depuis la migration 307, `tasks.status` et les trois niveaux portent une contrainte
 * `CHECK` écrite avec ces mêmes valeurs (comparaison tenue par
 * `tests/enums-referential.test.js`).
 *
 * Le front ajoute des **statuts dérivés** (`overdue`, `project_completed`,
 * `project_validated`) qui ne sont jamais écrits en base : ils ne font pas partie de
 * `TASK_STATUS_ENUM`.
 *
 * Miroir CJS : `lib/shared/taskEnums.js` (généré, ne pas éditer).
 */

const { defineEnum } = require('./enumCore');

/** Statut d'une tâche en base. */
const TASK_STATUS_ENUM = defineEnum('TASK_STATUS_ENUM', {
  values: ['available', 'in_progress', 'done', 'validated', 'proposed', 'on_hold'],
  labels: {
    available: 'À faire',
    in_progress: 'En cours',
    done: 'Terminée',
    validated: 'Validée',
    proposed: 'Proposée',
    on_hold: 'En attente',
  },
  columns: ['tasks.status'],
});

/** Niveau de danger (NULL = non renseigné), du moins au plus dangereux. */
const TASK_DANGER_LEVEL_ENUM = defineEnum('TASK_DANGER_LEVEL_ENUM', {
  values: ['safe', 'potential_danger', 'dangerous', 'very_dangerous'],
  labels: {
    safe: 'Sans danger',
    potential_danger: 'Danger potentiel',
    dangerous: 'Dangereux',
    very_dangerous: 'Très dangereux',
  },
  columns: ['tasks.danger_level'],
});

/** Niveau de difficulté (NULL = non renseigné), du plus facile au plus difficile. */
const TASK_DIFFICULTY_LEVEL_ENUM = defineEnum('TASK_DIFFICULTY_LEVEL_ENUM', {
  values: ['easy', 'medium', 'hard', 'very_hard'],
  labels: {
    easy: 'Facile',
    medium: 'Moyen',
    hard: 'Compliqué',
    very_hard: 'Super compliqué',
  },
  columns: ['tasks.difficulty_level'],
});

/**
 * Degré d'importance (NULL = non renseigné), du moins au plus important. L'ordre sert au tri
 * des listes : le poids d'une valeur est sa position + 1 (`not_important` = 1 …
 * `absolute` = 5), côté SQL comme côté front.
 */
const TASK_IMPORTANCE_LEVEL_ENUM = defineEnum('TASK_IMPORTANCE_LEVEL_ENUM', {
  values: ['not_important', 'low', 'medium', 'high', 'absolute'],
  labels: {
    not_important: 'Pas important',
    low: 'Peu important',
    medium: 'Modéré',
    high: 'Important',
    absolute: 'Urgent !',
  },
  columns: ['tasks.importance_level'],
});

/** Mode de validation d'une tâche (défaut `single_done`). */
const TASK_COMPLETION_MODE_ENUM = defineEnum('TASK_COMPLETION_MODE_ENUM', {
  values: ['single_done', 'all_assignees_done'],
  labels: {
    single_done: 'Validation individuelle',
    all_assignees_done: 'Validation collective',
  },
  columns: ['tasks.completion_mode'],
});

/** Récurrence d'une tâche (NULL = unique). */
const TASK_RECURRENCE_ENUM = defineEnum('TASK_RECURRENCE_ENUM', {
  values: ['weekly', 'biweekly', 'monthly'],
  labels: {
    weekly: 'Hebdomadaire',
    biweekly: 'Toutes les 2 semaines',
    monthly: 'Mensuelle',
  },
  columns: ['tasks.recurrence'],
});

module.exports = {
  TASK_STATUS_ENUM,
  TASK_DANGER_LEVEL_ENUM,
  TASK_DIFFICULTY_LEVEL_ENUM,
  TASK_IMPORTANCE_LEVEL_ENUM,
  TASK_COMPLETION_MODE_ENUM,
  TASK_RECURRENCE_ENUM,
};
