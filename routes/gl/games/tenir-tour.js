'use strict';

/**
 * « Tenir à deux » v2 — tour à phases, dés, Team Spirit, Lumière, projection.
 * Préfixe réel : `/api/gl/games/:id/tenir/*` (monté par routes/gl/games.js).
 * Chaque action : `insertGameEvent` + `emitGlGameEvent` ; le client recharge (`reloadGame`).
 */

const express = require('express');
const db = require('../../../database');
const { queryAll, queryOne, withTransaction } = db;
const {
  requireGlAuthOrTeam,
  requireGlAuthOrProjection,
  requireGlPermission,
  isMj,
} = require('../../../middleware/requireGlAuth');
const { resolveGesteActorOrRespond, actorOf } = require('../../../lib/glActeur');
const presences = require('../../../lib/glPresences');
const { canAccessGlGame } = require('../../../lib/glGameAccess');
const { getGameplaySettings } = require('../../../lib/glSettings');
const { emitGlGameEvent } = require('../../../lib/realtime');
const { parseId, normalizeOptionalString } = require('../../../lib/shared/httpHelpers');
const asyncHandler = require('../../../lib/asyncHandler');
const { resolveTenirSettings, resolveSurface, resolveDesMode } = require('../../../lib/glTenir');
const tour = require('../../../lib/glTour');
const roundPhases = require('../../../lib/glRoundPhases');
const glSablier = require('../../../lib/glSablier');
const { issueProjectionToken, revokeProjectionToken } = require('../../../lib/glProjection');
const { requireTenirGame } = require('./tenir');
const { DICE_SIDES } = require('../../../lib/glDiceRoll');
const glRandom = require('../../../lib/glRandom');
const { awardGlManualToTeam } = require('../../../lib/glRewardsHooks');

const router = express.Router();

const ERROR_MESSAGES = {
  GAME_NOT_LIVE: 'La partie doit être en cours',
  TOUR_PRECEDENT_OUVERT: 'Le tour précédent n’est pas clos',
  NO_TEAMS: 'Aucune équipe sur cette partie',
  NO_PATH: 'Le chapitre n’a pas de chemin numéroté',
  AUCUN_TOUR: 'Aucun tour ouvert',
  PHASE_INVALIDE: 'Phase invalide (jeu, souffle, clos)',
  PHASE_ORDRE: 'Les phases se suivent : ouverture → jeu → souffle → clos',
  FACE_INVALIDE: 'Face de dé invalide (1 à 6)',
  TENIR_PHASE: 'Ce geste n’est possible qu’en phase « jeu »',
  TENIR_EQUIPE_INACTIVE: 'Ce n’est pas le tour de cette équipe',
  TENIR_PERMISSION: 'Ce geste est réservé au prof sur cette surface',
  DICE_ALREADY_ROLLED: 'Dés déjà lancés pour ce tour',
  TOUTES_AU_CAMP: 'Toutes les équipes sont au camp',
  TEAM_NOT_FOUND: 'Équipe introuvable dans cette partie',
  SAISIE_NOT_FOUND: 'Saisie introuvable',
  SAISIE_NOT_PENDING: 'Cette saisie n’est plus en attente',
  CARTES_INVALIDES: 'Cartes gardées : entier de 0 à 6',
  SABLIER_INVALIDE:
    'Réglage de sablier invalide (durée de 10 secondes à 60 minutes, action pause, reprise ou zero)',
  PAS_D_ERREUR: 'Aucune erreur du jour sur ce tour',
  DEJA_CORRIGE: 'Déjà corrigé',
  PRESENCE_PHASE: 'Les présences se confirment au début du tour',
  PRESENCE_ABSENT_INVALIDE: 'Cette personne ne fait pas partie de l’équipe',
  PRESENCE_PAS_ABSENT: 'Cette personne est déjà comptée présente',
};

function sendTourError(res, err) {
  const message = ERROR_MESSAGES[err?.message];
  if (message && err.status)
    return res.status(err.status).json({ error: message, code: err.message });
  throw err;
}

function emitAll(gameId, events) {
  for (const evt of events || []) if (evt) emitGlGameEvent(gameId, evt);
}

/** Contexte d'un geste d'équipe : équipe visée, acteur, permissions rejouées côté serveur. */
async function resolveGesteContext(req, res, gameId, { geste, teamIdFromBody = null }) {
  const ctx = await requireTenirGame(req, res, gameId);
  if (!ctx) return null;
  const { game, settings } = ctx;
  const resolved = resolveTenirSettings(settings, game);
  const surface = resolveSurface(game, settings);
  const roundNumber = Number(game.current_round_number) || 0;
  const round = roundNumber ? await tour.loadRoundView(db, gameId, roundNumber) : null;
  // Acteur unique (prof, élève connecté ou tablette d'équipe) : `lib/glActeur.js`.
  const acteur = await resolveGesteActorOrRespond(req, res, gameId, { teamIdFromBody });
  if (!acteur) return null;
  const { actorKind, teamId, enRetrait } = acteur;
  const team = await queryOne(
    'SELECT id, type, name FROM gl_teams WHERE id = ? AND game_id = ? LIMIT 1',
    [teamId, gameId],
  );
  if (!team) {
    res.status(404).json({ error: 'Équipe introuvable dans cette partie' });
    return null;
  }
  try {
    tour.assertActionOuverte({
      round,
      surface,
      teamId,
      actorKind,
      geste,
      fouilleFenetreOuverte: round
        ? tour.isFouilleFenetreOuverte(
            round.effets.map((e) => ({ ...e })),
            teamId,
          )
        : false,
      enRetrait,
      resolved,
    });
  } catch (err) {
    sendTourError(res, err);
    return null;
  }
  return {
    game,
    settings,
    resolved,
    surface,
    round,
    roundNumber,
    teamId,
    team,
    actorKind,
    // Élève connecté : son identifiant (mesures « par l'élève ») ; tablette d'équipe : aucun.
    playerId: acteur.playerId,
    acteur,
    actorType: acteur.actorType,
    actorId: acteur.actorId,
  };
}

