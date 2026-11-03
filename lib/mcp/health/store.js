'use strict';

/**
 * Stockage et historique des rapports de santé (`mcp_health_reports`, migration 325).
 *
 * - `storeReport` : une ligne par rapport (statut, résumé, JSON complet borné à 512 ko), puis
 *   purge des rapports plus anciens que `MCP_HEALTH_REPORT_RETENTION_DAYS` (90 j par défaut,
 *   7 à 730) ;
 * - `listReports` : derniers rapports (résumés seulement) et évolution du statut : nombre de
 *   jours par statut, changements de statut, série la plus récente.
 */

const { execute, queryAll, queryOne } = require('../../../database');

const MAX_REPORT_JSON = 512 * 1024;

function retentionDays() {
  const n = Number.parseInt(String(process.env.MCP_HEALTH_REPORT_RETENTION_DAYS || ''), 10);
  return Number.isFinite(n) && n >= 7 && n <= 730 ? n : 90;
}

async function purgeOldReports(days = retentionDays()) {
  const res = await execute(
    `DELETE FROM mcp_health_reports WHERE created_at < NOW() - INTERVAL ${Number(days)} DAY LIMIT 5000`,
  );
  return Number(res.affectedRows || 0);
}

/**
 * @param {object} report rapport de `buildHealthReport`
 * @param {'cron'|'tool'} source
 */
async function storeReport(report, source) {
  let json = JSON.stringify(report);
  if (json.length > MAX_REPORT_JSON) {
    json = JSON.stringify({
      status: report.status,
      summary: report.summary,
      findings: report.findings,
      truncated: true,
    });
  }
  const res = await execute(
    'INSERT INTO mcp_health_reports (source, status, summary, report_json) VALUES (?, ?, ?, ?)',
    [source, report.status, String(report.summary || '').slice(0, 1000), json],
  );
  const purged = await purgeOldReports();
  return { id: Number(res.insertId), purged };
}

/** Rapport stocké complet (par identifiant, ou le plus récent). */
async function getReport(id) {
  const row = id
    ? await queryOne('SELECT * FROM mcp_health_reports WHERE id = ?', [id])
    : await queryOne('SELECT * FROM mcp_health_reports ORDER BY id DESC LIMIT 1');
  if (!row) return null;
  let report = null;
  try {
    report = JSON.parse(row.report_json);
  } catch {
    report = null;
  }
  return {
    id: Number(row.id),
    created_at: new Date(row.created_at).toISOString(),
    source: row.source,
    status: row.status,
    summary: row.summary,
    report,
  };
}

/**
 * Derniers rapports et évolution du statut.
 * @param {{ limit?: number, days?: number }} [opts]
 */
async function listReports({ limit = 20, days = 30 } = {}) {
  const n = Math.min(200, Math.max(1, Number(limit) || 20));
  const d = Math.min(730, Math.max(1, Number(days) || 30));
  const rows = await queryAll(
    `SELECT id, created_at, source, status, summary FROM mcp_health_reports
      WHERE created_at >= NOW() - INTERVAL ${d} DAY ORDER BY id DESC LIMIT ${n}`,
  );
  const items = rows.map((r) => ({
    id: Number(r.id),
    created_at: new Date(r.created_at).toISOString(),
    source: r.source,
    status: r.status,
    summary: r.summary,
  }));
  const counts = { green: 0, orange: 0, red: 0 };
  for (const r of items) counts[r.status] = (counts[r.status] || 0) + 1;
  const chronological = [...items].reverse();
  const changes = [];
  for (let i = 1; i < chronological.length; i += 1) {
    if (chronological[i].status !== chronological[i - 1].status) {
      changes.push({
        at: chronological[i].created_at,
        from: chronological[i - 1].status,
        to: chronological[i].status,
      });
    }
  }
  let streak = 0;
  for (const r of items) {
    if (r.status !== items[0].status) break;
    streak += 1;
  }
  return {
    window_days: d,
    count: items.length,
    current: items[0]
      ? { status: items[0].status, since_reports: streak, at: items[0].created_at }
      : null,
    counts,
    changes: changes.slice(-20),
    reports: items,
  };
}

module.exports = { getReport, listReports, purgeOldReports, retentionDays, storeReport };
