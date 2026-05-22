require('./helpers/setup');
const test = require('node:test');
const assert = require('node:assert');
const jwt = require('jsonwebtoken');
const request = require('supertest');
const { app } = require('../server');
const { initSchema, queryOne, execute } = require('../database');
const { signAuthToken } = require('../middleware/requireTeacher');
const { setSetting, resolveDefaultMapId } = require('../lib/settings');

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
  return await signAuthToken({
    userType: 'teacher',
    userId: teacher?.id || null,
    canonicalUserId: teacher?.id || null,
    roleId: adminRole?.id || null,
    roleSlug: 'admin',
    roleDisplayName: 'Administrateur',
    elevated: false,
  }, false);
}

const TINY_PNG_DATA_URL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO6pJkQAAAAASUVORK5CYII=';

test('POST /api/settings/admin/maps crée une carte puis GET /api/maps la liste', async () => {
  const token = await getAdminToken();
  const id = `tst_${Date.now()}`.slice(0, 31);
  await request(app)
    .post('/api/settings/admin/maps')
    .set('Authorization', `Bearer ${token}`)
    .send({ id, label: 'Plan test API', sort_order: 90, map_image_url: '/map.png', is_active: true })
    .expect(201);
  const list = await request(app).get('/api/maps').expect(200);
  assert.ok(Array.isArray(list.body));
  assert.ok(list.body.some((m) => m.id === id));
  const dup = await request(app)
    .post('/api/settings/admin/maps')
    .set('Authorization', `Bearer ${token}`)
    .send({ id, label: 'Doublon', sort_order: 91 })
    .expect(409);
  assert.ok(String(dup.body?.error || '').length > 0);
  await execute('DELETE FROM maps WHERE id = ?', [id]);
});

test('media-library admin: upload, liste et suppression', async () => {
  const token = await getAdminToken();

  const created = await request(app)
    .post('/api/settings/admin/media-library')
    .set('Authorization', `Bearer ${token}`)
    .send({ media_data: TINY_PNG_DATA_URL })
    .expect(201);
  assert.ok(String(created.body?.url || '').startsWith('/uploads/media-library/'));
  assert.strictEqual(created.body?.mediaType, 'image');

  const listed = await request(app)
    .get('/api/settings/admin/media-library')
    .set('Authorization', `Bearer ${token}`)
    .expect(200);
  assert.ok(Array.isArray(listed.body?.items));
  assert.ok(listed.body.items.some((item) => item.relativePath === created.body.relativePath));

  await request(app)
    .delete('/api/settings/admin/media-library')
    .set('Authorization', `Bearer ${token}`)
    .send({ relative_path: created.body.relativePath })
    .expect(200);
});

test('resolveDefaultMapId ignore une carte par défaut inactive', async () => {
  const inactiveMapId = `inactive_${Date.now()}`.slice(0, 31);
  const activeMapId = `active_${Date.now()}`.slice(0, 31);
  await execute(
    'INSERT INTO maps (id, label, map_image_url, sort_order, is_active) VALUES (?, ?, ?, ?, ?), (?, ?, ?, ?, ?)',
    [inactiveMapId, 'Inactive', '/map.png', 0, 0, activeMapId, 'Active', '/map.png', 1, 1]
  );
  await setSetting('ui.map.default_map_visit', inactiveMapId, { userType: 'teacher', userId: 'test-suite' });

  const resolved = await resolveDefaultMapId('visit');

  assert.notStrictEqual(resolved, inactiveMapId);
  const resolvedRow = await queryOne('SELECT id, is_active FROM maps WHERE id = ? LIMIT 1', [resolved]);
  assert.ok(resolvedRow?.id, 'Une carte résolue doit exister');
  assert.strictEqual(Number(resolvedRow.is_active || 0), 1, 'La carte résolue doit être active');

  await setSetting('ui.map.default_map_visit', 'foret', { userType: 'teacher', userId: 'test-suite' });
  await execute('DELETE FROM maps WHERE id IN (?, ?)', [inactiveMapId, activeMapId]);
});

