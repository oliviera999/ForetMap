'use strict';

const crypto = require('node:crypto');
const { queryOne, execute } = require('../../database');
const { setAssignedRole } = require('../../lib/effectiveRole');

/**
 * Helpers de rôle élève pour les tests.
 *
 * Depuis la politique « le plus élevé l'emporte » (migration 267), un profil **attribué**
 * (`users.assigned_role_id`) survit à la connexion : le recalcul du profil effectif ne peut
 * que le relever (groupe conférant davantage), jamais l'abaisser. Les helpers passent donc
 * par `setAssignedRole`, comme la console. Le groupe n3beur de test reste disponible pour
 * les scénarios qui veulent explicitement un profil **conféré par un groupe**.
 */

const groupIdByRoleSlug = new Map();

/** Crée (ou réutilise) un groupe de test dont le profil par défaut est `roleSlug`. */
async function ensureN3beurTestGroup(roleSlug = 'eleve_novice') {
  if (groupIdByRoleSlug.has(roleSlug)) return groupIdByRoleSlug.get(roleSlug);
  const role = await queryOne('SELECT id FROM roles WHERE slug = ? LIMIT 1', [roleSlug]);
  const slug = `test-n3beur-${roleSlug}`;
  let group = await queryOne('SELECT id FROM `groups` WHERE slug = ? LIMIT 1', [slug]);
  if (!group?.id) {
    const groupId = crypto.randomUUID();
    await execute(
      "INSERT INTO `groups` (id, slug, name, kind, default_role_id, is_active) VALUES (?, ?, ?, 'class', ?, 1)",
      [groupId, slug, `Groupe test n3beur ${roleSlug}`, role?.id ?? null],
    );
    group = { id: groupId };
  }
  groupIdByRoleSlug.set(roleSlug, group.id);
  return group.id;
}

/** Rattache un élève à un groupe n3beur de test (idempotent) et recalcule son profil. */
async function addStudentToN3beurTestGroup(studentId, roleSlug = 'eleve_novice') {
  const groupId = await ensureN3beurTestGroup(roleSlug);
  await execute(
    "INSERT IGNORE INTO group_members (group_id, user_id, user_type) VALUES (?, ?, 'student')",
    [groupId, studentId],
  );
  const { recomputeUserRole } = require('../../lib/effectiveRole');
  await recomputeUserRole(studentId);
  return groupId;
}

/**
 * Pose le profil **attribué** d'un élève et recalcule son profil effectif.
 * @param {string} studentId
 * @param {string} roleSlug
 * @returns {Promise<number>} l'id du rôle affecté
 */
async function setStudentPrimaryRole(studentId, roleSlug) {
  const role = await queryOne('SELECT id FROM roles WHERE slug = ? LIMIT 1', [roleSlug]);
  if (!role?.id) throw new Error(`Rôle introuvable: ${roleSlug}`);
  // Un palier n3beur va avec un groupe de classe (forum, périmètre, code de classe) : on
  // rattache l'élève au groupe de test correspondant, comme le ferait un professeur.
  if (String(roleSlug).toLowerCase().startsWith('eleve_')) {
    await addStudentToN3beurTestGroup(studentId, roleSlug);
  }
  await setAssignedRole(studentId, role.id);
  return role.id;
}

module.exports = {
  ensureN3beurTestGroup,
  addStudentToN3beurTestGroup,
  setStudentPrimaryRole,
};
