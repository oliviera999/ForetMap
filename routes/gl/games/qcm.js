const express = require('express');
const { queryAll, queryOne, withTransaction } = require('../../../database');
const { requireGlAuth, hasGlPermission } = require('../../../middleware/requireGlAuth');
const { normalizeEventRow } = require('../../../lib/glGameEvents');
const { emitGlGameEvent } = require('../../../lib/realtime');
const { getGameplaySettings } = require('../../../lib/glSettings');
const { verifyPresentationAnswer, resolveQcmAnswerFeedback } = require('../../../lib/glQcmChoices');
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
const { loadAnyActiveQuestion, isLoreQuestionCode } = require('../../../lib/glQcmResolve');
const { canAccessGlGame } = require('../../../lib/glGameAccess');

const router = express.Router();

function parseId(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

async function getPlayerGameMembership(gameId, playerId) {
  return queryOne(
    `SELECT team_id
       FROM gl_team_members
      WHERE game_id = ?
        AND player_id = ?
      LIMIT 1`,
    [gameId, playerId],
  );
}

const QCM_ANSWER_STAFF_PERMISSIONS = ['gl.event.emit', 'gl.game.manage', 'gl.mascot.position'];

function staffCanAnswerQcmForTeam(auth) {
  if (!auth || auth.userType === 'gl_player') return false;
  return QCM_ANSWER_STAFF_PERMISSIONS.some((key) => hasGlPermission(auth, key));
}

/** Contexte équipe / acteur pour POST /games/:id/qcm/answer (joueur ou MJ sur une équipe). */
async function resolveQcmAnswerContext(req, gameId) {
  const allowed = await canAccessGlGame(req.glAuth, gameId);
  if (!allowed) {
    return { ok: false, status: 403, error: 'Accès partie refusé' };
  }

  if (req.glAuth.userType === 'gl_player') {
    if (!hasGlPermission(req.glAuth, 'gl.action.request')) {
      return { ok: false, status: 403, error: 'Permission insuffisante' };
    }
    const player = await queryOne('SELECT id FROM gl_players WHERE id = ? LIMIT 1', [
      req.glAuth.userId,
    ]);
    if (!player) {
      return { ok: false, status: 403, error: 'Aucune équipe associée à ce joueur' };
    }
    const membership = await getPlayerGameMembership(gameId, player.id);
    if (!membership?.team_id) {
      return { ok: false, status: 403, error: 'Joueur non rattaché à cette partie' };
    }
    return {
      ok: true,
      teamId: Number(membership.team_id),
      actorType: 'team',
      actorId: String(player.id),
    };
  }

  if (!staffCanAnswerQcmForTeam(req.glAuth)) {
    return { ok: false, status: 403, error: 'Permission insuffisante' };
  }

  const teamId = req.body?.teamId != null ? parseId(req.body.teamId) : null;
  if (teamId == null) {
    return { ok: false, status: 400, error: 'teamId requis pour valider une réponse (mode MJ)' };
  }
  const team = await queryOne('SELECT id FROM gl_teams WHERE id = ? AND game_id = ? LIMIT 1', [
    teamId,
    gameId,
  ]);
  if (!team) {
    return { ok: false, status: 404, error: 'Équipe introuvable dans cette partie' };
  }
  return {
    ok: true,
    teamId,
    actorType: 'mj',
    actorId: String(req.glAuth.userId),
  };
}

router.post('/games/:id/qcm/answer', requireGlAuth, async (req, res) => {
  const gameId = parseId(req.params.id);
  if (!gameId) return res.status(400).json({ error: 'Identifiant de partie invalide' });

  const answerCtx = await resolveQcmAnswerContext(req, gameId);
  if (!answerCtx.ok) {
    return res.status(answerCtx.status).json({ error: answerCtx.error });
  }
  const teamIdForGame = answerCtx.teamId;

  const questionCode = String(req.body?.questionCode || '')
    .trim()
    .toUpperCase();
  if (!questionCode) return res.status(400).json({ error: 'questionCode requis' });

  const settings = await getGameplaySettings();

  if (settings.qcmMjOnly && req.glAuth.userType === 'gl_player') {
    return res.status(403).json({ error: 'QCM réservé au maître du jeu' });
  }

  if (settings.turnsEnabled) {
    const gameTurn = await queryOne('SELECT current_team_id FROM gl_games WHERE id = ? LIMIT 1', [
      gameId,
    ]);
    if (
      gameTurn?.current_team_id != null &&
      Number(gameTurn.current_team_id) !== Number(teamIdForGame)
    ) {
      return res.status(409).json({ error: 'Ce n’est pas le tour de votre équipe' });
    }
  }

  const questionRow = await loadAnyActiveQuestion({ queryOne }, questionCode);
  if (!questionRow) return res.status(404).json({ error: 'Question introuvable' });

  let verification;
  try {
    verification = verifyPresentationAnswer(
      req.body?.presentationToken,
      questionCode,
      req.body?.choiceId,
    );
  } catch (err) {
    return res.status(400).json({ error: err.message || 'Réponse invalide' });
  }

  let scoreDelta = 0;
  const markerIdRaw = req.body?.markerId;
  const markerId = markerIdRaw == null ? null : Number(markerIdRaw);

  await withTransaction(async (tx) => {
    await tx.execute(
      `INSERT INTO gl_game_events (game_id, team_id, actor_type, actor_id, event_type, payload_json, created_at)
       VALUES (?, ?, ?, ?, 'qcm_answer', ?, NOW())`,
      [
        gameId,
        teamIdForGame,
        answerCtx.actorType,
        answerCtx.actorId,
        JSON.stringify({
          questionCode,
          correct: verification.correct,
          choiceId: verification.selectedChoiceId,
          markerId: Number.isFinite(markerId) ? markerId : null,
        }),
      ],
    );
    if (verification.correct && settings.scoringEnabled) {
      scoreDelta = 1;
      await tx.execute(
        `INSERT INTO gl_team_scores (game_id, team_id, score, last_reason, updated_at)
         VALUES (?, ?, ?, ?, NOW())
         ON DUPLICATE KEY UPDATE
           score = score + VALUES(score),
           last_reason = VALUES(last_reason),
           updated_at = NOW()`,
        [gameId, teamIdForGame, scoreDelta, 'Bonne réponse QCM'],
      );
      await tx.execute(
        `INSERT INTO gl_game_events (game_id, team_id, actor_type, actor_id, event_type, payload_json, created_at)
         VALUES (?, ?, ?, ?, 'score', ?, NOW())`,
        [
          gameId,
          teamIdForGame,
          answerCtx.actorType,
          answerCtx.actorId,
          JSON.stringify({ delta: scoreDelta, reason: 'Bonne réponse QCM', questionCode }),
        ],
      );
    }
  });

  const isLore = isLoreQuestionCode(questionCode);
  const glossaryRows = await queryAll(
    isLore
      ? `SELECT lore_code, terme, variantes, categorie, definition_courte, niveau
           FROM gl_lore_glossary_terms WHERE statut = 'actif'`
      : `SELECT glossary_code, terme, variantes, categorie, definition_courte
           FROM gl_glossary_terms WHERE statut = 'actif'`,
  );
  const glossaryTerms = verification.correct
    ? isLore
      ? matchLoreGlossaryTermsForText(
          combineLoreKeywords(questionRow),
          buildLoreGlossaryLookupMap(glossaryRows),
        )
      : matchGlossaryTermsForSpecies(
          combineKeywords(questionRow),
          buildGlossaryLookupMap(glossaryRows),
        )
    : [];

  const evt = await queryOne(
    `SELECT id, game_id, team_id, actor_type, actor_id, event_type, payload_json, created_at
       FROM gl_game_events WHERE game_id = ? ORDER BY id DESC LIMIT 1`,
    [gameId],
  );
  if (evt) emitGlGameEvent(gameId, normalizeEventRow(evt));

  return res.json({
    correct: verification.correct,
    feedback: resolveQcmAnswerFeedback(questionRow, verification),
    scoreDelta,
    qcmSet: isLore ? 'lore' : 'biome',
    glossaryTerms: !isLore && verification.correct ? glossaryTerms : undefined,
    loreGlossaryTerms: isLore && verification.correct ? glossaryTerms : undefined,
  });
});

module.exports = router;
