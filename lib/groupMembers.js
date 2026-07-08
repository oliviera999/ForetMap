'use strict';

// F2 — rattachement unitaire d'un élève à un groupe, partagé entre l'inscription
// avec code de classe (routes/auth.js) et le rattachement en un clic côté prof
// (routes/groups.js). Idempotent, puis recalcul du rôle (promotion visiteur → n3beur
// si le groupe la confère, cf. lib/groupRole.js).
const { queryOne, execute } = require('../database');
const { syncStudentRoleFromGroups } = require('./groupRole');

/**
 * Ajoute un élève à un groupe actif puis synchronise son rôle.
 * @returns {{ok: true, group: object}|{ok: false, status: number, error: string}}
 */
async function addStudentToGroup(userId, groupId, { roleInGroup = 'member' } = {}) {
  const student = await queryOne(
    "SELECT id FROM users WHERE user_type = 'student' AND id = ? LIMIT 1",
    [userId],
  );
  if (!student) return { ok: false, status: 404, error: 'Élève introuvable' };
  const group = await queryOne(
    'SELECT id, name, grants_n3beur_access, default_role_id FROM `groups` WHERE id = ? AND is_active = 1 LIMIT 1',
    [groupId],
  );
  if (!group) return { ok: false, status: 404, error: 'Groupe introuvable ou inactif' };
  await execute(
    `INSERT INTO group_members (group_id, user_id, user_type, role_in_group)
     VALUES (?, ?, 'student', ?)
     ON DUPLICATE KEY UPDATE role_in_group = role_in_group`,
    [group.id, String(userId), roleInGroup],
  );
  await syncStudentRoleFromGroups(String(userId), { groupId: group.id });
  return { ok: true, group };
}

module.exports = { addStudentToGroup };