// ---------------------------------------------------------------------
// Lecture du tour
// ---------------------------------------------------------------------

/** Fouilles du tour d'une équipe (console du prof) : tolère l'absence du module de chasse. */
async function fouillesDuTour(gameId, team, roundNumber, resolved) {
  try {
    const chasse = require('../../../lib/glChasse');
    const sousVoile = await chasse.isSousVoile(db, gameId, team);
    return {
      ...(await chasse.fouillesRestantes(db, { gameId, roundNumber, team, resolved, sousVoile })),
      sousVoile,
    };
  } catch (_) {
    return null;
  }
}

/** Équipe de celui qui lit : la sienne pour un élève, celle de la session pour une tablette. */
async function equipeDuSpectateur(req, gameId) {
  const actor = actorOf(req);
  if (actor.kind === 'team') return Number(actor.teamId);
  if (actor.kind !== 'player') return null;
  const row = await queryOne(
    'SELECT team_id FROM gl_team_members WHERE game_id = ? AND player_id = ? LIMIT 1',
    [gameId, actor.playerId],
  );
  return row?.team_id != null ? Number(row.team_id) : null;
}

router.get(
  '/games/:id/tenir/tour',
  requireGlAuthOrProjection,
  asyncHandler(async (req, res) => {
    const gameId = parseId(req.params.id);
    if (!gameId) return res.status(400).json({ error: 'Identifiant de partie invalide' });
    if (!(await canAccessGlGame(req.glAuth, gameId)))
      return res.status(403).json({ error: 'Accès partie refusé' });
    const game = await tour.loadGameRow(db, gameId);
    if (!game) return res.status(404).json({ error: 'Partie introuvable' });
    const settings = await getGameplaySettings();
    const resolved = resolveTenirSettings(settings, game);
    const roundNumber = Number(game.current_round_number) || 0;
    const round = roundNumber ? await tour.loadRoundView(db, gameId, roundNumber) : null;
    const teams = await tour.loadTeams(db, gameId);
    const markers = await tour.loadPathMarkers(db, game.chapter_id);
    const {
      teamPathIndex,
      targetMarkerAfterPathSteps,
      resolveBoardPathStartIndex,
    } = require('../../../lib/shared/glBoardPathCore');
    const { markerTonalite } = require('../../../lib/glMarkerVitalityEffects');
    const startIndex = resolveBoardPathStartIndex(game);
    // Les six cases à venir (lot 2) : affichées gratuitement avant le jet — l'information que
    // donnait la Boussole. Donnée publique : le plateau est sous les yeux de tous.
    const casesAVenir = (team) => {
      const out = [];
      for (let i = 1; i <= 6; i += 1) {
        const cible = targetMarkerAfterPathSteps(markers, team, i, startIndex);
        if (!cible?.marker) break;
        out.push({
          index: cible.index,
          label: cible.marker.label || null,
          eventType: cible.marker.event_type,
          tonalite: markerTonalite(cible.marker) || null,
        });
        if (cible.index >= markers.length - 1) break;
      }
      return out;
    };
    const staff = isMj(req);
    // Chronométrage (migration 346) : durées par phase du tour courant, pour le prof seulement.
    let durees = null;
    if (staff && round) {
      const { loadRoundPhases, dureesParTour, formatDureesTour } = roundPhases;
      const [mesure] = dureesParTour(await loadRoundPhases(db, gameId, roundNumber));
      if (mesure) durees = { phases: mesure.phases, libelle: formatDureesTour(mesure.phases) };
    }
    const view = {
      gameId,
      roundNumber,
      surface: resolveSurface(game, settings),
      desMode: resolveDesMode({ ...resolved, surface: resolveSurface(game, settings) }),
      round: round
        ? {
            ...round,
            operateurs: staff ? round.operateurs : null,
            absences: staff ? round.absences : round.absences.length,
            ...(staff ? { durees } : {}),
          }
        : null,
      teams: await Promise.all(
        teams.map(async (t) => ({
          id: Number(t.id),
          name: t.name,
          type: t.type,
          pathIndex: teamPathIndex(t, markers),
          auCamp: tour.isAtCamp(t, markers),
          casesAVenir: casesAVenir(t),
          hasRolledDiceThisRound:
            roundNumber > 0 && Number(t.last_dice_round_number || 0) >= roundNumber,
          // Console du tour (prof) : quota de fouilles du tour, réparation E2 comprise.
          ...(staff && roundNumber > 0
            ? { fouilles: await fouillesDuTour(gameId, t, roundNumber, resolved) }
            : {}),
          // M3 : « Au prochain tour : un seul dé » (case Souffle), visible de tous ; `desProchainJet`
          // dit combien de dés l'équipe lance (ou saisit) à son prochain lancer.
          unDe: Number(t.un_de_prochain_tour) === 1,
          desProchainJet:
            roundNumber > 0
              ? await tour.desPourJet(db, {
                  gameId,
                  teamId: t.id,
                  roundNumber,
                  desCount: resolved.des_count,
                })
              : Number(resolved.des_count) || 2,
        })),
      ),
      campIndex: markers.length ? markers.length - 1 : 0,
      lumiere: await tour.loadLumiere(db, gameId, resolved),
      // File unique du prof (lot 2) : le compteur reste visible depuis tout l'écran du tour.
      ...(staff
        ? {
            demandesEnAttente: await require('../../../lib/glDemandes').compterDemandesEnAttente(
              db,
              gameId,
            ),
            // « Tout au tableau » : surface à retrouver quand le prof rend la main.
            surfaceAvantTableau: resolved.overrides?.surface_avant_tableau || null,
          }
        : {}),
      // Présences (lot 2) : confirmée ou non pour chaque équipe (public) ; les absents, pour le
      // prof et pour les membres (ou la tablette) de l'équipe concernée seulement.
      presences: await presences.buildPresencesView(db, {
        gameId,
        roundNumber,
        surface: resolveSurface(game, settings),
        phase: round?.phase || null,
        viewerTeamId: await equipeDuSpectateur(req, gameId),
        staff,
      }),
      // Sabliers : même vue pour le prof, les élèves et la projection (aucun élément privé).
      sablier: glSablier.buildSablierView({
        resolved,
        surface: resolveSurface(game, settings),
        round,
      }),
    };
    return res.json(view);
  }),
);

