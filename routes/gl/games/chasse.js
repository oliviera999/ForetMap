'use strict';

/**
 * « Tenir à deux » v2 — la chasse : `GET /games/:id/chasse` (carnet de la classe, empreintes,
 * voile, oiseau ; lisible en projection), `POST /chasse/fouiller`, `POST /chasse/repondre`,
 * `POST /chasse/pages/:zoneKey/ouvrir`, `POST /chasse/pages/:zoneKey/tenir`,
 * `GET /chasse/carnet`. Préfixe réel `/api/gl/games/:id/…` (monté par routes/gl/games.js).
 *
 * Les polygones ne sortent que vers le prof ; une mauvaise réponse ne retire rien.
 */

const express = require('express');
const db = require('../../../database');
const { withTransaction } = db;
const {
  requireGlAuth,
  requireGlAuthOrProjection,
  isMj,
} = require('../../../middleware/requireGlAuth');
const { canAccessGlGame } = require('../../../lib/glGameAccess');
const { parseId, normalizeOptionalString } = require('../../../lib/shared/httpHelpers');
const asyncHandler = require('../../../lib/asyncHandler');
const { getPlayerGameMembership } = require('../../../lib/gl/gamesRuntime');
const { viewerFromAuth } = require('../../../lib/glTenirView');
const chasse = require('../../../lib/glChasse');
const tour = require('../../../lib/glTour');
const { requireTenirGame } = require('./tenir');
const { resolveGesteContext, sendTourError, emitAll } = require('./tenir-tour');
const { resolveTenirSettings, resolveSurface, isPlayerEnRetrait } = require('../../../lib/glTenir');
const { resolveTenirPermissions } = require('../../../lib/shared/glTenirPermissionsCore');
const { queueGlRewardsForTeam, queueGlRewards } = require('../../../lib/glRewardsHooks');

const router = express.Router();

const CHASSE_ERRORS = {
  POINT_INVALIDE: 'Point de fouille invalide (x, y entre 0 et 1)',
  FOUILLES_EPUISEES: 'Plus de fouille pour ce tour',
  CHASSE_SANS_QUESTION: 'Aucune question disponible pour cette zone',
  JETON_HORS_CHASSE: 'Ce jeton n’est pas une question de chasse',
  JETON_HORS_LECTURE: 'Ce jeton n’est pas une question de lecture',
  JETON_AUTRE_EQUIPE: 'Ce jeton appartient à une autre équipe',
  JETON_AUTRE_PAGE: 'Le jeton ne porte pas cette page',
  TENIR_LIRE_SURFACE: 'Sur cette surface, le prof lit pour l’équipe',
  TENIR_RETRAIT: 'En retrait jusqu’à nouvel ordre',
  ZONE_INTROUVABLE: 'Page introuvable',
  PAGE_PAS_TROUVEE: 'Cette page dort encore',
  MEME_PEUPLE: 'Une page se tient par une équipe de l’autre peuple',
  VEILLEE_LIMITE: 'Limite de pages tenues en veillée atteinte cette semaine',
  TEAM_NOT_FOUND: 'Équipe introuvable dans cette partie',
};

function sendChasseError(res, err) {
  const message = CHASSE_ERRORS[err?.message];
  if (message && err.status) {
    return res.status(err.status).json({
      error: message,
      code: err.message,
      ...(err.fouilles ? { fouilles: err.fouilles, sousVoile: !!err.sousVoile } : {}),
      ...(err.limite != null ? { limite: err.limite } : {}),
    });
  }
  // Erreurs de présentation QCM (`lib/qcmChoices.js` : `statusCode` 400, `expose`).
  if (err?.expose && Number(err.statusCode) === 400) {
    return res.status(400).json({ error: err.message });
  }
  return sendTourError(res, err);
}

/**
 * Acteur d'une lecture (tour ou veillée) : joueur → son équipe ; MJ → `teamId`. Les permissions
 * de surface sont rejouées ici (`lire`) : en `tableau`, seul le prof lit pour l'équipe ; un
 * élève en retrait lit et tient (C6) ; la partie doit être en cours. Le client ne fait que griser.
 */