test('GET /api/settings/public renvoie les réglages publics', async () => {
  const res = await request(app).get('/api/settings/public').expect(200);
  assert.ok(res.body?.settings);
  assert.strictEqual(typeof res.body.settings.ui?.auth?.allow_register, 'boolean');
  assert.strictEqual(typeof res.body.settings.ui?.auth?.allow_google_student, 'boolean');
  assert.strictEqual(typeof res.body.settings.ui?.modules?.forum_enabled, 'boolean');
  assert.strictEqual(typeof res.body.settings.ui?.modules?.context_comments_enabled, 'boolean');
  assert.strictEqual(typeof res.body.settings.ui?.help?.show_context_hints, 'boolean');
  assert.strictEqual(typeof res.body.settings.ui?.help?.pulse_unseen_panels, 'boolean');
  assert.strictEqual(typeof res.body.settings.content?.auth?.title, 'string');
  assert.strictEqual(typeof res.body.settings.content?.visit?.title, 'string');
  assert.strictEqual(typeof res.body.settings.content?.help?.hint_prefix, 'string');
  assert.strictEqual(typeof res.body.settings.content?.help?.panel_title_prefix, 'string');
  assert.strictEqual(typeof res.body.settings.content?.help?.panel_close_cta, 'string');
  assert.strictEqual(typeof res.body.settings.content?.help?.panel_dismiss_cta, 'string');
  assert.strictEqual(typeof res.body.settings.content?.help?.map_quick_tip, 'string');
  assert.strictEqual(typeof res.body.settings.content?.help?.tasks_quick_tip, 'string');
  assert.strictEqual(typeof res.body.settings.content?.help?.visit_quick_tip, 'string');
  const uiMap = res.body.settings.ui?.map;
  assert.ok(uiMap);
  assert.strictEqual(uiMap.emoji_label_center_gap, 14);
  assert.strictEqual(uiMap.overlay_emoji_size_percent, 100);
  assert.strictEqual(uiMap.overlay_label_size_percent, 100);
  assert.ok(Array.isArray(res.body.settings.ui?.visit?.mascot?.allowed_ids));
  assert.strictEqual(typeof res.body.settings.ui?.visit?.mascot?.default_id, 'string');
});

