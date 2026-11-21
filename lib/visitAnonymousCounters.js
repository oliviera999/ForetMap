'use strict';

/**
 * Compteurs anonymes **agrégés** de la Visite (migration 374, audit UI/UX du 19/11/2026, U6
 * point 5) : une ligne par jour et par carte dans `visit_anonymous_daily`, trois nombres,
 * aucun identifiant.
 *
 * Pourquoi : `visit_seen_anonymous` (progression d'un visiteur sans compte) est purgée au
 * bout de 24 h — c'est voulu, le jeton anonyme ne vit pas plus longtemps. Les statistiques
 * ne pouvaient donc pas compter un visiteur anonyme au-delà d'une journée (« 0 session
 * anonyme sur 30 jours »). Ces compteurs survivent à la purge parce qu'ils ne disent plus
 * rien de personne.
 *
 * Règles de comptage, appliquées au moment où un visiteur anonyme marque un lieu « vu » :
 *  - `sessions` : premier lieu vu d'un jeton (aucune ligne encore pour lui) ;
 *  - `seen_actions` : chaque lieu vu pour la première fois par ce jeton ;
 *  - `completed_visits` : le jeton vient de voir le dernier lieu actif de la carte.
 *
 * Jamais bloquant : une erreur (table absente avant migration, base occupée) est journalisée
 * et le marquage « vu » du visiteur aboutit quand même.
 */

const logger = require('./logger');

/** Conservation des compteurs, en jours (au-delà, purge opportuniste). */
const RETENTION_DAYS = 400;

/**
 * Carte d'un lieu de visite (zone ou repère), `null` si introuvable.
 * @param {{ queryOne: Function }} db
 * @param {'zone'|'marker'} targetType
 * @param {string} targetId
 */
async function resolveTargetMapId(db, targetType, targetId) {
  const table = targetType === 'zone' ? 'visit_zones' : 'visit_markers';
  const row = await db.queryOne(`SELECT map_id FROM ${table} WHERE id = ? LIMIT 1`, [targetId]);
  return row?.map_id ? String(row.map_id) : null;
}

/**
 * Nombre de lieux **actifs** de la carte vus par ce jeton (jointure sur les lieux actifs,
 * comme `/api/visit/stats`).
 */
async function countSeenOnMap(db, anonToken, mapId) {
  const row = await db.queryOne(
    `SELECT COUNT(*) AS n
       FROM visit_seen_anonymous s
       LEFT JOIN visit_zones z
         ON s.target_type = 'zone' AND z.id = s.target_id AND z.is_active = 1 AND z.map_id = ?
       LEFT JOIN visit_markers m
         ON s.target_type = 'marker' AND m.id = s.target_id AND m.is_active = 1 AND m.map_id = ?
      WHERE s.anon_token = ? AND (z.id IS NOT NULL OR m.id IS NOT NULL)`,
    [mapId, mapId, anonToken],
  );
  return Number(row?.n || 0);
}

async function countActiveOnMap(db, mapId) {
  const row = await db.queryOne(
    `SELECT
       (SELECT COUNT(*) FROM visit_zones WHERE map_id = ? AND is_active = 1) +
       (SELECT COUNT(*) FROM visit_markers WHERE map_id = ? AND is_active = 1) AS n`,
    [mapId, mapId],
  );
  return Number(row?.n || 0);
}

/**
 * Enregistre un lieu « vu » par un visiteur anonyme ET met à jour les compteurs du jour.
 * Remplace l'`INSERT … ON DUPLICATE KEY` de la route.
 *
 * @param {{ queryOne: Function, execute: Function }} db
 * @param {{ anonToken: string, targetType: 'zone'|'marker', targetId: string }} params
 */
