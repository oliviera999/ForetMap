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

/** Vrai si la table existe (installation en retard ou table d'échafaudage supprimée). */
async function tableExists(tx, table) {
  const row = await tx.queryOne(
    'SELECT COUNT(*) AS c FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?',
    [table],
  );
  return Number(row?.c || 0) > 0;
}

/**
 * Effacement d'un compte (élève, ou enseignant depuis `routes/rbac.js`) — ses traces dans
 * les journaux (RG3 de
 * `docs/AUDIT_SECURITE_RGPD_2026-09-30.md`, art. 17 RGPD).
 *
 *  - `security_events` : l'événement reste (traçabilité des actions d'administration), mais
 *    **adresse IP et navigateur** sont effacés sur toute ligne où la personne est acteur ou
 *    cible. Avant, seul l'acteur passait à NULL (clé étrangère) : l'IP restait 365 jours.
 *  - `audit_log` : ne stocke ni IP ni navigateur ; le libellé (`details`) des lignes qui la
 *    visent portait son **nom** (création, duplication, suppression) — il est vidé.
 *  - `user_activity_events` : supprimé (la clé étrangère le passait à NULL, gardant l'activité
 *    datée d'un compte disparu).
 *  - `elevation_audit` : table de l'ancien mode PIN, supprimée par la migration 164 et au
 *    démarrage (`lib/legacySchemaCleanup.js`) ; purgée si une installation la porte encore.
 *
 * À appeler dans la transaction, avant `DELETE FROM users` (les clés étrangères SET NULL
 * effaceraient sinon le lien qui permet de retrouver les lignes).
 */
async function eraseAccountJournalTraces(tx, userId, userType = 'student') {
  const id = String(userId);
  await tx.execute(
    `UPDATE security_events SET ip_address = NULL, user_agent = NULL
      WHERE (actor_user_id = ? OR target_id = ?)
        AND (ip_address IS NOT NULL OR user_agent IS NOT NULL)`,
    [id, id],
  );
  await tx.execute(
    `UPDATE audit_log SET details = NULL
      WHERE target_id = ? AND target_type IN ('student', 'user') AND details IS NOT NULL`,
    [id],
  );
  await tx.execute('DELETE FROM user_activity_events WHERE user_id = ?', [id]);
  if (await tableExists(tx, 'elevation_audit')) {
    await tx.execute('DELETE FROM elevation_audit WHERE user_type = ? AND user_id = ?', [
      userType,
      id,
    ]);
  }
}

/** Effacement d'un élève : voir `eraseAccountJournalTraces`. */
async function eraseStudentJournalTraces(tx, studentId) {
  await eraseAccountJournalTraces(tx, studentId, 'student');
}

module.exports = {
  domain: 'Identité — profils, jetons et journaux',
  product: 'foret',
  studentDelete: {
    order: 30,
    async run(tx, student) {
      await purgeStudentRbacAndTokens(tx, student.id);
      await eraseStudentJournalTraces(tx, student.id);
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
  eraseAccountJournalTraces,
  eraseStudentJournalTraces,
};
