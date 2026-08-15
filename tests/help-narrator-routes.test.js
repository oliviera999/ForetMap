// Routes d'administration du narrateur d'aide (OLU) et exposition publique.
// Les règles de normalisation pures sont couvertes sans base par
// tests/help-narrator-normalize.test.js.
require('./helpers/setup');
const test = require('node:test');
const assert = require('node:assert');
const request = require('supertest');
const { app } = require('../server');
const { initSchema, queryOne, execute } = require('../database');
const { signAuthToken } = require('../middleware/requireTeacher');
const { HELP_NARRATOR_KEY } = require('../lib/helpNarrator');
const { HELP_REGISTRY_KEY } = require('../lib/helpContent');

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

test.after(async () => {
  await execute('DELETE FROM app_settings WHERE `key` = ?', [HELP_NARRATOR_KEY]);
});

async function getAdminToken() {
  const email = process.env.TEACHER_ADMIN_EMAIL || 'admin.test@foretmap.local';
  const teacher = await queryOne(
    "SELECT id FROM users WHERE user_type = 'teacher' AND LOWER(email) = LOWER(?) LIMIT 1",
    [email],
  );
  const adminRole = await queryOne("SELECT id FROM roles WHERE slug = 'admin' LIMIT 1");
  assert.ok(teacher?.id, 'Compte admin enseignant introuvable');
  assert.ok(adminRole?.id, 'Rôle admin introuvable');
  for (const key of ['admin.settings.read', 'admin.settings.write']) {
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
  return await signAuthToken(
    {
      userType: 'teacher',
      userId: teacher.id,
      canonicalUserId: teacher.id,
      roleId: adminRole.id,
      roleSlug: 'admin',
      roleDisplayName: 'Administrateur',
      elevated: false,
    },
    false,
  );
}

test('GET /admin/help-narrator exige une authentification prof', async () => {
  await request(app).get('/api/settings/admin/help-narrator').expect(401);
  await request(app).put('/api/settings/admin/help-narrator').send({}).expect(401);
  await request(app).post('/api/settings/admin/help-narrator/reset').send({}).expect(401);
});

test('GET /admin/help-narrator renvoie les défauts avant toute écriture', async () => {
  const token = await getAdminToken();
  await execute('DELETE FROM app_settings WHERE `key` = ?', [HELP_NARRATOR_KEY]);
  const res = await request(app)
    .get('/api/settings/admin/help-narrator')
    .set('Authorization', `Bearer ${token}`)
    .expect(200);
  assert.deepStrictEqual(res.body, {
    enabled: true,
    speakerName: 'OLU',
    fallbackSilhouette: 'olu',
    portraits: {},
  });
});

test('PUT /admin/help-narrator normalise, persiste et journalise', async () => {
  const token = await getAdminToken();
  const res = await request(app)
    .put('/api/settings/admin/help-narrator')
    .set('Authorization', `Bearer ${token}`)
    .send({
      enabled: true,
      speakerName: '  OLU  ',
      fallbackSilhouette: 'olu',
      portraits: {
        neutre: { bust: '/uploads/olu-neutre.webp' },
        parle: { bust: '/uploads/olu-parle.webp', face: 'javascript:alert(1)' },
        hilare: { bust: '/uploads/nope.webp' },
      },
    })
    .expect(200);

  assert.strictEqual(res.body.speakerName, 'OLU');
  assert.deepStrictEqual(res.body.portraits, {
    neutre: { bust: '/uploads/olu-neutre.webp' },
    parle: { bust: '/uploads/olu-parle.webp' },
  });

  const reread = await request(app)
    .get('/api/settings/admin/help-narrator')
    .set('Authorization', `Bearer ${token}`)
    .expect(200);
  assert.deepStrictEqual(reread.body, res.body);

  const audit = await queryOne(
    "SELECT action FROM audit_log WHERE action = 'settings_help_narrator_update' ORDER BY id DESC LIMIT 1",
  );
  assert.ok(audit, 'Événement d’audit settings_help_narrator_update absent');
});

test('le narrateur est exposé dans GET /api/settings/public', async () => {
  const token = await getAdminToken();
  await request(app)
    .put('/api/settings/admin/help-narrator')
    .set('Authorization', `Bearer ${token}`)
    .send({ speakerName: 'OLU', portraits: { neutre: { bust: '/uploads/olu-neutre.webp' } } })
    .expect(200);

  // La route enveloppe la configuration : `{ settings: <nested> }`.
  const res = await request(app).get('/api/settings/public').expect(200);
  const help = res.body?.settings?.content?.help;
  assert.ok(help?.narrator, 'content.help.narrator absent du payload public');
  assert.strictEqual(help.narrator.speakerName, 'OLU');
  assert.deepStrictEqual(help.narrator.portraits.neutre, { bust: '/uploads/olu-neutre.webp' });
  // Le corpus reste servi à côté : les deux réglages coexistent.
  assert.ok(help?.registry, 'content.help.registry absent du payload public');
});

test('réinitialiser le corpus d’aide ne touche pas au narrateur', async () => {
  const token = await getAdminToken();
  await request(app)
    .put('/api/settings/admin/help-narrator')
    .set('Authorization', `Bearer ${token}`)
    .send({ speakerName: 'OLU', portraits: { neutre: { bust: '/uploads/garde-moi.webp' } } })
    .expect(200);

  await request(app)
    .post('/api/settings/admin/help-content/reset')
    .set('Authorization', `Bearer ${token}`)
    .send({})
    .expect(200);

  const after = await request(app)
    .get('/api/settings/admin/help-narrator')
    .set('Authorization', `Bearer ${token}`)
    .expect(200);
  assert.deepStrictEqual(after.body.portraits.neutre, { bust: '/uploads/garde-moi.webp' });

  const row = await queryOne('SELECT `key` FROM app_settings WHERE `key` = ? LIMIT 1', [
    HELP_REGISTRY_KEY,
  ]);
  assert.ok(row, 'Le corpus doit bien avoir été réécrit par le reset');
});

test('POST /admin/help-narrator/reset restaure les défauts', async () => {
  const token = await getAdminToken();
  await request(app)
    .put('/api/settings/admin/help-narrator')
    .set('Authorization', `Bearer ${token}`)
    .send({
      enabled: false,
      speakerName: 'Autre',
      portraits: { grave: { bust: '/uploads/g.webp' } },
    })
    .expect(200);

  const res = await request(app)
    .post('/api/settings/admin/help-narrator/reset')
    .set('Authorization', `Bearer ${token}`)
    .send({})
    .expect(200);

  assert.deepStrictEqual(res.body, {
    enabled: true,
    speakerName: 'OLU',
    fallbackSilhouette: 'olu',
    portraits: {},
  });

  const audit = await queryOne(
    "SELECT action FROM audit_log WHERE action = 'settings_help_narrator_reset' ORDER BY id DESC LIMIT 1",
  );
  assert.ok(audit, 'Événement d’audit settings_help_narrator_reset absent');
});
