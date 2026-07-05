'use strict';

const assert = require('node:assert');
const { queryOne, execute } = require('../../database');
const { signAuthToken } = require('../../middleware/requireTeacher');

/** Permissions fréquemment requises par les tests API. */
const DEFAULT_TEST_ADMIN_PERMISSIONS = [
  'stats.read.all',
  'stats.export',
  'tasks.manage',
  'tasks.read.logs',
  'tasks.validate',
  'tasks.assign.group',
  'zones.manage',
  'visit.manage',
  'plants.manage',
  'admin.settings.read',
  'admin.settings.write',
  'admin.roles.manage',
  'admin.users.assign_roles',
  'admin.impersonate',
  'groups.read',
  'groups.manage',
  'task-projects.manage',
  'tutorials.manage',
];

/**
 * Réaligne le compte enseignant admin de test et retourne un JWT admin fiable.
 * @param {{ elevated?: boolean, extraPermissions?: string[] }} [options] `elevated` est accepté pour
 *   compatibilité d'appel mais ignoré : l'élévation par PIN a été supprimée (droits du rôle directs).
 */
async function ensureAdminTeacherAuthToken(options = {}) {
  const loginEmail = String(process.env.TEACHER_ADMIN_EMAIL || 'admin.test@foretmap.local').trim();
  const teacher = await queryOne(
    "SELECT id FROM users WHERE user_type = 'teacher' AND LOWER(email) = LOWER(?) LIMIT 1",
    [loginEmail],
  );
  const adminRole = await queryOne("SELECT id FROM roles WHERE slug = 'admin' LIMIT 1");
  assert.ok(teacher?.id, 'Compte admin enseignant introuvable');
  assert.ok(adminRole?.id, 'Rôle admin introuvable');

  const permissionKeys = [
    ...new Set([...DEFAULT_TEST_ADMIN_PERMISSIONS, ...(options.extraPermissions || [])]),
  ];

  for (const key of permissionKeys) {
    await execute('INSERT IGNORE INTO permissions (`key`, label, description) VALUES (?, ?, ?)', [
      key,
      key,
      'Permission auto-seed tests',
    ]);
    await execute('INSERT IGNORE INTO role_permissions (role_id, permission_key) VALUES (?, ?)', [
      adminRole.id,
      key,
    ]);
  }

  await execute('UPDATE user_roles SET is_primary = 0 WHERE user_type = ? AND user_id = ?', [
    'teacher',
    teacher.id,
  ]);
  await execute(
    'INSERT INTO user_roles (user_type, user_id, role_id, is_primary) VALUES (?, ?, ?, 1) ON DUPLICATE KEY UPDATE is_primary = 1',
    ['teacher', teacher.id, adminRole.id],
  );

  return signAuthToken({
    userType: 'teacher',
    userId: teacher.id,
    canonicalUserId: teacher.id,
    roleId: adminRole.id,
    roleSlug: 'admin',
    roleDisplayName: 'Administrateur',
  });
}

async function getAdminTeacherUserId() {
  const loginEmail = String(process.env.TEACHER_ADMIN_EMAIL || 'admin.test@foretmap.local').trim();
  const teacher = await queryOne(
    "SELECT id FROM users WHERE user_type = 'teacher' AND LOWER(email) = LOWER(?) LIMIT 1",
    [loginEmail],
  );
  assert.ok(teacher?.id, 'Compte admin enseignant introuvable');
  return teacher.id;
}

module.exports = {
  DEFAULT_TEST_ADMIN_PERMISSIONS,
  ensureAdminTeacherAuthToken,
  getAdminTeacherUserId,
};
