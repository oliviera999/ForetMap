'use strict';

/**
 * Suppression complète d'un compte élève — point d'entrée unique (`DELETE /api/students/:id`,
 * réconciliation des identités G&L, administration G&L).
 *
 * Depuis la piste B (étape B6), ce module ne fait plus que ce qui revient au compte lui-même :
 * transaction, ligne `users`, avatar sur disque. Ce que **chaque domaine** fait de ses lignes
 * (forum, commentaires, profils et jetons, tâches, joueur G&L lié) est déclaré dans le domaine
 * et exécuté par le registre `lib/accounts/cleanerRegistry.js`, dans l'ordre d'avant.
 *
 * `purgeLinkedGlPlayer` (ci-dessous) est le code G&L d'origine, **inchangé** : le registre
 * l'appelle tel quel par son adaptateur `lib/accounts/glAccountCleaners.js`.
 */

const { withTransaction } = require('../database');
const { purgeGlPlayerLearningTraces } = require('./glPlayerPurge');
const { deleteFile } = require('./uploads');
const logger = require('./logger');
const {
  runStudentDeleteCleaners,
  runAfterStudentDeleteCleaners,
} = require('./accounts/cleanerRegistry');
const { purgeStudentForum, purgeStudentContextComments } = require('./social/accountCleaners');
const { purgeStudentRbacAndTokens } = require('./accounts/identityAccountCleaners');
const { deleteTaskAssignmentsAndRecalcStatuses } = require('./tasks/accountCleaners');

/**
 * Supprime le contenu forum / commentaires contextuels lié à un n3beur (pas de FK vers users).
 * Conservé pour compatibilité : les deux moitiés vivent dans `lib/social/accountCleaners.js`.
 */
async function purgeStudentForumAndComments(tx, studentId) {
  await purgeStudentForum(tx, studentId);
  await purgeStudentContextComments(tx, studentId);
}

/**
 * Profil de jeu Gnomes & Licornes lié au compte (unification des identités, migration 211) :
 * supprimer l'élève supprime aussi son joueur — mêmes règles que `DELETE /api/gl/admin/players/:id`.
 * La FK `fk_gl_players_user` (ON DELETE CASCADE) est un filet ; le chemin applicatif est
 * préféré pour purger proprement et pour répondre 409 quand une partie retient le joueur
 * (`fk_gl_spell_cast_contrib_player` RESTRICT).
 * @returns {Promise<{ ok: true, playerId: number|null } | { ok: false, reason: string }>}
 */
async function purgeLinkedGlPlayer(tx, studentId) {
  const player = await tx.queryOne(
    'SELECT id FROM gl_players WHERE linked_foretmap_user_id = ? LIMIT 1',
    [studentId],
  );
  if (!player) return { ok: true, playerId: null };
  const activeGames = await tx.queryOne(
    `SELECT COUNT(*) AS c
       FROM gl_team_members tm
 INNER JOIN gl_games g ON g.id = tm.game_id
      WHERE tm.player_id = ? AND g.status IN ('draft', 'live', 'paused')`,
    [player.id],
  );
  if (Number(activeGames?.c || 0) > 0) {
    return { ok: false, reason: 'gl_player_in_active_game', playerId: Number(player.id) };
  }
  await tx.execute('DELETE FROM gl_team_members WHERE player_id = ?', [player.id]);
  await tx.execute(
    `DELETE FROM password_reset_tokens WHERE user_type = 'gl_player' AND user_id = ?`,
    [String(player.id)],
  );
  // Tentatives QCM, verrous et accusés d'apprentissage du joueur lié (lecteur polymorphe,
  // aucune FK possible) : sans cette purge, un identifiant réattribué en héritait.
  await purgeGlPlayerLearningTraces(tx, player.id);
  await tx.execute('DELETE FROM gl_players WHERE id = ?', [player.id]);
  return { ok: true, playerId: Number(player.id) };
}

/**
 * Suppression complète d’un compte élève (même logique métier que DELETE /api/students/:id),
 * plus nettoyage forum, commentaires contextuels, RBAC, tokens reset, élévation, avatar disque.
 * @param {string} studentId
 * @returns {Promise<{ ok: true, studentId: string, displayName: string, affectedTaskIds: string[], affectedMapIds: string[] } | { ok: false, reason: string }>}
 */
async function deleteStudentById(studentId, options = {}) {
  const id = String(studentId || '').trim();
  if (!id) return { ok: false, reason: 'missing_id' };
  const { skipLinkedGlPlayer = false } = options;

  let avatarPath = null;
  let summary;
  try {
    summary = await withTransaction(async (tx) => {
      const s = await tx.queryOne("SELECT * FROM users WHERE id = ? AND user_type = 'student'", [
        id,
      ]);
      if (!s) return { ok: false, reason: 'not_found' };
      avatarPath = s.avatar_path || null;

      // Domaines, dans l'ordre : joueur G&L lié (sauf `skipLinkedGlPlayer`), forum,
      // commentaires contextuels, profils et jetons, tâches (statuts recalculés).
      const cleaned = await runStudentDeleteCleaners(tx, s, {
        skipProducts: skipLinkedGlPlayer ? ['gl'] : [],
      });
      if (!cleaned.ok) {
        return { ok: false, reason: cleaned.abort.reason, glPlayerId: cleaned.abort.glPlayerId };
      }
      const { affectedTaskIds, affectedMapIds, glPlayerId = null } = cleaned.contributions;

      await tx.execute("DELETE FROM users WHERE id = ? AND user_type = 'student'", [id]);

      const displayName = `${s.first_name || ''} ${s.last_name || ''}`.trim() || id;
      return {
        ok: true,
        studentId: id,
        displayName,
        affectedTaskIds,
        affectedMapIds,
        glPlayerId,
      };
    });
  } catch (err) {
    // Une contribution à un sortilège dans une partie TERMINÉE référence encore le joueur
    // (`fk_gl_spell_cast_contrib_player` ON DELETE RESTRICT) : refus explicite plutôt qu'un 500.
    if (err && (err.errno === 1451 || err.code === 'ER_ROW_IS_REFERENCED_2')) {
      logger.warn({ studentId: id, err }, 'Suppression élève refusée : joueur GL référencé');
      return { ok: false, reason: 'gl_player_referenced' };
    }
    throw err;
  }

  if (summary.ok && avatarPath) deleteFile(avatarPath);
  // Suites hors transaction (complétion des projets des tâches touchées).
  if (summary.ok) await runAfterStudentDeleteCleaners(summary);

  return summary;
}

module.exports = {
  deleteStudentById,
  purgeLinkedGlPlayer,
  purgeStudentForumAndComments,
  purgeStudentRbacAndTokens,
  deleteTaskAssignmentsAndRecalcStatuses,
};
