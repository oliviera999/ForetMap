const express = require('express');
const { queryAll, queryOne, withTransaction } = require('../../../database');
const { requireGlAuth, actorTypeOf } = require('../../../middleware/requireGlAuth');
const { normalizeEventRow } = require('../../../lib/glGameEvents');
const { emitGlGameEvent } = require('../../../lib/realtime');
const { canAccessGlGame } = require('../../../lib/glGameAccess');
const {
  listPresentedFeuilletZones,
  presentFeuilletZone,
} = require('../../../lib/glFeuilletZonePresent');
const { getFeuilletZoneById } = require('../../../lib/glFeuilletZonesCatalog');
const { isTeamInsideFeuilletZone } = require('../../../lib/glFeuilletZonePresence');
const asyncHandler = require('../../../lib/asyncHandler');
const { z, validate } = require('../../../lib/validate');
const { getPlayerGameMembership } = require('../../../lib/gl/gamesRuntime');
const { parseId } = require('../../../lib/shared/httpHelpers');

const router = express.Router();

// O7 — query friction-free (coercition permissive, jamais de 400 issu du schéma) :
// `teamId` (GET /games/:id/feuillet-zones/presented) reproduit l'ancien `parseId`
// (Number fini → n, sinon null). Le 400 historique (« teamId requis pour le MJ »)
// reste décidé par le handler, conditions inchangées.
const glGamesFeuilletPresentedQuerySchema = z.object({
  teamId: z.preprocess(
    (v) => (v == null ? null : Number(v)),
    z.number().finite().nullable().catch(null),
  ),
});

/** GET /api/gl/games/:id/feuillet-zones/presented — zones feuillets déjà lues par équipe. */
router.get(
  '/games/:id/feuillet-zones/presented',
  requireGlAuth,
  validate({ query: glGamesFeuilletPresentedQuerySchema }),
  asyncHandler(async (req, res) => {
    const gameId = parseId(req.params.id);
    if (!gameId) return res.status(400).json({ error: 'Identifiant de partie invalide' });

    const allowed = await canAccessGlGame(req.glAuth, gameId);
    if (!allowed) return res.status(403).json({ error: 'Accès partie refusé' });

    let teamId = req.validatedQuery?.teamId;
    if (req.glAuth.userType === 'gl_player') {
      const membership = await getPlayerGameMembership(gameId, req.glAuth.userId);
      if (!membership?.team_id)
        return res.status(403).json({ error: 'Joueur non rattaché à une équipe' });
      teamId = Number(membership.team_id);
    } else if (teamId == null) {
      return res.status(400).json({ error: 'teamId requis pour le MJ' });
    }

    const team = await queryOne('SELECT id FROM gl_teams WHERE id = ? AND game_id = ? LIMIT 1', [
      teamId,
      gameId,
    ]);
    if (!team) return res.status(404).json({ error: 'Équipe introuvable dans cette partie' });

    const zoneIds = await listPresentedFeuilletZones({ queryAll }, { gameId, teamId });
    return res.json({ teamId, zoneIds });
  }),
);

