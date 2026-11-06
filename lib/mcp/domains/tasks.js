'use strict';

/**
 * Lectures agrégées du domaine « tâches » pour `foretmap_tasks stats` (lot D) — SQL écrit ici,
 * paramétré, exécuté en transaction READ ONLY (`withReadOnly`). Aucune donnée nominative :
 * uniquement des compteurs et des moyennes.
 *
 * Les requêtes sont écrites par ce code (jamais par l'appelant) : elles passent par `raw` avec
 * `astValidated` (« SQL de confiance »), la garde par expressions régulières ne s'appliquant
 * qu'aux tables de contenu.
 */

const { withReadOnly } = require('../readDb');
const { categoryInfo, formatInfo } = require('../../shared/taskTaxonomyCore');

const TRUSTED = { astValidated: true };
const READ_OPTS = { appPool: true };

function whereOf(args, alias = 't') {
  const where = [`${alias}.archived_at IS NULL`];
  const params = [];
  if (args.map_id) {
    where.push(`${alias}.map_id = ?`);
    params.push(String(args.map_id));
  }
  if (args.project_id) {
    where.push(`${alias}.project_id = ?`);
    params.push(String(args.project_id));
  }
  if (args.from) {
    where.push(`LEFT(${alias}.created_at, 10) >= ?`);
    params.push(String(args.from).slice(0, 10));
  }
  if (args.to) {
    where.push(`LEFT(${alias}.created_at, 10) <= ?`);
    params.push(String(args.to).slice(0, 10));
  }
  return { sql: where.join(' AND '), params };
}

function num(v) {
  return v === null || v === undefined ? null : Number(v);
}

/**
 * Statistiques des tâches actives (non archivées) du périmètre demandé.
 * @param {{ map_id?: string, project_id?: string, from?: string, to?: string }} args
 */