// ---------------------------------------------------------------------
// Prof : ouverture, phases, équipe suivante, absences, opérateurs, fenêtre de fouille
// ---------------------------------------------------------------------

router.post(
  '/games/:id/tenir/tour/ouvrir',
  requireGlPermission('gl.game.manage'),
  asyncHandler(async (req, res) => {
    const gameId = parseId(req.params.id);
    const ctx = await requireTenirGame(req, res, gameId);
    if (!ctx) return undefined;
    try {
      let result;
      await withTransaction(async (tx) => {
        result = await tour.ouvrirTourTx(tx, {
          gameId,
          actorId: req.glAuth.userId,
          settings: ctx.settings,
        });
      });
      emitAll(gameId, result.events);
      return res.json({
        ok: true,
        roundNumber: result.roundNumber,
        ordre: result.ordre,
        equipeActiveId: result.equipeActiveId,
        ventTeamId: result.ventTeamId,
        surface: result.surface,
      });
    } catch (err) {
      return sendTourError(res, err);
    }
  }),
);

router.post(
  '/games/:id/tenir/tour/phase',
  requireGlPermission('gl.game.manage'),
  asyncHandler(async (req, res) => {
    const gameId = parseId(req.params.id);
    const ctx = await requireTenirGame(req, res, gameId);
    if (!ctx) return undefined;
    const phase = String(req.body?.phase || '')
      .trim()
      .toLowerCase();
    const faces = Array.isArray(req.body?.faces) ? req.body.faces.map(Number) : null;
    try {
      let result;
      await withTransaction(async (tx) => {
        result = await tour.changerPhaseTx(tx, {
          gameId,
          phase,
          actorId: req.glAuth.userId,
          settings: ctx.settings,
          faces,
          dort: req.body?.dort === true,
        });
      });
      emitAll(gameId, result.events);
      return res.json({
        ok: true,
        roundNumber: result.roundNumber,
        phase: result.phase,
        souffle: result.souffle,
        passeur: result.passeur,
      });
    } catch (err) {
      return sendTourError(res, err);
    }
  }),
);

/**
 * Sabliers réglables d'un clic (prof) : `{ actif?, secondes?, phaseSecondes?, phaseAuto?,
 * action? }`. Les réglages sont enregistrés pour la partie ; `action` (`pause`, `reprise`,
 * `zero`) agit sur le sablier de phase du tour en cours.
 */
router.put(
  '/games/:id/tenir/sablier',
  requireGlPermission('gl.game.manage'),
  asyncHandler(async (req, res) => {
    const gameId = parseId(req.params.id);
    const ctx = await requireTenirGame(req, res, gameId);
    if (!ctx) return undefined;
    try {
      let result;
      await withTransaction(async (tx) => {
        result = await glSablier.reglerSablierTx(tx, {
          gameId,
          actorId: req.glAuth.userId,
          settings: ctx.settings,
          body: req.body || {},
        });
      });
      emitAll(gameId, [result.event]);
      return res.json({ ok: true, sablier: result.sablier });
    } catch (err) {
      return sendTourError(res, err);
    }
  }),
);

router.post(
  '/games/:id/tenir/tour/equipe-suivante',
  requireGlPermission('gl.game.manage'),
  asyncHandler(async (req, res) => {
    const gameId = parseId(req.params.id);
    const ctx = await requireTenirGame(req, res, gameId);
    if (!ctx) return undefined;
    try {
      let result;
      await withTransaction(async (tx) => {
        result = await tour.equipeSuivanteTx(tx, {
          gameId,
          actorId: req.glAuth.userId,
          settings: ctx.settings,
        });
      });
      emitAll(gameId, result.events);
      return res.json({ ok: true, equipeActiveId: result.equipeActiveId });
    } catch (err) {
      return sendTourError(res, err);
    }
  }),
);