async function resolveLectureContext(req, res, gameId, teamIdFromBody) {
  const ctx = await requireTenirGame(req, res, gameId);
  if (!ctx) return null;
  const { game, settings } = ctx;
  // Veillée comprise : une partie en pause entre deux séances se lit ; brouillon et close non.
  if (!['live', 'paused'].includes(String(game.status))) {
    res.status(409).json({ error: 'La partie n’est pas en cours' });
    return null;
  }
  const actorKind = isMj(req) ? 'mj' : 'player';
  let teamId = teamIdFromBody != null ? parseId(teamIdFromBody) : null;
  let playerId = null;
  let enRetrait = false;
  if (actorKind === 'player') {
    const membership = await getPlayerGameMembership(gameId, req.glAuth.userId);
    if (!membership?.team_id) {
      res.status(403).json({ error: 'Joueur non rattaché à une équipe' });
      return null;
    }
    teamId = Number(membership.team_id);
    playerId = Number(req.glAuth.userId);
    enRetrait = await isPlayerEnRetrait(db, gameId, playerId);
  } else if (teamId == null) {
    res.status(400).json({ error: 'teamId requis pour le MJ' });
    return null;
  }
  const team = await db.queryOne('SELECT id FROM gl_teams WHERE id = ? AND game_id = ? LIMIT 1', [
    teamId,
    gameId,
  ]);
  if (!team) {
    res.status(404).json({ error: 'Équipe introuvable dans cette partie' });
    return null;
  }
  const roundNumber = Number(game.current_round_number) || 0;
  const round = roundNumber ? await tour.loadRoundView(db, gameId, roundNumber) : null;
  const via = round && round.phase === 'jeu' ? 'tour' : 'veillee';
  if (actorKind === 'player') {
    // Choix C6 (simulation du 7 novembre 2026) : un élève en retrait peut ouvrir et tenir une
    // page et reçoit les gains d'équipe, comme un absent ; il ne voit toujours pas le Marché et
    // ne verse pas au pot (`listPresentMembers`, permissions `marche`).
    const resolved = resolveTenirSettings(settings, game);
    const perms = resolveTenirPermissions({
      surface: resolveSurface(game, settings),
      phase: round ? round.phase : null,
      actorKind,
      isMember: true,
      isActiveTeam: round?.equipeActiveId != null && Number(round.equipeActiveId) === teamId,
      enRetrait,
      settings: resolved,
    });
    if (!perms.lire) {
      res.status(403).json({ error: CHASSE_ERRORS.TENIR_LIRE_SURFACE, code: 'TENIR_LIRE_SURFACE' });
      return null;
    }
  }
  return {
    game,
    settings,
    teamId,
    playerId,
    roundNumber,
    via,
    actorType: actorKind === 'mj' ? 'mj' : 'team',
    actorId: String(req.glAuth.userId),
  };
}

async function loadCarnet(req, res, gameId) {
  if (!(await canAccessGlGame(req.glAuth, gameId))) {
    res.status(403).json({ error: 'Accès partie refusé' });
    return null;
  }
  const ctx = await requireTenirGame(req, res, gameId);
  if (!ctx) return null;
  const viewer = viewerFromAuth(req.glAuth);
  let viewerTeamId = null;
  if (viewer.kind === 'player') {
    const membership = await getPlayerGameMembership(gameId, viewer.playerId);
    viewerTeamId = membership?.team_id != null ? Number(membership.team_id) : null;
  }
  const carnet = await chasse.buildCarnetClasse(db, {
    game: ctx.game,
    settings: ctx.settings,
    viewerTeamId,
    includeGeometry: viewer.kind === 'mj',
  });
  let fouilles = null;
  if (viewerTeamId != null) {
    const team = await db.queryOne(
      'SELECT id, type, position_marker_id FROM gl_teams WHERE id = ? LIMIT 1',
      [viewerTeamId],
    );
    if (team) {
      const { resolveTenirSettings } = require('../../../lib/glTenir');
      const resolved = resolveTenirSettings(ctx.settings, ctx.game);
      const sousVoile = await chasse.isSousVoile(db, gameId, team);
      fouilles = {
        ...(await chasse.fouillesRestantes(db, {
          gameId,
          roundNumber: Number(ctx.game.current_round_number) || 0,
          team,
          resolved,
          sousVoile,
        })),
        sousVoile,
      };
    }
  }
  return { ...carnet, viewerTeamId, fouilles };
}

