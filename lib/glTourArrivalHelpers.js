'use strict';

/**
 * Helpers d'arrivée partagés par le moteur du tour (`lib/glTour.js`) et les routes de repères
 * (`routes/gl/games/markers.js`) : Sentier (sort gnome) actif ou consommé.
 */

/** Un Sentier non consommé est-il posé pour l'équipe ? */
async function resolveTenirMarkerContext(tx, gameId, teamId) {
  let sentierActif = false;
  try {
    const row = await tx.queryOne(
      `SELECT id FROM gl_game_tenir_effets
        WHERE game_id = ? AND team_id = ? AND kind = 'sentier'
          AND JSON_EXTRACT(COALESCE(payload_json, '{}'), '$.consomme') IS NULL
        ORDER BY id DESC LIMIT 1`,
      [gameId, teamId],
    );
    sentierActif = !!row;
  } catch (_) {
    sentierActif = false;
  }
  return { tenir: true, sentierActif };
}

/** Consomme le Sentier de l'équipe (après qu'il a neutralisé une case Souffle). */
async function consumeSentier(tx, gameId, teamId) {
  await tx.execute(
    `UPDATE gl_game_tenir_effets SET payload_json = JSON_SET(COALESCE(payload_json, '{}'), '$.consomme', 1)
      WHERE game_id = ? AND team_id = ? AND kind = 'sentier'
        AND JSON_EXTRACT(COALESCE(payload_json, '{}'), '$.consomme') IS NULL`,
    [gameId, teamId],
  );
}

/**
 * L'arrivée de l'équipe sur cette case a-t-elle déjà été appliquée par le moteur du tour ?
 * Le moteur (`applyArrivalTx`) journalise un `marker_effect` à chaque arrêt sur une case à
 * effet, Sentier compris. Quand le dernier de l'équipe porte ce repère, l'arrêt est déjà
 * joué : le présenter une seconde fois (`present-arrival`, appelé par l'écran après le jet) ne
 * doit plus rien poser — ni « un seul dé », ni Sentier consommé une seconde fois.
 * @returns {Promise<null|{ sentier: boolean }>} `sentier` : un Sentier a neutralisé la case
 */
async function arriveeDejaAppliquee(db, { gameId, teamId, markerId }) {
  const row = await db.queryOne(
    `SELECT payload_json FROM gl_game_events
      WHERE game_id = ? AND team_id = ? AND event_type = 'marker_effect'
      ORDER BY id DESC LIMIT 1`,
    [gameId, teamId],
  );
  if (!row) return null;
  let payload = null;
  try {
    payload =
      typeof row.payload_json === 'string' ? JSON.parse(row.payload_json) : row.payload_json;
  } catch (_) {
    payload = null;
  }
  if (!payload || Number(payload.markerId) !== Number(markerId)) return null;
  return { sentier: payload.sentier === true };
}

module.exports = { resolveTenirMarkerContext, consumeSentier, arriveeDejaAppliquee };