router.post(
  '/games/:id/tenir/tour/absences',
  requireGlPermission('gl.game.manage'),
  asyncHandler(async (req, res) => {
    const gameId = parseId(req.params.id);
    const ctx = await requireTenirGame(req, res, gameId);
    if (!ctx) return undefined;
    const roundNumber = Number(ctx.game.current_round_number) || 0;
    if (!roundNumber) return res.status(409).json({ error: ERROR_MESSAGES.AUCUN_TOUR });
    let result;
    await withTransaction(async (tx) => {
      result = await tour.setAbsencesTx(tx, {
        gameId,
        roundNumber,
        playerIds: req.body?.playerIds,
        actorId: req.glAuth.userId,
      });
    });
    emitGlGameEvent(gameId, {
      ...result.event,
      payload: { roundNumber, count: result.playerIds.length, redacted: true },
    });
    return res.json({ ok: true, playerIds: result.playerIds });
  }),
);

router.put(
  '/games/:id/tenir/tour/operateurs',
  requireGlPermission('gl.game.manage'),
  asyncHandler(async (req, res) => {
    const gameId = parseId(req.params.id);
    const ctx = await requireTenirGame(req, res, gameId);
    if (!ctx) return undefined;
    const roundNumber = Number(ctx.game.current_round_number) || 0;
    const teamId = parseId(req.body?.teamId);
    if (!roundNumber || !teamId)
      return res.status(400).json({ error: 'teamId requis et tour ouvert' });
    try {
      let result;
      await withTransaction(async (tx) => {
        result = await tour.setOperateurTx(tx, {
          gameId,
          roundNumber,
          teamId,
          playerId: req.body?.playerId == null ? null : parseId(req.body.playerId),
          role: normalizeOptionalString(req.body?.role) || 'operateur',
        });
      });
      return res.json({ ok: true, operateurs: result });
    } catch (err) {
      return sendTourError(res, err);
    }
  }),
);

router.post(
  '/games/:id/tenir/tour/fouille-fenetre',
  requireGlPermission('gl.game.manage'),
  asyncHandler(async (req, res) => {
    const gameId = parseId(req.params.id);
    const ctx = await requireTenirGame(req, res, gameId);
    if (!ctx) return undefined;
    const roundNumber = Number(ctx.game.current_round_number) || 0;
    if (!roundNumber) return res.status(409).json({ error: ERROR_MESSAGES.AUCUN_TOUR });
    const teamId = req.body?.teamId == null ? null : parseId(req.body.teamId);
    let evt;
    await withTransaction(async (tx) => {
      evt = await tour.setFouilleFenetreTx(tx, {
        gameId,
        roundNumber,
        teamId,
        ouverte: req.body?.ouverte === true,
        actorId: req.glAuth.userId,
      });
    });
    emitGlGameEvent(gameId, evt);
    return res.json({ ok: true, teamId, ouverte: req.body?.ouverte === true });
  }),
);

// ---------------------------------------------------------------------
// Écran d'équipe (lot 2) : sorts rangés par moment du tour
// ---------------------------------------------------------------------

/**
 * GET /tenir/sorts?teamId= — sorts de l'équipe rangés par moment (« Avant de lancer », « Après
 * le jet », « Pendant le tour », « Plus tard »). Un sort hors fenêtre reste servi, `ouvert:
 * false`, avec son message. Élève : son équipe ; tablette : la sienne ; prof : `teamId`.
 */
router.get(
  '/games/:id/tenir/sorts',
  requireGlAuthOrTeam,
  asyncHandler(async (req, res) => {
    const gameId = parseId(req.params.id);
    if (!gameId) return res.status(400).json({ error: 'Identifiant de partie invalide' });
    if (!(await canAccessGlGame(req.glAuth, gameId)))
      return res.status(403).json({ error: 'Accès partie refusé' });
    const ctx = await requireTenirGame(req, res, gameId);
    if (!ctx) return undefined;
    const teamId = isMj(req) ? parseId(req.query?.teamId) : await equipeDuSpectateur(req, gameId);
    if (!teamId) return res.status(400).json({ error: 'teamId requis' });
    try {
      return res.json(
        await require('../../../lib/glSpellCast').buildSortsParMoment({ gameId, teamId }),
      );
    } catch (err) {
      if (err?.status === 404)
        return res.status(404).json({ error: ERROR_MESSAGES.TEAM_NOT_FOUND });
      throw err;
    }
  }),
);

// ---------------------------------------------------------------------
// File unique du prof et « Tout au tableau » (lot 2)
// ---------------------------------------------------------------------

/** GET /tenir/demandes — file unique du prof, la plus ancienne en haut. */
router.get(
  '/games/:id/tenir/demandes',
  requireGlPermission('gl.game.manage'),
  asyncHandler(async (req, res) => {
    const gameId = parseId(req.params.id);
    const ctx = await requireTenirGame(req, res, gameId);
    if (!ctx) return undefined;
    const demandes = await require('../../../lib/glDemandes').buildFileDuProf(db, gameId);
    return res.json({ demandes, total: demandes.length });
  }),
);

/**
 * POST /tenir/surface { tableau: true|false } — « Tout au tableau » : le prof reprend tous les
 * gestes en pleine séance (surcharge `surface` = `tableau`), puis rend la main (`false`). Les
 * jets en suspens s'appliquent ; les tablettes d'équipe restent connectées, soumises aux droits
 * de la nouvelle surface.
 */
