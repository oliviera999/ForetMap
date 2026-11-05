'use strict';

/**
 * Lectures agrégées du domaine « observations d'espèces » pour `foretmap_observations stats`
 * (lot D3) — SQL écrit ici, paramétré, exécuté en transaction READ ONLY (`withReadOnly`).
 *
 * Aucune donnée nominative : des compteurs, des moyennes et un nombre d'observateurs
 * distincts, masqué sous 5 (même seuil que les usages anonymes du connecteur).
 */

const { withReadOnly } = require('../readDb');

const TRUSTED = { astValidated: true };
const READ_OPTS = { appPool: true };
const SMALL_COUNT = 5;

function whereOf(args) {
  const where = ['1 = 1'];
  const params = [];
  if (args.map_id) {
    where.push('o.map_id = ?');
    params.push(String(args.map_id));
  }
  if (args.from) {
    where.push('o.observed_at >= ?');
    params.push(String(args.from).slice(0, 10));
  }
  if (args.to) {
    where.push('o.observed_at <= ?');
    params.push(String(args.to).slice(0, 10));
  }
  return { sql: where.join(' AND '), params };
}

function masked(n) {
  const v = Number(n || 0);
  return v > 0 && v < SMALL_COUNT ? `< ${SMALL_COUNT}` : v;
}

/**
 * Statistiques des observations d'espèces du périmètre demandé.
 * @param {{ map_id?: string, from?: string, to?: string }} args
 */
async function observationStats(args = {}) {
  const w = whereOf(args);
  return withReadOnly(async (db) => {
    const q = (sql, params = w.params) => db.raw(sql, params, TRUSTED);
    const byStatus = await q(
      `SELECT o.status, COUNT(*) AS n FROM species_observations o
        WHERE ${w.sql} GROUP BY o.status ORDER BY n DESC`,
    );
    const byMap = await q(
      `SELECT o.map_id, m.label AS map_label, COUNT(*) AS n,
              SUM(o.status = 'validee') AS validated
         FROM species_observations o LEFT JOIN maps m ON m.id = o.map_id
        WHERE ${w.sql} GROUP BY o.map_id, m.label ORDER BY n DESC`,
    );
    const bySpecies = await q(
      `SELECT o.plant_id, p.name AS plant_name, COUNT(*) AS n,
              SUM(o.status = 'validee') AS validated
         FROM species_observations o LEFT JOIN plants p ON p.id = o.plant_id
        WHERE ${w.sql} AND o.plant_id IS NOT NULL
        GROUP BY o.plant_id, p.name ORDER BY n DESC LIMIT 50`,
    );
    const byMonth = await q(
      `SELECT DATE_FORMAT(o.observed_at, '%Y-%m') AS month, COUNT(*) AS n,
              SUM(o.status = 'validee') AS validated
         FROM species_observations o WHERE ${w.sql}
        GROUP BY DATE_FORMAT(o.observed_at, '%Y-%m') ORDER BY month DESC LIMIT 36`,
    );
    const byMode = await q(
      `SELECT COALESCE(o.detection_mode, 'non_precise') AS detection_mode, COUNT(*) AS n
         FROM species_observations o WHERE ${w.sql}
        GROUP BY COALESCE(o.detection_mode, 'non_precise') ORDER BY n DESC`,
    );
    const [delay] = await q(
      `SELECT AVG(TIMESTAMPDIFF(HOUR, o.created_at, o.decided_at)) AS avg_hours, COUNT(*) AS n
         FROM species_observations o
        WHERE ${w.sql} AND o.decided_at IS NOT NULL AND o.status IN ('validee', 'refusee')`,
    );
    const [people] = await q(
      `SELECT COUNT(DISTINCT o.observer_user_id) AS observers FROM species_observations o
        WHERE ${w.sql}`,
    );
    const total = byStatus.reduce((s, r) => s + Number(r.n), 0);
    const decided = byStatus
      .filter((r) => r.status === 'validee' || r.status === 'refusee')
      .reduce((s, r) => s + Number(r.n), 0);
    const validated = Number(byStatus.find((r) => r.status === 'validee')?.n || 0);
    return {
      perimetre: { map_id: args.map_id || null, from: args.from || null, to: args.to || null },
      total,
      by_status: byStatus.map((r) => ({ status: r.status, n: Number(r.n) })),
      validation_rate_percent: decided ? Math.round((validated * 1000) / decided) / 10 : null,
      by_map: byMap.map((r) => ({
        map_id: r.map_id,
        map_label: r.map_label,
        n: Number(r.n),
        validated: Number(r.validated || 0),
      })),
      top_species: bySpecies.map((r) => ({
        plant_id: Number(r.plant_id),
        plant_name: r.plant_name,
        n: Number(r.n),
        validated: Number(r.validated || 0),
      })),
      by_month: byMonth.map((r) => ({
        month: r.month,
        n: Number(r.n),
        validated: Number(r.validated || 0),
      })),
      by_detection_mode: byMode.map((r) => ({ detection_mode: r.detection_mode, n: Number(r.n) })),
      decision_delay_hours: {
        average: delay?.avg_hours == null ? null : Math.round(Number(delay.avg_hours) * 10) / 10,
        decided: Number(delay?.n || 0),
      },
      distinct_observers: masked(people?.observers),
    };
  }, READ_OPTS);
}

module.exports = { observationStats };
