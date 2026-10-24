'use strict';

/**
 * Journal de purge (`retention_purge_runs`, migration 319) : une ligne par exécution de la
 * purge planifiée, simulation comprise — date, mode, comptages par catégorie, durée, issue.
 *
 * Le journal ne porte **aucune donnée de personne** : des comptages, des durées et, en cas
 * d'échec, un message nettoyé ({@link sanitizeForOutput}). Il sert de preuve que la purge
 * tourne, et de point de lecture du rapport avant l'activation (simulation d'abord).
 *
 * Reprise après interruption : une exécution coupée (processus tué, serveur redémarré) laisse
 * une ligne `running`. La suivante, une fois le verrou pris — donc seule —, la marque
 * `interrupted` avant d'ouvrir la sienne.
 */

const {
  RETENTION_PURGE_MODE_ENUM,
  RETENTION_PURGE_OUTCOME_ENUM,
} = require('../shared/platformEnums');

/** Valeurs des colonnes ENUM du journal : une seule définition (référentiel des énumérations). */
const OUTCOMES = RETENTION_PURGE_OUTCOME_ENUM.values;
const MODES = RETENTION_PURGE_MODE_ENUM.values;
const ERROR_MESSAGE_MAX = 500;

/**
 * Masque ce qui pourrait désigner une personne dans un message destiné à la sortie ou au
 * journal : adresses e-mail, adresses IP, identifiants (UUID, longues suites hexadécimales).
 * @param {unknown} value
 * @returns {string}
 */
function sanitizeForOutput(value) {
  return (
    String(value == null ? '' : value)
      .replace(/[^\s@'"<>()]+@[^\s@'"<>()]+\.[^\s@'"<>()]+/g, '[e-mail]')
      .replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi, '[id]')
      .replace(/\b[0-9a-f]{16,}\b/gi, '[id]')
      .replace(/\b(?:\d{1,3}\.){3}\d{1,3}\b/g, '[ip]')
      // IPv6 compressée (`2001:db8::7`, `::ffff:…`), puis complète (4 groupes au moins : une
      // heure `04:00:00` n'en a que 3).
      .replace(/(?:[0-9a-f]{1,4}:)*[0-9a-f]{0,4}::(?:[0-9a-f]{1,4}(?::[0-9a-f]{1,4})*)?/gi, '[ip]')
      .replace(/\b(?:[0-9a-f]{1,4}:){3,7}[0-9a-f]{1,4}\b/gi, '[ip]')
      .replace(/\s+/g, ' ')
      .trim()
  );
}

/** Marque `interrupted` les exécutions restées `running` (à appeler verrou pris). */
async function markInterruptedRuns(db) {
  const result = await db.execute(
    "UPDATE retention_purge_runs SET outcome = 'interrupted', finished_at = NOW(3) WHERE outcome = 'running'",
  );
  return Number(result?.affectedRows || 0);
}

/**
 * Ouvre l'entrée d'une exécution.
 * @param {{ execute: Function }} db
 * @param {{ mode: 'simulation'|'apply', options?: object }} run
 * @returns {Promise<number>} identifiant de l'exécution
 */
async function startRun(db, { mode, options = null }) {
  if (!MODES.includes(mode)) throw new Error(`Mode de purge inconnu : ${mode}`);
  const result = await db.execute(
    "INSERT INTO retention_purge_runs (mode, outcome, options_json) VALUES (?, 'running', ?)",
    [mode, options ? JSON.stringify(options) : null],
  );
  return Number(result.insertId);
}

/**
 * Ferme l'entrée d'une exécution.
 * @param {{ execute: Function }} db
 * @param {number} runId
 * @param {{ outcome: string, counts?: object, durationMs?: number, errorMessage?: string|null }} end
 */
async function finishRun(
  db,
  runId,
  { outcome, counts = null, durationMs = null, errorMessage = null },
) {
  if (!OUTCOMES.includes(outcome) || outcome === 'running') {
    throw new Error(`Issue de purge invalide : ${outcome}`);
  }
  const message = errorMessage ? sanitizeForOutput(errorMessage).slice(0, ERROR_MESSAGE_MAX) : null;
  await db.execute(
    `UPDATE retention_purge_runs
        SET finished_at = NOW(3), outcome = ?, duration_ms = ?, counts_json = ?, error_message = ?
      WHERE id = ?`,
    [
      outcome,
      Number.isFinite(durationMs) ? Math.max(0, Math.round(durationMs)) : null,
      counts ? JSON.stringify(counts) : null,
      message,
      runId,
    ],
  );
}

/** Dernières exécutions, les plus récentes d'abord. */
async function listRecentRuns(db, limit = 10) {
  const n = Number.isInteger(limit) && limit > 0 && limit <= 100 ? limit : 10;
  return db.queryAll(
    `SELECT id, started_at, finished_at, mode, outcome, duration_ms, counts_json, error_message
       FROM retention_purge_runs ORDER BY id DESC LIMIT ${n}`,
  );
}

module.exports = {
  OUTCOMES,
  MODES,
  ERROR_MESSAGE_MAX,
  sanitizeForOutput,
  markInterruptedRuns,
  startRun,
  finishRun,
  listRecentRuns,
};