router.post(
  '/games/:id/tenir/surface',
  requireGlPermission('gl.game.manage'),
  asyncHandler(async (req, res) => {
    const gameId = parseId(req.params.id);
    const ctx = await requireTenirGame(req, res, gameId);
    if (!ctx) return undefined;
    const versTableau = req.body?.tableau !== false;
    const { parseOverrides } = require('../../../lib/glTenir');
    const actuelle = resolveSurface(ctx.game, ctx.settings);
    const overrides = { ...parseOverrides(ctx.game.tenir_overrides_json) };
    let surface;
    if (versTableau) {
      if (actuelle === 'tableau') {
        return res
          .status(409)
          .json({ error: 'La partie se joue déjà au tableau', code: 'SURFACE_DEJA' });
      }
      overrides.surface_avant_tableau = actuelle;
      overrides.surface = 'tableau';
      surface = 'tableau';
    } else {
      if (!overrides.surface_avant_tableau) {
        return res.status(409).json({
          error: 'Rien à rendre : la partie n’a pas été passée au tableau',
          code: 'SURFACE_DEJA',
        });
      }
      surface = overrides.surface_avant_tableau;
      overrides.surface = surface;
      delete overrides.surface_avant_tableau;
    }
    const events = [];
    await withTransaction(async (tx) => {
      await tx.execute(
        'UPDATE gl_games SET tenir_overrides_json = ?, tenir_surface = ?, updated_at = NOW() WHERE id = ?',
        [JSON.stringify(overrides), surface, gameId],
      );
      // Les jets en suspens s'appliquent : au tableau, le prof repart d'un plateau net.
      const confirmees = await require('../../../lib/glArriveeSuspendue').confirmerArriveesTx(tx, {
        gameId,
        settings: ctx.settings,
        actorType: 'mj',
        actorId: String(req.glAuth.userId),
        motif: 'surface',
      });
      events.push(...confirmees.events);
      events.push(
        await require('../../../lib/glGameEvents').insertGameEvent(tx, {
          gameId,
          actorType: 'mj',
          actorId: String(req.glAuth.userId),
          eventType: 'surface_changee',
          payload: { surface, from: actuelle },
        }),
      );
    });
    emitAll(gameId, events);
    return res.json({ ok: true, surface, from: actuelle, retourPossible: versTableau });
  }),
);

// ---------------------------------------------------------------------
// Présences (lot 2) : « Il manque quelqu'un ? », « Quelqu'un vient d'arriver »
// ---------------------------------------------------------------------

/** Contexte d'un geste de présence : partie « Tenir », tour ouvert, acteur et son équipe. */
async function resolvePresenceContext(req, res, gameId) {
  if (!(await canAccessGlGame(req.glAuth, gameId))) {
    res.status(403).json({ error: 'Accès partie refusé' });
    return null;
  }
  const ctx = await requireTenirGame(req, res, gameId);
  if (!ctx) return null;
  const roundNumber = Number(ctx.game.current_round_number) || 0;
  if (!roundNumber) {
    res.status(409).json({ error: ERROR_MESSAGES.AUCUN_TOUR, code: 'AUCUN_TOUR' });
    return null;
  }
  const acteur = await resolveGesteActorOrRespond(req, res, gameId, {
    teamIdFromBody: req.body?.teamId,
  });
  if (!acteur) return null;
  const team = await queryOne('SELECT id FROM gl_teams WHERE id = ? AND game_id = ? LIMIT 1', [
    acteur.teamId,
    gameId,
  ]);
  if (!team) {
    res.status(404).json({ error: ERROR_MESSAGES.TEAM_NOT_FOUND });
    return null;
  }
  const round = await queryOne(
    'SELECT phase FROM gl_game_rounds WHERE game_id = ? AND round_number = ? LIMIT 1',
    [gameId, roundNumber],
  );
  return { ...ctx, roundNumber, acteur, phase: round?.phase || null };
}

/**
 * POST /tenir/presences { teamId?, absents: [playerId] } — l'équipe (élève connecté, tablette
 * d'équipe) ou le prof dit qui manque ; la présence de l'équipe est confirmée pour le tour.
 */
router.post(
  '/games/:id/tenir/presences',
  requireGlAuthOrTeam,
  asyncHandler(async (req, res) => {
    const gameId = parseId(req.params.id);
    if (!gameId) return res.status(400).json({ error: 'Identifiant de partie invalide' });
    const ctx = await resolvePresenceContext(req, res, gameId);
    if (!ctx) return undefined;
    try {
      let result;
      await withTransaction(async (tx) => {
        result = await presences.confirmerPresenceTx(tx, {
          gameId,
          roundNumber: ctx.roundNumber,
          teamId: ctx.acteur.teamId,
          absentPlayerIds: Array.isArray(req.body?.absents) ? req.body.absents : [],
          actorType: ctx.acteur.actorType,
          actorId: ctx.acteur.actorId,
          phase: ctx.phase,
        });
      });
      emitAll(gameId, result.events);
      return res.json({ ok: true, teamId: result.teamId, absents: result.absents });
    } catch (err) {
      return sendTourError(res, err);
    }
  }),
);

