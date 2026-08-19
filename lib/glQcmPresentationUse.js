'use strict';

/**
 * Consommation à usage unique d'une présentation de QCM en partie.
 *
 * Le `presentationToken` reste valable 15 minutes : sans trace de son usage, la même
 * requête de réponse — légitime, signée, non modifiée — pouvait être rejouée en boucle
 * et créditer l'équipe à chaque fois (audit docs/AUDIT_APP_ET_JEU_2026-08.md §6.2 b).
 *
 * L'unicité est portée par la clé primaire de `gl_qcm_presentation_uses` : c'est la base
 * qui arbitre, donc deux réponses simultanées ne peuvent pas passer toutes les deux. À
 * appeler dans la transaction qui attribue le score, avant celle-ci.
 */

/**
 * @param {{ execute: Function }} tx transaction porteuse de l'attribution de score
 * @returns {Promise<'consumed'|'already_used'>}
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
    if (err && (err.errno === 1062 || err.code === 'ER_DUP_ENTRY')) return 'already_used';
    throw err;
  }
}

module.exports = { consumePresentationJti };
