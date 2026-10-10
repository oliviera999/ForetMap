'use strict';

/**
 * Suppression d'un compte de PERSONNEL (`users.user_type = 'teacher'`) — point d'entrée unique
 * de la route `DELETE /api/rbac/users/teacher/:userId` et de la purge planifiée
 * (`lib/retention/categories/staff.js`).
 *
 * Les contenus créés restent (les clés étrangères passent à NULL, les journaux gardent
 * l'identifiant) ; le compte, ses jetons de réinitialisation, l'IP et le navigateur de ses
 * événements de sécurité, les libellés d'audit qui le nomment et son avatar disparaissent
 * (mêmes règles que l'effacement d'un élève, `eraseAccountJournalTraces`).
 *
 * Jamais le dernier administrateur actif. `allowAdmin: false` (purge planifiée) refuse tout
 * compte administrateur.
 */

const { queryOne, withTransaction } = require('../database');
const { getPrimaryRoleForUser } = require('./rbac');
const { countPrimaryAdmins } = require('./rbacRoleAssignment');
const { eraseAccountJournalTraces } = require('./accounts/identityAccountCleaners');
const { deleteFile } = require('./uploads');

/**
 * @param {string} userId
 * @param {{ allowAdmin?: boolean }} [options]
 * @returns {Promise<{ ok: true, teacherId: string } |
 *   { ok: false, reason: 'missing_id'|'not_found'|'admin'|'last_admin' }>}
 */
async function deleteTeacherById(userId, { allowAdmin = true } = {}) {
  const id = String(userId || '').trim();
  if (!id) return { ok: false, reason: 'missing_id' };
  const teacher = await queryOne(
    "SELECT id, avatar_path FROM users WHERE id = ? AND user_type = 'teacher' LIMIT 1",
    [id],
  );
  if (!teacher) return { ok: false, reason: 'not_found' };
  const role = await getPrimaryRoleForUser('teacher', id);
  if (role?.slug === 'admin') {
    if (!allowAdmin) return { ok: false, reason: 'admin' };
    if ((await countPrimaryAdmins()) <= 1) return { ok: false, reason: 'last_admin' };
  }
  await withTransaction(async (tx) => {
    await tx.execute('DELETE FROM password_reset_tokens WHERE user_id = ?', [id]);
    // IP et navigateur de ses événements de sécurité, libellés d'audit qui le nomment —
    // mêmes règles que l'effacement d'un élève.
    await eraseAccountJournalTraces(tx, id, 'teacher');
    await tx.execute("DELETE FROM users WHERE id = ? AND user_type = 'teacher'", [id]);
  });
  // Avatar : supprimé du disque après validation (il restait servi sous /uploads).
  if (teacher.avatar_path) deleteFile(teacher.avatar_path);
  return { ok: true, teacherId: id };
}

module.exports = { deleteTeacherById };