/** POST /tenir/presences/arrivee { teamId?, playerId } — un retardataire rejoint le tour. */
router.post(
  '/games/:id/tenir/presences/arrivee',
  requireGlAuthOrTeam,
  asyncHandler(async (req, res) => {
    const gameId = parseId(req.params.id);
    const playerId = parseId(req.body?.playerId);
    if (!gameId || !playerId) return res.status(400).json({ error: 'playerId requis' });
    const ctx = await resolvePresenceContext(req, res, gameId);
    if (!ctx) return undefined;
    try {
      let result;
      await withTransaction(async (tx) => {
        result = await presences.arriveeRetardataireTx(tx, {
          gameId,
          roundNumber: ctx.roundNumber,
          teamId: ctx.acteur.teamId,
          playerId,
          actorType: ctx.acteur.actorType,
          actorId: ctx.acteur.actorId,
        });
      });
      emitAll(gameId, result.events);
      return res.json({ ok: true, teamId: result.teamId, playerId: result.playerId });
    } catch (err) {
      return sendTourError(res, err);
    }
  }),
);

// ---------------------------------------------------------------------
// Lancer : serveur | physique | libre (prof) ; saisies en attente
// ---------------------------------------------------------------------

function parseFaces(raw, count) {
  if (!Array.isArray(raw) || raw.length !== count) return null;
  const faces = raw.map(Number);
  if (faces.some((f) => !Number.isInteger(f) || f < 1 || f > DICE_SIDES)) return null;
  return faces;
}

/**
 * POST /tenir/lancer { teamId?, mode?, faces?, cases?, motif? } — le geste Lancer de la mouture :
 * tirage serveur, faces physiques saisies (validation prof sur tablette), ou avance libre (prof).
 */
router.post(
  '/games/:id/tenir/lancer',
  requireGlAuthOrTeam,
  asyncHandler(async (req, res) => {
    const gameId = parseId(req.params.id);
    if (!gameId) return res.status(400).json({ error: 'Identifiant de partie invalide' });
    if (!(await canAccessGlGame(req.glAuth, gameId)))
      return res.status(403).json({ error: 'Accès partie refusé' });
    const wantedMode = String(req.body?.mode || '')
      .trim()
      .toLowerCase();
    if (wantedMode === 'libre' && !isMj(req))
      return res.status(403).json({ error: 'Avance libre réservée au prof' });
    const ctx = await resolveGesteContext(req, res, gameId, {
      geste: 'lancer',
      teamIdFromBody: req.body?.teamId,
    });
    if (!ctx) return undefined;
    if (String(ctx.game.status) !== 'live')
      return res.status(409).json({ error: ERROR_MESSAGES.GAME_NOT_LIVE });
    if (!ctx.roundNumber) return res.status(409).json({ error: ERROR_MESSAGES.AUCUN_TOUR });
    const resolved = { ...ctx.resolved, surface: ctx.surface };
    // M3 : un seul dé au premier lancer qui suit une case Souffle (ou à la Relance de ce dé).
    const desCount =
      wantedMode === 'libre'
        ? Number(resolved.des_count) || 2
        : await tour.desPourJet(db, {
            gameId,
            teamId: ctx.teamId,
            roundNumber: ctx.roundNumber,
            desCount: resolved.des_count,
          });
    const configuredMode = resolveDesMode(resolved);
    // Un élève ne transforme pas un tirage `serveur` en faces choisies : des dés « physiques »
    // hors du mode de la surface ne passent que par la file de validation du prof (tablette,
    // `des_physiques_validation` ≠ auto). Le prof, lui, saisit ou avance comme il l'entend.
    const validationProf =
      ctx.surface === 'tablette' && resolved.des_physiques_validation !== 'auto';
    const horsMode = wantedMode && wantedMode !== configuredMode && !isMj(req);
    if (horsMode && !(wantedMode === 'physique' && validationProf)) {
      return res.status(403).json({
        error: 'Mode de dés non autorisé sur cette surface',
        code: 'TENIR_DES_MODE',
      });
    }
    const mode = wantedMode || configuredMode;
    try {
      let result;
      if (mode === 'libre') {
        const cases = Number(req.body?.cases);
        const motif = normalizeOptionalString(req.body?.motif);
        if (!Number.isInteger(cases) || cases < 1 || cases > 12)
          return res.status(400).json({ error: 'Avance libre : 1 à 12 cases' });
        if (!motif || motif.length < 3)
          return res.status(400).json({ error: 'Motif obligatoire (3 caractères au moins)' });
        await withTransaction(async (tx) => {
          result = await tour.appliquerJetTx(tx, {
            gameId,
            roundNumber: ctx.roundNumber,
            teamId: ctx.teamId,
            mode: 'libre',
            faces: [],
            total: cases,
            motif,
            actorType: 'mj',
            actorId: ctx.actorId,
            settings: ctx.settings,
          });
        });
      } else if (mode === 'physique') {
        const faces = parseFaces(req.body?.faces, desCount);
        if (!faces)
          return res.status(400).json({
            error: `Faces attendues : ${desCount} ${desCount > 1 ? 'valeurs' : 'valeur'} de 1 à 6`,
          });
        const attente = ctx.actorKind === 'player' && validationProf;
        if (attente) {
          await withTransaction(async (tx) => {
            result = await tour.creerSaisieTx(tx, {
              gameId,
              roundNumber: ctx.roundNumber,
              teamId: ctx.teamId,
              faces,
              actorId: ctx.actorId,
            });
          });
          emitGlGameEvent(gameId, result.event);
          return res.status(202).json({
            ok: true,
            enAttente: true,
            saisieId: result.saisieId,
            faces,
            total: result.total,
          });
        }
        await withTransaction(async (tx) => {
          result = await tour.appliquerJetTx(tx, {
            gameId,
            roundNumber: ctx.roundNumber,
            teamId: ctx.teamId,
            mode: 'physique',
            faces,
            total: faces.reduce((s, f) => s + f, 0),
            actorType: ctx.actorType,
            actorId: ctx.actorId,
            settings: ctx.settings,
          });
        });
      } else {
        const { rollServerDice } = require('../../../lib/glDiceRoll');
        const roll = rollServerDice(desCount, glRandom.forGame(gameId).randomInt);
        await withTransaction(async (tx) => {
          result = await tour.appliquerJetTx(tx, {
            gameId,
            roundNumber: ctx.roundNumber,
            teamId: ctx.teamId,
            mode: 'serveur',
            faces: roll.values,
            total: roll.total,
            actorType: ctx.actorType,
            actorId: ctx.actorId,
            settings: ctx.settings,
          });
        });
      }
      emitAll(gameId, result.events);
      return res.status(201).json({
        ok: true,
        mode,
        teamId: ctx.teamId,
        beneficiaryTeamId: result.beneficiaryTeamId,
        total: result.total,
        target: result.target,
        arrival: result.arrival,
      });
    } catch (err) {
      return sendTourError(res, err);
    }
  }),
);

