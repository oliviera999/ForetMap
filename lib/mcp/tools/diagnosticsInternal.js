'use strict';

/**
 * Source **interne** des outils de diagnostic (serveur `/mcp`) : appelle directement les
 * fonctions qu'utilisent `routes/health.js` et `routes/admin-ops.js`, sans passer par HTTP ni
 * par `DEPLOY_SECRET` — l'autorisation est portée par le jeton OAuth et la permission RBAC.
 */

const { ping, queryOne, queryAll } = require('../../../database');
const { getMigrationStatus } = require('../../migrationStatus');
const { tailLogLines, getBufferedLineCount, getMaxLines } = require('../../logBuffer');
const { getRuntimeProcessSnapshot } = require('../../runtimeDiagnostics');
const { summarizeBootJournal } = require('../../bootJournal');
const logMetrics = require('../../logMetrics');
const { createPseudonymizer } = require('../pseudonymize');

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

function createInternalDiagnosticsSource() {
  return {
    async health() {
      return {
        version: startupVersion,
        uptimeSeconds: Math.floor(process.uptime()),
        database: await pingDb(),
      };
    },
    async diagnostics() {
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
      // Mêmes pseudonymes que les journaux pour toute valeur nominative éventuelle.
      return createPseudonymizer().pseudoValue({
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
        restarts: summarizeBootJournal({ windowHours: 24 }),
        gl,
      });
    },
    async logs(lines) {
      // Le logger retire déjà les champs sensibles (`redact`) ; en plus, identifiants de
      // comptes, UUID et IP sont remplacés par des pseudonymes stables **au sein de cet
      // appel** (sel aléatoire non conservé), puis e-mails, hachages et jetons masqués.
      const { pseudoLogLine } = createPseudonymizer();
      const entries = tailLogLines(Math.min(1000, Math.max(1, lines))).map(pseudoLogLine);
      return { returned: entries.length, bufferLines: getBufferedLineCount(), entries };
    },
    async dbStatus() {
      return { ts: new Date().toISOString(), schema: await schemaStatus() };
    },
  };
}

module.exports = { createInternalDiagnosticsSource };
