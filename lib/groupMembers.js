'use strict';

/**
 * Rattachement unitaire d'un compte à un groupe — partagé par l'inscription avec code de
 * classe (routes/auth.js), le rattachement côté prof (routes/groups.js, routes/rbac.js),
 * l'import de fichier (lib/groupImport.js) et le pont Gnomes & Licornes. Idempotent, puis
 * recalcul du profil effectif (`lib/effectiveRole.js`) : le profil par défaut du groupe
 * s'applique s'il est plus élevé que le profil attribué.
 */
const { queryOne, execute } = require('../database');
const { recomputeUserRole } = require('./effectiveRole');

/**
 * Ajoute un compte (élève ou enseignant) à un groupe actif puis recalcule son profil.
 * @returns {Promise<{ok: true, group: object, role: object}|{ok: false, status: number, error: string}>}
 */
async function addUserToGroup(userId, groupId) {
  const user = await queryOne(
    "SELECT id, user_type FROM users WHERE id = ? AND user_type IN ('student', 'teacher') LIMIT 1",
    [String(userId || '').trim()],
  );
  if (!user) return { ok: false, status: 404, error: 'Compte introuvable' };
  const group = await queryOne(
    'SELECT id, name, default_role_id, force_default_role FROM `groups` WHERE id = ? AND is_active = 1 LIMIT 1',
    [String(groupId || '').trim()],
  );
  if (!group) return { ok: false, status: 404, error: 'Groupe introuvable ou inactif' };
  await execute(
    `INSERT INTO group_members (group_id, user_id, user_type)
     VALUES (?, ?, ?)
     ON DUPLICATE KEY UPDATE user_type = VALUES(user_type)`,
    [group.id, user.id, user.user_type],
  );
  const role = await recomputeUserRole(user.id);
  return { ok: true, group, role };
}

/** Compatibilité d'appel : n'accepte qu'un compte élève. */
async function addStudentToGroup(userId, groupId) {
  const student = await queryOne(
    "SELECT id FROM users WHERE user_type = 'student' AND id = ? LIMIT 1",
    [String(userId || '').trim()],
  );
  if (!student) return { ok: false, status: 404, error: 'Élève introuvable' };
  return addUserToGroup(student.id, groupId);
}

/** Retire un compte d'un groupe puis recalcule son profil. */
async function removeUserFromGroup(userId, groupId) {
  const member = await queryOne(
    'SELECT user_type FROM group_members WHERE group_id = ? AND user_id = ? LIMIT 1',
    [String(groupId || '').trim(), String(userId || '').trim()],
  );
  if (!member) return { ok: false, status: 404, error: 'Rattachement introuvable' };
  await execute('DELETE FROM group_members WHERE group_id = ? AND user_id = ?', [
    String(groupId).trim(),
    String(userId).trim(),
  ]);
  const role = await recomputeUserRole(userId);
  return { ok: true, role };
}

module.exports = { addUserToGroup, addStudentToGroup, removeUserFromGroup };