/**
 * POST /tenir/arrivee/garder { teamId? } — l'équipe garde son jet : la case d'arrivée restée en
 * suspens (Relance encore possible) s'applique maintenant. Élève de l'équipe ou prof (`teamId`).
 */
router.post(
  '/games/:id/tenir/arrivee/garder',
  requireGlAuthOrTeam,
  asyncHandler(async (req, res) => {
    const gameId = parseId(req.params.id);
    if (!gameId) return res.status(400).json({ error: 'Identifiant de partie invalide' });
    if (!(await canAccessGlGame(req.glAuth, gameId)))
      return res.status(403).json({ error: 'Accès partie refusé' });
    const ctx = await requireTenirGame(req, res, gameId);
    if (!ctx) return undefined;
    const acteur = await resolveGesteActorOrRespond(req, res, gameId, {
      teamIdFromBody: req.body?.teamId,
    });
    if (!acteur) return undefined;
    const teamId = acteur.teamId;
    const { confirmerArriveesTx } = require('../../../lib/glArriveeSuspendue');
    let result;
    await withTransaction(async (tx) => {
      result = await confirmerArriveesTx(tx, {
        gameId,
        teamId,
        settings: ctx.settings,
        actorType: acteur.actorType,
        actorId: acteur.actorId,
        motif: 'garde',
      });
    });
    if (!result.arrivals.length && !result.events.length) {
      return res.status(409).json({
        error: 'Aucun jet en attente pour cette équipe',
        code: 'AUCUNE_ARRIVEE_EN_SUSPENS',
      });
    }
    emitAll(gameId, result.events);
    return res.json({ ok: true, arrival: result.arrivals[0]?.summary || null });
  }),
);

for (const decision of ['valider', 'refuser']) {
  router.post(
    `/games/:id/tenir/des/:saisieId/${decision}`,
    requireGlPermission('gl.game.manage'),
    asyncHandler(async (req, res) => {
      const gameId = parseId(req.params.id);
      const saisieId = parseId(req.params.saisieId);
      const ctx = await requireTenirGame(req, res, gameId);
      if (!ctx) return undefined;
      try {
        let result;
        await withTransaction(async (tx) => {
          result = await tour.validerSaisieTx(tx, {
            gameId,
            saisieId,
            actorId: req.glAuth.userId,
            settings: ctx.settings,
            decision,
          });
        });
        emitAll(gameId, result.events);
        return res.json({
          ok: true,
          decision,
          beneficiaryTeamId: result.beneficiaryTeamId ?? null,
          target: result.target ?? null,
          arrival: result.arrival ?? null,
        });
      } catch (err) {
        return sendTourError(res, err);
      }
    }),
  );
}

// ---------------------------------------------------------------------
// Team Spirit, Lumière, Olu, péripétie
// ---------------------------------------------------------------------

router.put(
  '/games/:id/tenir/tour/team-spirit',
  requireGlPermission('gl.game.manage'),
  asyncHandler(async (req, res) => {
    const gameId = parseId(req.params.id);
    const ctx = await requireTenirGame(req, res, gameId);
    if (!ctx) return undefined;
    const roundNumber = Number(req.body?.roundNumber) || Number(ctx.game.current_round_number) || 0;
    if (!roundNumber) return res.status(409).json({ error: ERROR_MESSAGES.AUCUN_TOUR });
    const bilans = Array.isArray(req.body?.bilans) ? req.body.bilans : [];
    if (!bilans.length) return res.status(400).json({ error: 'bilans[] requis' });
    try {
      let result;
      await withTransaction(async (tx) => {
        result = await tour.enregistrerTeamSpiritTx(tx, {
          gameId,
          roundNumber,
          bilans,
          actorId: req.glAuth.userId,
          settings: ctx.settings,
        });
      });
      emitAll(
        gameId,
        result.events.map((e) =>
          e.eventType === 'team_spirit'
            ? { ...e, payload: { roundNumber, bilans: result.bilans, redacted: true } }
            : e,
        ),
      );
      return res.json({ ok: true, roundNumber, bilans: result.bilans, lumiere: result.lumiere });
    } catch (err) {
      return sendTourError(res, err);
    }
  }),
);

