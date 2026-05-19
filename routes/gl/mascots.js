'use strict';

const express = require('express');
const { queryOne, queryAll, withTransaction } = require('../../database');
const { requireGlAuth, requireGlPermission } = require('../../middleware/requireGlAuth');
const { getGlMascotCatalog, getGlMascotById } = require('../../lib/glMascotCatalog');

const router = express.Router();

/** GET /api/gl/mascots — catalogue complet (auth GL requise, joueur ou MJ). */
router.get('/', requireGlAuth, async (req, res) => {
  const catalog = await getGlMascotCatalog();
  let assignments = [];
  const gameIdRaw = req.query?.gameId;
  if (gameIdRaw != null) {
    const gameId = Number(gameIdRaw);
    if (Number.isFinite(gameId) && gameId > 0) {
      assignments = await queryAll(
        `SELECT team_id, mascot_id
           FROM gl_mascot_assignments
          WHERE game_id = ?`,
        [gameId]
      );
    }
  }
  return res.json({ mascots: catalog, assignments });
});

/**
 * POST /api/gl/mascots/assign — assigne une mascotte à une équipe.
 *
 * Transactionnel : applique la même `mascot_id` sur `gl_teams` et insère/
 * met à jour la ligne `gl_mascot_assignments` (clé unique `(game_id, team_id)`).
 * Refuse `409` si la mascotte est déjà utilisée par une autre équipe de la
 * même partie.
 */
router.post('/assign', requireGlPermission('gl.team.manage'), async (req, res) => {
  const gameId = Number(req.body?.gameId);
  const teamId = Number(req.body?.teamId);
  const mascotId = String(req.body?.mascotId || '').trim();
  if (!Number.isFinite(gameId) || gameId <= 0) {
    return res.status(400).json({ error: 'gameId invalide' });
  }
  if (!Number.isFinite(teamId) || teamId <= 0) {
    return res.status(400).json({ error: 'teamId invalide' });
  }
  if (!mascotId) {
    return res.status(400).json({ error: 'mascotId requis' });
  }
  const mascot = await getGlMascotById(mascotId);
  if (!mascot) {
    return res.status(404).json({ error: 'Mascotte inconnue dans le catalogue G&L' });
  }
  const team = await queryOne(
    'SELECT id, game_id FROM gl_teams WHERE id = ? LIMIT 1',
    [teamId]
  );
  if (!team) return res.status(404).json({ error: 'Équipe introuvable' });
  if (Number(team.game_id) !== gameId) {
    return res.status(400).json({ error: 'team_id n\'appartient pas à la partie spécifiée' });
  }

  const collision = await queryOne(
    `SELECT team_id
       FROM gl_mascot_assignments
      WHERE game_id = ? AND mascot_id = ? AND team_id <> ?
      LIMIT 1`,
    [gameId, mascotId, teamId]
  );
  if (collision) {
    return res.status(409).json({ error: 'Mascotte déjà utilisée par une autre équipe de cette partie' });
  }

  await withTransaction(async (tx) => {
    await tx.execute(
      `INSERT INTO gl_mascot_assignments (game_id, team_id, mascot_id, created_at)
       VALUES (?, ?, ?, NOW())
       ON DUPLICATE KEY UPDATE mascot_id = VALUES(mascot_id), created_at = VALUES(created_at)`,
      [gameId, teamId, mascotId]
    );
    await tx.execute(
      'UPDATE gl_teams SET mascot_id = ?, updated_at = NOW() WHERE id = ?',
      [mascotId, teamId]
    );
  });

  const row = await queryOne(
    `SELECT game_id, team_id, mascot_id, created_at
       FROM gl_mascot_assignments
      WHERE game_id = ? AND team_id = ?
      LIMIT 1`,
    [gameId, teamId]
  );
  return res.status(200).json({ assignment: row, mascot });
});

module.exports = router;
