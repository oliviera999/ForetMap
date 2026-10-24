'use strict';

// Persistance des tentatives QCM GL par lecteur (joueur/invite/MJ) — table gl_qcm_attempts.
// Alimente le mode de granularite 'player' du conditionnement (cf. resourceQuestionGatingCore).
// L'ecriture est INCONDITIONNELLE (toutes les routes de reponse QCM y passent) : c'est ce qui
// rend l'activation du conditionnement retroactive. Seule la LECTURE (getChallengeState) depend
// de gating.enabled — conditionnement eteint = aucun quiz a l'accuse (audit F3, 2026-08).

const { GL_QUESTION_DATASETS } = require('./shared/resourceQuestionGatingCore');

function normalizeDataset(value) {
  const v = String(value == null ? '' : value)
    .trim()
    .toLowerCase();
  return GL_QUESTION_DATASETS.includes(v) ? v : null;
}

/** Deduit le jeu de questions depuis le code (LQCM... -> lore, sinon ecologie). */
function datasetFromQuestionCode(code) {
  return String(code || '')
    .trim()
    .toUpperCase()
    .startsWith('LQCM')
    ? 'qcm_lore'
    : 'qcm';
}

async function recordGlQcmAttempt(
  db,
  { reader, dataset, questionCode, isCorrect, gameId = null, teamId = null } = {},
) {
  if (!db || !reader || !reader.reader_user_type || !reader.reader_user_id) return false;
  // Invité (audit sécurité 2026-09-30, GL8 / M5) : aucune tentative enregistrée. Les jetons
  // invités se créent à volonté et la table n'est jamais purgée ; la réponse reste corrigée.
  if (String(reader.reader_user_type).toLowerCase() === 'gl_guest') return false;
  const ds = normalizeDataset(dataset) || datasetFromQuestionCode(questionCode);
  const code = String(questionCode == null ? '' : questionCode).trim();
  if (!code) return false;
  await db.execute(
    `INSERT INTO gl_qcm_attempts
      (reader_user_type, reader_user_id, question_dataset, question_code, is_correct, game_id, team_id, answered_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, NOW())`,
    [
      reader.reader_user_type,
      reader.reader_user_id,
      ds,
      code,
      isCorrect ? 1 : 0,
      gameId == null ? null : Number(gameId),
      teamId == null ? null : Number(teamId),
    ],
  );
  return true;
}

/** Codes des questions QCM repondues juste par un lecteur (mode granularite 'player'). */
async function listCorrectQcmCodesForReader(db, reader, dataset = null) {
  if (!db || !reader || !reader.reader_user_type || !reader.reader_user_id) return [];
  const params = [reader.reader_user_type, reader.reader_user_id];
  let sql = `SELECT DISTINCT question_code FROM gl_qcm_attempts
              WHERE reader_user_type = ? AND reader_user_id = ? AND is_correct = 1`;
  const ds = normalizeDataset(dataset);
  if (ds) {
    sql += ' AND question_dataset = ?';
    params.push(ds);
  }
  const rows = await db.queryAll(sql, params);
  return rows.map((r) => r.question_code);
}

/**
 * Le lecteur a-t-il déjà réussi cette question ? Sert à repérer la PREMIÈRE bonne réponse
 * (« +1 » du voyageur, `lib/glVoyageur.js`), avant d'enregistrer la nouvelle tentative.
 */
async function hasCorrectGlQcmAttempt(db, { reader, dataset, questionCode } = {}) {
  if (!db || !reader || !reader.reader_user_type || !reader.reader_user_id) return false;
  const ds = normalizeDataset(dataset) || datasetFromQuestionCode(questionCode);
  const code = String(questionCode == null ? '' : questionCode).trim();
  if (!code) return false;
  const row = await db.queryOne(
    `SELECT 1 AS ok FROM gl_qcm_attempts
      WHERE reader_user_type = ? AND reader_user_id = ?
        AND question_dataset = ? AND question_code = ? AND is_correct = 1
      LIMIT 1`,
    [reader.reader_user_type, reader.reader_user_id, ds, code],
  );
  return !!row;
}

module.exports = {
  hasCorrectGlQcmAttempt,
  normalizeDataset,
  datasetFromQuestionCode,
  recordGlQcmAttempt,
  listCorrectQcmCodesForReader,
};
