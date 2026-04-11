'use strict';

/**
 * Agrégats BDD non sensibles pour expliquer une mascotte absente (contenu public visite vide).
 * Utilisé par GET /api/admin/diagnostics (secret requis).
 */

function n(v) {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
}

/**
 * @param {string[]} allMapIds — ordre conservé (ex. sort_order des cartes)
 * @param {Array<{ map_id: string, rows_total: unknown, rows_public_api: unknown }>} zoneRows
 * @param {Array<{ map_id: string, rows_total: unknown, rows_public_api: unknown }>} markerRows
 * @param {Array<{ map_id: string, tutorial_rows_active: unknown }>} tutoRows
 */
function buildVisitMascotHintPayload(allMapIds, zoneRows, markerRows, tutoRows) {
  const zBy = new Map(zoneRows.map((r) => [String(r.map_id), r]));
  const mBy = new Map(markerRows.map((r) => [String(r.map_id), r]));
  const tBy = new Map(tutoRows.map((r) => [String(r.map_id), r]));
  return allMapIds.map((map_id) => {
    const z = zBy.get(String(map_id));
    const m = mBy.get(String(map_id));
    const t = tBy.get(String(map_id));
    const zp = z ? n(z.rows_public_api) : 0;
    const mp = m ? n(m.rows_public_api) : 0;
    const tc = t ? n(t.tutorial_rows_active) : 0;
    return {
      map_id,
      visitZonesInPublicApi: zp,
      visitZonesTotalRows: z ? n(z.rows_total) : 0,
      visitMarkersInPublicApi: mp,
      visitMarkersTotalRows: m ? n(m.rows_total) : 0,
      visitTutorialsForContentApi: tc,
      /** Aligné sur le client : mascotte si au moins une cible publique ou un tuto actif lié au plan. */
      mascotWouldRenderHint: zp + mp + tc > 0,
    };
  });
}

/**
 * @param {(sql: string, params?: unknown[]) => Promise<any[]>} queryAll
 * @returns {Promise<{ maps: ReturnType<typeof buildVisitMascotHintPayload> }>}
 */
async function getVisitMascotHintSnapshot(queryAll) {
  const allMaps = await queryAll('SELECT id FROM maps ORDER BY sort_order ASC, id ASC');
  const allMapIds = allMaps.map((r) => String(r.id));
  const zoneRows = await queryAll(
    `SELECT map_id,
            COUNT(*) AS rows_total,
            SUM(CASE WHEN IFNULL(is_active, 1) <> 0 THEN 1 ELSE 0 END) AS rows_public_api
       FROM visit_zones
       GROUP BY map_id`
  );
  const markerRows = await queryAll(
    `SELECT map_id,
            COUNT(*) AS rows_total,
            SUM(CASE WHEN IFNULL(is_active, 1) <> 0 THEN 1 ELSE 0 END) AS rows_public_api
       FROM visit_markers
       GROUP BY map_id`
  );
  const tutoRows = await queryAll(
    `SELECT vt.map_id, COUNT(*) AS tutorial_rows_active
       FROM visit_tutorials vt
       INNER JOIN tutorials t ON t.id = vt.tutorial_id AND t.is_active = 1
       WHERE vt.is_active = 1
       GROUP BY vt.map_id`
  );
  return { maps: buildVisitMascotHintPayload(allMapIds, zoneRows, markerRows, tutoRows) };
}

module.exports = { buildVisitMascotHintPayload, getVisitMascotHintSnapshot };
