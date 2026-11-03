'use strict';

/**
 * Journal horodaté des tâches planifiées (`scheduled_job_runs`, migration 325).
 *
 * Avant ce lot, seules la purge planifiée (`retention_purge_runs`) et les lignes de crontab
 * (fichiers `logs/*.log`) laissaient une trace durable ; les jobs quotidiens du serveur
 * (tâches récurrentes, archivage, purge des notifications, rappels d'échéance) ne laissaient
 * qu'une ligne Pino, perdue au redémarrage suivant. `foretmap_cron_status` ne pouvait donc pas
 * dire « le job n'a pas tourné depuis trois jours ».
 *
 * `trackJobRun(job, work)` ouvre une ligne `running`, exécute `work`, la ferme en `success` ou
 * `failure` avec la durée et un résumé **nettoyé** (comptages ; message d'erreur passé par
 * `maskSecrets` puis débarrassé des identifiants). Le journal est **best-effort** : une base
 * indisponible n'empêche jamais le job de tourner, et une erreur du job est relancée telle quelle.
 * Rétention : `purgeOldJobRuns` (appelé par le script de rapport de santé), 180 jours.
 */

const { execute, queryAll } = require('../database');
const logger = require('./logger');

const DETAIL_MAX = 500;
const RETENTION_DAYS = 180;

/** Résumé court sans identifiant : nombres longs, UUID et e-mails retirés. */
function cleanDetail(text) {
  const { maskSecrets } = require('./mcp/secretMask');
  return maskSecrets(String(text ?? ''))
    .replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi, '[id]')
    .replace(/'[^'\n]*'/g, "'[valeur]'")
    .slice(0, DETAIL_MAX);
}

/** Résumé d'un résultat de job : seuls les compteurs et drapeaux simples sont gardés. */
function summarizeResult(result) {
  if (result == null || typeof result !== 'object') return null;
  const parts = [];
  for (const [k, v] of Object.entries(result)) {
    if (Array.isArray(v)) parts.push(`${k}=${v.length}`);
    else if (typeof v === 'number' || typeof v === 'boolean') parts.push(`${k}=${v}`);
    else if (['reason', 'status', 'via'].includes(k) && typeof v === 'string') {
      parts.push(`${k}=${v.slice(0, 40)}`);
    }
    if (parts.length >= 12) break;
  }
  return parts.length ? parts.join(' ') : null;
}

async function startJobRun(job) {
  try {
    const res = await execute(
      "INSERT INTO scheduled_job_runs (job, outcome) VALUES (?, 'running')",
      [String(job).slice(0, 64)],
    );
    return Number(res.insertId);
  } catch (err) {
    logger.warn(
      { err, job, msg: 'scheduled_job_journal_unavailable' },
      'Journal des tâches planifiées indisponible',
    );
    return null;
  }
}

async function finishJobRun(runId, { outcome, durationMs, detail }) {
  if (!runId) return;
  try {
    await execute(
      `UPDATE scheduled_job_runs SET finished_at = NOW(3), outcome = ?, duration_ms = ?, detail = ?
        WHERE id = ?`,
      [
        outcome,
        Number.isFinite(durationMs) ? Math.max(0, Math.round(durationMs)) : null,
        detail ? cleanDetail(detail) : null,
        runId,
      ],
    );
  } catch (err) {
    logger.warn(
      { err, msg: 'scheduled_job_journal_unavailable' },
      'Journal des tâches planifiées indisponible',
    );
  }
}

/**
 * Exécute `work` en traçant son exécution.
 * @template T
 * @param {string} job identifiant stable (`recurring_tasks`, `health_report`…)
 * @param {() => Promise<T>} work
 * @returns {Promise<T>}
 */
async function trackJobRun(job, work) {
  const started = Date.now();
  const runId = await startJobRun(job);
  try {
    const result = await work();
    await finishJobRun(runId, {
      outcome: 'success',
      durationMs: Date.now() - started,
      detail: summarizeResult(result),
    });
    return result;
  } catch (err) {
    await finishJobRun(runId, {
      outcome: 'failure',
      durationMs: Date.now() - started,
      detail: err?.message || String(err),
    });
    throw err;
  }
}

/**
 * Dernière exécution et compteurs récents par job.
 * @returns {Promise<Array<{ job, last_started_at, last_finished_at, last_outcome, last_duration_ms, last_detail, runs_7d, failures_7d }>>}
 */
async function listJobSummaries() {
  const rows = await queryAll(
    `SELECT r.job, r.started_at, r.finished_at, r.outcome, r.duration_ms, r.detail,
            agg.runs_7d, agg.failures_7d
       FROM scheduled_job_runs r
       JOIN (SELECT job, MAX(id) AS last_id,
                    SUM(started_at >= NOW() - INTERVAL 7 DAY) AS runs_7d,
                    SUM(started_at >= NOW() - INTERVAL 7 DAY AND outcome = 'failure') AS failures_7d
               FROM scheduled_job_runs GROUP BY job) agg
         ON agg.last_id = r.id
      ORDER BY r.job`,
  );
  return rows.map((r) => ({
    job: r.job,
    last_started_at: r.started_at ? new Date(r.started_at).toISOString() : null,
    last_finished_at: r.finished_at ? new Date(r.finished_at).toISOString() : null,
    last_outcome: r.outcome,
    last_duration_ms: r.duration_ms == null ? null : Number(r.duration_ms),
    last_detail: r.detail || null,
    runs_7d: Number(r.runs_7d || 0),
    failures_7d: Number(r.failures_7d || 0),
  }));
}

async function purgeOldJobRuns(days = RETENTION_DAYS) {
  const n = Number.isInteger(days) && days >= 7 ? days : RETENTION_DAYS;
  const res = await execute(
    `DELETE FROM scheduled_job_runs WHERE started_at < NOW() - INTERVAL ${n} DAY LIMIT 5000`,
  );
  return Number(res.affectedRows || 0);
}

module.exports = {
  RETENTION_DAYS,
  cleanDetail,
  listJobSummaries,
  purgeOldJobRuns,
  summarizeResult,
  trackJobRun,
};
