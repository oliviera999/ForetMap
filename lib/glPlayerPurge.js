'use strict';

// =====================================================================
// Purge d'un joueur GL à la suppression de son compte — point d'entrée unique des deux
// chemins : `DELETE /api/gl/admin/players/:id` et suppression d'un élève ForetMap lié
// (`lib/studentDeletion.js` → `purgeLinkedGlPlayer`).
//
// 1. Traces d'apprentissage. Le lecteur GL est identifié par un COUPLE polymorphe
//    (reader_user_type, reader_user_id) : aucune clé étrangère vers `gl_players` n'est
//    possible (un invité ou un MJ n'a pas de ligne joueur). `gl_players.id` étant un
//    AUTO_INCREMENT, un identifiant réattribué héritait des bonnes réponses, des accusés et
//    des verrous du joueur disparu (docs/AUDIT_VALIDATION_QUIZ_2026-09.md, constat C1).
//
// 2. Effacement complet (RG3 de docs/AUDIT_SECURITE_RGPD_2026-09-30.md, art. 17 RGPD) :
//    forum G&L, commentaires de contexte, traces de partie (événements, demandes d'action,
//    sortilèges), fichiers du journal et avatar. Avant ce lot, tout cela survivait au joueur,
//    et une contribution à un sortilège d'une partie terminée bloquait la suppression par un
//    409 systématique (`fk_gl_spell_cast_contrib_player` ON DELETE RESTRICT).
//
//    Choix pour les traces de partie : **anonymiser** ce qui fait l'historique collectif
//    (l'événement, la demande, le brouillon de sort restent, sans auteur) et **supprimer**
//    la contribution du joueur à un sortilège (la clé primaire `(draft_id, player_id)`
//    interdit de la détacher). Aucun changement de schéma ; idempotent.
//
// À appeler DANS la transaction qui supprime le joueur, avant `DELETE FROM gl_players`.
// Les fichiers relevés sont supprimés APRÈS validation (`deleteGlPlayerFiles`) : un retour
// arrière laisserait sinon des lignes sans leurs fichiers.
// =====================================================================

const { collectUserContentImagePaths } = require('./userContentImages');
const { deleteFile, deleteDirectory } = require('./uploads');

const GL_PLAYER_READER_TYPE = 'gl_player';
const GL_FORUM_UPLOAD_PREFIX = 'gl-forum-posts';
const CONTEXT_COMMENT_UPLOAD_PREFIX = 'context-comments';
const GL_PLAYER_JOURNAL_PREFIX = 'gl-player-journal';
/** Avatars de joueur : `gl_players/<id>/avatar-<horodatage>.<ext>` (`routes/gl/auth.js`). */
const GL_PLAYER_AVATAR_PREFIX = 'gl_players';
/** Acteur « joueur » des brouillons de sort et des événements (`lib/glSpellCast.js`). */
const GL_PLAYER_ACTOR_TYPE = 'team';

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

function imagePathsFromRows(rows, prefix) {
  return (rows || []).flatMap((r) => collectUserContentImagePaths(r.image_paths_json, prefix));
}

/**
 * Forum G&L et commentaires de contexte du joueur : réactions, signalements, messages, fils
 * (les messages d'autres auteurs dans ses fils partent en cascade `thread_id` — leurs
 * images sont relevées aussi, comme côté ForetMap).
 * @returns {Promise<string[]>} chemins d'images à supprimer après validation
 */
async function purgeGlPlayerSocial(tx, playerId) {
  const id = String(playerId);
  const forumImages = await tx.queryAll(
    `SELECT p.image_paths_json
       FROM gl_forum_posts p
      WHERE p.image_paths_json IS NOT NULL
        AND ((p.author_user_type = ? AND p.author_user_id = ?)
          OR p.thread_id IN (SELECT t.id FROM gl_forum_threads t
                              WHERE t.author_user_type = ? AND t.author_user_id = ?))`,
    [GL_PLAYER_READER_TYPE, id, GL_PLAYER_READER_TYPE, id],
  );
  await tx.execute(
    'DELETE FROM gl_forum_post_reactions WHERE reactor_user_type = ? AND reactor_user_id = ?',
    [GL_PLAYER_READER_TYPE, id],
  );
  await tx.execute(
    'DELETE FROM gl_forum_reports WHERE reporter_user_type = ? AND reporter_user_id = ?',
    [GL_PLAYER_READER_TYPE, id],
  );
  await tx.execute('DELETE FROM gl_forum_posts WHERE author_user_type = ? AND author_user_id = ?', [
    GL_PLAYER_READER_TYPE,
    id,
  ]);
  await tx.execute(
    'DELETE FROM gl_forum_threads WHERE author_user_type = ? AND author_user_id = ?',
    [GL_PLAYER_READER_TYPE, id],
  );

  const commentImages = await tx.queryAll(
    `SELECT image_paths_json FROM context_comments
      WHERE author_user_type = ? AND author_user_id = ? AND image_paths_json IS NOT NULL`,
    [GL_PLAYER_READER_TYPE, id],
  );
  await tx.execute(
    'DELETE FROM context_comment_reactions WHERE reactor_user_type = ? AND reactor_user_id = ?',
    [GL_PLAYER_READER_TYPE, id],
  );
  await tx.execute(
    'DELETE FROM context_comment_reports WHERE reporter_user_type = ? AND reporter_user_id = ?',
    [GL_PLAYER_READER_TYPE, id],
  );
  await tx.execute(
    'DELETE FROM context_comments WHERE author_user_type = ? AND author_user_id = ?',
    [GL_PLAYER_READER_TYPE, id],
  );
  return [
    ...imagePathsFromRows(forumImages, GL_FORUM_UPLOAD_PREFIX),
    ...imagePathsFromRows(commentImages, CONTEXT_COMMENT_UPLOAD_PREFIX),
  ];
}

