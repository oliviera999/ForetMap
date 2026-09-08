const express = require('express');
const db = require('../../../database');
const { queryOne, execute } = db;
const { requireGlPermission, hasGlPermission } = require('../../../middleware/requireGlAuth');
const { normalizeOptionalString, parseId } = require('../../../lib/shared/httpHelpers');
const asyncHandler = require('../../../lib/asyncHandler');
const logger = require('../../../lib/logger');
const { grantStartingFeuilletsToTeam } = require('../../../lib/glFeuilletBundleGrant');
const {
  GlTeamCompositionError,
  buildCompositionProposal,
  applyComposition,
  getClassMixingRate,
} = require('../../../lib/glTeamComposition');

const router = express.Router();

/**
 * Composition automatique (docs/GL_EQUIPES_AUTO_CONCEPTION.md) : outre `gl.team.manage`, la
 * route touche aux affectations de joueurs — même exigence que le roster (`gl.players.manage`).
 */
function requireTeamCompositionRights(req, res) {
  if (!hasGlPermission(req.glAuth, 'gl.players.manage')) {
    res.status(403).json({ error: 'Permission insuffisante (gl.players.manage requise)' });
    return false;
  }
  return true;
}

function sendCompositionError(res, err) {
  if (err instanceof GlTeamCompositionError) {
    res.status(err.status || 400).json({ error: err.message, code: err.code });
    return true;
  }
  return false;
}

router.post(
  '/games/:id/teams/compose/preview',
  requireGlPermission('gl.team.manage'),
  asyncHandler(async (req, res) => {
    const gameId = parseId(req.params.id);
    if (!gameId) return res.status(400).json({ error: 'Identifiant de partie invalide' });
    if (!requireTeamCompositionRights(req, res)) return undefined;
    const body = req.body && typeof req.body === 'object' ? req.body : {};
    try {
      const proposal = await buildCompositionProposal({
        gameId,
        recipe: body.recipe,
        teamCount: body.teamCount,
        teamSize: body.teamSize,
        seed: body.seed,
        includeInactive: body.includeInactive === true,
        weightsOverride: body.weightsOverride,
        pins: body.pins,
        startWith: body.startWith,
      });
      return res.json(proposal);
    } catch (err) {
      if (sendCompositionError(res, err)) return undefined;
      throw err;
    }
  }),
);

router.get(
  '/games/:id/teams/compose/mixing-rate',
  requireGlPermission('gl.team.manage'),
  asyncHandler(async (req, res) => {
    const gameId = parseId(req.params.id);
    if (!gameId) return res.status(400).json({ error: 'Identifiant de partie invalide' });
    try {
      return res.json(await getClassMixingRate({ gameId }));
    } catch (err) {
      if (sendCompositionError(res, err)) return undefined;
      throw err;
    }
  }),
);

router.post(
  '/games/:id/teams/compose/apply',
  requireGlPermission('gl.team.manage'),
  asyncHandler(async (req, res) => {
    const gameId = parseId(req.params.id);
    if (!gameId) return res.status(400).json({ error: 'Identifiant de partie invalide' });
    if (!requireTeamCompositionRights(req, res)) return undefined;
    const body = req.body && typeof req.body === 'object' ? req.body : {};
    try {
      const result = await applyComposition({
        gameId,
        teams: body.teams,
        replaceExisting: body.replaceExisting === true,
        recipe: body.recipe,
        seed: body.seed,
        actor: req.glAuth,
      });
      return res.status(201).json({
        ok: true,
        gameId,
        replaced: result.replaced,
        teams: result.teams,
        event: result.event,
      });
    } catch (err) {
      if (sendCompositionError(res, err)) return undefined;
      throw err;
    }
  }),
);

