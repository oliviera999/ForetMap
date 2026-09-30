'use strict';

/**
 * Éligibilité au point d'une bonne réponse QCM en partie (audit sécurité 2026-09-30, GL2).
 *
 * Avant ce correctif, `POST /api/gl/games/:id/qcm/answer` créditait +1 à chaque bonne réponse
 * portée par N'IMPORTE QUEL jeton de présentation valide — jetons que `GET
 * /api/gl/qcm/questions/:code/present` distribue à volonté. Après un premier essai (qui révèle
 * la bonne réponse), boucler « présenter → répondre » gonflait le score sans limite, y compris
 * en partie terminée.
 *
 * Désormais (la route vérifie en amont jeton de repère + statut `live`), une bonne réponse ne
 * rapporte un point que si :
 *
 * 1. **(partie, équipe, question)** n'a pas déjà été crédité — sauf réglage de
 *    re-déclenchement `every_arrival`, où la même question peut rapporter de nouveau APRÈS un
 *    nouveau déplacement de l'équipe ;
 * 2. **(partie, équipe, repère)** n'a rien rapporté depuis le dernier déplacement de l'équipe :
 *    rester posé sur un repère et re-présenter sa question ne rapporte qu'une fois par arrivée.
 *
 * La réponse reste corrigée (feedback, glossaire) ; seul le point est refusé
 * (`scoreDelta: 0`, `scoreSkippedReason`).
 *
 * Les lectures se font dans la transaction du score, après verrouillage de la ligne d'équipe
 * (`SELECT … FOR UPDATE`) : deux réponses simultanées de la même équipe sont sérialisées.
 */

const { normalizeMarkerQuestionRetrigger } = require('./glMarkerEventConfig');

const QCM_SCORE_REASON = 'Bonne réponse QCM';

function parsePayload(json) {
  try {
    return json ? JSON.parse(json) : {};
  } catch (_) {
    return {};
  }
}

/**
 * @param {{ queryOne: Function, queryAll: Function }} tx transaction du score
 * @returns {Promise<{ eligible: true } | { eligible: false, reason: 'question_already_scored'|'marker_already_scored' }>}
 */
async function resolveGameQcmScoreEligibility(
  tx,
  { gameId, teamId, questionCode, markerId = null, retriggerMode = 'every_arrival' },
) {
  // Sérialise les réponses concurrentes d'une même équipe (verrou de ligne).
  await tx.queryOne('SELECT id FROM gl_teams WHERE id = ? AND game_id = ? FOR UPDATE', [
    teamId,
    gameId,
  ]);

  const rows = await tx.queryAll(
    `SELECT id, event_type, payload_json
       FROM gl_game_events
      WHERE game_id = ?
        AND team_id = ?
        AND event_type IN ('score', 'qcm_answer', 'move')
      ORDER BY id ASC`,
    [gameId, teamId],
  );

  let lastMoveId = 0;
  let lastQuestionScoreId = 0;
  let lastMarkerScoreId = 0;
  const code = String(questionCode || '')
    .trim()
    .toUpperCase();
  // Un point QCM est un couple d'événements consécutifs `qcm_answer` (correct) puis `score`.
  let pendingAnswer = null;
  for (const row of rows) {
    const id = Number(row.id);
    const payload = parsePayload(row.payload_json);
    if (row.event_type === 'move') {
      lastMoveId = id;
      pendingAnswer = null;
      continue;
    }
    if (row.event_type === 'qcm_answer') {
      pendingAnswer = payload?.correct ? payload : null;
      continue;
    }
    if (row.event_type === 'score' && payload?.reason === QCM_SCORE_REASON) {
      const scoredCode = String(payload?.questionCode || pendingAnswer?.questionCode || '')
        .trim()
        .toUpperCase();
      if (scoredCode && scoredCode === code) lastQuestionScoreId = id;
      const scoredMarker = pendingAnswer?.markerId != null ? Number(pendingAnswer.markerId) : null;
      if (markerId != null && scoredMarker === Number(markerId)) lastMarkerScoreId = id;
    }
    pendingAnswer = null;
  }

  const mode = normalizeMarkerQuestionRetrigger(retriggerMode);
  if (lastQuestionScoreId > 0) {
    const rearmed = mode === 'every_arrival' && lastMoveId > lastQuestionScoreId;
    if (!rearmed) return { eligible: false, reason: 'question_already_scored' };
  }
  if (lastMarkerScoreId > 0 && lastMarkerScoreId > lastMoveId) {
    return { eligible: false, reason: 'marker_already_scored' };
  }
  return { eligible: true };
}

module.exports = {
  QCM_SCORE_REASON,
  resolveGameQcmScoreEligibility,
};
