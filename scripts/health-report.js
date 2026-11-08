#!/usr/bin/env node
'use strict';

/**
 * Rapport de santé quotidien — tâche de la crontab (docs/CRONTAB.md, ligne 9 ; docs/MCP.md,
 * « Rapport de santé »).
 *
 * 1. Interroge l'application (`GET <base>/api/health/report`, en-tête `X-Health-Token`) : c'est
 *    elle qui détient les compteurs HTTP (5xx, 429) et l'état de son processus. Base :
 *    `HEALTH_REPORT_BASE_URL`, sinon `MCP_PUBLIC_BASE_URL`, sinon `DEPLOY_BASE_URL`.
 *    - application injoignable → rapport construit ici, statut **rouge** (`app_unreachable`) ;
 *    - `MCP_HEALTH_TOKEN` absent → rapport construit ici, sans compteurs HTTP (signalé).
 * 2. Stocke le rapport dans `mcp_health_reports` et purge les anciens
 *    (`MCP_HEALTH_REPORT_RETENTION_DAYS`, 90 j), ainsi que `scheduled_job_runs` (180 j).
 * 3. E-mail (mailer existant, `OPS_ALERT_TO`) si le statut est **orange ou rouge**, ou chaque
 *    jour si `MCP_HEALTH_REPORT_EMAIL=daily` ; `MCP_HEALTH_REPORT_EMAIL=off` coupe l'e-mail.
 * 4. Trace l'exécution dans `scheduled_job_runs` (`health_report`, lu par
 *    `foretmap_cron_status`).
 *
 * Usage (crontab, chaque jour à 06:40) :
 *   bash /home/USER/foretmap/scripts/with-app-node.sh node scripts/health-report.js \
 *     >> /home/USER/foretmap/logs/health-report.log 2>&1
 *
 * Sortie : une ligne de résumé, jamais de donnée de personne. Code : 0 si le rapport a été
 * produit (quel que soit son statut), 1 si le script lui-même a échoué.
 */

require('dotenv').config({ quiet: true });
// Avant tout `require` qui charge lib/logger.js : la sortie va au journal du cron.
process.env.LOG_LEVEL = process.env.HEALTH_REPORT_LOG_LEVEL || 'warn';

const FETCH_TIMEOUT_MS = 60_000;

function ts() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

function resolveBaseUrl(env) {
  const raw = env.HEALTH_REPORT_BASE_URL || env.MCP_PUBLIC_BASE_URL || env.DEPLOY_BASE_URL || '';
  return String(raw).trim().replace(/\/+$/, '');
}

function emailMode(env) {
  const v = String(env.MCP_HEALTH_REPORT_EMAIL || '')
    .trim()
    .toLowerCase();
  if (['daily', 'quotidien', 'always'].includes(v)) return 'daily';
  if (['off', '0', 'false', 'non', 'none'].includes(v)) return 'off';
  return 'alert';
}

/** L'e-mail part-il pour ce statut ? */
function shouldEmail(status, mode) {
  if (mode === 'off') return false;
  if (mode === 'daily') return true;
  return status === 'orange' || status === 'red';
}

/** Corps de l'e-mail : résumé, constats, chiffres clés (aucune donnée de personne). */
function formatEmail(report, { stored } = {}) {
  const lines = [report.summary, ''];
  const alerts = (report.findings || []).filter((f) => f.level !== 'info');
  if (alerts.length) {
    lines.push('Alertes :');
    for (const f of alerts) lines.push(`  - [${f.level}] ${f.message}`);
    lines.push('');
  }
  const p = report.process || {};
  lines.push(
    `Version ${p.version || '?'} · Node ${p.nodeVersion || '?'} · uptime ${p.uptimeSeconds ?? '?'} s · RSS ${p.memory?.rssMb ?? '?'} Mo`,
  );
  const db = report.database || {};
  lines.push(
    `Base : ${db.ok ? `OK (${db.latencyMs} ms)` : 'injoignable'} · schéma ${report.schema?.current ?? '?'}/${report.schema?.latest ?? '?'}`,
  );
  const h = report.http?.last24h;
  if (h)
    lines.push(
      `HTTP 24 h : ${h.requests} requêtes, ${h.http5xx} 5xx, ${h.http429} 429 (fenêtre couverte ${h.coveredHours} h)`,
    );
  const rc = report.restarts?.counts;
  if (rc && Number(rc.hardKills || 0) > 0) {
    const rss = report.restarts.maxRssMbBeforeKill;
    lines.push(
      `Arrêts brutaux 24 h : ${rc.hardKills} · RSS max relevée avant arrêt : ${Number.isFinite(rss) ? `${rss} Mo` : 'inconnue'} (cPanel → Resource Usage, docs/EXPLOITATION.md)`,
    );
  }
  if (report.disk?.freePct != null) {
    lines.push(
      `Disque : ${report.disk.freePct} % libre · uploads ${report.disk.uploads?.sizeMb ?? '?'} Mo`,
    );
  }
  for (const c of report.tls?.hosts || []) {
    lines.push(
      `TLS ${c.host} : ${c.error ? `erreur (${c.error})` : `${c.daysRemaining} j restants`}`,
    );
  }
  if (report.audit?.total_findings != null)
    lines.push(`Audits du corpus : ${report.audit.total_findings} constat(s)`);
  lines.push('');
  if (stored?.id)
    lines.push(`Rapport n° ${stored.id} : foretmap_health_history (connecteur Claude).`);
  lines.push('Détail : docs/MCP.md, « Rapport de santé ».');
  return lines.join('\n');
}

