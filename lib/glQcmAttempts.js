'use strict';

// Persistance des tentatives QCM GL par lecteur (joueur/invite/MJ) — table gl_qcm_attempts.
// Alimente le mode de granularite 'player' du conditionnement (cf. resourceQuestionGatingCore).
// Le branchement dans la route de reponse en partie est conditionne a gating.enabled
// (aucune ecriture par defaut : backbone structurel, comportement inchange).

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

/** Codes des questions QCM repondues juste par une equipe en partie (mode granularite 'team'). */
async function listCorrectQcmCodesForTeam(db, { gameId, teamId, dataset = null } = {}) {
  if (!db || gameId == null || teamId == null) return [];
  const params = [Number(gameId), Number(teamId)];
  let sql = `SELECT DISTINCT question_code FROM gl_qcm_attempts
              WHERE game_id = ? AND team_id = ? AND is_correct = 1`;
  const ds = normalizeDataset(dataset);
  if (ds) {
    sql += ' AND question_dataset = ?';
    params.push(ds);
  }
  const rows = await db.queryAll(sql, params);
  return rows.map((r) => r.question_code);
}

module.exports = {
  normalizeDataset,
  datasetFromQuestionCode,
  recordGlQcmAttempt,
  listCorrectQcmCodesForReader,
  listCorrectQcmCodesForTeam,
};
