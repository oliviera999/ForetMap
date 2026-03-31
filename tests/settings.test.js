require('./helpers/setup');
const test = require('node:test');
const assert = require('node:assert');
const request = require('supertest');
const { app } = require('../server');
const { initSchema, queryOne, execute } = require('../database');
const { signAuthToken } = require('../middleware/requireTeacher');

test.before(async () => {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      await initSchema();
      break;
    } catch (err) {
      if (err?.code !== 'ER_LOCK_DEADLOCK' || attempt === 4) throw err;
      await new Promise((resolve) => setTimeout(resolve, 150 * (attempt + 1)));
    }
  }
});

async function getAdminToken() {
  const email = process.env.TEACHER_ADMIN_EMAIL || 'admin.test@foretmap.local';
  const teacher = await queryOne(
    "SELECT id FROM users WHERE user_type = 'teacher' AND LOWER(email) = LOWER(?) LIMIT 1",
    [email]
  );
  const adminRole = await queryOne("SELECT id FROM roles WHERE slug = 'admin' LIMIT 1");
  assert.ok(teacher?.id, 'Compte admin enseignant introuvable');
  assert.ok(adminRole?.id, 'Rôle admin introuvable');
  const requiredPermissions = [
    'admin.settings.read', 'admin.settings.write', 'admin.settings.secrets.write',
    'admin.roles.manage', 'admin.users.assign_roles',
  ];
  for (const key of requiredPermissions) {
    await execute(
      'INSERT IGNORE INTO permissions (`key`, label, description) VALUES (?, ?, ?)',
      [key, key, 'Permission auto-seed tests']
    );
    await execute(
      'INSERT IGNORE INTO role_permissions (role_id, permission_key, requires_elevation) VALUES (?, ?, 1)',
      [adminRole.id, key]
    );
  }
  if (teacher?.id && adminRole?.id) {
    await execute('UPDATE user_roles SET is_primary = 0 WHERE user_type = ? AND user_id = ?', ['teacher', teacher.id]);
    await execute(
      'INSERT INTO user_roles (user_type, user_id, role_id, is_primary) VALUES (?, ?, ?, 1) ON DUPLICATE KEY UPDATE is_primary = 1',
      ['teacher', teacher.id, adminRole.id]
    );
  }
  return signAuthToken({
    userType: 'teacher',
    userId: teacher?.id || null,
    canonicalUserId: teacher?.id || null,
    roleId: adminRole?.id || null,
    roleSlug: 'admin',
    roleDisplayName: 'Administrateur',
    elevated: false,
  }, false);
}

test('GET /api/settings/public renvoie les réglages publics', async () => {
  const res = await request(app).get('/api/settings/public').expect(200);
  assert.ok(res.body?.settings);
  assert.strictEqual(typeof res.body.settings.ui?.auth?.allow_register, 'boolean');
  assert.strictEqual(typeof res.body.settings.ui?.auth?.allow_google_student, 'boolean');
  assert.strictEqual(typeof res.body.settings.ui?.modules?.forum_enabled, 'boolean');
  assert.strictEqual(typeof res.body.settings.ui?.modules?.context_comments_enabled, 'boolean');
  assert.strictEqual(typeof res.body.settings.content?.auth?.title, 'string');
  assert.strictEqual(typeof res.body.settings.content?.visit?.title, 'string');
  const uiMap = res.body.settings.ui?.map;
  assert.ok(uiMap);
  assert.strictEqual(uiMap.emoji_label_center_gap, 14);
  assert.strictEqual(uiMap.overlay_emoji_size_percent, 100);
  assert.strictEqual(uiMap.overlay_label_size_percent, 100);
});

