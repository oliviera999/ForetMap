const express = require('express');
const db = require('../../../database');
const { queryOne, queryAll, execute } = db;
const { requireGlPermission } = require('../../../middleware/requireGlAuth');
const { normalizeEventRow, insertGameEvent } = require('../../../lib/glGameEvents');
const { emitGlGameEvent } = require('../../../lib/realtime');
const asyncHandler = require('../../../lib/asyncHandler');
const {
  sortMarkersByPath,
  resolveBoardMovementMode,
  resolveBoardPathStartIndex,
  startMarker,
} = require('../../../lib/glBoardPath');
const { parseId } = require('../../../lib/shared/httpHelpers');
const {
  grantStartingFeuilletsForGame,
  grantClosingFeuilletsForGame,
} = require('../../../lib/glFeuilletBundleGrant');
const logger = require('../../../lib/logger');

const router = express.Router();

/** Dernier plateau du voyage : c'est là que la liasse du copiste se remet d'elle-même. */
const LAST_PLATEAU = 5;

async function placeTeamsOnPathStart(gameId, gameRow) {
  if (!gameRow?.chapter_id) return;
  if (resolveBoardMovementMode(gameRow) !== 'numbered_path') return;
  const markerRows = await queryAll(
    `SELECT id, x_pct, y_pct, order_index
       FROM gl_chapter_markers
      WHERE chapter_id = ?
      ORDER BY order_index ASC, id ASC`,
    [gameRow.chapter_id],
  );
  const sorted = sortMarkersByPath(markerRows);
  const start = startMarker(sorted, resolveBoardPathStartIndex(gameRow));
  if (!start?.marker) return;
  // Mêmes valeurs pour toutes les équipes : un seul UPDATE sur la partie.
  await execute(
    `UPDATE gl_teams
        SET position_marker_id = ?,
            position_x_pct = ?,
            position_y_pct = ?,
            updated_at = NOW()
      WHERE game_id = ?`,
    [start.marker.id, Number(start.marker.x_pct), Number(start.marker.y_pct), gameId],
  );
}

async function updateGameStatus(req, res, nextStatus) {
  const gameId = parseId(req.params.id);
  if (!gameId) return res.status(400).json({ error: 'Identifiant de partie invalide' });
  const gameRow = await queryOne(
    `SELECT g.id, g.chapter_id, g.board_movement_mode, g.board_path_start_index,
            ch.plateau_number
       FROM gl_games g
       LEFT JOIN gl_chapters ch ON ch.id = g.chapter_id
      WHERE g.id = ? LIMIT 1`,
    [gameId],
  );
  if (!gameRow) return res.status(404).json({ error: 'Partie introuvable' });
  await execute('UPDATE gl_games SET status = ?, updated_at = NOW() WHERE id = ?', [
    nextStatus,
    gameId,
  ]);
  if (nextStatus === 'live') {
    await placeTeamsOnPathStart(gameId, gameRow);
    // Feuillets d'ouverture : chaque équipe démarre avec le cadre du récit en main.
    // Best-effort — un corpus sans feuillet d'ouverture ne doit pas empêcher de jouer.
    try {
      await grantStartingFeuilletsForGame(db, { gameId, actorId: req.glAuth.userId });
    } catch (err) {
      logger.warn({ err, gameId }, 'Feuillets d’ouverture non attribués');
    }
  }
  // Fin du voyage : la liasse du copiste est remise en bloc. Réservée au dernier
  // plateau — `cop-finale` et `cop-close` expliquent que le carnet de Sélène s'arrête
  // sur un mot suspendu, ce qui dévoilerait la fin s'il restait des chapitres à jouer.
  // Une classe qui s'arrête avant passe par la remise manuelle (route dédiée du MJ).
  if (nextStatus === 'ended' && Number(gameRow.plateau_number) === LAST_PLATEAU) {
    try {
      await grantClosingFeuilletsForGame(db, { gameId, actorId: req.glAuth.userId });
    } catch (err) {
      logger.warn({ err, gameId }, 'Liasse du copiste non remise');
    }
  }

  const normalized = await insertGameEvent(db, {
    gameId,
    actorType: 'mj',
    actorId: req.glAuth.userId,
    eventType: 'game_status',
    payload: { status: nextStatus },
  });
  emitGlGameEvent(gameId, normalized);
  return res.json({ ok: true, status: nextStatus });
}

router.post(
  '/games/:id/start',
  requireGlPermission('gl.game.manage'),
  asyncHandler((req, res) => updateGameStatus(req, res, 'live')),
);
router.post(
  '/games/:id/pause',
  requireGlPermission('gl.game.manage'),
  asyncHandler((req, res) => updateGameStatus(req, res, 'paused')),
);
router.post(
  '/games/:id/end',
  requireGlPermission('gl.game.manage'),
  asyncHandler((req, res) => updateGameStatus(req, res, 'ended')),
);

module.exports = router;
