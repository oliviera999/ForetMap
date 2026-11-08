'use strict';

/**
 * Collecte du rapport de santé (`foretmap_health_report`, `GET /api/health/report`,
 * `scripts/health-report.js`).
 *
 * Chaque section est **indépendante et bornée** : une section en échec devient
 * `{ ok: false, error }` sans faire échouer le rapport (un rapport de santé qui plante quand
 * quelque chose va mal ne sert à rien). Aucune section ne lit de donnée de personne : version,
 * processus, base (latence, migrations, tailles de tables tirées d'`information_schema`),
 * compteurs HTTP, journal de cycle de vie, tâches planifiées, disque, certificats, nombre de
 * connexions MCP actives et résumé de `foretmap_audit_all`.
 *
 * Le statut est calculé par `rules.js` (fonctions pures) ; le stockage et l'historique sont
 * dans `store.js`.
 */

const fs = require('node:fs');
const path = require('node:path');
const tls = require('node:tls');
const { evaluateHealth, summarize } = require('./rules');

const ROOT = path.join(__dirname, '..', '..', '..');
const startupVersion = require('../../../package.json').version;

/** Tables dont la taille est suivie (les plus grosses et les plus utiles au diagnostic). */
const TRACKED_TABLE_LIMIT = 12;

function round(n, d = 2) {
  const f = 10 ** d;
  return Math.round(n * f) / f;
}

async function safe(fn) {
  try {
    return await fn();
  } catch (err) {
    return { ok: false, error: String(err?.code || err?.message || err).slice(0, 200) };
  }
}

function processSection() {
  const mem = process.memoryUsage();
  const toMb = (n) => round(n / 1024 / 1024);
  return {
    version: startupVersion,
    nodeVersion: process.version,
    nodeEnv: process.env.NODE_ENV || null,
    uptimeSeconds: Math.floor(process.uptime()),
    memory: {
      rssMb: toMb(mem.rss),
      heapUsedMb: toMb(mem.heapUsed),
      heapTotalMb: toMb(mem.heapTotal),
    },
  };
}

async function databaseSection() {
  const { ping } = require('../../../database');
  const t0 = performance.now();
  try {
    await ping();
    return { ok: true, latencyMs: round(performance.now() - t0) };
  } catch {
    return { ok: false, error: 'Database unavailable' };
  }
}

async function schemaSection() {
  const { queryOne } = require('../../../database');
  const { getMigrationStatus } = require('../../migrationStatus');
  const s = await getMigrationStatus({ queryOne });
  return { ok: s.upToDate, current: s.current, latest: s.latest, pending: s.pending };
}

/** Principales tables par taille (`information_schema` : métadonnées, aucune ligne lue). */
async function tablesSection() {
  const { queryAll } = require('../../../database');
  const rows = await queryAll(
    `SELECT TABLE_NAME AS t, TABLE_ROWS AS r, DATA_LENGTH + INDEX_LENGTH AS b
       FROM information_schema.TABLES
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_TYPE = 'BASE TABLE'
      ORDER BY DATA_LENGTH + INDEX_LENGTH DESC
      LIMIT ${TRACKED_TABLE_LIMIT}`,
  );
  const total = await queryAll(
    `SELECT COUNT(*) AS n, SUM(DATA_LENGTH + INDEX_LENGTH) AS b FROM information_schema.TABLES
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_TYPE = 'BASE TABLE'`,
  );
  return {
    ok: true,
    tableCount: Number(total[0]?.n || 0),
    totalMb: round(Number(total[0]?.b || 0) / 1024 / 1024),
    largest: rows.map((r) => ({
      table: r.t,
      approxRows: Number(r.r || 0),
      sizeMb: round(Number(r.b || 0) / 1024 / 1024),
    })),
    note: 'Nombre de lignes approximatif (statistiques InnoDB).',
  };
}

/**
 * Comptes 5xx / 429 sur 24 h et 7 j : tranches horaires de `lib/logMetrics.js` (processus en
 * cours) — la fenêtre réellement couverte est indiquée. Hors processus (script cron), les
 * compteurs sont lus par l'endpoint `GET /api/health/report` de l'application.
 */
function httpSection() {
  const logMetrics = require('../../logMetrics');
  const m = logMetrics.getMetrics();
  return {
    available: true,
    last24h: logMetrics.getHttpWindowCounts(24),
    last7d: logMetrics.getHttpWindowCounts(24 * 7),
    sinceStart: { requests: m.httpRequests, http5xx: m.http5xx, http429: m.http429 },
    note: 'Compteurs en mémoire du processus : la fenêtre couverte (coveredHours) s’arrête au dernier redémarrage.',
  };
}

