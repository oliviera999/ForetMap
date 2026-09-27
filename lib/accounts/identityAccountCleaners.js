'use strict';

/**
 * Identité — ce que le domaine des comptes fait de ses propres lignes polymorphes quand un
 * compte disparaît (registre `lib/accounts/cleanerRegistry.js`) : profils RBAC, jetons de
 * réinitialisation, journaux d'élévation, de sécurité et d'audit.
 *
 * La ligne `users` elle-même, son avatar et les clés étrangères déclarées en base restent à
 * `lib/studentDeletion.js` et `lib/accountMerge.js`.
 */

/** Suppression d'un élève : profils RBAC et jetons de réinitialisation de mot de passe. */
async function purgeStudentRbacAndTokens(tx, studentId) {
  await tx.execute(`DELETE FROM user_roles WHERE user_type = 'student' AND user_id = ?`, [
    studentId,
  ]);
  await tx.execute(
    `DELETE FROM password_reset_tokens WHERE user_type = 'student' AND user_id = ?`,
    [studentId],
  );
}

module.exports = {
  domain: 'Identité — profils, jetons et journaux',
  product: 'foret',
  studentDelete: {
    order: 30,
    async run(tx, student) {
      await purgeStudentRbacAndTokens(tx, student.id);
    },
  },
  // À la fusion, les jetons et profils du compte absorbé sont abandonnés (le compte cible
  // garde les siens) ; les journaux lui sont réattribués.
  mergeRefs: {
    order: 30,
    refs: [
      {
        table: 'password_reset_tokens',
        typeColumn: 'user_type',
        idColumn: 'user_id',
        dropInstead: true,
      },
      { table: 'user_roles', typeColumn: 'user_type', idColumn: 'user_id', dropInstead: true },
      { table: 'elevation_audit', typeColumn: 'user_type', idColumn: 'user_id' },
      { table: 'security_events', typeColumn: 'actor_user_type', idColumn: 'actor_user_id' },
      { table: 'audit_log', typeColumn: 'actor_user_type', idColumn: 'actor_user_id' },
    ],
  },
  purgeStudentRbacAndTokens,
};
