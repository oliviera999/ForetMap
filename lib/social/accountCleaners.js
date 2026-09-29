'use strict';

/**
 * Vie sociale — ce que le forum et les commentaires contextuels font de leurs lignes quand un
 * compte ou un groupe disparaît (registre `lib/accounts/cleanerRegistry.js`).
 *
 * Ces tables désignent leur auteur par une colonne polymorphe `(xxx_user_type, xxx_user_id)`,
 * sans clé étrangère possible : sans ces déclarations, rien ne les nettoierait.
 *
 * Les **fichiers** joints (`uploads/forum-posts/…`, `uploads/context-comments/…`) sont servis
 * publiquement : leurs chemins sont relevés dans la transaction, puis supprimés après validation
 * (`docs/AUDIT_AFFICHAGE_PHOTOS_2026-09-29.md` PH-B4). Jamais avant : un retour arrière
 * laisserait des messages sans leurs images.
 */

const { collectUserContentImagePaths } = require('../userContentImages');
const { deleteFile } = require('../uploads');

const FORUM_UPLOAD_PREFIX = 'forum-posts';
const CONTEXT_COMMENT_UPLOAD_PREFIX = 'context-comments';

function pathsFromRows(rows, prefix) {
  return rows.flatMap((r) => collectUserContentImagePaths(r.image_paths_json, prefix));
}

/**
 * Suppression d'un élève : ses réactions, signalements, messages et fils de forum.
 * Les messages d'autres auteurs dans ses fils partent avec eux (cascade `thread_id`) : leurs
 * images sont relevées aussi.
 * @returns {Promise<string[]>} chemins des images à supprimer après validation
 */
async function purgeStudentForum(tx, studentId) {
  const imageRows = await tx.queryAll(
    `SELECT p.image_paths_json
       FROM forum_posts p
      WHERE p.image_paths_json IS NOT NULL
        AND ((p.author_user_type = 'student' AND p.author_user_id = ?)
          OR p.thread_id IN (SELECT t.id FROM forum_threads t
                              WHERE t.author_user_type = 'student' AND t.author_user_id = ?))`,
    [studentId, studentId],
  );
  await tx.execute(
    `DELETE FROM forum_post_reactions WHERE reactor_user_type = 'student' AND reactor_user_id = ?`,
    [studentId],
  );
  await tx.execute(
    `DELETE FROM forum_reports WHERE reporter_user_type = 'student' AND reporter_user_id = ?`,
    [studentId],
  );
  await tx.execute(
    `DELETE FROM forum_posts WHERE author_user_type = 'student' AND author_user_id = ?`,
    [studentId],
  );
  await tx.execute(
    `DELETE FROM forum_threads WHERE author_user_type = 'student' AND author_user_id = ?`,
    [studentId],
  );
  return pathsFromRows(imageRows, FORUM_UPLOAD_PREFIX);
}

/**
 * Suppression d'un élève : ses réactions, signalements et commentaires contextuels.
 * @returns {Promise<string[]>} chemins des images à supprimer après validation
 */
async function purgeStudentContextComments(tx, studentId) {
  const imageRows = await tx.queryAll(
    `SELECT image_paths_json FROM context_comments
      WHERE author_user_type = 'student' AND author_user_id = ? AND image_paths_json IS NOT NULL`,
    [studentId],
  );
  await tx.execute(
    `DELETE FROM context_comment_reactions WHERE reactor_user_type = 'student' AND reactor_user_id = ?`,
    [studentId],
  );
  await tx.execute(
    `DELETE FROM context_comment_reports WHERE reporter_user_type = 'student' AND reporter_user_id = ?`,
    [studentId],
  );
  await tx.execute(
    `DELETE FROM context_comments WHERE author_user_type = 'student' AND author_user_id = ?`,
    [studentId],
  );
  return pathsFromRows(imageRows, CONTEXT_COMMENT_UPLOAD_PREFIX);
}

function deleteAll(paths) {
  for (const relativePath of paths || []) deleteFile(relativePath);
}

const forumCleaners = {
  domain: 'Vie sociale — forum',
  product: 'foret',
  studentDelete: {
    order: 20,
    async run(tx, student) {
      return { forumImagePaths: await purgeStudentForum(tx, student.id) };
    },
  },
  afterStudentDelete: {
    order: 20,
    async run(summary, contributions = {}) {
      if (summary?.ok) deleteAll(contributions.forumImagePaths);
    },
  },
  // `forum_threads.group_id` ne porte aucune contrainte vers `groups` : sans ce détachement,
  // le fil restait rattaché à un groupe fantôme (filtrage, visibilité).
  groupDetach: {
    order: 20,
    async run(tx, groupId) {
      await tx.execute('UPDATE forum_threads SET group_id = NULL WHERE group_id = ?', [groupId]);
    },
  },
  mergeRefs: {
    order: 10,
    refs: [
      { table: 'forum_threads', typeColumn: 'author_user_type', idColumn: 'author_user_id' },
      { table: 'forum_posts', typeColumn: 'author_user_type', idColumn: 'author_user_id' },
      { table: 'forum_reports', typeColumn: 'reporter_user_type', idColumn: 'reporter_user_id' },
      {
        table: 'forum_post_reactions',
        typeColumn: 'reactor_user_type',
        idColumn: 'reactor_user_id',
      },
    ],
  },
};

const contextCommentCleaners = {
  domain: 'Vie sociale — commentaires contextuels',
  product: 'foret',
  studentDelete: {
    order: 21,
    async run(tx, student) {
      return { contextCommentImagePaths: await purgeStudentContextComments(tx, student.id) };
    },
  },
  afterStudentDelete: {
    order: 21,
    async run(summary, contributions = {}) {
      if (summary?.ok) deleteAll(contributions.contextCommentImagePaths);
    },
  },
  mergeRefs: {
    order: 20,
    refs: [
      { table: 'context_comments', typeColumn: 'author_user_type', idColumn: 'author_user_id' },
      {
        table: 'context_comment_reports',
        typeColumn: 'reporter_user_type',
        idColumn: 'reporter_user_id',
      },
      {
        table: 'context_comment_reactions',
        typeColumn: 'reactor_user_type',
        idColumn: 'reactor_user_id',
      },
    ],
  },
};

module.exports = [forumCleaners, contextCommentCleaners];
module.exports.purgeStudentForum = purgeStudentForum;
module.exports.purgeStudentContextComments = purgeStudentContextComments;
