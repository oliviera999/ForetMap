const express = require('express');
const { queryAll, queryOne, withTransaction } = require('../../../database');
const { requireGlPermission } = require('../../../middleware/requireGlAuth');
const { getGameplaySettings } = require('../../../lib/glSettings');
const { assignPlayerToTeamTx, unassignPlayerFromGameTx } = require('../../../lib/glRoster');
const asyncHandler = require('../../../lib/asyncHandler');
// O10 — resolveRosterError partagé via lib/gl/gamesRuntime.js (aussi utilisé par join-team dans gl/games.js).
const { resolveRosterError } = require('../../../lib/gl/gamesRuntime');

const router = express.Router();

function parseId(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

router.get('/games/:id/roster', requireGlPermission('gl.players.manage'), asyncHandler(async (req, res) => {
  const gameId = parseId(req.params.id);
  if (!gameId) return res.status(400).json({ error: 'Identifiant de partie invalide' });
  const game = await queryOne(
    'SELECT id, class_id FROM gl_games WHERE id = ? LIMIT 1',
    [gameId]
  );
  if (!game) return res.status(404).json({ error: 'Partie introuvable' });

  const settings = await getGameplaySettings();
  const vitalitySelect = settings.vitalityEnabled
    ? ', p.health_points, p.power_points'
    : '';
  const rows = await queryAll(
    `SELECT p.id, p.first_name, p.last_name, p.pseudo, p.is_active,
            tm.team_id, t.name AS team_name${vitalitySelect}
       FROM gl_players p
  LEFT JOIN gl_team_members tm ON tm.game_id = ? AND tm.player_id = p.id
  LEFT JOIN gl_teams t ON t.id = tm.team_id
      WHERE p.class_id = ?
      ORDER BY p.last_name ASC, p.first_name ASC, p.id ASC`,
    [gameId, game.class_id]
  );
  return res.json(rows.map((row) => {
    const out = {
      id: Number(row.id),
      firstName: row.first_name || '',
      lastName: row.last_name || '',
      pseudo: row.pseudo || '',
      isActive: !!Number(row.is_active),
      teamId: row.team_id != null ? Number(row.team_id) : null,
      teamName: row.team_name || null,
    };
    if (settings.vitalityEnabled) {
      out.healthPoints = Number(row.health_points) || 0;
      out.powerPoints = Number(row.power_points) || 0;
    }
    return out;
  }));
}));

router.post('/games/:id/roster/assign', requireGlPermission('gl.players.manage'), asyncHandler(async (req, res) => {
  const gameId = parseId(req.params.id);
  const playerId = parseId(req.body?.playerId);
  const teamId = parseId(req.body?.teamId);
  if (!gameId || !playerId || !teamId) return res.status(400).json({ error: 'Identifiants invalides' });
  try {
    await withTransaction(async (tx) => {
      await assignPlayerToTeamTx(tx, { gameId, teamId, playerId });
    });
  } catch (err) {
    const mapped = resolveRosterError(err);
    if (mapped) return res.status(mapped.status).json({ error: mapped.error });
    throw err;
  }
  return res.json({ ok: true });
}));

router.post('/games/:id/roster/unassign', requireGlPermission('gl.players.manage'), asyncHandler(async (req, res) => {
  const gameId = parseId(req.params.id);
  const playerId = parseId(req.body?.playerId);
  if (!gameId || !playerId) return res.status(400).json({ error: 'Identifiants invalides' });
  await withTransaction(async (tx) => {
    await unassignPlayerFromGameTx(tx, { gameId, playerId });
  });
  return res.json({ ok: true });
}));

module.exports = router;
