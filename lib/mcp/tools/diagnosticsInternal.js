'use strict';

/**
 * Source **interne** des outils de diagnostic (serveur `/mcp`) : appelle directement les
 * fonctions qu'utilisent `routes/health.js` et `routes/admin-ops.js`, sans passer par HTTP ni
 * par `DEPLOY_SECRET` — l'autorisation est portée par le jeton OAuth et la permission RBAC.
 */

const { ping, queryOne, queryAll } = require('../../../database');
const { getMigrationStatus, summarizeDrift } = require('../../migrationStatus');

/** Au-delà, le détail colonne par colonne n'est pas renvoyé (base très en retard, par ex.). */
const DRIFT_DETAILS_MAX = 100;

/**
 * Contrôle d'écart prod/dépôt pour `foretmap_db_status` (flux F7) : compteurs, phrases « à
 * reprendre en migration » et détail des écarts. Informatif, jamais d'exception.
 */
async function schemaDriftStatus() {
  try {
    const status = await getMigrationStatus({ queryOne, queryAll }, { includeDrift: true });
    const summary = summarizeDrift(status.drift);
    if (summary && summary.available && !summary.ok) {
      const details = { ...status.drift.diff };
      delete details.ok;
      delete details.total;
      const tooMany = summary.total > DRIFT_DETAILS_MAX;
      summary.details = tooMany ? null : details;
      if (tooMany) {
        summary.details_note = `détail omis au-delà de ${DRIFT_DETAILS_MAX} écarts : node scripts/schema-fingerprint.js --json sur le serveur`;
      }
    }
    return summary;
  } catch {
    return { available: false, ok: null, reason: 'schema_drift_unavailable' };
  }
}
const { tailLogLines, getBufferedLineCount, getMaxLines } = require('../../logBuffer');
const { getRuntimeProcessSnapshot } = require('../../runtimeDiagnostics');
const { summarizeBootJournal } = require('../../bootJournal');
const logMetrics = require('../../logMetrics');
const { createLogSanitizer } = require('../logSanitizer');

const startupVersion = require('../../../package.json').version;

async function pingDb() {
  const t0 = performance.now();
  try {
    await ping();
    return { ok: true, latencyMs: Math.round((performance.now() - t0) * 100) / 100 };
  } catch {
    return { ok: false, error: 'Database unavailable' };
  }
}

async function schemaStatus() {
  try {
    const status = await getMigrationStatus({ queryOne });
    return {
      ok: status.upToDate,
      current: status.current,
      latest: status.latest,
      pending: status.pending,
    };
  } catch {
    return { ok: false, error: 'schema_version_unavailable' };
  }
}

const finiteOrNull = (v) => (Number.isFinite(v) ? v : null);
const isoOrNull = (v) => {
  const t = Date.parse(String(v || ''));
  return Number.isFinite(t) ? new Date(t).toISOString() : null;
};
const spreadOf = (s) => ({
  samples: finiteOrNull(s?.samples) ?? 0,
  min: finiteOrNull(s?.min),
  median: finiteOrNull(s?.median),
  max: finiteOrNull(s?.max),
});

/**
 * Champs de `restarts` propres au diagnostic des arrêts sans trace, absents de la liste blanche
 * générale : aucun texte libre, seulement des nombres, des dates ISO et des noms de motif
 * (`SIGHUP`, `passenger-stdin`, `restart`…) filtrés par gabarit.
 * @param {object} r synthèse de `summarizeBootJournal`
 */