router.get(
  '/games/:id/tenir/tour/team-spirit',
  requireGlPermission('gl.game.manage'),
  asyncHandler(async (req, res) => {
    const gameId = parseId(req.params.id);
    const ctx = await requireTenirGame(req, res, gameId);
    if (!ctx) return undefined;
    const rows = await queryAll(
      'SELECT round_number, team_id, cartes_gardees, cartes_json, note, saisi_at FROM gl_game_team_spirit WHERE game_id = ? ORDER BY round_number ASC, team_id ASC',
      [gameId],
    );
    return res.json({
      items: rows.map((r) => ({
        roundNumber: Number(r.round_number),
        teamId: Number(r.team_id),
        cartesGardees: Number(r.cartes_gardees),
        cartes: r.cartes_json ? JSON.parse(r.cartes_json) : null,
        note: r.note || null,
        saisiAt: r.saisi_at,
      })),
      // Réglages résolus de la partie : la jauge dit si elle est montrée (`active`).
      lumiere: await tour.loadLumiere(db, gameId, resolveTenirSettings(ctx.settings, ctx.game)),
    });
  }),
);

router.post(
  '/games/:id/tenir/tour/olu-corrige',
  requireGlPermission('gl.game.manage'),
  asyncHandler(async (req, res) => {
    const gameId = parseId(req.params.id);
    const teamId = parseId(req.body?.teamId);
    const ctx = await requireTenirGame(req, res, gameId);
    if (!ctx) return undefined;
    const roundNumber = Number(ctx.game.current_round_number) || 0;
    if (!roundNumber || !teamId)
      return res.status(400).json({ error: 'teamId requis et tour ouvert' });
    try {
      let result;
      await withTransaction(async (tx) => {
        result = await tour.oluCorrigeTx(tx, {
          gameId,
          roundNumber,
          teamId,
          actorId: req.glAuth.userId,
          settings: ctx.settings,
        });
      });
      emitAll(gameId, result.events);
      // Badge « Correcteur du renard » aux membres présents (hors transaction, jamais bloquant).
      awardGlManualToTeam(gameId, teamId, {
        type: 'renard',
        note: 'Ton équipe a corrigé Olu au bon moment.',
        awardedBy: String(req.glAuth.userId),
        roundNumber,
      });
      return res.json({ ok: true });
    } catch (err) {
      return sendTourError(res, err);
    }
  }),
);

/** « On passe » : une péripétie se ferme sans rien perdre. */
router.post(
  '/games/:id/tenir/peripetie/passer',
  requireGlAuthOrTeam,
  asyncHandler(async (req, res) => {
    const gameId = parseId(req.params.id);
    if (!gameId) return res.status(400).json({ error: 'Identifiant de partie invalide' });
    if (!(await canAccessGlGame(req.glAuth, gameId)))
      return res.status(403).json({ error: 'Accès partie refusé' });
    const ctx = await requireTenirGame(req, res, gameId);
    if (!ctx) return undefined;
    const acteur = await resolveGesteActorOrRespond(req, res, gameId, {
      teamIdFromBody: req.body?.teamId,
      teamRequired: false,
    });
    if (!acteur) return undefined;
    const teamId = acteur.teamId;
    if (acteur.kind === 'mj' && teamId != null) {
      const team = await queryOne('SELECT id FROM gl_teams WHERE id = ? AND game_id = ? LIMIT 1', [
        teamId,
        gameId,
      ]);
      if (!team) return res.status(404).json({ error: 'Équipe introuvable dans cette partie' });
    }
    const evt = await require('../../../lib/glGameEvents').insertGameEvent(db, {
      gameId,
      teamId,
      actorType: acteur.actorType,
      actorId: acteur.actorId,
      eventType: 'peripetie_passee',
      payload: { id: req.body?.id ? String(req.body.id) : null },
    });
    emitGlGameEvent(gameId, evt);
    return res.json({ ok: true });
  }),
);

// ---------------------------------------------------------------------
// Projection (vidéoprojecteur) — jeton 12 h, révocable
// ---------------------------------------------------------------------

router.post(
  '/games/:id/projection-token',
  requireGlPermission('gl.game.manage'),
  asyncHandler(async (req, res) => {
    const gameId = parseId(req.params.id);
    const game = await queryOne('SELECT id FROM gl_games WHERE id = ? LIMIT 1', [gameId]);
    if (!game) return res.status(404).json({ error: 'Partie introuvable' });
    if (req.body?.revoke === true) {
      await revokeProjectionToken(db, gameId);
      return res.json({ ok: true, revoked: true });
    }
    const { token, expiresIn } = await issueProjectionToken(db, {
      gameId,
      issuedBy: req.glAuth.userId,
    });
    const evt = await require('../../../lib/glGameEvents').insertGameEvent(db, {
      gameId,
      actorType: 'mj',
      actorId: String(req.glAuth.userId),
      eventType: 'projection',
      payload: { expiresIn },
    });
    emitGlGameEvent(gameId, evt);
    return res
      .status(201)
      .json({ ok: true, token, expiresIn, url: `gl.html?projection=${encodeURIComponent(token)}` });
  }),
);

module.exports = router;
module.exports.resolveGesteContext = resolveGesteContext;
module.exports.sendTourError = sendTourError;
module.exports.emitAll = emitAll;
module.exports.ERROR_MESSAGES = ERROR_MESSAGES;
