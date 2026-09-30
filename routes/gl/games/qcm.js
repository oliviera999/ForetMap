const express = require('express');
const { queryAll, queryOne, execute, withTransaction } = require('../../../database');
const { requireGlAuth, hasGlPermission } = require('../../../middleware/requireGlAuth');
const { insertGameEvent } = require('../../../lib/glGameEvents');
const { emitGlGameEvent } = require('../../../lib/realtime');
const { getGameplaySettings } = require('../../../lib/glSettings');
const { verifyPresentationAnswer, resolveQcmAnswerFeedback } = require('../../../lib/qcmChoices');
const { consumePresentationJti } = require('../../../lib/qcmPresentationUse');
const { combineKeywords } = require('../../../lib/glQcmImport');
const { combineKeywords: combineLoreKeywords } = require('../../../lib/glQcmLoreImport');
const {
  buildGlossaryLookupMap,
  matchGlossaryTermsForSpecies,
} = require('../../../lib/glossaryMatch');
const {
  buildLoreGlossaryLookupMap,
  matchLoreGlossaryTermsForText,
} = require('../../../lib/glLoreGlossaryMatch');
const { loadAnyActiveQuestion, isLoreQuestionCode } = require('../../../lib/glQcmResolve');
const { canAccessGlGame } = require('../../../lib/glGameAccess');
const { recordGlQcmAttemptForReader } = require('../../../lib/learningGatingRuntime');
const { parseId } = require('../../../lib/shared/httpHelpers');
const {
  QCM_SCORE_REASON,
  resolveGameQcmScoreEligibility,
} = require('../../../lib/glGameQcmScoring');
const { sendSafeError } = require('../../../lib/safeErrorResponse');