router.get(
  '/games/:id/chasse',
  requireGlAuthOrProjection,
  asyncHandler(async (req, res) => {
    const gameId = parseId(req.params.id);
    if (!gameId) return res.status(400).json({ error: 'Identifiant de partie invalide' });
    const carnet = await loadCarnet(req, res, gameId);
    if (!carnet) return undefined;
    return res.json(carnet);
  }),
);

router.get(
  '/games/:id/chasse/carnet',
  requireGlAuthOrProjection,
  asyncHandler(async (req, res) => {
    const gameId = parseId(req.params.id);
    if (!gameId) return res.status(400).json({ error: 'Identifiant de partie invalide' });
    const carnet = await loadCarnet(req, res, gameId);
    if (!carnet) return undefined;
    return res.json({
      pages: carnet.pages,
      total: carnet.total,
      tenues: carnet.tenues,
      trouvees: carnet.trouvees,
      carnetCompletAt: carnet.carnetCompletAt,
    });
  }),
);

router.post(
  '/games/:id/chasse/fouiller',
  requireGlAuth,
  asyncHandler(async (req, res) => {
    const gameId = parseId(req.params.id);
    if (!gameId) return res.status(400).json({ error: 'Identifiant de partie invalide' });
    if (!(await canAccessGlGame(req.glAuth, gameId))) {
      return res.status(403).json({ error: 'Accès partie refusé' });
    }
    const ctx = await resolveGesteContext(req, res, gameId, {
      geste: 'fouiller',
      teamIdFromBody: req.body?.teamId,
    });
    if (!ctx) return undefined;
    let result;
    try {
      result = await withTransaction((tx) =>
        chasse.fouillerTx(tx, {
          gameId,
          teamId: ctx.teamId,
          playerId: ctx.actorKind === 'player' ? Number(req.glAuth.userId) : null,
          x: req.body?.x,
          y: req.body?.y,
          roundNumber: ctx.roundNumber,
          settings: ctx.settings,
          actorType: ctx.actorType,
          actorId: ctx.actorId,
        }),
      );
    } catch (err) {
      return sendChasseError(res, err);
    }
    emitAll(gameId, result.events);
    // Badges (hors transaction, jamais bloquant) : membres présents de l'équipe.
    queueGlRewardsForTeam(gameId, ctx.teamId, {
      roundNumber: ctx.roundNumber,
      families: ['chasse'],
      source: { type: 'fouille', ref: String(gameId) },
    });
    const { events, ...rest } = result; // eslint-disable-line no-unused-vars
    return res.status(201).json(rest);
  }),
);

router.post(
  '/games/:id/chasse/repondre',
  requireGlAuth,
  asyncHandler(async (req, res) => {
    const gameId = parseId(req.params.id);
    if (!gameId) return res.status(400).json({ error: 'Identifiant de partie invalide' });
    if (!(await canAccessGlGame(req.glAuth, gameId))) {
      return res.status(403).json({ error: 'Accès partie refusé' });
    }
    const presentationToken = normalizeOptionalString(req.body?.presentationToken);
    const questionCode = normalizeOptionalString(req.body?.questionCode);
    if (!presentationToken || !questionCode || req.body?.choiceId == null) {
      return res.status(400).json({ error: 'presentationToken, questionCode et choiceId requis' });
    }
    const ctx = await resolveGesteContext(req, res, gameId, {
      geste: 'fouiller',
      teamIdFromBody: req.body?.teamId,
    });
    if (!ctx) return undefined;
    let result;
    try {
      result = await withTransaction((tx) =>
        chasse.repondreChasseTx(tx, {
          gameId,
          teamId: ctx.teamId,
          roundNumber: ctx.roundNumber,
          presentationToken,
          questionCode,
          choiceId: req.body.choiceId,
          settings: ctx.settings,
          actorType: ctx.actorType,
          actorId: ctx.actorId,
        }),
      );
    } catch (err) {
      return sendChasseError(res, err);
    }
    emitAll(gameId, result.events);
    if (result.correct) {
      queueGlRewardsForTeam(gameId, ctx.teamId, {
        roundNumber: ctx.roundNumber,
        families: ['chasse', 'cooperation', 'perseverance'],
        source: { type: 'page_trouvee', ref: result.zoneKey || String(gameId) },
      });
    }
    const { events, ...rest } = result; // eslint-disable-line no-unused-vars
    return res.json(rest);
  }),
);

