const express = require('express');
const { queryOne, execute } = require('../../../database');
const { requireGlPermission } = require('../../../middleware/requireGlAuth');
const { normalizeEventRow } = require('../../../lib/glGameEvents');
const { emitGlGameEvent } = require('../../../lib/realtime');
const asyncHandler = require('../../../lib/asyncHandler');

const router = express.Router();

function parseId(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

async function updateGameStatus(req, res, nextStatus) {
  const gameId = parseId(req.params.id);
  if (!gameId) return res.status(400).json({ error: 'Identifiant de partie invalide' });
  await execute('UPDATE gl_games SET status = ?, updated_at = NOW() WHERE id = ?', [nextStatus, gameId]);
  await execute(
    `INSERT INTO gl_game_events (game_id, team_id, actor_type, actor_id, event_type, payload_json, created_at)
     VALUES (?, NULL, 'mj', ?, 'game_status', ?, NOW())`,
    [gameId, req.glAuth.userId, JSON.stringify({ status: nextStatus })]
  );
  const evt = await queryOne(
    'SELECT id, game_id, team_id, actor_type, actor_id, event_type, payload_json, created_at FROM gl_game_events WHERE game_id = ? ORDER BY id DESC LIMIT 1',
    [gameId]
  );
  const normalized = normalizeEventRow(evt);
  emitGlGameEvent(gameId, normalized);
  return res.json({ ok: true, status: nextStatus });
}

router.post('/games/:id/start', requireGlPermission('gl.game.manage'), asyncHandler((req, res) => updateGameStatus(req, res, 'live')));
router.post('/games/:id/pause', requireGlPermission('gl.game.manage'), asyncHandler((req, res) => updateGameStatus(req, res, 'paused')));
router.post('/games/:id/end', requireGlPermission('gl.game.manage'), asyncHandler((req, res) => updateGameStatus(req, res, 'ended')));

module.exports = router;
