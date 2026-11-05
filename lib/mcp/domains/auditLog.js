'use strict';

/**
 * Lecture filtrée du journal d'audit pour `foretmap_audit_log query` (lot D4). La seule route
 * existante (`GET /api/audit`) ne renvoie que les N dernières lignes, sans filtre : le filtrage
 * (acteur, action, entité, période, `via`) est donc fait ici, en SQL paramétré, dans une
 * transaction READ ONLY (`withReadOnly`). L'outil exige la permission `audit.read`, comme la
 * route.
 *
 * `via` (canal de l'action : `mcp`, …) vit dans `payload_json` : filtre par
 * `JSON_UNQUOTE(JSON_EXTRACT(payload_json, '$.via'))`.
 */

const { withReadOnly } = require('../readDb');

const TRUSTED = { astValidated: true };
const READ_OPTS = { appPool: true };
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

function parsePayload(raw) {
  if (raw == null) return null;
  if (typeof raw === 'object') return raw;
  try {
    return JSON.parse(String(raw));
  } catch {
    return String(raw);
  }
}

/**
 * Clause WHERE paramétrée des filtres.
 * @param {{ actor_user_id?: string, actor_user_type?: string, action?: string,
 *   target_type?: string, target_id?: string, from?: string, to?: string, via?: string,
 *   result?: string }} args
 */
function auditWhere(args = {}) {
  const where = [];
  const params = [];
  const eq = (col, v) => {
    where.push(`a.${col} = ?`);
    params.push(String(v));
  };
  if (args.actor_user_id) eq('actor_user_id', args.actor_user_id);
  if (args.actor_user_type) eq('actor_user_type', args.actor_user_type);
  if (args.target_type) eq('target_type', args.target_type);
  if (args.target_id) eq('target_id', args.target_id);
  if (args.result) eq('result', args.result);
  if (args.action) {
    // `préfixe*` : toutes les actions qui commencent par le préfixe (ex. `forum_*`).
    const a = String(args.action);
    if (a.endsWith('*')) {
      where.push('a.action LIKE ?');
      params.push(`${a.slice(0, -1).replace(/[\\%_]/g, (c) => `\\${c}`)}%`);
    } else {
      eq('action', a);
    }
  }
  if (args.from && DAY_RE.test(args.from)) {
    where.push('a.occurred_at >= ?');
    params.push(`${args.from} 00:00:00`);
  }
  if (args.to && DAY_RE.test(args.to)) {
    where.push('a.occurred_at < DATE_ADD(?, INTERVAL 1 DAY)');
    params.push(args.to);
  }
  if (args.via) {
    where.push("JSON_UNQUOTE(JSON_EXTRACT(a.payload_json, '$.via')) = ?");
    params.push(String(args.via));
  }
  return { sql: where.length ? `WHERE ${where.join(' AND ')}` : '', params };
}

/**
 * Lignes du journal d'audit, plus récentes d'abord, avec le nom affiché de l'acteur.
 * @param {object} args filtres (voir `auditWhere`)
 * @param {{ limit: number, offset: number }} page
 */
async function queryAuditLog(args, { limit, offset }) {
  const w = auditWhere(args);
  return withReadOnly(async (db) => {
    const rows = await db.raw(
      `SELECT a.id, a.occurred_at, a.action, a.target_type, a.target_id, a.details,
              a.actor_user_type, a.actor_user_id, a.result, a.payload_json,
              u.display_name AS actor_display_name
         FROM audit_log a
         LEFT JOIN users u ON u.id = a.actor_user_id
        ${w.sql}
        ORDER BY a.id DESC
        LIMIT ? OFFSET ?`,
      // Entiers bornés par l'outil, passés en nombres (échappement client de mysql2 : LIMIT 50).
      [...w.params, Math.trunc(Number(limit)), Math.trunc(Number(offset))],
      TRUSTED,
    );
    const [total] = await db.raw(
      `SELECT COUNT(*) AS n FROM audit_log a ${w.sql}`,
      w.params,
      TRUSTED,
    );
    return {
      total: Number(total?.n || 0),
      items: rows.map((r) => {
        const payload = parsePayload(r.payload_json);
        return {
          id: Number(r.id),
          occurred_at: r.occurred_at,
          action: r.action,
          target_type: r.target_type,
          target_id: r.target_id,
          details: r.details,
          actor_user_type: r.actor_user_type,
          actor_user_id: r.actor_user_id,
          actor_display_name: r.actor_display_name || null,
          result: r.result,
          via: payload && typeof payload === 'object' ? payload.via || null : null,
          payload,
        };
      }),
    };
  }, READ_OPTS);
}

module.exports = { auditWhere, queryAuditLog };
