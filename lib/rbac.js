const crypto = require('crypto');
const { queryAll, queryOne, execute } = require('../database');
const { canonicalFromEmail } = require('./identity');
const { getSettingValue } = require('./settings');

const SYSTEM_ROLES = [
  { slug: 'admin', display_name: 'Admin', rank: 500 },
  { slug: 'prof', display_name: 'Prof', rank: 400 },
  { slug: 'eleve_chevronne', display_name: 'Élève chevronné', rank: 300 },
  { slug: 'eleve_avance', display_name: 'Élève avancé', rank: 200 },
  { slug: 'eleve_novice', display_name: 'Élève novice', rank: 100 },
  { slug: 'visiteur', display_name: 'Visiteur', rank: 50 },
];

const PERMISSIONS = [
  ['teacher.access', 'Accès interface professeur', 'Permet d’ouvrir l’interface professeur'],
  ['admin.roles.manage', 'Gestion des profils RBAC', 'Créer/renommer profils, permissions et PIN'],
  ['admin.users.assign_roles', 'Attribution des profils', 'Attribuer/retraiter un profil aux utilisateurs'],
  ['users.create', 'Création unitaire utilisateurs', 'Créer un utilisateur unitaire (élève/prof/admin selon droits)'],
  ['admin.settings.read', 'Lecture paramètres admin', 'Consulter la console de réglages'],
  ['admin.settings.write', 'Édition paramètres admin', 'Modifier les réglages non secrets'],
  ['admin.settings.secrets.write', 'Actions admin critiques', 'Exécuter les actions critiques (restart, secrets)'],
  ['stats.read.all', 'Lecture stats globales', 'Consulter les stats de tous les élèves'],
  ['stats.export', 'Export stats', 'Exporter les stats élèves en CSV'],
  ['students.import', 'Import élèves', 'Importer des élèves via CSV/XLSX'],
  ['students.delete', 'Suppression élève', 'Supprimer un compte élève'],
  ['tasks.manage', 'Gestion tâches', 'Créer/éditer/supprimer les tâches'],
  ['tasks.validate', 'Validation tâches', 'Valider les tâches terminées'],
  ['tasks.propose', 'Proposition de tâches', 'Proposer de nouvelles tâches'],
  ['tasks.assign_self', 'Prise en charge tâche', 'S’assigner à une tâche'],
  ['tasks.unassign_self', 'Retrait de tâche', 'Se retirer d’une tâche'],
  ['tasks.done_self', 'Soumission de tâche', 'Marquer une tâche comme faite'],
  ['zones.manage', 'Gestion zones', 'Créer/éditer/supprimer zones et photos'],
  ['map.manage_markers', 'Gestion repères', 'Créer/éditer/supprimer repères'],
  ['plants.manage', 'Gestion biodiversité', 'Créer/éditer/supprimer/importer plantes'],
  ['tutorials.manage', 'Gestion tutoriels', 'Créer/éditer/supprimer tutoriels'],
  ['visit.manage', 'Gestion visite', 'Gérer la carte de visite publique'],
  ['audit.read', 'Lecture audit', 'Consulter le journal d’audit'],
  ['observations.read.all', 'Lecture observations globales', 'Consulter toutes les observations'],
];

const ROLE_PERMISSION_MATRIX = {
  admin: [
    ['teacher.access', 0], ['admin.roles.manage', 1], ['admin.users.assign_roles', 1],
    ['users.create', 1],
    ['admin.settings.read', 1], ['admin.settings.write', 1], ['admin.settings.secrets.write', 1],
    ['stats.read.all', 0], ['stats.export', 1], ['students.import', 1], ['students.delete', 1],
    ['tasks.manage', 1], ['tasks.validate', 1], ['tasks.propose', 0], ['tasks.assign_self', 0],
    ['tasks.unassign_self', 0], ['tasks.done_self', 0], ['zones.manage', 1], ['map.manage_markers', 1],
    ['plants.manage', 1], ['tutorials.manage', 1], ['visit.manage', 1], ['audit.read', 1], ['observations.read.all', 1],
  ],
  prof: [
    ['teacher.access', 0], ['stats.read.all', 0], ['stats.export', 1], ['students.import', 1], ['students.delete', 1],
    ['users.create', 1],
    ['tasks.manage', 1], ['tasks.validate', 1], ['tasks.propose', 0], ['tasks.assign_self', 0], ['tasks.unassign_self', 0],
    ['tasks.done_self', 0], ['zones.manage', 1], ['map.manage_markers', 1], ['plants.manage', 1],
    ['tutorials.manage', 1], ['visit.manage', 1], ['audit.read', 1], ['observations.read.all', 1],
  ],
  eleve_chevronne: [['tasks.propose', 1], ['tasks.assign_self', 0], ['tasks.unassign_self', 0], ['tasks.done_self', 0]],
  eleve_avance: [['tasks.propose', 0], ['tasks.assign_self', 0], ['tasks.unassign_self', 0], ['tasks.done_self', 0]],
  eleve_novice: [['tasks.assign_self', 0], ['tasks.unassign_self', 0], ['tasks.done_self', 0]],
  visiteur: [],
};