async function recordAnonymousSeen(db, { anonToken, targetType, targetId }) {
  // Avant l'insertion : ce jeton avait-il déjà une ligne (session déjà comptée), et ce lieu
  // précis (lieu déjà compté) ? Lu avant l'écriture : `affectedRows` d'un
  // `ON DUPLICATE KEY UPDATE` dépend du drapeau CLIENT_FOUND_ROWS du pilote, pas fiable.
  let firstForToken = false;
  let alreadySeen = true;
  try {
    const prior = await db.queryOne(
      `SELECT COUNT(*) AS n,
              SUM(CASE WHEN target_type = ? AND target_id = ? THEN 1 ELSE 0 END) AS same
         FROM visit_seen_anonymous WHERE anon_token = ?`,
      [targetType, targetId, anonToken],
    );
    firstForToken = Number(prior?.n || 0) === 0;
    alreadySeen = Number(prior?.same || 0) > 0;
  } catch (_) {
    firstForToken = false;
    alreadySeen = true;
  }

  await db.execute(
    `INSERT INTO visit_seen_anonymous (anon_token, target_type, target_id, updated_at)
     VALUES (?, ?, ?, UTC_TIMESTAMP())
     ON DUPLICATE KEY UPDATE updated_at = VALUES(updated_at)`,
    [anonToken, targetType, targetId],
  );
  if (alreadySeen) return;

  try {
    const mapId = await resolveTargetMapId(db, targetType, targetId);
    if (!mapId) return;
    let completed = 0;
    const [seenOnMap, activeOnMap] = await Promise.all([
      countSeenOnMap(db, anonToken, mapId),
      countActiveOnMap(db, mapId),
    ]);
    if (activeOnMap > 0 && seenOnMap === activeOnMap) completed = 1;
    await db.execute(
      `INSERT INTO visit_anonymous_daily (day, map_id, sessions, seen_actions, completed_visits)
       VALUES (UTC_DATE(), ?, ?, 1, ?)
       ON DUPLICATE KEY UPDATE
         sessions = sessions + VALUES(sessions),
         seen_actions = seen_actions + 1,
         completed_visits = completed_visits + VALUES(completed_visits)`,
      [mapId, firstForToken ? 1 : 0, completed],
    );
  } catch (err) {
    logger.warn({ err }, 'Visite : compteurs anonymes non mis à jour');
  }
}

/**
 * Totaux anonymes sur les `days` derniers jours (toutes cartes, et par carte).
 * @param {{ queryAll: Function, execute: Function }} db
 * @param {number} [days=30]
 * @returns {Promise<{ days: number, sessions: number, seen_actions: number, completed_visits: number, by_map: Array<object> }>}
 */
async function readAnonymousTotals(db, days = 30) {
  const empty = { days, sessions: 0, seen_actions: 0, completed_visits: 0, by_map: [] };
  try {
    await db.execute('DELETE FROM visit_anonymous_daily WHERE day < UTC_DATE() - INTERVAL ? DAY', [
      RETENTION_DAYS,
    ]);
    const rows = await db.queryAll(
      `SELECT map_id,
              SUM(sessions) AS sessions,
              SUM(seen_actions) AS seen_actions,
              SUM(completed_visits) AS completed_visits
         FROM visit_anonymous_daily
        WHERE day >= UTC_DATE() - INTERVAL ? DAY
        GROUP BY map_id
        ORDER BY map_id`,
      [Math.max(0, Number(days) - 1)],
    );
    const byMap = (rows || []).map((r) => ({
      map_id: String(r.map_id),
      sessions: Number(r.sessions || 0),
      seen_actions: Number(r.seen_actions || 0),
      completed_visits: Number(r.completed_visits || 0),
    }));
    return {
      days,
      sessions: byMap.reduce((n, r) => n + r.sessions, 0),
      seen_actions: byMap.reduce((n, r) => n + r.seen_actions, 0),
      completed_visits: byMap.reduce((n, r) => n + r.completed_visits, 0),
      by_map: byMap,
    };
  } catch (err) {
    logger.warn({ err }, 'Visite : compteurs anonymes illisibles');
    return empty;
  }
}

module.exports = { RETENTION_DAYS, recordAnonymousSeen, readAnonymousTotals };
