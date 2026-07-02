const express = require('express');
const db = require('../../../database');
const { queryAll, queryOne, execute, withTransaction } = db;
const { requireGlAuth, requireGlPermission } = require('../../../middleware/requireGlAuth');
const { insertGameEvent } = require('../../../lib/glGameEvents');
const { emitGlGameEvent } = require('../../../lib/realtime');
const { getGameplaySettings } = require('../../../lib/glSettings');
const { resolveVitalityError } = require('../../../lib/glVitality');
const { canAccessGlGame } = require('../../../lib/glGameAccess');
const { MARKER_SELECT, formatMarkerRow, isQuestionMarker } = require('../../../lib/glMarkerRow');
const {
  buildMarkerArrivalPayload,
  hasApplicableMarkerEffects,
} = require('../../../lib/glMarkerEffects');
const {
  applyMarkerVitalityEffects,
  buildMarkerEffectEventPayload,
  hasMarkerVitalityApplied,
} = require('../../../lib/glMarkerVitalityEffects');
const { applyMarkerEffectAutoMoveTx } = require('../../../lib/glMarkerEffectAutoMove');
const { resolveBoardMovementConfig } = require('../../../lib/shared/glBoardPathCore');
const { drawQuestionFromMarker } = require('../../../lib/glMarkerQuestionPool');
const { canPresentMarkerQuestion } = require('../../../lib/glMarkerQuestionRetrigger');
const { loadBiomesForChapterIds } = require('../../../lib/glChapterBiomes');
const { combineKeywords } = require('../../../lib/glQcmImport');
const { combineKeywords: combineLoreKeywords } = require('../../../lib/glQcmLoreImport');
const {
  buildGlossaryLookupMap,
  matchGlossaryTermsForSpecies,
} = require('../../../lib/glGlossaryMatch');
const {
  buildLoreGlossaryLookupMap,
  matchLoreGlossaryTermsForText,
} = require('../../../lib/glLoreGlossaryMatch');
const {
  loadAnyPresentableQuestion,
  buildAnyPresentation,
  isLoreQuestionCode,
} = require('../../../lib/glQcmResolve');
// O10 — helpers runtime à I/O (DB) partagés via lib/gl/gamesRuntime.js (déplacement pur),
// recopie locale de parseId pour éviter tout import circulaire vers gl/games.js.
const {
  getPlayerGameMembership,
  recordVitalityChangeEvent,
} = require('../../../lib/gl/gamesRuntime');

const router = express.Router();