router.post(
  '/games/:id/teams',
  requireGlPermission('gl.team.manage'),
  asyncHandler(async (req, res) => {
    const gameId = parseId(req.params.id);
    if (!gameId) return res.status(400).json({ error: 'Identifiant de partie invalide' });
    const name = normalizeOptionalString(req.body?.name);
    const type = String(req.body?.type || '').toLowerCase();
    const mascotId = normalizeOptionalString(req.body?.mascotId);
    const color = normalizeOptionalString(req.body?.color) || '#22c55e';
    if (!name) return res.status(400).json({ error: 'Nom d’équipe requis' });
    if (!['gnome', 'unicorn'].includes(type))
      return res.status(400).json({ error: 'Type équipe invalide' });
    const gameRow = await queryOne('SELECT id FROM gl_games WHERE id = ? LIMIT 1', [gameId]);
    if (!gameRow) return res.status(404).json({ error: 'Partie introuvable' });
    let insertResult;
    try {
      insertResult = await execute(
        `INSERT INTO gl_teams (game_id, name, type, mascot_id, position_marker_id, color, created_at, updated_at)
       VALUES (?, ?, ?, ?, NULL, ?, NOW(), NOW())`,
        [gameId, name, type, mascotId, color],
      );
    } catch (err) {
      if (err && err.code === 'ER_NO_REFERENCED_ROW_2') {
        return res.status(409).json({ error: 'Partie supprimée entre-temps' });
      }
      throw err;
    }
    const team = await queryOne('SELECT * FROM gl_teams WHERE id = ? LIMIT 1', [
      insertResult?.insertId,
    ]);
    // Équipe créée après le démarrage : elle reçoit le même lot d'ouverture que les autres.
    const game = await queryOne('SELECT status FROM gl_games WHERE id = ? LIMIT 1', [gameId]);
    if (team && ['live', 'paused'].includes(String(game?.status || '').toLowerCase())) {
      try {
        await grantStartingFeuilletsToTeam(db, {
          gameId,
          teamId: Number(team.id),
          actorId: req.glAuth.userId,
        });
      } catch (err) {
        logger.warn({ err, gameId, teamId: team.id }, 'Feuillets d’ouverture non attribués');
      }
    }
    return res.status(201).json(team);
  }),
);

router.put(
  '/games/:id/teams/:teamId',
  requireGlPermission('gl.team.manage'),
  asyncHandler(async (req, res) => {
    const gameId = parseId(req.params.id);
    const teamId = parseId(req.params.teamId);
    if (!gameId || !teamId) return res.status(400).json({ error: 'Identifiants invalides' });
    const existing = await queryOne(
      'SELECT id, game_id FROM gl_teams WHERE id = ? AND game_id = ? LIMIT 1',
      [teamId, gameId],
    );
    if (!existing) return res.status(404).json({ error: 'Équipe introuvable' });

    const name = req.body?.name == null ? null : normalizeOptionalString(req.body.name);
    const type = req.body?.type == null ? null : String(req.body.type || '').toLowerCase();
    const mascotId = req.body?.mascotId == null ? null : normalizeOptionalString(req.body.mascotId);
    const color = req.body?.color == null ? null : normalizeOptionalString(req.body.color);
    if (name != null && !name) return res.status(400).json({ error: 'Nom d’équipe invalide' });
    if (type != null && !['gnome', 'unicorn'].includes(type)) {
      return res.status(400).json({ error: 'Type équipe invalide' });
    }
    if (name == null && type == null && mascotId == null && color == null) {
      return res.status(400).json({ error: 'Aucune modification fournie' });
    }

    await execute(
      `UPDATE gl_teams
        SET name = COALESCE(?, name),
            type = COALESCE(?, type),
            mascot_id = ?,
            color = COALESCE(?, color),
            updated_at = NOW()
      WHERE id = ? AND game_id = ?`,
      [name, type, mascotId, color, teamId, gameId],
    );
    const updated = await queryOne('SELECT * FROM gl_teams WHERE id = ? AND game_id = ? LIMIT 1', [
      teamId,
      gameId,
    ]);
    return res.json(updated);
  }),
);

router.delete(
  '/games/:id/teams/:teamId',
  requireGlPermission('gl.team.manage'),
  asyncHandler(async (req, res) => {
    const gameId = parseId(req.params.id);
    const teamId = parseId(req.params.teamId);
    if (!gameId || !teamId) return res.status(400).json({ error: 'Identifiants invalides' });
    const existing = await queryOne(
      'SELECT id FROM gl_teams WHERE id = ? AND game_id = ? LIMIT 1',
      [teamId, gameId],
    );
    if (!existing) return res.status(404).json({ error: 'Équipe introuvable' });
    const members = await queryOne(
      'SELECT COUNT(*) AS c FROM gl_team_members WHERE game_id = ? AND team_id = ?',
      [gameId, teamId],
    );
    if (Number(members?.c || 0) > 0) {
      return res.status(409).json({ error: 'Suppression refusée : équipe avec joueurs assignés' });
    }
    await execute('DELETE FROM gl_teams WHERE id = ? AND game_id = ?', [teamId, gameId]);
    return res.json({ ok: true });
  }),
);

module.exports = router;
