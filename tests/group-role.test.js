require('./helpers/setup');
const test = require('node:test');
const assert = require('node:assert');
const crypto = require('node:crypto');
const { initSchema, queryOne, execute } = require('../database');
const {
  isN3beurGroup,
  resolveDefaultRoleForStudent,
  syncStudentRoleFromGroups,
} = require('../lib/groupRole');
const { getPrimaryRoleForUser } = require('../lib/rbac');

test.before(async () => {
  await initSchema();
});

async function createStudent(label) {
  const id = crypto.randomUUID();
  const unique = `${label}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  await execute(
    `INSERT INTO users
      (id, user_type, email, pseudo, first_name, last_name, display_name, affiliation, password_hash, auth_provider, is_active, created_at, updated_at)
     VALUES (?, 'student', ?, ?, ?, ?, ?, 'both', NULL, 'local', 1, NOW(), NOW())`,
    [id, `${unique}@example.com`, `grp_${unique}`, 'Test', label, `Test ${label}`],
  );
  await execute(
    `INSERT INTO user_roles (user_type, user_id, role_id, is_primary)
     SELECT 'student', ?, id, 1 FROM roles WHERE slug = 'visiteur' LIMIT 1`,
    [id],
  );
  return id;
}

async function createGroup({ slug, grantsN3beur = false, defaultRoleSlug = null }) {
  const id = crypto.randomUUID();
  let defaultRoleId = null;
  if (defaultRoleSlug) {
    const role = await queryOne('SELECT id FROM roles WHERE slug = ? LIMIT 1', [defaultRoleSlug]);
    defaultRoleId = role?.id ?? null;
  }
  await execute(
    `INSERT INTO \`groups\` (id, slug, name, kind, default_role_id, grants_n3beur_access, is_active, created_at, updated_at)
     VALUES (?, ?, ?, 'class', ?, ?, 1, NOW(), NOW())`,
    [id, slug, slug, defaultRoleId, grantsN3beur ? 1 : 0],
  );
  return id;
}

test('isN3beurGroup via flag ou profil eleve_*', () => {
  assert.strictEqual(isN3beurGroup({ grants_n3beur_access: 1 }), true);
  assert.strictEqual(isN3beurGroup({ default_role_slug: 'eleve_novice' }), true);
  assert.strictEqual(isN3beurGroup({ default_role_slug: 'visiteur' }), false);
});

test('élève sans groupe n3beur reste visiteur après sync', async () => {
  const studentId = await createStudent('visitor_only');
  const resolved = await resolveDefaultRoleForStudent(studentId);
  assert.strictEqual(resolved.roleSlug, 'visiteur');
  const sync = await syncStudentRoleFromGroups(studentId);
  assert.strictEqual(sync.changed, false);
  const primary = await getPrimaryRoleForUser('student', studentId);
  assert.strictEqual(primary.slug, 'visiteur');
});

test('membre groupe n3beur reçoit eleve_novice par défaut', async () => {
  const studentId = await createStudent('n3_member');
  const groupId = await createGroup({
    slug: `n3-${Date.now()}`,
    grantsN3beur: true,
  });
  await execute(
    `INSERT INTO group_members (group_id, user_id, user_type, role_in_group)
     VALUES (?, ?, 'student', 'member')`,
    [groupId, studentId],
  );
  const sync = await syncStudentRoleFromGroups(studentId);
  assert.strictEqual(sync.changed, true);
  const primary = await getPrimaryRoleForUser('student', studentId);
  assert.strictEqual(primary.slug, 'eleve_novice');
});

test('profil par défaut du groupe est appliqué en force', async () => {
  const studentId = await createStudent('forced_role');
  const groupId = await createGroup({
    slug: `forced-${Date.now()}`,
    grantsN3beur: true,
    defaultRoleSlug: 'eleve_avance',
  });
  await execute(
    `INSERT INTO group_members (group_id, user_id, user_type, role_in_group)
     VALUES (?, ?, 'student', 'member')`,
    [groupId, studentId],
  );
  const sync = await syncStudentRoleFromGroups(studentId, { force: true, groupId });
  assert.strictEqual(sync.changed, true);
  const primary = await getPrimaryRoleForUser('student', studentId);
  assert.strictEqual(primary.slug, 'eleve_avance');
});

test('profil par défaut dangereux ignoré lors de la synchronisation de groupe', async () => {
  const studentId = await createStudent('unsafe_default');
  const groupId = await createGroup({
    slug: `unsafe-default-${Date.now()}`,
    grantsN3beur: true,
    defaultRoleSlug: 'admin',
  });
  await execute(
    `INSERT INTO group_members (group_id, user_id, user_type, role_in_group)
     VALUES (?, ?, 'student', 'member')`,
    [groupId, studentId],
  );

  const sync = await syncStudentRoleFromGroups(studentId, { force: true, groupId });
  assert.strictEqual(sync.changed, true);
  const primary = await getPrimaryRoleForUser('student', studentId);
  assert.strictEqual(primary.slug, 'eleve_novice');
});
