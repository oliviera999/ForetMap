'use strict';

/**
 * Lecture filtrée du journal `security_events` (IP / User-Agent).
 * Réservé aux routes protégées par `audit.security.read`.
 */

const { usageDay } = require('./usage');
const { csvEscape } = require('./importRows');
const { listJournalEvents } = require('./auditJournal/query');

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
 * Liste filtrée et enrichie (nom de l'acteur, libellé de l'action, cible lisible) — délègue à
 * `lib/auditJournal/query.js`, qui sert aussi l'historique et l'onglet « Utilisateurs ».
 * @param {{ from: string, to: string, actorUserId?: string|null, actorQuery?: string|null,
 *   actorType?: string|null, action?: string|null, category?: string|null,
 *   mode?: 'main'|'all', ip?: string|null, result?: string|null, q?: string|null,
 *   targetId?: string|null, limit?: number, offset?: number }} opts
 */
async function listSecurityEvents(opts) {
  return listJournalEvents('security', {
    ...opts,
    limit: Math.max(1, Math.min(Number(opts.limit) || 100, 5000)),
  });
}

const CSV_COLUMNS = [
  'id',
  'occurred_at',
  'actor_user_id',
  'actor_user_type',
  'actor_name',
  'action',
  'action_label',
  'category_label',
  'target_type',
  'target_id',
  'target_label',
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
      if (col === 'actor_name') return csvEscape(row.actor?.name || '');
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
