'use strict';

/**
 * Réglages du domaine « tâches » (`app_settings`).
 *
 * Tâches : plafond d'inscriptions, récurrence et archivage automatiques.
 *
 * Déclarations au format du noyau commun `lib/shared/settingsRegistryCore.js` (+ `scope` :
 * public / teacher / admin), agrégées par `lib/settings/domains.js` dans le registre unique
 * `SETTINGS_REGISTRY` de `lib/settings.js`. Recopiées telles quelles depuis ce registre
 * (piste B, étape B6) : mêmes clés, mêmes défauts, mêmes bornes.
 */

const TASKS_SETTINGS = {
  /** 0 = pas de limite. Compte les tâches non validées où l'élève est inscrit (toutes cartes). */
  'tasks.student_max_active_assignments': {
    scope: 'teacher',
    type: 'number',
    min: 0,
    max: 99,
    default: 0,
  },
  /** Si false : la duplication automatique des tâches récurrentes (job quotidien) est suspendue. */
  'tasks.recurring_automation_enabled': { scope: 'teacher', type: 'boolean', default: true },
  /** Si true : le job quotidien archive automatiquement les tâches validées et projets validés
   *  inactifs depuis `tasks.auto_archive_after_days` (référence : date de validation). */
  'tasks.auto_archive_enabled': { scope: 'teacher', type: 'boolean', default: true },
  /** Délai (jours) avant archivage automatique d'un élément validé. Défaut 120 (~4 mois).
   *  Min 7 (garde-fou anti-archivage prématuré), max 3650 (~10 ans). */
  'tasks.auto_archive_after_days': {
    scope: 'teacher',
    type: 'number',
    min: 7,
    max: 3650,
    default: 120,
  },
};

module.exports = { TASKS_SETTINGS };