test('réglages mascotte visite : liste autorisée + défaut global normalisés', async () => {
  const token = await getAdminToken();
  const allowedIds = 'renard2-cut-spritesheet,sprout-rive';
  await request(app)
    .put('/api/settings/admin/ui.visit.mascot.allowed_ids')
    .set('Authorization', `Bearer ${token}`)
    .send({ value: allowedIds })
    .expect(200);
  await request(app)
    .put('/api/settings/admin/ui.visit.mascot.default_id')
    .set('Authorization', `Bearer ${token}`)
    .send({ value: 'sprout-rive' })
    .expect(200);

  const pub = await request(app).get('/api/settings/public').expect(200);
  assert.deepStrictEqual(pub.body?.settings?.ui?.visit?.mascot?.allowed_ids, ['renard2-cut-spritesheet', 'sprout-rive']);
  assert.strictEqual(pub.body?.settings?.ui?.visit?.mascot?.default_id, 'sprout-rive');

  await request(app)
    .put('/api/settings/admin/ui.visit.mascot.default_id')
    .set('Authorization', `Bearer ${token}`)
    .send({ value: 'inconnue' })
    .expect(200);
  const normalized = await request(app).get('/api/settings/public').expect(200);
  assert.strictEqual(normalized.body?.settings?.ui?.visit?.mascot?.default_id, 'renard2-cut-spritesheet');

  await request(app)
    .put('/api/settings/admin/ui.visit.mascot.allowed_ids')
    .set('Authorization', `Bearer ${token}`)
    .send({
      value: [
        'sprout-rive',
        'scrap-rive',
        'gnome-foret-rive',
        'gnome-ambre-rive',
        'gnome-punk-rive',
        'spore-rive',
        'vine-rive',
        'moss-rive',
        'seed-rive',
        'swarm-rive',
        'sprite-template',
        'olu-spritesheet',
        'tan-bird-spritesheet',
        'fox-backpack-spritesheet',
        'renard2-cut-spritesheet',
      ].join(','),
    })
    .expect(200);
  await request(app)
    .put('/api/settings/admin/ui.visit.mascot.default_id')
    .set('Authorization', `Bearer ${token}`)
    .send({ value: 'renard2-cut-spritesheet' })
    .expect(200);
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

test('PUT /api/settings/admin/:key met à jour les libellés d aide contextuelle', async () => {
  const token = await getAdminToken();
  const nextClose = 'Fermer le panneau';
  await request(app)
    .put('/api/settings/admin/content.help.panel_close_cta')
    .set('Authorization', `Bearer ${token}`)
    .send({ value: nextClose })
    .expect(200);
  const pub = await request(app).get('/api/settings/public').expect(200);
  assert.strictEqual(pub.body?.settings?.content?.help?.panel_close_cta, nextClose);
  await request(app)
    .put('/api/settings/admin/content.help.panel_close_cta')
    .set('Authorization', `Bearer ${token}`)
    .send({ value: 'Fermer' })
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

test('PUT /api/settings/admin/:key refuse un préfixe aide trop long', async () => {
  const token = await getAdminToken();
  const res = await request(app)
    .put('/api/settings/admin/content.help.panel_title_prefix')
    .set('Authorization', `Bearer ${token}`)
    .send({ value: '123456789' })
    .expect(400);
  assert.match(String(res.body?.error || ''), /Texte trop long/i);
});

test('security.jwt_ttl_base_seconds pilote la durée du JWT à l’émission', async () => {
  const token = await getAdminToken();
  await request(app)
    .put('/api/settings/admin/security.jwt_ttl_base_seconds')
    .set('Authorization', `Bearer ${token}`)
    .send({ value: 3600 })
    .expect(200);
  const issued = await signAuthToken(
    {
      userType: 'teacher',
      userId: 'ttl-test-user',
      canonicalUserId: 'ttl-test-user',
      roleId: 1,
      roleSlug: 'prof',
      roleDisplayName: 'Test',
      elevated: false,
    },
    false
  );
  const dec = jwt.decode(issued);
  assert.ok(dec?.iat && dec?.exp, 'JWT décodable avec iat/exp');
  const span = dec.exp - dec.iat;
  assert.ok(span >= 3580 && span <= 3620, `TTL attendu ~3600 s, obtenu ${span}`);
  await request(app)
    .put('/api/settings/admin/security.jwt_ttl_base_seconds')
    .set('Authorization', `Bearer ${token}`)
    .send({ value: 5400 })
    .expect(200);
});

test('GET /api/settings/admin/system/species-autofill-providers-test renvoie le détail plantnet et openai', async () => {
  const token = await getAdminToken();
  const res = await request(app)
    .get('/api/settings/admin/system/species-autofill-providers-test')
    .set('Authorization', `Bearer ${token}`)
    .expect(200);
  assert.strictEqual(typeof res.body.ok, 'boolean');
  assert.ok(res.body.plantnet && typeof res.body.plantnet === 'object');
  assert.ok(res.body.openai && typeof res.body.openai === 'object');
  assert.ok('keyPresent' in res.body.plantnet);
  assert.ok('configuredForAutofill' in res.body.plantnet);
  assert.ok('keyPresent' in res.body.openai);
});

test('GET /api/settings/admin/system/diagnostics renvoie un snapshot runtime', async () => {
  const token = await getAdminToken();
  await request(app)
    .put('/api/settings/admin/ops.allow_remote_logs')
    .set('Authorization', `Bearer ${token}`)
    .send({ value: true })
    .expect(200);
  const res = await request(app)
    .get('/api/settings/admin/system/diagnostics')
    .set('Authorization', `Bearer ${token}`)
    .expect(200);
  assert.strictEqual(res.body?.ok, true);
  assert.ok(res.body?.memory && typeof res.body.memory === 'object');
  assert.ok(res.body?.database && typeof res.body.database === 'object');
  assert.ok(res.body?.metrics && typeof res.body.metrics === 'object');
  assert.ok(res.body?.runtimeProcess && typeof res.body.runtimeProcess === 'object');
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