test('PUT ui.map.emoji_label_center_gap valide et refuse hors plage', async () => {
  const token = await getAdminToken();
  await request(app)
    .put('/api/settings/admin/ui.map.emoji_label_center_gap')
    .set('Authorization', `Bearer ${token}`)
    .send({ value: 20 })
    .expect(200);
  const pub = await request(app).get('/api/settings/public').expect(200);
  assert.strictEqual(pub.body?.settings?.ui?.map?.emoji_label_center_gap, 20);
  const bad = await request(app)
    .put('/api/settings/admin/ui.map.emoji_label_center_gap')
    .set('Authorization', `Bearer ${token}`)
    .send({ value: 2 })
    .expect(400);
  assert.match(String(bad.body?.error || ''), /trop petite|min/i);
  await request(app)
    .put('/api/settings/admin/ui.map.emoji_label_center_gap')
    .set('Authorization', `Bearer ${token}`)
    .send({ value: 14 })
    .expect(200);
});

test('PUT /api/settings/admin/:key met à jour un réglage public', async () => {
  const token = await getAdminToken();
  await request(app)
    .put('/api/settings/admin/ui.auth.allow_register')
    .set('Authorization', `Bearer ${token}`)
    .send({ value: false })
    .expect(200);

  const pub = await request(app).get('/api/settings/public').expect(200);
  assert.strictEqual(pub.body?.settings?.ui?.auth?.allow_register, false);

  // Remise à la valeur par défaut pour isoler les autres tests.
  await request(app)
    .put('/api/settings/admin/ui.auth.allow_register')
    .set('Authorization', `Bearer ${token}`)
    .send({ value: true })
    .expect(200);
});

test('PUT /api/settings/admin/:key met à jour un contenu texte public', async () => {
  const token = await getAdminToken();
  const value = 'Titre dynamique de connexion';
  await request(app)
    .put('/api/settings/admin/content.auth.title')
    .set('Authorization', `Bearer ${token}`)
    .send({ value })
    .expect(200);

  const pub = await request(app).get('/api/settings/public').expect(200);
  assert.strictEqual(pub.body?.settings?.content?.auth?.title, value);

  await request(app)
    .put('/api/settings/admin/content.auth.title')
    .set('Authorization', `Bearer ${token}`)
    .send({ value: 'ForêtMap' })
    .expect(200);
});

test('PUT /api/settings/admin/:key refuse un contenu texte trop long', async () => {
  const token = await getAdminToken();
  const tooLong = 'x'.repeat(241); // maxLength content.about.help_body = 240
  const res = await request(app)
    .put('/api/settings/admin/content.about.help_body')
    .set('Authorization', `Bearer ${token}`)
    .send({ value: tooLong })
    .expect(400);
  assert.match(String(res.body?.error || ''), /Texte trop long/i);
});

test('RBAC refuse la rétrogradation du dernier administrateur', async () => {
  const token = await getAdminToken();
  const users = await request(app)
    .get('/api/rbac/users')
    .set('Authorization', `Bearer ${token}`)
    .expect(200);
  const loginEmail = String(process.env.TEACHER_ADMIN_EMAIL || 'admin.test@foretmap.local').trim().toLowerCase();
  const adminUser = (users.body || []).find(
    (u) => u.role_slug === 'admin' && String(u.email || '').trim().toLowerCase() === loginEmail
  );
  assert.ok(adminUser, 'Aucun utilisateur admin trouvé pour TEACHER_ADMIN_EMAIL');
  const prof = await queryOne('SELECT id FROM roles WHERE slug = ? LIMIT 1', ['prof']);
  assert.ok(prof?.id, 'Rôle prof introuvable');
  const adminCountRow = await queryOne(
    `SELECT COUNT(*) AS c
       FROM user_roles ur
       INNER JOIN roles r ON r.id = ur.role_id
      WHERE ur.is_primary = 1 AND ur.user_type = 'teacher' AND r.slug = 'admin'`
  );
  const adminCount = Number(adminCountRow?.c || 0);
  const expectedStatus = adminCount <= 1 ? 409 : 200;
  await request(app)
    .put(`/api/rbac/users/${adminUser.user_type}/${adminUser.id}/role`)
    .set('Authorization', `Bearer ${token}`)
    .send({ role_id: prof.id })
    .expect(expectedStatus);
});
