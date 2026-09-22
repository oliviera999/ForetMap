'use strict';

/**
 * Lecture filtrée du journal `security_events` (IP / User-Agent).
 * Réservé aux routes protégées par `audit.security.read`.
 */

const { queryAll, queryOne } = require('../database');
const { usageDay } = require('./usage');
const { csvEscape } = require('./importRows');

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_RANGE_DAYS = 365;

/**
 * Bornes de jours tolérantes (défaut 30 j, plage max 365 j).
 * @param {{ from?: string, to?: string }} query
 * @returns {{ from: string, to: string }}
 */
function resolveSecurityDayRange(query = {}) {
  const today = usageDay();
  const defaultFrom = usageDay(new Date(Date.now() - 29 * 24 * 60 * 60 * 1000));
  let from = DAY_RE.test(String(query.from || '')) ? String(query.from) : defaultFrom;
  let to = DAY_RE.test(String(query.to || '')) ? String(query.to) : today;
  if (from > to) {
    const swap = from;
    from = to;
    to = swap;
  }
  const fromMs = Date.parse(`${from}T00:00:00Z`);
  const toMs = Date.parse(`${to}T00:00:00Z`);
  if (Number.isFinite(fromMs) && Number.isFinite(toMs)) {
    const spanDays = Math.floor((toMs - fromMs) / (24 * 60 * 60 * 1000)) + 1;
    if (spanDays > MAX_RANGE_DAYS) {
      from = usageDay(new Date(toMs - (MAX_RANGE_DAYS - 1) * 24 * 60 * 60 * 1000));
    }
  }
  return { from, to };
}

/**
 * @param {{ from: string, to: string, actorUserId?: string|null, action?: string|null,
 *   ip?: string|null, result?: string|null, limit?: number, offset?: number }} opts
 */
function buildSecurityEventsWhere(opts) {
  const clauses = ['occurred_at >= ?', 'occurred_at < DATE_ADD(?, INTERVAL 1 DAY)'];
  const params = [opts.from, opts.to];
  if (opts.actorUserId) {
    clauses.push('actor_user_id = ?');
    params.push(opts.actorUserId);
  }
  if (opts.action) {
    clauses.push('action LIKE ?');
    params.push(`${opts.action}%`);
  }
  if (opts.ip) {
    clauses.push('ip_address LIKE ?');
    params.push(`${opts.ip}%`);
  }
  if (opts.result) {
    clauses.push('result = ?');
    params.push(opts.result);
  }
  return { whereSql: clauses.join(' AND '), params };
}

/**
 * @param {{ from: string, to: string, actorUserId?: string|null, action?: string|null,
 *   ip?: string|null, result?: string|null, limit?: number, offset?: number }} opts
 */
async function listSecurityEvents(opts) {
  const { whereSql, params } = buildSecurityEventsWhere(opts);
  const limit = Math.max(1, Math.min(Number(opts.limit) || 100, 200));
  const offset = Math.max(0, Number(opts.offset) || 0);
  const countRow = await queryOne(
    `SELECT COUNT(*) AS total FROM security_events WHERE ${whereSql}`,
    params,
  );
  const rows = await queryAll(
    `SELECT id, occurred_at, actor_user_id, actor_user_type, action, target_type, target_id,
            result, reason, ip_address, user_agent, payload_json
       FROM security_events
      WHERE ${whereSql}
      ORDER BY id DESC
      LIMIT ? OFFSET ?`,
    [...params, String(limit), String(offset)],
  );
  return {
    from: opts.from,
    to: opts.to,
    total: Number(countRow?.total) || 0,
    rows,
  };
}

const CSV_COLUMNS = [
  'id',
  'occurred_at',
  'actor_user_id',
  'actor_user_type',
  'action',
  'target_type',
  'target_id',
  'result',
  'reason',
  'ip_address',
  'user_agent',
  'payload_json',
];

function serializePayloadCell(value) {
  if (value == null) return '';
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

/** CSV (séparateur `;`) pour export incident. */
function securityEventsToCsv(rows) {
  const header = CSV_COLUMNS.map(csvEscape).join(';');
  const lines = (rows || []).map((row) =>
    CSV_COLUMNS.map((col) => {
      if (col === 'payload_json') return csvEscape(serializePayloadCell(row.payload_json));
      return csvEscape(row[col] == null ? '' : String(row[col]));
    }).join(';'),
  );
  return [header, ...lines].join('\n');
}

module.exports = {
  DAY_RE,
  MAX_RANGE_DAYS,
  resolveSecurityDayRange,
  listSecurityEvents,
  securityEventsToCsv,
  CSV_COLUMNS,
};