const router = express.Router();

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

  // GL2 : on ne marque de points que dans une partie EN COURS (plus en brouillon, en pause
  // ni terminée).
  const game = await queryOne('SELECT id, status FROM gl_games WHERE id = ? LIMIT 1', [gameId]);
  if (!game) return res.status(404).json({ error: 'Partie introuvable' });
  if (String(game.status || '').toLowerCase() !== 'live') {
    return res.status(409).json({ error: 'La partie doit être en cours' });
  }

  // Mode classique : toutes les équipes jouent simultanément, plus de blocage « pas votre tour ».

  const questionRow = await loadAnyActiveQuestion({ queryOne }, questionCode);
  if (!questionRow) return res.status(404).json({ error: 'Question introuvable' });

  const isLore = isLoreQuestionCode(questionCode);

  let verification;
  try {
    verification = verifyPresentationAnswer(
      req.body?.presentationToken,
      questionCode,
      req.body?.choiceId,
    );
  } catch (err) {
    return sendSafeError(res, err, {
      fallbackMessage: 'Réponse invalide',
      req,
      context: 'gl.games.qcm.answer',
    });
  }

  // GL2 : le jeton doit venir de la présentation d'un repère de CETTE partie, pour CETTE
  // équipe. Un jeton de QCM libre (`/api/gl/qcm/questions/:code/present`) ne porte pas de
  // contexte de partie : il reste utilisable hors partie, mais ne rapporte aucun point ici.
  const tokenGame = verification.game;
  if (!tokenGame || Number(tokenGame.gameId) !== Number(gameId)) {
    return res.status(403).json({
      error: 'Question non présentée par un repère de cette partie',
      code: 'GL_QCM_TOKEN_NOT_FOR_GAME',
    });
  }
  if (Number(tokenGame.teamId) !== Number(teamIdForGame)) {
    return res.status(403).json({
      error: 'Question présentée pour une autre équipe',
      code: 'GL_QCM_TOKEN_OTHER_TEAM',
    });
  }

  const dataset = isLore ? 'qcm_lore' : 'qcm';

  let scoreDelta = 0;
  let scoreSkippedReason = null;
  // Repère lu dans le jeton (GL2) ; `req.body.markerId` n'est plus honoré.
  const markerId = tokenGame.markerId != null ? Number(tokenGame.markerId) : null;

  let lastEvent = null;
  try {
    await withTransaction(async (tx) => {
      // Une présentation ne se joue qu'une fois : sans cette consommation, renvoyer la
      // même requête pendant les 15 min de validité du jeton recréditait l'équipe à
      // chaque appel. Dans la transaction du score — jeton consommé et point compté vont
      // ensemble, ou rien.
      const consumed = await consumePresentationJti(tx, {
        jti: verification.jti,
        gameId,
        teamId: teamIdForGame,
        questionCode,
      });
      if (consumed === 'already_used') {
        const err = new Error('Présentation déjà utilisée');
        err.status = 409;
        throw err;
      }

      // Une bonne réponse notée par (partie, équipe, question) et par arrivée sur le repère
      // (GL2, cf. lib/glGameQcmScoring.js) — lu AVANT d'insérer la réponse courante.
      let eligibility = { eligible: true };
      if (verification.correct && settings.scoringEnabled) {
        eligibility = await resolveGameQcmScoreEligibility(tx, {
          gameId,
          teamId: teamIdForGame,
          questionCode,
          markerId,
          retriggerMode: settings.markerQuestionRetrigger,
        });
        if (!eligibility.eligible) scoreSkippedReason = eligibility.reason;
      }

      lastEvent = await insertGameEvent(tx, {
        gameId,
        teamId: teamIdForGame,
        actorType: answerCtx.actorType,
        actorId: answerCtx.actorId,
        eventType: 'qcm_answer',
        payload: {
          questionCode,
          correct: verification.correct,
          choiceId: verification.selectedChoiceId,
          markerId: Number.isFinite(markerId) ? markerId : null,
          ...(scoreSkippedReason ? { scoreSkipped: scoreSkippedReason } : {}),
        },
      });
      if (verification.correct && settings.scoringEnabled && eligibility.eligible) {
        scoreDelta = 1;
        await tx.execute(
          `INSERT INTO gl_team_scores (game_id, team_id, score, last_reason, updated_at)
           VALUES (?, ?, ?, ?, NOW())
           ON DUPLICATE KEY UPDATE
             score = score + VALUES(score),
             last_reason = VALUES(last_reason),
             updated_at = NOW()`,
          [gameId, teamIdForGame, scoreDelta, QCM_SCORE_REASON],
        );
        lastEvent = await insertGameEvent(tx, {
          gameId,
          teamId: teamIdForGame,
          actorType: answerCtx.actorType,
          actorId: answerCtx.actorId,
          eventType: 'score',
          payload: { delta: scoreDelta, reason: QCM_SCORE_REASON, questionCode },
        });
      }
    });
  } catch (err) {
    if (err?.status === 409) return res.status(409).json({ error: err.message });
    throw err;
  }

  // Après consommation seulement : un rejeu refusé ne doit pas peser sur le gating
  // (tentative comptée, verrou de re-tentative posé) alors qu'il n'a rien joué.
  await recordGlQcmAttemptForReader(
    { queryAll, queryOne, execute },
    {
      glAuth: req.glAuth,
      dataset,
      questionCode,
      isCorrect: verification.correct,
      gameId,
      teamId: teamIdForGame,
    },
  );

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

  if (lastEvent) emitGlGameEvent(gameId, lastEvent);

  return res.json({
    correct: verification.correct,
    feedback: resolveQcmAnswerFeedback(questionRow, verification),
    scoreDelta,
    scoreSkippedReason: scoreSkippedReason || undefined,
    qcmSet: isLore ? 'lore' : 'biome',
    glossaryTerms: !isLore && verification.correct ? glossaryTerms : undefined,
    loreGlossaryTerms: isLore && verification.correct ? glossaryTerms : undefined,
  });
});

module.exports = router;
