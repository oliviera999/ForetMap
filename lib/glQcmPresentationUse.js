'use strict';

/**
 * Consomme atomiquement un jti de présentation QCM pour une partie.
 * Empêche le rejeu d'un même presentationToken (score / événements).
 * @returns {'consumed'|'already_used'}
 */
async function consumePresentationJti(tx, { jti, gameId, teamId, questionCode }) {
  const tokenJti = String(jti || '').trim();
  if (!tokenJti) {
    const err = new Error('Token de présentation invalide (jti manquant)');
    err.status = 400;
    throw err;
  }
  try {
    await tx.execute(
      `INSERT INTO gl_qcm_presentation_uses (jti, game_id, team_id, question_code, used_at)
       VALUES (?, ?, ?, ?, NOW())`,
      [tokenJti, gameId, teamId == null ? null : Number(teamId), String(questionCode || '')],
    );
    return 'consumed';
  } catch (err) {
    if (err && (err.errno === 1062 || err.code === 'ER_DUP_ENTRY')) {
      return 'already_used';
    }
    throw err;
  }
}

module.exports = { consumePresentationJti };
