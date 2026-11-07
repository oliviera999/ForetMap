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
  requireGlAuth,
  requireGlAuthOrProjection,
  requireGlPermission,
  isMj,
} = require('../../../middleware/requireGlAuth');
const { canAccessGlGame } = require('../../../lib/glGameAccess');
const { getGameplaySettings } = require('../../../lib/glSettings');
const { emitGlGameEvent } = require('../../../lib/realtime');
const { parseId, normalizeOptionalString } = require('../../../lib/shared/httpHelpers');
const asyncHandler = require('../../../lib/asyncHandler');
const { getPlayerGameMembership } = require('../../../lib/gl/gamesRuntime');
const {
  resolveTenirSettings,
  resolveSurface,
  resolveDesMode,
  isPlayerEnRetrait,
} = require('../../../lib/glTenir');
const tour = require('../../../lib/glTour');
const { issueProjectionToken, revokeProjectionToken } = require('../../../lib/glProjection');
const { requireTenirGame } = require('./tenir');
const { DICE_SIDES } = require('../../../lib/glDiceRoll');
const glRandom = require('../../../lib/glRandom');

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
  LUMIERE_DISABLED: 'La Lumière est désactivée pour cette partie',
  PALIER_NON_ATTEINT: 'Palier non atteint',
  PALIER_DEJA_CHOISI: 'Ce palier a déjà son choix',
  CHOIX_INVALIDE: 'Choix invalide (voile, sort)',
  PAS_D_ERREUR: 'Aucune erreur du jour sur ce tour',
  DEJA_CORRIGE: 'Déjà corrigé',
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
  const actorKind = isMj(req) ? 'mj' : 'player';
  let teamId = teamIdFromBody != null ? parseId(teamIdFromBody) : null;
  let enRetrait = false;
  if (actorKind === 'player') {
    const membership = await getPlayerGameMembership(gameId, req.glAuth.userId);
    if (!membership?.team_id) {
      res.status(403).json({ error: 'Joueur non rattaché à une équipe' });
      return null;
    }
    teamId = Number(membership.team_id);
    enRetrait = await isPlayerEnRetrait(db, gameId, Number(req.glAuth.userId));
  } else if (teamId == null) {
    res.status(400).json({ error: 'teamId requis pour le MJ' });
    return null;
  }
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
    actorType: actorKind === 'mj' ? 'mj' : 'team',
    actorId: String(req.glAuth.userId),
  };
}

// ---------------------------------------------------------------------
// Lecture du tour
// ---------------------------------------------------------------------

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
    const { teamPathIndex } = require('../../../lib/shared/glBoardPathCore');
    const staff = isMj(req);
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
          }
        : null,
      teams: teams.map((t) => ({
        id: Number(t.id),
        name: t.name,
        type: t.type,
        pathIndex: teamPathIndex(t, markers),
        auCamp: tour.isAtCamp(t, markers),
        hasRolledDiceThisRound:
          roundNumber > 0 && Number(t.last_dice_round_number || 0) >= roundNumber,
      })),
      campIndex: markers.length ? markers.length - 1 : 0,
      lumiere: await tour.loadLumiere(db, gameId),
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
        result = await tour.equipeSuivanteTx(tx, { gameId, actorId: req.glAuth.userId });
      });
      emitGlGameEvent(gameId, result.event);
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
  requireGlAuth,
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
    const desCount = Number(resolved.des_count) || 2;
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
          return res.status(400).json({ error: `Faces attendues : ${desCount} valeurs de 1 à 6` });
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
      lumiere: await tour.loadLumiere(db, gameId),
    });
  }),
);

router.post(
  '/games/:id/tenir/lumiere/choix',
  requireGlPermission('gl.game.manage'),
  asyncHandler(async (req, res) => {
    const gameId = parseId(req.params.id);
    const ctx = await requireTenirGame(req, res, gameId);
    if (!ctx) return undefined;
    try {
      let result;
      await withTransaction(async (tx) => {
        result = await tour.lumiereChoixTx(tx, {
          gameId,
          palier: req.body?.palier,
          choix: String(req.body?.choix || ''),
          libelle: normalizeOptionalString(req.body?.libelle),
          actorId: req.glAuth.userId,
          settings: ctx.settings,
        });
      });
      emitAll(gameId, result.events);
      return res.json({ ok: true, total: result.total, paliers: result.paliers });
    } catch (err) {
      return sendTourError(res, err);
    }
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
      return res.json({ ok: true });
    } catch (err) {
      return sendTourError(res, err);
    }
  }),
);

/** « On passe » : une péripétie se ferme sans rien perdre. */
router.post(
  '/games/:id/tenir/peripetie/passer',
  requireGlAuth,
  asyncHandler(async (req, res) => {
    const gameId = parseId(req.params.id);
    if (!gameId) return res.status(400).json({ error: 'Identifiant de partie invalide' });
    if (!(await canAccessGlGame(req.glAuth, gameId)))
      return res.status(403).json({ error: 'Accès partie refusé' });
    const ctx = await requireTenirGame(req, res, gameId);
    if (!ctx) return undefined;
    let teamId = null;
    if (isMj(req)) {
      if (req.body?.teamId != null) {
        teamId = parseId(req.body.teamId);
        const team = teamId
          ? await queryOne('SELECT id FROM gl_teams WHERE id = ? AND game_id = ? LIMIT 1', [
              teamId,
              gameId,
            ])
          : null;
        if (!team) return res.status(404).json({ error: 'Équipe introuvable dans cette partie' });
      }
    } else {
      const membership = await getPlayerGameMembership(gameId, req.glAuth.userId);
      if (!membership?.team_id)
        return res.status(403).json({ error: 'Joueur non rattaché à une équipe' });
      teamId = Number(membership.team_id);
    }
    const evt = await require('../../../lib/glGameEvents').insertGameEvent(db, {
      gameId,
      teamId,
      actorType: isMj(req) ? 'mj' : 'team',
      actorId: String(req.glAuth.userId),
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
