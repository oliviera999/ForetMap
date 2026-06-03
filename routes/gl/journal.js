'use strict';

const express = require('express');
const { queryAll, queryOne } = require('../../database');
const { requireGlAuth } = require('../../middleware/requireGlAuth');
const { normalizeEventRow } = require('../../lib/glGameEvents');
const { canAccessGlGame } = require('../../lib/glGameAccess');
const { presentJournalEvent, buildTeamsById } = require('../../lib/glJournalPresent');

const router = express.Router();

router.use(requireGlAuth);

router.get('/games/:id', async (req, res) => {
  const gameId = Number(req.params.id);
  if (!Number.isFinite(gameId)) return res.status(400).json({ error: 'Identifiant de partie invalide' });
  const game = await queryOne('SELECT id FROM gl_games WHERE id = ? LIMIT 1', [gameId]);
  if (!game) return res.status(404).json({ error: 'Partie introuvable' });
  if (!(await canAccessGlGame(req.glAuth, gameId))) {
    return res.status(403).json({ error: 'Accès refusé à cette partie' });
  }

  const teamFilter = req.query?.teamId != null ? Number(req.query.teamId) : null;
  const limit = Math.min(500, Math.max(1, Number(req.query?.limit) || 100));

  const rows = teamFilter != null && Number.isFinite(teamFilter)
    ? await queryAll(
      `SELECT id, game_id, team_id, actor_type, actor_id, event_type, payload_json, created_at
         FROM gl_game_events
        WHERE game_id = ? AND (team_id = ? OR team_id IS NULL)
        ORDER BY id DESC
        LIMIT ${limit}`,
      [gameId, teamFilter]
    )
    : await queryAll(
      `SELECT id, game_id, team_id, actor_type, actor_id, event_type, payload_json, created_at
         FROM gl_game_events
        WHERE game_id = ?
        ORDER BY id DESC
        LIMIT ${limit}`,
      [gameId]
    );

  const teamRows = await queryAll(
    'SELECT id, name, color FROM gl_teams WHERE game_id = ? ORDER BY id ASC',
    [gameId]
  );
  const teams = teamRows.map((row) => ({
    id: Number(row.id),
    name: String(row.name || ''),
    color: row.color ? String(row.color) : null,
  }));
  const teamsById = buildTeamsById(teams);
  const events = rows.map((row) => {
    const normalized = normalizeEventRow(row);
    return {
      ...normalized,
      presentation: presentJournalEvent(normalized, { teamsById }),
    };
  });
  return res.json({ events, total: events.length, teams });
});

module.exports = router;
