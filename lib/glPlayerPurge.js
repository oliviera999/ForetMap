'use strict';

// =====================================================================
// Purge des traces d'apprentissage d'un joueur GL à la suppression de son compte.
//
// Le lecteur GL est identifié par un COUPLE polymorphe (reader_user_type, reader_user_id) :
// aucune clé étrangère vers `gl_players` n'est possible (un invité ou un MJ n'a pas de ligne
// joueur). Trois tables portaient donc des lignes orphelines après suppression, sur les deux
// chemins (route admin GL et suppression d'un élève ForetMap lié) — et `gl_players.id` étant un
// AUTO_INCREMENT, un identifiant réattribué héritait des bonnes réponses, des accusés et des
// verrous du joueur disparu (docs/AUDIT_VALIDATION_QUIZ_2026-09.md, constat C1).
//
// À appeler DANS la transaction qui supprime le joueur, avant `DELETE FROM gl_players`.
// =====================================================================

const GL_PLAYER_READER_TYPE = 'gl_player';

/** Tables portant des lignes par lecteur GL, sans FK possible. */
const GL_PLAYER_TRACE_TABLES = Object.freeze([
  'gl_qcm_attempts',
  'gl_resource_gating_cooldowns',
  'gl_learning_acknowledgements',
]);

/**
 * Supprime les tentatives QCM, verrous de conditionnement et accusés d'apprentissage d'un
 * joueur GL. Idempotent.
 * @param {{ execute: Function }} tx connexion transactionnelle (ou pool)
 * @param {number|string} playerId identifiant `gl_players.id`
 * @returns {Promise<{ [table: string]: number }>} lignes supprimées par table
 */
async function purgeGlPlayerLearningTraces(tx, playerId) {
  const id = String(playerId == null ? '' : playerId).trim();
  const removed = {};
  if (!id) return removed;
  for (const table of GL_PLAYER_TRACE_TABLES) {
    const result = await tx.execute(
      `DELETE FROM ${table} WHERE reader_user_type = ? AND reader_user_id = ?`,
      [GL_PLAYER_READER_TYPE, id],
    );
    removed[table] = Number(result?.affectedRows) || 0;
  }
  return removed;
}

module.exports = { GL_PLAYER_TRACE_TABLES, purgeGlPlayerLearningTraces };
