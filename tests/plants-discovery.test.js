require('./helpers/setup');
const test = require('node:test');
const assert = require('node:assert');
const request = require('supertest');
const { app } = require('../server');
const { initSchema, queryOne, execute } = require('../database');
const { signAuthToken } = require('../middleware/requireTeacher');

let teacherToken;

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

test('GET /api/plants/me/discovered-ids sans jeton renvoie 401', async () => {
  await request(app).get('/api/plants/me/discovered-ids').expect(401);
});

test('Eleve: acknowledge-discovery et liste plant_ids', async () => {
  const reg = await request(app)
    .post('/api/auth/register')
    .send({
      firstName: 'Bio',
      lastName: `Decouverte${Date.now()}`,
      password: 'pass1234',
      affiliation: 'foret',
    })
    .expect(201);
  const studentToken = reg.body.authToken;
  assert.ok(studentToken, 'authToken inscription');

  const createPlant = await request(app)
    .post('/api/plants')
    .set('Authorization', 'Bearer ' + teacherToken)
    .send({
      name: `Espece test decouverte ${Date.now()}`,
      emoji: '🌿',
      description: 'Test',
    })
    .expect(201);
  const testPlantId = createPlant.body.id;
  assert.ok(testPlantId, 'plante creee');

  const empty = await request(app)
    .get('/api/plants/me/discovered-ids')
    .set('Authorization', 'Bearer ' + studentToken)
    .expect(200);
  assert.ok(Array.isArray(empty.body.plant_ids));
  assert.ok(!empty.body.plant_ids.includes(testPlantId));

  await request(app)
    .post(`/api/plants/${testPlantId}/acknowledge-discovery`)
    .set('Authorization', 'Bearer ' + studentToken)
    .send({})
    .expect(400);

  const ok = await request(app)
    .post(`/api/plants/${testPlantId}/acknowledge-discovery`)
    .set('Authorization', 'Bearer ' + studentToken)
    .send({ confirm: true })
    .expect(200);
  assert.strictEqual(ok.body.success, true);
  assert.strictEqual(Number(ok.body.plant_id), Number(testPlantId));

  const after = await request(app)
    .get('/api/plants/me/discovered-ids')
    .set('Authorization', 'Bearer ' + studentToken)
    .expect(200);
  assert.ok(after.body.plant_ids.includes(testPlantId));
});