let bootstrapped = false;
const ADMIN_CANONICAL_LOGIN = String(process.env.ADMIN_CANONICAL_LOGIN || 'oliviera9').trim().toLowerCase();
const STUDENT_PROFILE_SLUGS = ['eleve_novice', 'eleve_avance', 'eleve_chevronne'];

function hashPin(pin) {
  return crypto.createHash('sha256').update(String(pin || '')).digest('hex');
}

function toPositiveInt(value, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  const i = Math.max(0, Math.floor(n));
  return i;
}

async function getStudentRoleThresholds() {
  const avanceRaw = await getSettingValue('progression.student_role_min_done_eleve_avance', 5);
  const chevronneRaw = await getSettingValue('progression.student_role_min_done_eleve_chevronne', 10);
  const eleveAvance = Math.max(1, toPositiveInt(avanceRaw, 5));
  const eleveChevronne = Math.max(eleveAvance + 1, toPositiveInt(chevronneRaw, 10));
  return {
    eleve_novice: 0,
    eleve_avance: eleveAvance,
    eleve_chevronne: eleveChevronne,
  };
}

function resolveStudentRoleSlugFromValidatedCount(validatedCount, thresholds) {
  const done = toPositiveInt(validatedCount, 0);
  if (done >= thresholds.eleve_chevronne) return 'eleve_chevronne';
  if (done >= thresholds.eleve_avance) return 'eleve_avance';
  return 'eleve_novice';
}

async function countValidatedAssignmentsForStudent(studentId) {
  const row = await queryOne(
    `SELECT COUNT(*) AS c
       FROM task_assignments ta
       INNER JOIN tasks t ON t.id = ta.task_id
       INNER JOIN users u ON u.id = ? AND u.user_type = 'student'
      WHERE t.status = 'validated'
        AND (
          ta.student_id = u.id
          OR (ta.student_first_name = u.first_name AND ta.student_last_name = u.last_name)
        )`,
    [studentId]
  );
  return toPositiveInt(row?.c, 0);
}

async function getStudentProgressionConfig() {
  const thresholds = await getStudentRoleThresholds();
  const placeholders = STUDENT_PROFILE_SLUGS.map(() => '?').join(',');
  const roles = await queryAll(
    `SELECT slug, display_name
       FROM roles
      WHERE slug IN (${placeholders})`,
    STUDENT_PROFILE_SLUGS
  );
  const labelBySlug = Object.fromEntries(roles.map((r) => [String(r.slug), String(r.display_name || r.slug)]));
  const steps = [
    { roleSlug: 'eleve_novice', min: thresholds.eleve_novice, label: labelBySlug.eleve_novice || 'Élève novice' },
    { roleSlug: 'eleve_avance', min: thresholds.eleve_avance, label: labelBySlug.eleve_avance || 'Élève avancé' },
    { roleSlug: 'eleve_chevronne', min: thresholds.eleve_chevronne, label: labelBySlug.eleve_chevronne || 'Élève chevronné' },
  ];
  return { thresholds, steps };
}

