'use strict';

/**
 * Guide du prof : seul document de référence ForetMap ouvert aux n3boss
 * (`reference_docs.teacher_guide.read`) ; le reste demeure sous `admin.settings.read`.
 */

require('./helpers/setup');
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const request = require('supertest');

const { app } = require('../server');
const { initSchema, queryOne, execute } = require('../database');
const { signAuthToken } = require('../middleware/requireTeacher');
const { ROLE_PERMISSION_MATRIX } = require('../lib/rbac');
const {
  TEACHER_GUIDE_SLUGS,
  referenceDocsScopeFor,
  listReferenceDocs,
  getReferenceDoc,
} = require('../lib/foretmapReferenceDocs');
const { ensureAdminTeacherAuthToken } = require('./helpers/adminAuth');

const createdUserIds = [];

async function tokenForRole(roleSlug, userType = 'teacher') {
  const role = await queryOne('SELECT id, display_name FROM roles WHERE slug = ? LIMIT 1', [
    roleSlug,
  ]);
  assert.ok(role?.id, `rôle ${roleSlug} introuvable`);
  const id = crypto.randomUUID();
  const unique = `${roleSlug}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  await execute(
    `INSERT INTO users
      (id, user_type, assigned_role_id, email, pseudo, first_name, last_name, display_name,
       password_hash, auth_provider, is_active, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, 'Guide', ?, ?, NULL, 'local', 1, NOW(), NOW())`,
    [id, userType, role.id, `${unique}@example.com`, `gp_${unique}`, roleSlug, `Guide ${roleSlug}`],
  );
  await execute(
    'INSERT INTO user_roles (user_type, user_id, role_id, is_primary) VALUES (?, ?, ?, 1)',
    [userType, id, role.id],
  );
  createdUserIds.push(id);
  return signAuthToken({
    userType,
    userId: id,
    canonicalUserId: id,
    roleId: role.id,
    roleSlug,
    roleDisplayName: role.display_name,
  });
}

test.before(async () => {
  await initSchema();
});

test.after(async () => {
  for (const id of createdUserIds) {
    await execute('DELETE FROM user_roles WHERE user_id = ?', [id]);
    await execute('DELETE FROM users WHERE id = ?', [id]);
  }
});

test('matrice : n3boss et admin lisent le guide, pas le prof de classe ni les élèves', () => {
  assert.ok(ROLE_PERMISSION_MATRIX.prof.includes('reference_docs.teacher_guide.read'));
  assert.ok(ROLE_PERMISSION_MATRIX.admin.includes('reference_docs.teacher_guide.read'));
  for (const slug of ['prof_classe', 'eleve_novice', 'eleve_avance', 'eleve_chevronne']) {
    assert.ok(!ROLE_PERMISSION_MATRIX[slug].includes('reference_docs.teacher_guide.read'), slug);
  }
});

test('périmètre : tout pour la lecture des réglages, le guide seul sinon', () => {
  assert.equal(
    referenceDocsScopeFor((k) => k === 'admin.settings.read'),
    'all',
  );
  assert.equal(
    referenceDocsScopeFor((k) => k === 'reference_docs.teacher_guide.read'),
    'teacher',
  );
  assert.equal(
    referenceDocsScopeFor(() => false),
    null,
  );

  const teacherSlugs = listReferenceDocs({ scope: 'teacher' }).map((d) => d.slug);
  assert.deepEqual(teacherSlugs, [...TEACHER_GUIDE_SLUGS]);
  assert.equal(getReferenceDoc('presentation', { scope: 'teacher' }), null);
  assert.ok(getReferenceDoc('guide-du-prof', { scope: 'teacher' })?.bodyMarkdown);
  const allSlugs = listReferenceDocs().map((d) => d.slug);
  assert.ok(allSlugs.includes('presentation'));
  assert.ok(allSlugs.includes('guide-du-prof'));
});

test('HTTP : un n3boss ne voit que le guide du prof', async () => {
  // Base de test partagée : d'autres suites ont pu accorder `admin.settings.read` au profil
  // `prof`. On revient le temps du test à la matrice par défaut, puis on restaure.
  const prof = await queryOne("SELECT id FROM roles WHERE slug = 'prof' LIMIT 1");
  const hadSettingsRead = await queryOne(
    "SELECT 1 AS ok FROM role_permissions WHERE role_id = ? AND permission_key = 'admin.settings.read'",
    [prof.id],
  );
  await execute(
    "DELETE FROM role_permissions WHERE role_id = ? AND permission_key = 'admin.settings.read'",
    [prof.id],
  );
  await execute(
    "INSERT IGNORE INTO role_permissions (role_id, permission_key) VALUES (?, 'reference_docs.teacher_guide.read')",
    [prof.id],
  );
  try {
    const token = await tokenForRole('prof');
    const list = await request(app)
      .get('/api/admin/reference-docs')
      .set('Authorization', `Bearer ${token}`);
    assert.equal(list.status, 200);
    assert.deepEqual(
      list.body.docs.map((d) => d.slug),
      ['guide-du-prof'],
    );

    const guide = await request(app)
      .get('/api/admin/reference-docs/guide-du-prof')
      .set('Authorization', `Bearer ${token}`);
    assert.equal(guide.status, 200);
    assert.ok(guide.body.doc.bodyMarkdown.length > 0);

    const other = await request(app)
      .get('/api/admin/reference-docs/presentation')
      .set('Authorization', `Bearer ${token}`);
    assert.equal(other.status, 404);
  } finally {
    if (hadSettingsRead) {
      await execute(
        "INSERT IGNORE INTO role_permissions (role_id, permission_key) VALUES (?, 'admin.settings.read')",
        [prof.id],
      );
    }
  }
});

test('HTTP : un prof de classe et un anonyme sont refusés', async () => {
  const token = await tokenForRole('prof_classe');
  const res = await request(app)
    .get('/api/admin/reference-docs')
    .set('Authorization', `Bearer ${token}`);
  assert.equal(res.status, 403);

  const anon = await request(app).get('/api/admin/reference-docs');
  assert.equal(anon.status, 401);
});

test('HTTP : un administrateur voit tout le sommaire', async () => {
  const token = await ensureAdminTeacherAuthToken();
  const res = await request(app)
    .get('/api/admin/reference-docs')
    .set('Authorization', `Bearer ${token}`);
  assert.equal(res.status, 200);
  const slugs = res.body.docs.map((d) => d.slug);
  assert.ok(slugs.includes('presentation'));
  assert.ok(slugs.includes('guide-du-prof'));
});