/** POST /api/gl/games/:id/feuillet-zones/:zoneId/present — première traversée d'une zone feuillet. */
router.post(
  '/games/:id/feuillet-zones/:zoneId/present',
  requireGlAuth,
  asyncHandler(async (req, res) => {
    const gameId = parseId(req.params.id);
    const zoneId = String(req.params.zoneId || '').trim();
    if (!gameId || !zoneId) {
      return res.status(400).json({ error: 'Identifiants invalides' });
    }

    const allowed = await canAccessGlGame(req.glAuth, gameId);
    if (!allowed) return res.status(403).json({ error: 'Accès partie refusé' });

    const game = await queryOne(
      `SELECT g.id, g.chapter_id, g.status,
            g.lore_gemme_costs_enabled, g.lore_heart_rewards_enabled,
            g.lore_effacement_enabled, g.lore_feuillet_retrigger,
            ch.plateau_number AS chapter_plateau_number
       FROM gl_games g
       LEFT JOIN gl_chapters ch ON ch.id = g.chapter_id
      WHERE g.id = ?
      LIMIT 1`,
      [gameId],
    );
    if (!game) return res.status(404).json({ error: 'Partie introuvable' });
    if (!['live', 'paused'].includes(String(game.status || '').toLowerCase())) {
      return res.status(409).json({ error: 'Partie non active' });
    }

    const catalogZone = getFeuilletZoneById(zoneId);
    if (!catalogZone) return res.status(404).json({ error: 'Zone feuillet introuvable' });

    const chapterPlateau = Number(game.chapter_plateau_number);
    if (!Number.isFinite(chapterPlateau) || chapterPlateau < 1 || chapterPlateau > 5) {
      return res.status(409).json({ error: 'Chapitre sans plateau configuré' });
    }
    if (Number(catalogZone.plateau) !== chapterPlateau) {
      return res.status(404).json({ error: 'Zone feuillet incompatible avec ce chapitre' });
    }

    let teamId = req.body?.teamId != null ? parseId(req.body.teamId) : null;
    if (req.glAuth.userType === 'gl_player') {
      const membership = await getPlayerGameMembership(gameId, req.glAuth.userId);
      if (!membership?.team_id)
        return res.status(403).json({ error: 'Joueur non rattaché à une équipe' });
      teamId = Number(membership.team_id);
    } else if (teamId == null) {
      return res.status(400).json({ error: 'teamId requis pour le MJ' });
    }

    // La position est chargée avec l'équipe : libre (`position_*_pct`) ou, à défaut,
    // celle du repère où elle se tient — c'est ce que le joueur voit à l'écran.
    const team = await queryOne(
      `SELECT t.id, t.position_x_pct, t.position_y_pct,
              m.x_pct AS marker_x_pct, m.y_pct AS marker_y_pct
         FROM gl_teams t
         LEFT JOIN gl_chapter_markers m ON m.id = t.position_marker_id
        WHERE t.id = ? AND t.game_id = ?
        LIMIT 1`,
      [teamId, gameId],
    );
    if (!team) return res.status(404).json({ error: 'Équipe introuvable dans cette partie' });

    // Anti-farm : côté joueur, les cœurs, les gemmes et l'événement de traversée ne
    // s'obtiennent qu'en étant réellement dans le polygone. Sans cette garde, les
    // 24 zones du catalogue se récoltaient sans bouger la mascotte. Le MJ, lui, peut
    // présenter à distance (démonstration, rattrapage).
    if (req.glAuth.userType === 'gl_player' && !isTeamInsideFeuilletZone(team, catalogZone)) {
      return res.status(409).json({ error: 'Votre mascotte n’est pas dans cette zone' });
    }

    const actorType = actorTypeOf(req);
    const result = await presentFeuilletZone(
      { queryAll, withTransaction },
      {
        gameId,
        teamId,
        zoneId,
        feuilletCode: catalogZone.feuillet_code,
        plateau: catalogZone.plateau,
        titre: catalogZone.titre,
        coutGemme: catalogZone.cout_gemme,
        gainCoeur: catalogZone.gain_coeur,
        actorType,
        actorId: req.glAuth.userId,
        gameRow: game,
      },
    );

    if (result.error) {
      return res.status(result.error.status).json({ error: result.error.message });
    }

    // Événement inséré par presentFeuilletZone : émis par insertId (plus de
    // re-SELECT « dernier de la partie », sensible à la concurrence).
    if (result.presentEvent) emitGlGameEvent(gameId, result.presentEvent);

    return res.json({
      zone: {
        zoneId: result.zoneId,
        feuilletCode: result.feuilletCode,
        titre: result.titre,
        popover: catalogZone.popover,
        coutGemme: result.coutGemme,
        gainCoeur: result.gainCoeur,
        plateau: catalogZone.plateau,
      },
      teamId,
      vitality: result.vitality,
    });
  }),
);

module.exports = router;