/**
 * Traces de partie : anonymisées (l'historique collectif reste, sans auteur) ; contributions
 * aux sortilèges supprimées (elles bloquaient la suppression : FK RESTRICT).
 */
async function anonymizeGlPlayerGameTraces(tx, playerId) {
  const numericId = Number(playerId);
  const id = String(playerId);
  await tx.execute(
    'UPDATE gl_game_events SET actor_id = NULL WHERE actor_type = ? AND actor_id = ?',
    [GL_PLAYER_ACTOR_TYPE, id],
  );
  await tx.execute('UPDATE gl_action_requests SET player_id = NULL WHERE player_id = ?', [
    numericId,
  ]);
  // Coordination par ce joueur de la contribution d'un coéquipier : la ligne reste au
  // coéquipier, qui en devient l'auteur de la dernière modification.
  await tx.execute(
    `UPDATE gl_spell_cast_contributions SET updated_by_player_id = player_id
      WHERE updated_by_player_id = ? AND player_id <> ?`,
    [numericId, numericId],
  );
  await tx.execute('DELETE FROM gl_spell_cast_contributions WHERE player_id = ?', [numericId]);
  await tx.execute(
    'UPDATE gl_spell_cast_drafts SET launched_by_player_id = NULL WHERE launched_by_player_id = ?',
    [numericId],
  );
  // `created_by_actor_id` est NOT NULL : chaîne vide plutôt que NULL.
  await tx.execute(
    `UPDATE gl_spell_cast_drafts SET created_by_actor_id = ''
      WHERE created_by_actor_type = ? AND created_by_actor_id = ?`,
    [GL_PLAYER_ACTOR_TYPE, id],
  );
  for (const column of ['launched_by', 'decided_by', 'effect_applied_by']) {
    await tx.execute(
      `UPDATE gl_spell_cast_drafts SET ${column}_actor_id = NULL
        WHERE ${column}_actor_type = ? AND ${column}_actor_id = ?`,
      [GL_PLAYER_ACTOR_TYPE, id],
    );
  }
  await tx.execute(
    'UPDATE gl_game_feuillet_states SET discovered_by_player_id = NULL WHERE discovered_by_player_id = ?',
    [id],
  );
  await tx.execute(
    'UPDATE gl_player_feuillet_states SET discovered_by_player_id = NULL WHERE discovered_by_player_id = ?',
    [id],
  );
}

/**
 * Dossiers du joueur sous `uploads/` (journal, avatars), seulement pour un identifiant entier :
 * jamais un segment de chemin venu d'ailleurs.
 */
function glPlayerDirectories(playerId) {
  const n = Number(playerId);
  if (!Number.isInteger(n) || n <= 0) return [];
  return [`${GL_PLAYER_JOURNAL_PREFIX}/${n}`, `${GL_PLAYER_AVATAR_PREFIX}/${n}`];
}

/**
 * Tout ce qui, hors la ligne `gl_players`, appartient au joueur. Dans la transaction, avant
 * `DELETE FROM gl_players`. Idempotent.
 * @param {object} tx exécuteur de transaction (`withTransaction`)
 * @param {number|string} playerId
 * @returns {Promise<{ filePaths: string[], directories: string[] }>} fichiers à supprimer
 *   après validation (`deleteGlPlayerFiles`)
 */
async function purgeGlPlayerAccount(tx, playerId) {
  const id = String(playerId == null ? '' : playerId).trim();
  const out = { filePaths: [], directories: [] };
  if (!id) return out;
  const player = await tx.queryOne('SELECT avatar_path FROM gl_players WHERE id = ? LIMIT 1', [id]);
  await tx.execute('DELETE FROM gl_team_members WHERE player_id = ?', [id]);
  // Les jetons de réinitialisation du joueur ne portent pas de FK (table polymorphe).
  await tx.execute('DELETE FROM password_reset_tokens WHERE user_type = ? AND user_id = ?', [
    GL_PLAYER_READER_TYPE,
    id,
  ]);
  await purgeGlPlayerLearningTraces(tx, id);
  out.filePaths.push(...(await purgeGlPlayerSocial(tx, id)));
  await anonymizeGlPlayerGameTraces(tx, id);
  if (player?.avatar_path) out.filePaths.push(String(player.avatar_path));
  out.directories.push(...glPlayerDirectories(id));
  return out;
}

/** Suppression des fichiers relevés par `purgeGlPlayerAccount`, après validation. */
function deleteGlPlayerFiles(files) {
  for (const relativePath of files?.filePaths || []) deleteFile(relativePath);
  for (const relativeDir of files?.directories || []) deleteDirectory(relativeDir);
}

module.exports = {
  GL_PLAYER_TRACE_TABLES,
  purgeGlPlayerLearningTraces,
  purgeGlPlayerSocial,
  anonymizeGlPlayerGameTraces,
  glPlayerDirectories,
  purgeGlPlayerAccount,
  deleteGlPlayerFiles,
};
