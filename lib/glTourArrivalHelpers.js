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

module.exports = { resolveTenirMarkerContext, consumeSentier };
