require('./helpers/setup');
const test = require('node:test');
const assert = require('node:assert');
const request = require('supertest');
const { app } = require('../server');
const { initSchema, queryOne, execute } = require('../database');
const { signAuthToken } = require('../middleware/requireTeacher');

let teacherToken;
let plantId;
const ONE_PIXEL_PNG_DATA_URL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=';

async function refreshAdminTeacherToken() {
  const loginEmail = String(process.env.TEACHER_ADMIN_EMAIL || '').trim();
  const teacher = await queryOne(
    "SELECT id FROM users WHERE user_type = 'teacher' AND LOWER(email) = LOWER(?) LIMIT 1",
    [loginEmail]
  );
  const adminRole = await queryOne("SELECT id FROM roles WHERE slug = 'admin' LIMIT 1");
  assert.ok(teacher?.id, 'Compte admin enseignant introuvable');
  assert.ok(adminRole?.id, 'Rôle admin introuvable');
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
  teacherToken = await refreshAdminTeacherToken();
});

test.beforeEach(async () => {
  teacherToken = await refreshAdminTeacherToken();
});

test('POST /api/plants rejette les URLs photo en http', async () => {
  const res = await request(app)
    .post('/api/plants')
    .set('Authorization', 'Bearer ' + teacherToken)
    .send({
      name: `Entrée biodiversité HTTP ${Date.now()}`,
      emoji: '🌿',
      photo: 'http://example.com/photo.jpg',
    })
    .expect(400);

  assert.ok(res.body.error.includes('HTTPS'));
});

test('POST /api/plants accepte les URLs photo en https', async () => {
  const res = await request(app)
    .post('/api/plants')
    .set('Authorization', 'Bearer ' + teacherToken)
    .send({
      name: `Entrée biodiversité HTTPS ${Date.now()}`,
      emoji: '🌱',
      photo: 'https://example.com/photo.jpg',
      photo_leaf: 'https://example.com/leaf.jpg, https://example.com/leaf-2.jpg',
    })
    .expect(201);

  assert.ok(res.body.id);
  plantId = res.body.id;
});

test('PUT /api/plants/:id rejette les URLs photo en http', async () => {
  const res = await request(app)
    .put(`/api/plants/${plantId}`)
    .set('Authorization', 'Bearer ' + teacherToken)
    .send({
      photo_flower: 'http://example.com/flower.jpg',
    })
    .expect(400);

  assert.ok(res.body.error.includes('HTTPS'));
});

test('POST /api/plants/:id/photo-upload conserve les URLs photo existantes', async () => {
  const existingPhotos = [
    'https://example.com/photos/existante-1.jpg',
    'https://example.com/photos/existante-2.jpg',
  ];
  const created = await request(app)
    .post('/api/plants')
    .set('Authorization', 'Bearer ' + teacherToken)
    .send({
      name: `Entrée biodiversité upload ${Date.now()}`,
      emoji: '🌿',
      photo: existingPhotos.join('\n'),
    })
    .expect(201);

  const uploaded = await request(app)
    .post(`/api/plants/${created.body.id}/photo-upload`)
    .set('Authorization', 'Bearer ' + teacherToken)
    .send({
      field: 'photo',
      imageData: ONE_PIXEL_PNG_DATA_URL,
      position: 'prepend',
    })
    .expect(200);

  assert.match(uploaded.body.url, /^\/uploads\/plants\/\d+\/photo-\d+\.png$/);

  const updated = await queryOne('SELECT photo FROM plants WHERE id = ?', [created.body.id]);
  const entries = String(updated.photo || '').split(/\n|,\s*/).filter(Boolean);
  assert.strictEqual(entries[0], uploaded.body.url);
  assert.ok(entries.includes(existingPhotos[0]));
  assert.ok(entries.includes(existingPhotos[1]));
  assert.strictEqual(uploaded.body.plant.photo, updated.photo);
});

test('GET /api/health expose une CSP avec img-src restreint', async () => {
  const res = await request(app).get('/api/health').expect(200);
  const csp = res.headers['content-security-policy'] || '';
  assert.ok(csp.includes("img-src 'self' https: data: blob:;"));
});
