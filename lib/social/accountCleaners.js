'use strict';

/**
 * Vie sociale — ce que le forum et les commentaires contextuels font de leurs lignes quand un
 * compte ou un groupe disparaît (registre `lib/accounts/cleanerRegistry.js`).
 *
 * Ces tables désignent leur auteur par une colonne polymorphe `(xxx_user_type, xxx_user_id)`,
 * sans clé étrangère possible : sans ces déclarations, rien ne les nettoierait.
 */

/** Suppression d'un élève : ses réactions, signalements, messages et fils de forum. */
async function purgeStudentForum(tx, studentId) {
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
}

/** Suppression d'un élève : ses réactions, signalements et commentaires contextuels. */
async function purgeStudentContextComments(tx, studentId) {
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
}

const forumCleaners = {
  domain: 'Vie sociale — forum',
  product: 'foret',
  studentDelete: {
    order: 20,
    async run(tx, student) {
      await purgeStudentForum(tx, student.id);
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
      await purgeStudentContextComments(tx, student.id);
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
