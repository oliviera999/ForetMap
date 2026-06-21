const express = require('express');
const { queryOne, queryAll, execute, withTransaction } = require('../../../database');
const { requireGlPermission } = require('../../../middleware/requireGlAuth');
const { normalizeEventRow } = require('../../../lib/glGameEvents');
const { emitGlGameEvent } = require('../../../lib/realtime');
const asyncHandler = require('../../../lib/asyncHandler');
const {
  sortMarkersByPath,
  resolveBoardMovementMode,
  resolveBoardPathStartIndex,
  startMarker,
} = require('../../../lib/glBoardPath');

const router = express.Router();

function parseId(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

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
  const teams = await queryAll('SELECT id FROM gl_teams WHERE game_id = ?', [gameId]);
  if (!teams.length) return;
  await withTransaction(async (tx) => {
    for (const team of teams) {
      await tx.execute(
        `UPDATE gl_teams
            SET position_marker_id = ?,
                position_x_pct = ?,
                position_y_pct = ?,
                updated_at = NOW()
          WHERE id = ? AND game_id = ?`,
        [start.marker.id, Number(start.marker.x_pct), Number(start.marker.y_pct), team.id, gameId],
      );
    }
  });
}

async function updateGameStatus(req, res, nextStatus) {
  const gameId = parseId(req.params.id);
  if (!gameId) return res.status(400).json({ error: 'Identifiant de partie invalide' });
  const gameRow = await queryOne(
    `SELECT id, chapter_id, board_movement_mode, board_path_start_index
       FROM gl_games WHERE id = ? LIMIT 1`,
    [gameId],
  );
  if (!gameRow) return res.status(404).json({ error: 'Partie introuvable' });
  await execute('UPDATE gl_games SET status = ?, updated_at = NOW() WHERE id = ?', [
    nextStatus,
    gameId,
  ]);
  if (nextStatus === 'live') {
    await placeTeamsOnPathStart(gameId, gameRow);
  }
  await execute(
    `INSERT INTO gl_game_events (game_id, team_id, actor_type, actor_id, event_type, payload_json, created_at)
     VALUES (?, NULL, 'mj', ?, 'game_status', ?, NOW())`,
    [gameId, req.glAuth.userId, JSON.stringify({ status: nextStatus })],
  );
  const evt = await queryOne(
    'SELECT id, game_id, team_id, actor_type, actor_id, event_type, payload_json, created_at FROM gl_game_events WHERE game_id = ? ORDER BY id DESC LIMIT 1',
    [gameId],
  );
  const normalized = normalizeEventRow(evt);
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
