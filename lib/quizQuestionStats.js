'use strict';

// =====================================================================
// Taux de reussite par question (ForetMap + Gnomes & Licornes).
//
// Une question que tout le monde rate est rarement « difficile » : elle est le
// plus souvent mal formulee, ou son enonce laisse deux lectures possibles. Sans
// ces chiffres, le professeur ne peut pas la reperer — et si elle est bloquante,
// elle bloque toute une classe sans raison.
//
// Les deux produits n'enregistrent pas au meme endroit (`user_quiz_attempts` par
// compte, `gl_qcm_attempts` par lecteur) mais la lecture et le classement sont
// communs : c'est le meme ecran des deux cotes.
// =====================================================================

/** Seuil en deca duquel une moyenne n'a pas de sens statistique. */
const MIN_ATTEMPTS_FOR_FLAG = 5;
/** Taux de reussite sous lequel une question merite d'etre relue. */
const SUSPECT_SUCCESS_RATE = 0.35;
const MAX_ROWS = 300;

/** Enrichit une ligne brute : taux, et signalement s'il y a matiere. */
function decorate(row) {
  const attempts = Number(row.attempts) || 0;
  const correct = Number(row.correct) || 0;
  const rate = attempts > 0 ? correct / attempts : null;
  return {
    question_code: row.question_code,
    question: row.question || null,
    categorie_slug: row.categorie_slug || null,
    attempts,
    correct,
    wrong: attempts - correct,
    success_rate: rate == null ? null : Math.round(rate * 1000) / 1000,
    learners: Number(row.learners) || 0,
    // Un signalement n'a de valeur qu'avec assez de tentatives : sur deux essais,
    // 0 % ne veut rien dire.
    suspect: attempts >= MIN_ATTEMPTS_FOR_FLAG && rate != null && rate < SUSPECT_SUCCESS_RATE,
    is_gating: row.is_gating == null ? null : Number(row.is_gating) === 1,
  };
}

/**
 * Statistiques ForetMap. `onlyGating` restreint aux questions qui conditionnent
 * reellement une validation — celles dont un defaut coute le plus cher.
 */
async function listFmQuestionStats(db, { onlyGating = false, minAttempts = 1 } = {}) {
  const rows = await db.queryAll(
    `SELECT a.question_code,
            q.question,
            q.categorie_slug,
            COUNT(*) AS attempts,
            SUM(CASE WHEN a.is_correct = 1 THEN 1 ELSE 0 END) AS correct,
            COUNT(DISTINCT a.user_id) AS learners,
            MAX(CASE WHEN l.is_gating = 1 AND l.status = 'approved' THEN 1 ELSE 0 END) AS is_gating
       FROM user_quiz_attempts a
       LEFT JOIN quiz_questions q ON q.question_code = a.question_code
       LEFT JOIN resource_question_links l ON l.question_code = a.question_code
      GROUP BY a.question_code, q.question, q.categorie_slug
     HAVING attempts >= ?
        ${onlyGating ? 'AND is_gating = 1' : ''}
      ORDER BY (SUM(CASE WHEN a.is_correct = 1 THEN 1 ELSE 0 END) / COUNT(*)) ASC, attempts DESC
      LIMIT ${MAX_ROWS}`,
    [Math.max(1, Math.floor(Number(minAttempts) || 1))],
  );
  return rows.map(decorate);
}

/** Statistiques GL. Le lecteur peut etre un joueur, un invite ou un MJ. */
async function listGlQuestionStats(db, { dataset = 'qcm', minAttempts = 1 } = {}) {
  const table = dataset === 'qcm_lore' ? 'gl_qcm_lore_questions' : 'gl_qcm_questions';
  const rows = await db.queryAll(
    `SELECT a.question_code,
            q.question,
            q.categorie_slug,
            COUNT(*) AS attempts,
            SUM(CASE WHEN a.is_correct = 1 THEN 1 ELSE 0 END) AS correct,
            COUNT(DISTINCT CONCAT(a.reader_user_type, ':', a.reader_user_id)) AS learners
       FROM gl_qcm_attempts a
       LEFT JOIN ${table} q ON q.question_code = a.question_code
      WHERE a.question_dataset = ?
      GROUP BY a.question_code, q.question, q.categorie_slug
     HAVING attempts >= ?
      ORDER BY (SUM(CASE WHEN a.is_correct = 1 THEN 1 ELSE 0 END) / COUNT(*)) ASC, attempts DESC
      LIMIT ${MAX_ROWS}`,
    [dataset, Math.max(1, Math.floor(Number(minAttempts) || 1))],
  );
  return rows.map(decorate);
}

module.exports = {
  MIN_ATTEMPTS_FOR_FLAG,
  SUSPECT_SUCCESS_RATE,
  MAX_ROWS,
  decorate,
  listFmQuestionStats,
  listGlQuestionStats,
};