async function fetchAppReport(baseUrl, token, fetchImpl) {
  const res = await fetchImpl(`${baseUrl}/api/health/report`, {
    headers: { Accept: 'application/json', 'X-Health-Token': token },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (res.status !== 200) {
    const err = new Error(`HTTP ${res.status}`);
    err.httpStatus = res.status;
    throw err;
  }
  return res.json();
}

/**
 * Exécution complète (exportée pour les tests : `fetchImpl`, `sendAlert`, `env` injectables).
 * @returns {Promise<{ report: object, stored: object, emailed: boolean, via: string }>}
 */
async function runHealthReportJob({
  env = process.env,
  fetchImpl = fetch,
  sendAlert = (msg) => require('../lib/mailer').sendOpsAlert(msg),
  log = (line) => process.stdout.write(`[${ts()}] [health-report] ${line}\n`),
} = {}) {
  const { trackJobRun, purgeOldJobRuns } = require('../lib/scheduledJobs');
  return trackJobRun('health_report', async () => {
    const { buildHealthReport } = require('../lib/mcp/health/collect');
    const { evaluateHealth, summarize } = require('../lib/mcp/health/rules');
    const { storeReport } = require('../lib/mcp/health/store');
    const baseUrl = resolveBaseUrl(env);
    const token = String(env.MCP_HEALTH_TOKEN || '').trim();
    let report;
    let via;
    if (baseUrl && token) {
      try {
        report = await fetchAppReport(baseUrl, token, fetchImpl);
        report.app = { reachable: true, via: 'endpoint' };
        via = 'endpoint';
      } catch (err) {
        const reason = err?.httpStatus
          ? `HTTP ${err.httpStatus}`
          : String(
              err?.name === 'TimeoutError' ? 'délai dépassé' : err?.code || err?.message || err,
            );
        report = await buildHealthReport({
          app: { reachable: false, error: reason },
          http: { available: false, reason: 'application injoignable' },
        });
        via = 'local';
      }
    } else {
      report = await buildHealthReport({
        http: {
          available: false,
          reason: !token
            ? 'MCP_HEALTH_TOKEN absent : compteurs du processus web non lus'
            : 'adresse de l’application inconnue (HEALTH_REPORT_BASE_URL)',
        },
      });
      via = 'local';
    }
    // Statut recalculé ici avec les faits complets (application injoignable comprise).
    const evaluation = evaluateHealth(report);
    report.status = evaluation.status;
    report.findings = evaluation.findings;
    report.summary = summarize(evaluation);

    const stored = await storeReport(report, 'cron');
    await purgeOldJobRuns().catch(() => 0);
    let emailed = false;
    const mode = emailMode(env);
    if (shouldEmail(report.status, mode)) {
      const label = { green: 'vert', orange: 'ORANGE', red: 'ROUGE' }[report.status];
      emailed = Boolean(
        await sendAlert({
          subject: `Santé du site : ${label}`,
          text: formatEmail(report, { stored }),
        }),
      );
    }
    log(
      `${report.summary} (via ${via}, rapport n° ${stored.id}, ${stored.purged} ancien(s) purgé(s), e-mail ${emailed ? 'envoyé' : mode === 'off' ? 'coupé' : 'non envoyé'})`,
    );
    return { report, stored, emailed, via, status: report.status };
  });
}

async function main() {
  const { endPool } = require('../database');
  let code = 0;
  try {
    await runHealthReportJob();
  } catch (err) {
    const { maskSecrets } = require('../lib/mcp/secretMask');
    process.stdout.write(`[${ts()}] [health-report] ÉCHEC : ${maskSecrets(err?.message || err)}\n`);
    code = 1;
  } finally {
    await endPool().catch(() => {});
  }
  return code;
}

if (require.main === module) {
  main().then((code) => process.exit(code));
}

module.exports = { emailMode, formatEmail, main, resolveBaseUrl, runHealthReportJob, shouldEmail };
