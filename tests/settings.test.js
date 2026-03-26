require('./helpers/setup');
const test = require('node:test');
const assert = require('node:assert');
const request = require('supertest');
const { app } = require('../server');
const { initSchema, queryOne } = require('../database');

test.before(async () => {
  await initSchema();
});

async function getElevatedAdminToken() {
  const email = process.env.TEACHER_ADMIN_EMAIL || 'admin.test@foretmap.local';
  const password = process.env.TEACHER_ADMIN_PASSWORD || 'admin1234';
  const login = await request(app)
    .post('/api/auth/login')
    .send({ identifier: email, password })
    .expect(200);
  assert.ok(login.body?.authToken, 'Token login manquant');
  const elevated = await request(app)
    .post('/api/auth/elevate')
    .set('Authorization', `Bearer ${login.body.authToken}`)
    .send({ pin: process.env.TEACHER_PIN || '1234' })
    .expect(200);
  assert.ok(elevated.body?.token, 'Token élevé manquant');
  return elevated.body.token;
}

test('GET /api/settings/public renvoie les réglages publics', async () => {
  const res = await request(app).get('/api/settings/public').expect(200);
  assert.ok(res.body?.settings);
  assert.strictEqual(typeof res.body.settings.auth.allow_register, 'boolean');
  assert.strictEqual(typeof res.body.settings.auth.allow_google_student, 'boolean');
});

test('PUT /api/settings/admin/:key met à jour un réglage public', async () => {
  const token = await getElevatedAdminToken();
  await request(app)
    .put('/api/settings/admin/ui.auth.allow_register')
    .set('Authorization', `Bearer ${token}`)
    .send({ value: false })
    .expect(200);

  const pub = await request(app).get('/api/settings/public').expect(200);
  assert.strictEqual(pub.body?.settings?.auth?.allow_register, false);

  // Remise à la valeur par défaut pour isoler les autres tests.
  await request(app)
    .put('/api/settings/admin/ui.auth.allow_register')
    .set('Authorization', `Bearer ${token}`)
    .send({ value: true })
    .expect(200);
});

test('RBAC refuse la rétrogradation du dernier administrateur', async () => {
  const token = await getElevatedAdminToken();
  const users = await request(app)
    .get('/api/rbac/users')
    .set('Authorization', `Bearer ${token}`)
    .expect(200);
  const adminUser = (users.body || []).find((u) => u.role_slug === 'admin');
  assert.ok(adminUser, 'Aucun utilisateur admin trouvé');
  const prof = await queryOne('SELECT id FROM roles WHERE slug = ? LIMIT 1', ['prof']);
  assert.ok(prof?.id, 'Rôle prof introuvable');
  await request(app)
    .put(`/api/rbac/users/${adminUser.user_type}/${adminUser.id}/role`)
    .set('Authorization', `Bearer ${token}`)
    .send({ role_id: prof.id })
    .expect(409);
});