function restartsSection() {
  const { summarizeBootJournal } = require('../../bootJournal');
  const r = summarizeBootJournal({ windowHours: 24 });
  return {
    enabled: r.enabled,
    counts: r.counts,
    verdict: r.verdict,
    entriesTotal: r.entriesTotal,
    /** RSS maximale relevée avant chaque arrêt brutal (hard kill) de la fenêtre, si connue. */
    hardKills: (r.hardKills || []).map(({ at, bootedAt, maxRssMbBeforeKill }) => ({
      at,
      bootedAt,
      maxRssMbBeforeKill,
    })),
    maxRssMbBeforeKill: r.maxRssMbBeforeKill ?? null,
  };
}

function dirSize(dir, { maxEntries = 200000 } = {}) {
  let bytes = 0;
  let files = 0;
  let truncated = false;
  const stack = [dir];
  while (stack.length) {
    const d = stack.pop();
    let entries;
    try {
      entries = fs.readdirSync(d, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const e of entries) {
      if (files >= maxEntries) {
        truncated = true;
        break;
      }
      const p = path.join(d, e.name);
      if (e.isDirectory()) stack.push(p);
      else if (e.isFile()) {
        try {
          bytes += fs.statSync(p).size;
          files += 1;
        } catch {
          /* fichier disparu entre-temps */
        }
      }
    }
  }
  return { bytes, files, truncated };
}

function diskSection() {
  const st = fs.statfsSync(ROOT);
  const total = st.blocks * st.bsize;
  const free = st.bavail * st.bsize;
  const { UPLOADS_DIR } = require('../../uploads');
  const up = fs.existsSync(UPLOADS_DIR) ? dirSize(UPLOADS_DIR) : { bytes: 0, files: 0 };
  const logsDir = path.join(ROOT, 'logs');
  const logs = fs.existsSync(logsDir) ? dirSize(logsDir) : { bytes: 0, files: 0 };
  return {
    ok: true,
    totalGb: round(total / 1024 ** 3),
    freeGb: round(free / 1024 ** 3),
    freePct: total > 0 ? round((free / total) * 100, 1) : null,
    uploads: {
      sizeMb: round(up.bytes / 1024 ** 2),
      files: up.files,
      truncated: up.truncated || undefined,
    },
    logs: { sizeMb: round(logs.bytes / 1024 ** 2), files: logs.files },
    note: 'Sur un hébergement mutualisé, l’espace libre est celui du système de fichiers, pas le quota du compte.',
  };
}

/** Hôtes dont le certificat est contrôlé : `MCP_HEALTH_TLS_HOSTS`, sinon ForêtMap + G&L. */
function tlsHosts() {
  const explicit = String(process.env.MCP_HEALTH_TLS_HOSTS || '').trim();
  if (explicit) {
    return [
      ...new Set(
        explicit
          .split(',')
          .map((h) => h.trim().toLowerCase())
          .filter(Boolean),
      ),
    ].slice(0, 6);
  }
  const hosts = [];
  const fromUrl = (u) => {
    try {
      const url = new URL(String(u || '').trim());
      return url.protocol === 'https:' ? url.hostname.toLowerCase() : null;
    } catch {
      return null;
    }
  };
  const main = fromUrl(process.env.MCP_PUBLIC_BASE_URL);
  if (main) hosts.push(main);
  const gl = fromUrl(process.env.GL_PROD_BASE_URL);
  if (gl) hosts.push(gl);
  else if (main) {
    // Même domaine parent, préfixe du produit G&L (`lib/products.js`).
    const { PRODUCTS } = require('../../products');
    const prefix = PRODUCTS.gl.hostPrefixes[0];
    const parent = main.split('.').slice(1).join('.');
    if (prefix && parent.includes('.')) hosts.push(`${prefix}${parent}`);
  }
  return [...new Set(hosts)];
}

/**
 * Jours restants avant l'expiration du certificat d'un hôte (`tls.connect`, délai court,
 * erreur gérée : un hôte injoignable donne `{ error }`, jamais une exception).
 */
function checkTlsHost(host, { timeoutMs = 5000, port = 443, now = Date.now() } = {}) {
  return new Promise((resolve) => {
    let settled = false;
    const done = (v) => {
      if (settled) return;
      settled = true;
      try {
        socket.destroy();
      } catch {
        /* déjà fermé */
      }
      resolve({ host, ...v });
    };
    const socket = tls.connect({
      host,
      port,
      servername: host,
      rejectUnauthorized: false,
      timeout: timeoutMs,
    });
    socket.setTimeout(timeoutMs, () => done({ error: 'délai dépassé' }));
    socket.once('error', (err) => done({ error: String(err?.code || err?.message || err) }));
    socket.once('secureConnect', () => {
      const cert = socket.getPeerCertificate();
      if (!cert || !cert.valid_to) return done({ error: 'certificat absent' });
      const validTo = new Date(cert.valid_to);
      return done({
        authorized: socket.authorized,
        authorizationError: socket.authorized ? undefined : String(socket.authorizationError || ''),
        validTo: validTo.toISOString(),
        daysRemaining: Math.floor((validTo.getTime() - now) / 86400000),
        issuer: cert.issuer?.O || cert.issuer?.CN || undefined,
      });
    });
  });
}

async function tlsSection({ skip = false } = {}) {
  if (skip) return { skipped: true, hosts: [] };
  const hosts = tlsHosts();
  if (!hosts.length) {
    return {
      hosts: [],
      note: 'Aucun hôte https connu (MCP_PUBLIC_BASE_URL ou MCP_HEALTH_TLS_HOSTS)',
    };
  }
  return { hosts: await Promise.all(hosts.map((h) => checkTlsHost(h))) };
}

/** Connexions MCP actives : familles de jetons de rafraîchissement valides (comptes seulement). */
async function mcpConnectionsSection() {
  const { queryOne } = require('../../../database');
  const row = await queryOne(
    `SELECT COUNT(DISTINCT family_id) AS families, COUNT(DISTINCT user_id) AS accounts,
            SUM(kind = 'access' AND last_used_at >= NOW() - INTERVAL 24 HOUR) AS used24h
       FROM mcp_oauth_tokens
      WHERE revoked_at IS NULL AND expires_at > NOW()`,
  );
  return {
    ok: true,
    activeConnections: Number(row?.families || 0),
    accounts: Number(row?.accounts || 0),
    usedLast24h: Number(row?.used24h || 0),
  };
}

/** Contrôles du corpus relevés nommément dans le rapport (règles de `rules.js`). */
const AUDIT_TRACKED_CHECKS = Object.freeze(['gl_marker_promises']);

async function auditSection() {
  const { runAllAudits } = require('../audits');
  const a = await runAllAudits();
  const byCheck = {};
  for (const c of a.checks) if (AUDIT_TRACKED_CHECKS.includes(c.check)) byCheck[c.check] = c.count;
  return {
    total_findings: a.total_findings,
    duration_ms: a.duration_ms,
    byCheck,
    top: a.checks
      .filter((c) => c.count > 0)
      .sort((x, y) => y.count - x.count)
      .slice(0, 5)
      .map((c) => ({ check: c.check, count: c.count })),
  };
}

async function cronSection() {
  const { getCronStatus } = require('../files/cron');
  const s = await getCronStatus({ includeCrontab: false });
  return {
    jobs: s.jobs.map(({ job, state, ageHours, expectedEveryHours, detail, hint }) => ({
      job,
      state,
      ageHours,
      expectedEveryHours,
      detail,
      hint,
    })),
  };
}

/**
 * Construit le rapport complet.
 * @param {{ skipTls?: boolean, skipAudit?: boolean, app?: object, http?: object }} [opts]
 *   `app` / `http` : faits fournis par l'appelant (script cron qui a interrogé l'application).
 */
async function buildHealthReport(opts = {}) {
  const started = Date.now();
  const dbSection = await databaseSection();
  const dbOk = dbSection.ok;
  const unavailable = { ok: false, error: 'database_unavailable' };
  const [schema, tables, mcp, audit, cron, disk, tlsRes] = await Promise.all([
    dbOk ? safe(schemaSection) : unavailable,
    dbOk ? safe(tablesSection) : unavailable,
    dbOk ? safe(mcpConnectionsSection) : unavailable,
    dbOk && !opts.skipAudit ? safe(auditSection) : opts.skipAudit ? { skipped: true } : unavailable,
    safe(cronSection),
    safe(async () => diskSection()),
    safe(() => tlsSection({ skip: opts.skipTls })),
  ]);
  const facts = {
    generated_at: new Date().toISOString(),
    process: processSection(),
    app: opts.app,
    database: dbSection,
    schema,
    tables,
    http: opts.http || httpSection(),
    restarts: await safe(async () => restartsSection()),
    cron,
    disk,
    tls: tlsRes,
    mcp,
    audit,
  };
  const evaluation = evaluateHealth(facts);
  return {
    status: evaluation.status,
    summary: summarize(evaluation),
    findings: evaluation.findings,
    ...facts,
    thresholds: evaluation.thresholds,
    duration_ms: Date.now() - started,
  };
}

module.exports = {
  AUDIT_TRACKED_CHECKS,
  buildHealthReport,
  checkTlsHost,
  dirSize,
  httpSection,
  tlsHosts,
};