router.post(
  '/games/:id/chasse/pages/:zoneKey/ouvrir',
  requireGlAuth,
  asyncHandler(async (req, res) => {
    const gameId = parseId(req.params.id);
    const zoneKey = normalizeOptionalString(req.params.zoneKey);
    if (!gameId || !zoneKey) return res.status(400).json({ error: 'Paramètres invalides' });
    if (!(await canAccessGlGame(req.glAuth, gameId))) {
      return res.status(403).json({ error: 'Accès partie refusé' });
    }
    const ctx = await resolveLectureContext(req, res, gameId, req.body?.teamId);
    if (!ctx) return undefined;
    let result;
    try {
      result = await withTransaction((tx) =>
        chasse.ouvrirPageTx(tx, {
          gameId,
          teamId: ctx.teamId,
          playerId: ctx.playerId,
          zoneKey,
          via: ctx.via,
          roundNumber: ctx.roundNumber,
          settings: ctx.settings,
          actorType: ctx.actorType,
          actorId: ctx.actorId,
        }),
      );
    } catch (err) {
      return sendChasseError(res, err);
    }
    emitAll(gameId, result.events);
    // Lecture : le lecteur lui-même (veillée ou tour).
    if (ctx.playerId != null) {
      queueGlRewards([ctx.playerId], {
        families: ['lecture'],
        source: { type: 'page_lue', ref: zoneKey },
        reason: 'page_lue',
      });
    }
    const { events, ...rest } = result; // eslint-disable-line no-unused-vars
    return res.json({ ...rest, via: ctx.via });
  }),
);

router.post(
  '/games/:id/chasse/pages/:zoneKey/tenir',
  requireGlAuth,
  asyncHandler(async (req, res) => {
    const gameId = parseId(req.params.id);
    const zoneKey = normalizeOptionalString(req.params.zoneKey);
    if (!gameId || !zoneKey) return res.status(400).json({ error: 'Paramètres invalides' });
    if (!(await canAccessGlGame(req.glAuth, gameId))) {
      return res.status(403).json({ error: 'Accès partie refusé' });
    }
    const presentationToken = normalizeOptionalString(req.body?.presentationToken);
    const questionCode = normalizeOptionalString(req.body?.questionCode);
    if (!presentationToken || !questionCode || req.body?.choiceId == null) {
      return res.status(400).json({ error: 'presentationToken, questionCode et choiceId requis' });
    }
    const ctx = await resolveLectureContext(req, res, gameId, req.body?.teamId);
    if (!ctx) return undefined;
    let result;
    try {
      result = await withTransaction((tx) =>
        chasse.tenirPageTx(tx, {
          gameId,
          teamId: ctx.teamId,
          playerId: ctx.playerId,
          roundNumber: ctx.roundNumber,
          presentationToken,
          questionCode,
          choiceId: req.body.choiceId,
          via: ctx.via,
          settings: ctx.settings,
          actorType: ctx.actorType,
          actorId: ctx.actorId,
          expectedZoneKey: zoneKey,
        }),
      );
    } catch (err) {
      return sendChasseError(res, err);
    }
    emitAll(gameId, result.events);
    if (result.correct) {
      const options = {
        families: ['lecture', 'perseverance', 'veillee'],
        source: { type: 'page_tenue', ref: zoneKey },
      };
      if (ctx.via === 'veillee' && ctx.playerId != null) {
        queueGlRewards([ctx.playerId], { ...options, reason: 'page_tenue_veillee' });
      } else {
        queueGlRewardsForTeam(gameId, ctx.teamId, { roundNumber: ctx.roundNumber, ...options });
      }
    }
    const { events, ...rest } = result; // eslint-disable-line no-unused-vars
    return res.json({ ...rest, via: ctx.via });
  }),
);

module.exports = router;