function restartsDiagnosisFields(r = {}) {
  return {
    hardKillsByHourBasis: {
      death: finiteOrNull(r.hardKillsByHourBasis?.death) ?? 0,
      restart: finiteOrNull(r.hardKillsByHourBasis?.restart) ?? 0,
    },
    stopsByReason: Object.fromEntries(
      Object.entries(r.stopsByReason || {})
        .filter(([reason]) => /^[A-Za-z0-9_-]{1,40}$/.test(reason))
        .slice(0, 40)
        .map(([reason, n]) => [reason, finiteOrNull(n) ?? 0]),
    ),
    signalStops: finiteOrNull(r.signalStops) ?? 0,
    passengerStops: finiteOrNull(r.passengerStops) ?? 0,
    hardKillLifetimeMs: spreadOf(r.hardKillLifetimeMs),
    hardKillRssMb: spreadOf(r.hardKillRssMb),
    lowRssMb: finiteOrNull(r.lowRssMb),
    hardKillDowntimeEstimateMs: spreadOf(r.hardKillDowntimeEstimateMs),
    hardKillsPreviousAlive: finiteOrNull(r.hardKillsPreviousAlive) ?? 0,
    maxRssMbBeforeKill: finiteOrNull(r.maxRssMbBeforeKill),
    hardKills: (Array.isArray(r.hardKills) ? r.hardKills : []).slice(-60).map((k) => ({
      at: isoOrNull(k.at),
      bootedAt: isoOrNull(k.bootedAt),
      lastAliveAt: isoOrNull(k.lastAliveAt),
      lifetimeMs: finiteOrNull(k.lifetimeMs),
      rssMbBeforeKill: finiteOrNull(k.rssMbBeforeKill),
      maxRssMbBeforeKill: finiteOrNull(k.maxRssMbBeforeKill),
      downtimeEstimateMs: finiteOrNull(k.downtimeEstimateMs),
      previousPidAlive: typeof k.previousPidAlive === 'boolean' ? k.previousPidAlive : null,
    })),
  };
}

function createInternalDiagnosticsSource() {
  return {
    async health() {
      return {
        version: startupVersion,
        uptimeSeconds: Math.floor(process.uptime()),
        database: await pingDb(),
      };
    },
    async diagnostics({ restartsWindowHours } = {}) {
      const hours = Number(restartsWindowHours);
      const restartsWindowHoursSafe =
        Number.isFinite(hours) && hours >= 1 ? Math.min(Math.floor(hours), 24 * 31) : 24;
      const mem = process.memoryUsage();
      const toMb = (n) => Math.round((n / 1024 / 1024) * 100) / 100;
      const database = await pingDb();
      let gl = { ok: false };
      if (database.ok) {
        try {
          const games = await queryAll(
            'SELECT status, COUNT(*) AS c FROM gl_games GROUP BY status',
          );
          gl = {
            ok: true,
            gamesByStatus: Object.fromEntries(games.map((r) => [r.status, Number(r.c)])),
          };
        } catch {
          gl = { ok: false, error: 'gl_diagnostics_unavailable' };
        }
      }
      const restarts = summarizeBootJournal({ windowHours: restartsWindowHoursSafe });
      // Liste blanche de champs (`lib/mcp/logSanitizer.js`) : seuls des compteurs, états et
      // gabarits de route sortent ; toute autre clé est retirée.
      const out = createLogSanitizer().sanitizeDiagnostics({
        ts: new Date().toISOString(),
        version: startupVersion,
        nodeVersion: process.version,
        nodeEnv: process.env.NODE_ENV || null,
        uptimeSeconds: Math.floor(process.uptime()),
        memory: { rssMb: toMb(mem.rss), heapUsedMb: toMb(mem.heapUsed) },
        database,
        schema: database.ok ? await schemaStatus() : { ok: false, error: 'database_unavailable' },
        logBuffer: { linesCount: getBufferedLineCount(), maxLines: getMaxLines() },
        metrics: logMetrics.getMetrics(),
        runtimeProcess: getRuntimeProcessSnapshot(),
        restarts,
        gl,
      });
      // Mesures du diagnostic des arrêts sans trace (signaux tracés, battement) : nombres,
      // dates et noms de motif seulement, repris champ par champ.
      Object.assign(out.restarts, restartsDiagnosisFields(restarts));
      return out;
    },
    async logs(lines) {
      // Liste blanche de champs (`lib/mcp/logSanitizer.js`) : niveau, heure, message nettoyé,
      // requestId, méthode, statut, durée, gabarit de route, type/code/message d'erreur.
      // Toute autre clé est retirée ; identifiants, IP et nombres longs du texte libre sont
      // remplacés (pseudonymes stables dans cet appel seulement).
      const { sanitizeLogLine } = createLogSanitizer();
      const entries = tailLogLines(Math.min(1000, Math.max(1, lines))).map(sanitizeLogLine);
      return { returned: entries.length, bufferLines: getBufferedLineCount(), entries };
    },
    async dbStatus() {
      return {
        ts: new Date().toISOString(),
        schema: await schemaStatus(),
        schema_drift: await schemaDriftStatus(),
      };
    },
  };
}

module.exports = { createInternalDiagnosticsSource, restartsDiagnosisFields };
