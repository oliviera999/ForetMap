'use strict';

/**
 * Tâches planifiées quotidiennes du serveur, extraites de `server.js` (lot D4 du connecteur) :
 * la même liste sert au minuteur du serveur (`runDailyJobs`) et au lancement à la demande
 * (`runJobNow`, outil `foretmap_ops run_cron`).
 *
 * Chaque exécution est tracée dans `scheduled_job_runs` (`trackJobRun`, `lib/scheduledJobs.js`,
 * migration 325) : `foretmap_cron_status` y lit la dernière exécution et les retards. Le
 * traçage est best-effort, sans effet sur le job lui-même.
 *
 * Ordre et comportement identiques à l'ancienne closure de `server.js` : les quatre jobs sont
 * lancés sans attente l'un de l'autre ; l'échec de l'un est journalisé (`warn`) et n'empêche
 * pas les suivants.
 */

const logger = require('./logger');
const { trackJobRun } = require('./scheduledJobs');
const { runRecurringTaskSpawnJob } = require('./recurringTasks');
const { runAutoArchiveJob } = require('./autoArchive');
const { purgeOldNotifications } = require('./notifications');
const { runTaskDeadlineRemindersJob } = require('./taskDeadlineReminders');

/**
 * Jobs quotidiens, dans l'ordre de lancement. `name` est l'identifiant stable du journal
 * `scheduled_job_runs` (ne pas le renommer : l'historique et `foretmap_cron_status` en
 * dépendent).
 */
const DAILY_JOBS = Object.freeze([
  Object.freeze({
    name: 'recurring_tasks',
    label: 'Occurrences des tâches récurrentes',
    failureMessage: 'Job tâches récurrentes',
    run: () => runRecurringTaskSpawnJob(),
  }),
  // Archivage automatique des tâches/projets validés anciens (réglable, cf. lib/autoArchive).
  Object.freeze({
    name: 'auto_archive',
    label: 'Archivage automatique des tâches et projets validés',
    failureMessage: 'Job archivage automatique',
    run: () => runAutoArchiveJob(),
  }),
  Object.freeze({
    name: 'notifications_purge',
    label: 'Purge des notifications anciennes',
    failureMessage: 'Job purge notifications',
    run: () => purgeOldNotifications(),
  }),
  Object.freeze({
    name: 'task_deadline_reminders',
    label: 'Rappels d’échéance des tâches',
    failureMessage: 'Job rappels d’échéance',
    run: () => runTaskDeadlineRemindersJob(),
  }),
]);

/** Noms des jobs quotidiens (ordre de lancement). */
const DAILY_JOB_NAMES = Object.freeze(DAILY_JOBS.map((job) => job.name));

/** Liste publique : nom et libellé de chaque job. */
function listDailyJobs() {
  return DAILY_JOBS.map(({ name, label }) => ({ name, label }));
}

/**
 * Lance tous les jobs quotidiens sans les attendre (minuteur de `server.js`). Une erreur est
 * journalisée et avalée : un job en échec ne doit ni arrêter les autres ni le processus.
 */
function runDailyJobs() {
  for (const job of DAILY_JOBS) {
    trackJobRun(job.name, job.run).catch((err) => logger.warn({ err }, job.failureMessage));
  }
}

/**
 * Exécute un job quotidien tout de suite et attend son résultat (tracé comme une exécution
 * planifiée). Lève si le nom est inconnu ou si le job échoue.
 * @param {string} name identifiant (`recurring_tasks`, `auto_archive`…)
 * @returns {Promise<{ job: string, durationMs: number, result: unknown }>}
 */
async function runJobNow(name) {
  const job = DAILY_JOBS.find((j) => j.name === String(name || '').trim());
  if (!job) {
    const err = new Error(
      `Tâche planifiée inconnue : ${name} (connues : ${DAILY_JOB_NAMES.join(', ')})`,
    );
    err.code = 'UNKNOWN_JOB';
    throw err;
  }
  const started = Date.now();
  const result = await trackJobRun(job.name, job.run);
  return { job: job.name, durationMs: Date.now() - started, result };
}

module.exports = { DAILY_JOBS, DAILY_JOB_NAMES, listDailyJobs, runDailyJobs, runJobNow };
