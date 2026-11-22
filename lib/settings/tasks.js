'use strict';

/**
 * Réglages du domaine « tâches » (`app_settings`).
 *
 * Tâches : plafond d'inscriptions, récurrence et archivage automatiques, élèves référents
 * automatiques des séries récurrentes (bornes : `lib/tasks/referentBounds.js`).
 *
 * Déclarations au format du noyau commun `lib/shared/settingsRegistryCore.js` (+ `scope` :
 * public / teacher / admin), agrégées par `lib/settings/domains.js` dans le registre unique
 * `SETTINGS_REGISTRY` de `lib/settings.js`. Recopiées telles quelles depuis ce registre
 * (piste B, étape B6) : mêmes clés, mêmes défauts, mêmes bornes.
 */

const { STUDENT_REFERENT_BOUNDS: B } = require('../tasks/referentBounds');

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
  /** Jours ouvrables du calendrier scolaire (0 = dimanche … 6 = samedi), séparés par des
   *  virgules. Édité par le panneau « Calendrier scolaire », qui recalcule aussi les jours
   *  des années en cours et à venir — ne pas l'écrire seul (cf. lib/schoolCalendar.js). */
  'tasks.school_calendar_open_weekdays': {
    scope: 'teacher',
    type: 'string',
    maxLength: 32,
    default: '1,2,3,4,5',
  },
  /** Délai (jours) avant archivage automatique d'un élément validé. Défaut 120 (~4 mois).
   *  Min 7 (garde-fou anti-archivage prématuré), max 3650 (~10 ans). */
  'tasks.auto_archive_after_days': {
    scope: 'teacher',
    type: 'number',
    min: 7,
    max: 3650,
    default: 120,
  },
  /** Noms des inscrits visibles par un n3beur : `all` (tous), `group` (ses camarades de
   *  groupe et lui-même), `self` (sa seule inscription). Le personnel n'est pas concerné. */
  'tasks.assignees_visibility': {
    scope: 'admin',
    type: 'enum',
    values: ['all', 'group', 'self'],
    default: 'group',
  },
  /** Journal d'une tâche lisible par un n3beur : `all` (tout compte connecté non visiteur),
   *  `assignees` (les inscrits de la tâche), `group` (entrées de ses camarades et les siennes). */
  'tasks.logs_visibility': {
    scope: 'admin',
    type: 'enum',
    values: ['all', 'assignees', 'group'],
    default: 'group',
  },
  // --- Élèves référents automatiques des séries récurrentes (lib/tasks/studentReferents.js) ---
  /** Interrupteur général : faux = le moteur n'écrit rien, quel que soit le déclencheur. */
  'tasks.student_referent_enabled': { scope: 'teacher', type: 'boolean', default: false },
  /** Groupe de l'année (identifiant ou slug) dont les élèves peuvent devenir référents.
   *  Vide, inexistant ou inactif = moteur inactif (avertissement journalisé). */
  'tasks.student_referent_group_id': {
    scope: 'teacher',
    type: 'string',
    maxLength: B.groupIdMaxLength,
    default: '',
  },
  /** Occurrences validées d'une même série nécessaires (règle de la progression n3beur). */
  'tasks.student_referent_min_validations': {
    scope: 'teacher',
    type: 'number',
    ...B.minValidations,
  },
  /** Plafond de séries par élève (0 = illimité). */
  'tasks.student_referent_max_series_per_student': {
    scope: 'teacher',
    type: 'number',
    ...B.maxSeriesPerStudent,
  },
  /** Plafond d'élèves référents par série (0 = illimité ; la borne laisse deux places aux
   *  référents enseignants sous `MAX_TASK_REFERENTS`). */
  'tasks.student_referent_max_students_per_series': {
    scope: 'teacher',
    type: 'number',
    ...B.maxStudentsPerSeries,
  },
  /** Retrait d'un lien automatique après N jours sans réalisation de la série (0 = jamais). */
  'tasks.student_referent_inactivity_days': {
    scope: 'teacher',
    type: 'number',
    ...B.inactivityDays,
  },
  /** Prévenir aussi les comptes `tasks.manage` quand un élève devient (ou n'est plus) référent. */
  'tasks.student_referent_notify_managers': { scope: 'teacher', type: 'boolean', default: true },
};

module.exports = { TASKS_SETTINGS };