async function syncStudentPrimaryRoleFromProgress(studentId, doneCount = null, progressionConfig = null) {
  await ensureRbacBootstrap();
  const current = await getPrimaryRoleForUser('student', studentId);
  if (current && !STUDENT_PROFILE_SLUGS.includes(String(current.slug || '').toLowerCase())) {
    return {
      changed: false,
      currentRoleSlug: current.slug,
      currentRoleDisplayName: current.display_name,
      done: toPositiveInt(doneCount, 0),
      ...(progressionConfig || (await getStudentProgressionConfig())),
    };
  }
  const done = doneCount == null ? await countValidatedAssignmentsForStudent(studentId) : toPositiveInt(doneCount, 0);
  const config = progressionConfig || (await getStudentProgressionConfig());
  const targetSlug = resolveStudentRoleSlugFromValidatedCount(done, config.thresholds);
  const currentSlug = String(current?.slug || '').toLowerCase();
  if (currentSlug !== targetSlug) {
    const targetRole = await getRoleBySlug(targetSlug);
    if (targetRole?.id) {
      await setPrimaryRole('student', studentId, targetRole.id);
      return {
        changed: true,
        currentRoleSlug: targetSlug,
        currentRoleDisplayName: targetRole.display_name,
        done,
        ...config,
      };
    }
  }
  return {
    changed: false,
    currentRoleSlug: current?.slug || targetSlug,
    currentRoleDisplayName: current?.display_name || null,
    done,
    ...config,
  };
}

async function getRoleBySlug(slug) {
  return queryOne('SELECT * FROM roles WHERE slug = ? LIMIT 1', [slug]);
}

async function ensureDefaultRolesAndPermissions() {
  for (const role of SYSTEM_ROLES) {
    await execute(
      'INSERT IGNORE INTO roles (slug, display_name, rank, is_system) VALUES (?, ?, ?, 1)',
      [role.slug, role.display_name, role.rank]
    );
  }
  for (const [key, label, description] of PERMISSIONS) {
    await execute(
      'INSERT IGNORE INTO permissions (`key`, label, description) VALUES (?, ?, ?)',
      [key, label, description]
    );
  }
  for (const [roleSlug, entries] of Object.entries(ROLE_PERMISSION_MATRIX)) {
    const role = await getRoleBySlug(roleSlug);
    if (!role) continue;
    for (const [permissionKey, requiresElevation] of entries) {
      await execute(
        'INSERT IGNORE INTO role_permissions (role_id, permission_key, requires_elevation) VALUES (?, ?, ?)',
        [role.id, permissionKey, requiresElevation ? 1 : 0]
      );
    }
    await execute(
      'INSERT IGNORE INTO role_pin_secrets (role_id, pin_hash) VALUES (?, ?)',
      [role.id, hashPin('1234')]
    );
  }
}

async function ensureDefaultAssignments() {
  const profRole = await getRoleBySlug('prof');
  const adminRole = await getRoleBySlug('admin');
  const noviceRole = await getRoleBySlug('eleve_novice');
  if (!profRole || !noviceRole) return;

  const teachers = await queryAll("SELECT id, email FROM users WHERE user_type = 'teacher'");
  const adminEmail = (process.env.TEACHER_ADMIN_EMAIL || '').trim().toLowerCase();
  for (const t of teachers) {
    const email = String(t.email || '').trim().toLowerCase();
    const canonical = canonicalFromEmail(email);
    const isConfiguredAdmin = adminEmail && email === adminEmail;
    const isCanonicalAdmin = !!ADMIN_CANONICAL_LOGIN && canonical === ADMIN_CANONICAL_LOGIN;
    const targetRoleId = (isConfiguredAdmin || isCanonicalAdmin)
      ? (adminRole ? adminRole.id : profRole.id)
      : profRole.id;
    await execute(
      'INSERT IGNORE INTO user_roles (user_type, user_id, role_id, is_primary) VALUES (?, ?, ?, 1)',
      ['teacher', t.id, targetRoleId]
    );
    if (targetRoleId === (adminRole ? adminRole.id : null)) {
      await execute('UPDATE user_roles SET is_primary = CASE WHEN role_id = ? THEN 1 ELSE 0 END WHERE user_type = ? AND user_id = ?', [
        targetRoleId,
        'teacher',
        t.id,
      ]);
    }
  }

  const students = await queryAll("SELECT id FROM users WHERE user_type = 'student'");
  for (const s of students) {
    await execute(
      'INSERT IGNORE INTO user_roles (user_type, user_id, role_id, is_primary) VALUES (?, ?, ?, 1)',
      ['student', s.id, noviceRole.id]
    );
  }
}

async function ensureRbacBootstrap() {
  if (bootstrapped) return;
  await ensureDefaultRolesAndPermissions();
  await ensureDefaultAssignments();
  bootstrapped = true;
}