function parseId(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

async function loadChapterPathMarkers(tx, chapterId) {
  return tx.queryAll(
    `SELECT id, x_pct, y_pct, order_index, label
       FROM gl_chapter_markers
      WHERE chapter_id = ?
      ORDER BY order_index ASC, id ASC`,
    [chapterId],
  );
}

function willAutoMoveMarkerEffect(game, settings, moveDelta) {
  const steps = Number(moveDelta);
  if (!settings?.markerEffectAutoMoveEnabled || !Number.isFinite(steps) || steps === 0) {
    return false;
  }
  return resolveBoardMovementConfig(game).isNumberedPath;
}

async function maybeApplyMarkerEffectAutoMove(
  tx,
  {
    gameId,
    teamId,
    team,
    game,
    chapterId,
    moveDelta,
    settings,
    actorType,
    actorId,
    originMarkerId,
  },
) {
  if (!moveDelta) return null;
  const gameRow =
    game?.board_movement_mode != null
      ? game
      : await tx.queryOne(
          `SELECT id, chapter_id, board_movement_mode, board_path_start_index
             FROM gl_games WHERE id = ? LIMIT 1`,
          [gameId],
        );
  const teamRow =
    team?.position_marker_id != null
      ? team
      : await tx.queryOne(
          `SELECT id, position_marker_id, position_x_pct, position_y_pct
             FROM gl_teams WHERE id = ? AND game_id = ? LIMIT 1`,
          [teamId, gameId],
        );
  const chapterMarkers = await loadChapterPathMarkers(tx, chapterId ?? gameRow?.chapter_id);
  return applyMarkerEffectAutoMoveTx(tx, {
    gameId,
    teamId,
    team: teamRow,
    game: gameRow,
    chapterMarkers,
    moveDelta,
    settings,
    actorType,
    actorId,
    originMarkerId,
    roundNumber: null,
  });
}

async function loadGlossaryLookup() {
  const rows = await queryAll(
    `SELECT glossary_code, terme, variantes, categorie, definition_courte
       FROM gl_glossary_terms WHERE statut = 'actif'`,
  );
  return buildGlossaryLookupMap(rows);
}

async function loadLoreGlossaryLookup() {
  const rows = await queryAll(
    `SELECT lore_code, terme, variantes, categorie, definition_courte, niveau
       FROM gl_lore_glossary_terms WHERE statut = 'actif'`,
  );
  return buildLoreGlossaryLookupMap(rows);
}

async function enrichQuestionWithGlossary(questionRow, glossaryByKey) {
  if (!questionRow) return [];
  if (isLoreQuestionCode(questionRow.question_code)) {
    const loreByKey = glossaryByKey.loreByKey || glossaryByKey;
    return matchLoreGlossaryTermsForText(combineLoreKeywords(questionRow), loreByKey);
  }
  return matchGlossaryTermsForSpecies(combineKeywords(questionRow), glossaryByKey);
}

/** POST /api/gl/games/:id/markers/:markerId/present-question — tirage + présentation QCM depuis un repère. */
router.post('/games/:id/markers/:markerId/present-question', requireGlAuth, async (req, res) => {
  const gameId = parseId(req.params.id);
  const markerId = parseId(req.params.markerId);
  if (!gameId || !markerId) {
    return res.status(400).json({ error: 'Identifiants invalides' });
  }

  const allowed = await canAccessGlGame(req.glAuth, gameId);
  if (!allowed) return res.status(403).json({ error: 'Accès partie refusé' });

  const game = await queryOne('SELECT id, chapter_id, status FROM gl_games WHERE id = ? LIMIT 1', [
    gameId,
  ]);
  if (!game) return res.status(404).json({ error: 'Partie introuvable' });

  const chapterRow = await queryOne(
    'SELECT id, plateau_number FROM gl_chapters WHERE id = ? LIMIT 1',
    [game.chapter_id],
  );
  const chapterPlateauNumber = chapterRow?.plateau_number ?? null;

  const markerRow = await queryOne(
    `SELECT ${MARKER_SELECT} FROM gl_chapter_markers WHERE id = ? LIMIT 1`,
    [markerId],
  );
  const marker = formatMarkerRow(markerRow);
  if (!marker || !isQuestionMarker(marker)) {
    return res.status(404).json({ error: 'Repère question introuvable' });
  }
  if (Number(marker.chapter_id) !== Number(game.chapter_id)) {
    return res.status(409).json({ error: 'Repère hors chapitre de la partie' });
  }

  const settings = await getGameplaySettings();
  if (settings.qcmMjOnly && req.glAuth.userType === 'gl_player') {
    return res.status(403).json({ error: 'QCM réservé au maître du jeu' });
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

  const team = await queryOne('SELECT id FROM gl_teams WHERE id = ? AND game_id = ? LIMIT 1', [
    teamId,
    gameId,
  ]);
  if (!team) return res.status(404).json({ error: 'Équipe introuvable dans cette partie' });
  const canPresent = await canPresentMarkerQuestion(
    { queryAll },
    {
      gameId,
      teamId,
      markerId,
      retriggerMode: settings.markerQuestionRetrigger,
    },
  );
  if (!canPresent) {
    return res
      .status(409)
      .json({ error: 'Question déjà présentée pour ce repère selon les réglages' });
  }

  const biomesMap = await loadBiomesForChapterIds({ queryAll }, [game.chapter_id]);
  const chapterBiomes = biomesMap.get(Number(game.chapter_id)) || [];
  const chapterBiomeSlugs = chapterBiomes.map((b) => b.slug);

  const excludeRaw = req.body?.excludeCodes;
  const excludeCodes = Array.isArray(excludeRaw)
    ? excludeRaw
    : typeof excludeRaw === 'string'
      ? excludeRaw.split(',')
      : [];

  const draw = await drawQuestionFromMarker(
    { queryAll, queryOne },
    markerRow,
    chapterBiomeSlugs,
    excludeCodes,
    chapterPlateauNumber,
  );
  if (draw.error || !draw.questionCode) {
    return res.status(404).json({ error: draw.error || 'Aucune question disponible' });
  }

  const questionRow = await loadAnyPresentableQuestion({ queryOne }, draw.questionCode);
  if (!questionRow) {
    return res
      .status(404)
      .json({ error: draw.error || `Question ${draw.questionCode} non présentable` });
  }

  const isLore = isLoreQuestionCode(draw.questionCode);
  const glossaryByKey = isLore ? await loadLoreGlossaryLookup() : await loadGlossaryLookup();
  const glossaryTerms = await enrichQuestionWithGlossary(questionRow, glossaryByKey);
  let presentation;
  try {
    presentation = buildAnyPresentation(questionRow, glossaryTerms);
  } catch (err) {
    return res.status(400).json({ error: err.message || 'Présentation impossible' });
  }

  const actorType = req.glAuth.userType === 'gl_admin' ? 'mj' : 'team';
  const presentedEvent = await insertGameEvent(db, {
    gameId,
    teamId,
    actorType,
    actorId: String(req.glAuth.userId),
    eventType: 'marker_question_presented',
    payload: {
      markerId,
      questionCode: draw.questionCode,
      qcmSet: draw.qcmSet || (isLore ? 'lore' : 'biome'),
      markerLabel: marker.label,
    },
  });
  emitGlGameEvent(gameId, presentedEvent);

  return res.json({
    questionCode: draw.questionCode,
    qcmSet: draw.qcmSet || (isLore ? 'lore' : 'biome'),
    presentation,
    markerId,
    teamId,
  });
});

/** POST /api/gl/games/:id/markers/:markerId/present-arrival — résumé d'arrivée sur repère (effets plateau). */
router.post('/games/:id/markers/:markerId/present-arrival', requireGlAuth, async (req, res) => {
  const gameId = parseId(req.params.id);
  const markerId = parseId(req.params.markerId);
  if (!gameId || !markerId) {
    return res.status(400).json({ error: 'Identifiants invalides' });
  }

  const allowed = await canAccessGlGame(req.glAuth, gameId);
  if (!allowed) return res.status(403).json({ error: 'Accès partie refusé' });

  const game = await queryOne(
    'SELECT id, chapter_id, status, board_movement_mode, board_path_start_index FROM gl_games WHERE id = ? LIMIT 1',
    [gameId],
  );
  if (!game) return res.status(404).json({ error: 'Partie introuvable' });

  const markerRow = await queryOne(
    `SELECT ${MARKER_SELECT} FROM gl_chapter_markers WHERE id = ? LIMIT 1`,
    [markerId],
  );
  const marker = formatMarkerRow(markerRow);
  if (!marker || Number(marker.chapter_id) !== Number(game.chapter_id)) {
    return res.status(404).json({ error: 'Repère introuvable' });
  }
  if (isQuestionMarker(marker)) {
    return res.status(409).json({ error: 'Repère question : utiliser present-question' });
  }
  if (!hasApplicableMarkerEffects(marker)) {
    return res.status(404).json({ error: 'Repère sans effet à présenter' });
  }

  const settings = await getGameplaySettings();
  if (settings.qcmMjOnly && req.glAuth.userType === 'gl_player') {
    return res.status(403).json({ error: 'Présentation réservée au maître du jeu' });
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

  const team = await queryOne(
    'SELECT id, type, name FROM gl_teams WHERE id = ? AND game_id = ? LIMIT 1',
    [teamId, gameId],
  );
  if (!team) return res.status(404).json({ error: 'Équipe introuvable dans cette partie' });

  const arrival = buildMarkerArrivalPayload(marker, team);
  const actorType = req.glAuth.userType === 'gl_admin' ? 'mj' : 'team';
  const actorId = String(req.glAuth.userId);
  const reason = String(marker.label || 'Repère').trim();

  const playerIdsRaw = req.body?.playerIds;
  const playerIds = Array.isArray(playerIdsRaw)
    ? playerIdsRaw
    : playerIdsRaw != null
      ? [playerIdsRaw]
      : null;

  let vitalityPayload = null;
  let autoMove = null;
  let lastEvent = null;
  try {
    await withTransaction(async (tx) => {
      vitalityPayload = await applyMarkerVitalityEffects(tx, {
        gameId,
        teamId,
        marker,
        teamType: team.type,
        settings,
        playerIds,
        skipIfAlreadyApplied: true,
      });

      if (vitalityPayload?.applied) {
        await recordVitalityChangeEvent(tx, {
          gameId,
          teamId,
          actorId,
          healthDelta: vitalityPayload.healthDelta,
          powerDelta: vitalityPayload.powerDelta,
          reason,
          results: vitalityPayload.vitalityResults,
        });
        lastEvent = await insertGameEvent(tx, {
          gameId,
          teamId,
          actorType,
          actorId,
          eventType: 'marker_effect',
          payload: buildMarkerEffectEventPayload({
            marker,
            resolved: vitalityPayload.resolvedEffect,
            healthDelta: vitalityPayload.healthDelta,
            powerDelta: vitalityPayload.powerDelta,
            moveDelta: vitalityPayload.moveDelta,
            passTurn: vitalityPayload.passTurn,
            reason,
            vitalityTarget: vitalityPayload.vitalityTarget,
            vitalityPlayerIds: vitalityPayload.vitalityPlayerIds,
            autoMoveApplied: willAutoMoveMarkerEffect(game, settings, vitalityPayload.moveDelta),
          }),
        });
      }

      lastEvent = await insertGameEvent(tx, {
        gameId,
        teamId,
        actorType,
        actorId,
        eventType: 'marker_arrival',
        payload: {
          markerId,
          markerLabel: marker.label,
          eventType: marker.event_type,
          effectSummary: arrival.effectSummary,
        },
      });

      autoMove = await maybeApplyMarkerEffectAutoMove(tx, {
        gameId,
        teamId,
        team,
        game,
        chapterId: game.chapter_id,
        moveDelta: vitalityPayload?.moveDelta,
        settings,
        actorType,
        actorId,
        originMarkerId: markerId,
      });
      if (autoMove?.moveEvent) lastEvent = autoMove.moveEvent;
    });
  } catch (err) {
    const mapped = resolveVitalityError(err);
    if (mapped) return res.status(mapped.status).json({ error: mapped.error });
    throw err;
  }

  // Dernier événement inséré par CETTE requête (insertId), plus de re-SELECT
  // « dernier de la partie », sensible à la concurrence.
  if (lastEvent) emitGlGameEvent(gameId, lastEvent);

  return res.json({
    ...arrival,
    teamId: Number(teamId),
    teamType: team.type,
    vitality: vitalityPayload
      ? {
          applied: vitalityPayload.applied === true,
          alreadyApplied: vitalityPayload.alreadyApplied === true,
          healthDelta: vitalityPayload.healthDelta,
          powerDelta: vitalityPayload.powerDelta,
          results: vitalityPayload.vitalityResults,
          target: vitalityPayload.vitalityTarget || 'team',
        }
      : null,
    autoMove: autoMove?.applied ? autoMove : null,
  });
});

/** POST /api/gl/games/:id/markers/:markerId/apply-effects — applique les effets vitalité du repère (MJ). */
router.post(
  '/games/:id/markers/:markerId/apply-effects',
  requireGlPermission('gl.event.emit'),
  async (req, res) => {
    const gameId = parseId(req.params.id);
    const markerId = parseId(req.params.markerId);
    const teamId = parseId(req.body?.teamId);
    if (!gameId || !markerId || !teamId) {
      return res.status(400).json({ error: 'gameId, markerId et teamId requis' });
    }

    const game = await queryOne(
      'SELECT id, chapter_id, board_movement_mode, board_path_start_index FROM gl_games WHERE id = ? LIMIT 1',
      [gameId],
    );
    if (!game) return res.status(404).json({ error: 'Partie introuvable' });

    const markerRow = await queryOne(
      `SELECT ${MARKER_SELECT} FROM gl_chapter_markers WHERE id = ? LIMIT 1`,
      [markerId],
    );
    const marker = formatMarkerRow(markerRow);
    if (!marker || Number(marker.chapter_id) !== Number(game.chapter_id)) {
      return res.status(404).json({ error: 'Repère introuvable' });
    }

    const team = await queryOne(
      'SELECT id, type, name FROM gl_teams WHERE id = ? AND game_id = ? LIMIT 1',
      [teamId, gameId],
    );
    if (!team) return res.status(404).json({ error: 'Équipe introuvable' });

    const settings = await getGameplaySettings();
    const reason = String(req.body?.reason || marker.label || 'Repère').trim();
    const actorId = String(req.glAuth.userId);

    const playerIdsRaw = req.body?.playerIds;
    const playerIds = Array.isArray(playerIdsRaw)
      ? playerIdsRaw
      : playerIdsRaw != null
        ? [playerIdsRaw]
        : null;

    const alreadyApplied = await hasMarkerVitalityApplied(
      { queryAll },
      { gameId, teamId, markerId },
    );
    if (alreadyApplied) {
      return res
        .status(409)
        .json({ error: 'Effets vitalité déjà appliqués pour ce repère et cette équipe' });
    }

    let vitalityPayload = null;
    let lastEvent = null;
    let autoMove = null;
    try {
      await withTransaction(async (tx) => {
        vitalityPayload = await applyMarkerVitalityEffects(tx, {
          gameId,
          teamId,
          marker,
          teamType: team.type,
          settings,
          playerIds,
          skipIfAlreadyApplied: false,
        });

        if (!vitalityPayload?.resolvedEffect) {
          const err = new Error('NO_MARKER_EFFECT');
          err.status = 409;
          throw err;
        }

        if (vitalityPayload.vitalityRequired && !vitalityPayload.applied) {
          const hasMove =
            Number.isFinite(Number(vitalityPayload.moveDelta)) &&
            Number(vitalityPayload.moveDelta) !== 0;
          if (!hasMove) {
            const err = new Error('NO_VITALITY_TO_APPLY');
            err.status = 409;
            throw err;
          }
        }

        if (vitalityPayload.applied) {
          await recordVitalityChangeEvent(tx, {
            gameId,
            teamId,
            actorId,
            healthDelta: vitalityPayload.healthDelta,
            powerDelta: vitalityPayload.powerDelta,
            reason,
            results: vitalityPayload.vitalityResults,
          });
        }

        lastEvent = await insertGameEvent(tx, {
          gameId,
          teamId,
          actorType: 'mj',
          actorId,
          eventType: 'marker_effect',
          payload: buildMarkerEffectEventPayload({
            marker,
            resolved: vitalityPayload.resolvedEffect,
            healthDelta: vitalityPayload.healthDelta,
            powerDelta: vitalityPayload.powerDelta,
            moveDelta: vitalityPayload.moveDelta,
            passTurn: vitalityPayload.passTurn,
            reason,
            vitalityTarget: vitalityPayload.vitalityTarget,
            vitalityPlayerIds: vitalityPayload.vitalityPlayerIds,
            autoMoveApplied: willAutoMoveMarkerEffect(game, settings, vitalityPayload.moveDelta),
          }),
        });

        autoMove = await maybeApplyMarkerEffectAutoMove(tx, {
          gameId,
          teamId,
          team,
          game,
          chapterId: game.chapter_id,
          moveDelta: vitalityPayload.moveDelta,
          settings,
          actorType: 'mj',
          actorId,
          originMarkerId: markerId,
        });
        if (autoMove?.moveEvent) lastEvent = autoMove.moveEvent;
      });
    } catch (err) {
      if (err?.message === 'NO_MARKER_EFFECT') {
        return res.status(409).json({ error: 'Aucun effet applicable sur ce repère' });
      }
      if (err?.message === 'NO_VITALITY_TO_APPLY') {
        return res
          .status(409)
          .json({ error: 'Aucun delta cœur ou gemme à appliquer sur ce repère' });
      }
      const mapped = resolveVitalityError(err);
      if (mapped) return res.status(mapped.status).json({ error: mapped.error });
      throw err;
    }

    if (lastEvent) emitGlGameEvent(gameId, lastEvent);

    return res.json({
      ok: true,
      markerId,
      teamId,
      resolvedEffect: vitalityPayload.resolvedEffect,
      moveDelta: vitalityPayload.moveDelta,
      passTurn: vitalityPayload.passTurn,
      vitalityResults: vitalityPayload.vitalityResults,
      vitalityRequired: vitalityPayload.vitalityRequired,
      vitalityTarget: vitalityPayload.vitalityTarget,
      autoMove: autoMove?.applied ? autoMove : null,
    });
  },
);

module.exports = router;
