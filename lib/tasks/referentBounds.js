'use strict';

/**
 * Bornes des référents de tâches — source unique (élèves référents automatiques, lot 9).
 *
 * `MAX_TASK_REFERENTS` limite le nombre de référents d'une tâche (refus 400 à l'édition ; le
 * moteur des élèves référents consigne un dépassement sans erreur). Les bornes des réglages
 * `tasks.student_referent_*` (`lib/settings/tasks.js`) en découlent : le plafond d'élèves par
 * série laisse toujours deux places aux référents enseignants.
 */

const MAX_TASK_REFERENTS = 15;

/** Places réservées aux référents enseignants sous `MAX_TASK_REFERENTS`. */
const RESERVED_STAFF_REFERENT_SEATS = 2;

const STUDENT_REFERENT_BOUNDS = Object.freeze({
  minValidations: Object.freeze({ min: 1, max: 20, default: 2 }),
  maxSeriesPerStudent: Object.freeze({ min: 0, max: 50, default: 0 }),
  maxStudentsPerSeries: Object.freeze({
    min: 0,
    max: MAX_TASK_REFERENTS - RESERVED_STAFF_REFERENT_SEATS,
    default: 0,
  }),
  inactivityDays: Object.freeze({ min: 0, max: 730, default: 0 }),
  groupIdMaxLength: 64,
});

module.exports = { MAX_TASK_REFERENTS, RESERVED_STAFF_REFERENT_SEATS, STUDENT_REFERENT_BOUNDS };