async function getPrimaryRoleForUser(userType, userId) {
  return queryOne(
    `SELECT r.id, r.slug, r.display_name, r.rank
       FROM user_roles ur
       INNER JOIN roles r ON r.id = ur.role_id
      WHERE ur.user_type = ? AND ur.user_id = ? AND ur.is_primary = 1
      ORDER BY ur.assigned_at ASC
      LIMIT 1`,
    [userType, userId]
  );
}

async function getRolePermissions(roleId) {
  return queryAll(
    `SELECT rp.permission_key, rp.requires_elevation
       FROM role_permissions rp
      WHERE rp.role_id = ?`,
    [roleId]
  );
}

async function buildAuthzPayload(userType, userId, elevated = false) {
  await ensureRbacBootstrap();
  const role = await getPrimaryRoleForUser(userType, userId);
  if (!role) return null;
  const rows = await getRolePermissions(role.id);
  const roleSlug = String(role.slug || '').toLowerCase();
  const hasNativePrivilegedRole = roleSlug === 'admin' || roleSlug === 'prof';
  const permissions = [];
  const elevatedPermissions = [];
  for (const row of rows) {
    const key = row.permission_key;
    const needsElevation = !!row.requires_elevation;
    if (!needsElevation || elevated || hasNativePrivilegedRole) permissions.push(key);
    if (needsElevation) elevatedPermissions.push(key);
  }
  return {
    roleId: role.id,
    roleSlug: role.slug,
    roleDisplayName: role.display_name,
    roleRank: role.rank,
    permissions,
    elevatedPermissions,
  };
}

async function verifyRolePin(roleId, pin) {
  const row = await queryOne('SELECT pin_hash FROM role_pin_secrets WHERE role_id = ? LIMIT 1', [roleId]);
  if (!row) return false;
  return hashPin(pin) === row.pin_hash;
}

async function ensurePrimaryRole(userType, userId, preferredRoleSlug) {
  await ensureRbacBootstrap();
  const existing = await getPrimaryRoleForUser(userType, userId);
  if (existing) return existing;
  const role = await getRoleBySlug(preferredRoleSlug);
  if (!role) return null;
  await execute(
    'INSERT IGNORE INTO user_roles (user_type, user_id, role_id, is_primary) VALUES (?, ?, ?, 1)',
    [userType, userId, role.id]
  );
  return getPrimaryRoleForUser(userType, userId);
}

async function setPrimaryRole(userType, userId, roleId) {
  await execute('UPDATE user_roles SET is_primary = 0 WHERE user_type = ? AND user_id = ?', [userType, userId]);
  await execute(
    'INSERT INTO user_roles (user_type, user_id, role_id, is_primary) VALUES (?, ?, ?, 1) ON DUPLICATE KEY UPDATE is_primary = 1',
    [userType, userId, roleId]
  );
}

async function checkCriticalAdminAccount() {
  await ensureRbacBootstrap();
  const adminRole = await getRoleBySlug('admin');
  if (!adminRole) return { ok: false, reason: 'admin_role_missing' };
  const adminEmail = String(process.env.TEACHER_ADMIN_EMAIL || '').trim().toLowerCase();
  const rows = await queryAll("SELECT id, email FROM users WHERE user_type = 'teacher'");
  const candidates = rows.filter((t) => {
    const email = String(t.email || '').trim().toLowerCase();
    const canonical = canonicalFromEmail(email);
    if (adminEmail && email === adminEmail) return true;
    if (ADMIN_CANONICAL_LOGIN && canonical === ADMIN_CANONICAL_LOGIN) return true;
    return false;
  });
  if (!candidates.length) return { ok: false, reason: 'admin_teacher_not_found' };
  for (const teacher of candidates) {
    const role = await getPrimaryRoleForUser('teacher', teacher.id);
    if (role?.slug === 'admin') return { ok: true, teacherId: teacher.id, email: teacher.email };
  }
  return { ok: false, reason: 'admin_role_not_assigned', candidates: candidates.map((c) => c.email) };
}

module.exports = {
  PERMISSIONS,
  ROLE_PERMISSION_MATRIX,
  ensureRbacBootstrap,
  buildAuthzPayload,
  getPrimaryRoleForUser,
  getRolePermissions,
  verifyRolePin,
  hashPin,
  ensurePrimaryRole,
  setPrimaryRole,
  checkCriticalAdminAccount,
  getStudentRoleThresholds,
  resolveStudentRoleSlugFromValidatedCount,
  getStudentProgressionConfig,
  syncStudentPrimaryRoleFromProgress,
};
