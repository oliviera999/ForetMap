'use strict';

const { v4: uuidv4 } = require('uuid');
const { queryOne, execute } = require('../../database');

/**
 * Helpers de rôle élève pour les tests.
 *
 * Contexte : depuis le modèle d'accès n3beur par groupes, `syncStudentRoleFromGroups`
 * (exécuté à l'inscription ET au login) démote tout élève qui n'appartient à aucun
 * **groupe n3beur** vers le profil `visiteur`. Affecter le rôle uniquement via
 * `user_roles` ne « tient » donc pas après un login : il faut aussi rattacher l'élève
 * à un groupe n3beur (`grants_n3beur_access = 1`, `default_role_id` = rôle visé).
 *
 * Ces helpers garantissent un élève dont le rôle `eleve_*` survit au login.
 */

const groupIdByRoleSlug = new Map();

/** Crée (ou réutilise) un groupe n3beur de test dont le rôle par défaut est `roleSlug`. */
async function ensureN3beurTestGroup(roleSlug = 'eleve_novice') {
  if (groupIdByRoleSlug.has(roleSlug)) return groupIdByRoleSlug.get(roleSlug);
  const role = await queryOne('SELECT id FROM roles WHERE slug = ? LIMIT 1', [roleSlug]);
  const slug = `test-n3beur-${roleSlug}`;
  let group = await queryOne('SELECT id FROM `groups` WHERE slug = ? LIMIT 1', [slug]);
  if (!group?.id) {
    const groupId = uuidv4();
    await execute(
      "INSERT INTO `groups` (id, slug, name, kind, default_role_id, grants_n3beur_access, is_active) VALUES (?, ?, ?, 'class', ?, 1, 1)",
      [groupId, slug, `Groupe test n3beur ${roleSlug}`, role?.id ?? null],
    );
    group = { id: groupId };
  }
  groupIdByRoleSlug.set(roleSlug, group.id);
  return group.id;
}

/** Rattache un élève à un groupe n3beur de test (idempotent). */
async function addStudentToN3beurTestGroup(studentId, roleSlug = 'eleve_novice') {
  const groupId = await ensureN3beurTestGroup(roleSlug);
  await execute(
    "INSERT IGNORE INTO group_members (group_id, user_id, user_type, role_in_group) VALUES (?, ?, 'student', 'member')",
    [groupId, studentId],
  );
  return groupId;
}

/**
 * Affecte le profil primaire d'un élève **et** garantit que ce rôle survit au login.
 * Pour un rôle `eleve_*`, l'élève est rattaché à un groupe n3beur de test (sinon le
 * `syncStudentRoleFromGroups` du login le redémoterait en `visiteur`).
 *
 * À appeler **avant** un éventuel re-login pour que le token porte le bon rôle.
 *
 * @param {string} studentId
 * @param {string} roleSlug
 * @returns {Promise<number>} l'id du rôle affecté
 */
async function setStudentPrimaryRole(studentId, roleSlug) {
  const role = await queryOne('SELECT id FROM roles WHERE slug = ? LIMIT 1', [roleSlug]);
  if (!role?.id) throw new Error(`Rôle introuvable: ${roleSlug}`);
  if (String(roleSlug).toLowerCase().startsWith('eleve_')) {
    await addStudentToN3beurTestGroup(studentId, roleSlug);
  }
  await execute(
    "UPDATE user_roles SET is_primary = 0 WHERE user_type = 'student' AND user_id = ?",
    [studentId],
  );
  await execute(
    "INSERT INTO user_roles (user_type, user_id, role_id, is_primary) VALUES ('student', ?, ?, 1) ON DUPLICATE KEY UPDATE is_primary = 1",
    [studentId, role.id],
  );
  return role.id;
}

module.exports = {
  ensureN3beurTestGroup,
  addStudentToN3beurTestGroup,
  setStudentPrimaryRole,
};