async function taskStats(args = {}) {
  const w = whereOf(args);
  return withReadOnly(async (db) => {
    const q = (sql, params = w.params) => db.raw(sql, params, TRUSTED);
    const byStatus = await q(
      `SELECT t.status, COUNT(*) AS n FROM tasks t WHERE ${w.sql} GROUP BY t.status ORDER BY n DESC`,
    );
    const byMap = await q(
      `SELECT t.map_id, m.label AS map_label, COUNT(*) AS n,
              SUM(t.status = 'validated') AS validated
         FROM tasks t LEFT JOIN maps m ON m.id = t.map_id
        WHERE ${w.sql} GROUP BY t.map_id, m.label ORDER BY n DESC`,
    );
    const byProject = await q(
      `SELECT t.project_id, p.title AS project_title, COUNT(*) AS n,
              SUM(t.status = 'validated') AS validated
         FROM tasks t LEFT JOIN task_projects p ON p.id = t.project_id
        WHERE ${w.sql} AND t.project_id IS NOT NULL
        GROUP BY t.project_id, p.title ORDER BY n DESC LIMIT 200`,
    );
    // Répartitions par métier et par format (migration 329) ; NULL = non classée.
    const byCategory = await q(
      `SELECT t.category AS k, COUNT(*) AS n, SUM(t.status = 'validated') AS validated
         FROM tasks t WHERE ${w.sql} GROUP BY t.category ORDER BY n DESC`,
    );
    const byFormat = await q(
      `SELECT t.format AS k, COUNT(*) AS n, SUM(t.status = 'validated') AS validated
         FROM tasks t WHERE ${w.sql} GROUP BY t.format ORDER BY n DESC`,
    );
    const byMonth = await q(
      `SELECT LEFT(t.created_at, 7) AS month, COUNT(*) AS created,
              SUM(t.status = 'validated') AS validated
         FROM tasks t WHERE ${w.sql} AND t.created_at IS NOT NULL
        GROUP BY LEFT(t.created_at, 7) ORDER BY month DESC LIMIT 36`,
    );
    const [delay] = await q(
      `SELECT AVG(DATEDIFF(t.validated_at, STR_TO_DATE(LEFT(t.created_at, 10), '%Y-%m-%d'))) AS avg_days,
              COUNT(*) AS n
         FROM tasks t
        WHERE ${w.sql} AND t.status = 'validated' AND t.validated_at IS NOT NULL
          AND t.created_at IS NOT NULL`,
    );
    const [late] = await q(
      `SELECT SUM(t.due_date IS NOT NULL AND LEFT(t.due_date, 10) < CURDATE()
                  AND t.status NOT IN ('validated', 'done')) AS overdue,
              SUM(t.status NOT IN ('validated')) AS open_tasks,
              SUM(t.due_date IS NOT NULL) AS with_due
         FROM tasks t WHERE ${w.sql}`,
    );
    const [fill] = await q(
      `SELECT AVG(LEAST(1, COALESCE(a.n, 0) / GREATEST(1, t.required_students))) AS fill_rate,
              SUM(COALESCE(a.n, 0) = 0) AS without_assignee
         FROM tasks t
         LEFT JOIN (SELECT task_id, COUNT(*) AS n FROM task_assignments GROUP BY task_id) a
           ON a.task_id = t.id
        WHERE ${w.sql} AND t.status IN ('available', 'in_progress')`,
    );
    // Abandon : désinscriptions rapportées aux inscriptions (journal d'audit, même période).
    const auditWhere = [];
    const auditParams = [];
    if (args.from) {
      auditWhere.push('LEFT(created_at, 10) >= ?');
      auditParams.push(String(args.from).slice(0, 10));
    }
    if (args.to) {
      auditWhere.push('LEFT(created_at, 10) <= ?');
      auditParams.push(String(args.to).slice(0, 10));
    }
    const [abandon] = await q(
      `SELECT SUM(action = 'assign_task') AS assigns, SUM(action = 'unassign_task') AS unassigns
         FROM audit_log
        WHERE action IN ('assign_task', 'unassign_task')
          ${auditWhere.length ? `AND ${auditWhere.join(' AND ')}` : ''}`,
      auditParams,
    );
    const total = byStatus.reduce((s, r) => s + Number(r.n), 0);
    const open = num(late?.open_tasks) || 0;
    const assigns = num(abandon?.assigns) || 0;
    return {
      perimetre: {
        map_id: args.map_id || null,
        project_id: args.project_id || null,
        from: args.from || null,
        to: args.to || null,
        archived: 'exclues',
      },
      total,
      by_status: byStatus.map((r) => ({ status: r.status, n: Number(r.n) })),
      by_map: byMap.map((r) => ({
        map_id: r.map_id,
        map_label: r.map_label,
        n: Number(r.n),
        validated: Number(r.validated || 0),
      })),
      by_project: byProject.map((r) => ({
        project_id: r.project_id,
        project_title: r.project_title,
        n: Number(r.n),
        validated: Number(r.validated || 0),
      })),
      by_category: byCategory.map((r) => ({
        category: r.k ?? null,
        label: r.k ? categoryInfo(r.k)?.label || r.k : 'Non classée',
        n: Number(r.n),
        validated: Number(r.validated || 0),
      })),
      by_format: byFormat.map((r) => ({
        format: r.k ?? null,
        label: r.k ? formatInfo(r.k)?.label || r.k : 'Non renseigné',
        n: Number(r.n),
        validated: Number(r.validated || 0),
      })),
      by_month: byMonth.map((r) => ({
        month: r.month,
        created: Number(r.created),
        validated: Number(r.validated || 0),
      })),
      validation_delay_days: {
        average: delay?.avg_days == null ? null : Math.round(Number(delay.avg_days) * 10) / 10,
        validated_tasks: Number(delay?.n || 0),
      },
      overdue: {
        count: Number(late?.overdue || 0),
        rate_of_open: open ? Math.round((Number(late.overdue || 0) * 1000) / open) / 10 : 0,
      },
      fill: {
        rate_percent:
          fill?.fill_rate == null ? null : Math.round(Number(fill.fill_rate) * 1000) / 10,
        open_without_assignee: Number(fill?.without_assignee || 0),
      },
      abandon: {
        assigns,
        unassigns: num(abandon?.unassigns) || 0,
        rate_percent: assigns
          ? Math.round(((num(abandon?.unassigns) || 0) * 1000) / assigns) / 10
          : 0,
      },
    };
  }, READ_OPTS);
}

module.exports = { taskStats };
