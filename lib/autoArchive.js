'use strict';

/**
 * Archivage AUTOMATIQUE des tâches et projets terminés (soft-delete), exécuté par le job
 * quotidien. Portée volontairement restreinte aux éléments FINIS pour ne jamais masquer de
 * travail en cours :
 *  - tâches en statut `validated` dont `validated_at` dépasse le délai ;
 *  - projets en statut `validated` dont `finished_at` dépasse le délai.
 * Le délai (jours) et l'activation sont paramétrables (`tasks.auto_archive_after_days`,
 * `tasks.auto_archive_enabled`). Les archives restent réversibles (désarchivage manuel).
 */

const { execute } = require('../database');
const { getSettingValue } = require('./settings');
const logger = require('./logger');
const { emitTasksChanged } = require('./realtime');

const DEFAULT_AFTER_DAYS = 120; // ~4 mois
const MIN_AFTER_DAYS = 7;
const MAX_AFTER_DAYS = 3650;

/** Nombre de jours de délai, normalisé aux bornes du registre de réglages. */
function normalizeAfterDays(raw) {
  const n = Math.floor(Number(raw));
  if (!Number.isFinite(n)) return DEFAULT_AFTER_DAYS;
  return Math.min(MAX_AFTER_DAYS, Math.max(MIN_AFTER_DAYS, n));
}

/**
 * Archive les éléments validés dont la date de validation dépasse le délai configuré.
 * @param {{ db?: {execute: Function} }} [opts] injection BDD pour les tests
 * @returns {Promise<{ enabled: boolean, afterDays: number, tasksArchived: number, projectsArchived: number }>}
 */
async function runAutoArchiveJob(opts = {}) {
  const db = opts.db || { execute };
  const enabled = !!(await getSettingValue('tasks.auto_archive_enabled', true));
  const afterDays = normalizeAfterDays(
    await getSettingValue('tasks.auto_archive_after_days', DEFAULT_AFTER_DAYS),
  );
  if (!enabled) {
    return { enabled: false, afterDays, tasksArchived: 0, projectsArchived: 0 };
  }

  // Tâches validées assez anciennes et pas déjà archivées. Marqueur cascade à 0
  // (archivage indépendant, désarchivable individuellement).
  const taskRes = await db.execute(
    `UPDATE tasks
        SET archived_at = NOW(), archived_via_project = 0
      WHERE status = 'validated'
        AND archived_at IS NULL
        AND validated_at IS NOT NULL
        AND validated_at < DATE_SUB(NOW(), INTERVAL ? DAY)`,
    [afterDays],
  );

  // Projets validés assez anciens (les projets `completed` restent hors périmètre : statut
  // automatique réversible, pas une clôture décidée). Pas de cascade : les tâches suivent
  // leur propre critère d'archivage auto.
  const projectRes = await db.execute(
    `UPDATE task_projects
        SET archived_at = NOW()
      WHERE status = 'validated'
        AND archived_at IS NULL
        AND finished_at IS NOT NULL
        AND finished_at < DATE_SUB(NOW(), INTERVAL ? DAY)`,
    [afterDays],
  );

  const tasksArchived = Number(taskRes?.affectedRows) || 0;
  const projectsArchived = Number(projectRes?.affectedRows) || 0;

  if (tasksArchived > 0 || projectsArchived > 0) {
    logger.info(
      { tasksArchived, projectsArchived, afterDays },
      'Archivage automatique : éléments validés archivés',
    );
    emitTasksChanged({ reason: 'auto_archive' });
  }

  return { enabled: true, afterDays, tasksArchived, projectsArchived };
}

module.exports = {
  runAutoArchiveJob,
  normalizeAfterDays,
  DEFAULT_AFTER_DAYS,
  MIN_AFTER_DAYS,
  MAX_AFTER_DAYS,
};
