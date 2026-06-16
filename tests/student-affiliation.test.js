'use strict';

require('./helpers/setup');
const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { app } = require('../server');
const { initSchema, queryOne, execute } = require('../database');
const { signAuthToken } = require('../middleware/requireTeacher');

let teacherToken;

async function ensureAdminToken() {
  const loginEmail = String(process.env.TEACHER_ADMIN_EMAIL || '').trim();
  const teacher = await queryOne(
    "SELECT id FROM users WHERE user_type = 'teacher' AND LOWER(email) = LOWER(?) LIMIT 1",
    [loginEmail],
  );
  const adminRole = await queryOne("SELECT id FROM roles WHERE slug = 'admin' LIMIT 1");
  assert.ok(teacher?.id, 'Compte admin enseignant introuvable');
  assert.ok(adminRole?.id, 'Rôle admin introuvable');
  if (teacher?.id && adminRole?.id) {
    await execute('UPDATE user_roles SET is_primary = 0 WHERE user_type = ? AND user_id = ?', [
      'teacher',
      teacher.id,
    ]);
    await execute(
      'INSERT INTO user_roles (user_type, user_id, role_id, is_primary) VALUES (?, ?, ?, 1) ON DUPLICATE KEY UPDATE is_primary = 1',
      ['teacher', teacher.id, adminRole.id],
    );
  }
  return signAuthToken(
    {
      userType: 'teacher',
      userId: teacher?.id || null,
      canonicalUserId: teacher?.id || null,
      roleId: adminRole?.id || null,
      roleSlug: 'admin',
      roleDisplayName: 'Administrateur',
      elevated: false,
    },
    false,
  );
}

async function createMap(id) {
  await execute(
    `INSERT INTO maps (id, label, map_image_url, sort_order, frame_padding_px, is_active)
     VALUES (?, ?, ?, ?, NULL, 1)
     ON DUPLICATE KEY UPDATE label = VALUES(label), is_active = 1`,
    [id, `Plan ${id}`, `/maps/${id}.svg`, 900],
  );
}

async function createStudentOnTemporaryMap(prefix) {
  const stamp = `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const mapId = `${prefix}_${stamp}`.slice(0, 31).toLowerCase();
  const password = 'pass1234';
  await createMap(mapId);
  const reg = await request(app)
    .post('/api/auth/register')
    .send({
      firstName: `Aff${prefix}`,
      lastName: stamp,
      password,
      affiliation: mapId,
    })
    .expect(201);
  await execute('DELETE FROM maps WHERE id = ?', [mapId]);
  return { mapId, password, student: reg.body };
}

test.before(async () => {
  await initSchema();
  teacherToken = await ensureAdminToken();
});

test('PATCH /api/auth/me/profile conserve une affiliation de carte orpheline si elle n’est pas modifiée', async () => {
  const { mapId, password, student } = await createStudentOnTemporaryMap('orphme');

  const res = await request(app)
    .patch('/api/auth/me/profile')
    .set('Authorization', `Bearer ${student.authToken}`)
    .send({
      description: 'Mise à jour sans changement de plan',
      currentPassword: password,
    })
    .expect(200);

  assert.equal(res.body.affiliation, mapId);
  const row = await queryOne('SELECT affiliation FROM users WHERE id = ? LIMIT 1', [student.id]);
  assert.equal(row?.affiliation, mapId);
});

test('PATCH /api/students/:id/profile conserve une affiliation de carte orpheline si elle n’est pas modifiée', async () => {
  const { mapId, password, student } = await createStudentOnTemporaryMap('orphst');

  const res = await request(app)
    .patch(`/api/students/${student.id}/profile`)
    .set('Authorization', `Bearer ${student.authToken}`)
    .send({
      pseudo: `orph_${Date.now()}`.slice(0, 30),
      currentPassword: password,
    })
    .expect(200);

  assert.equal(res.body.affiliation, mapId);
  const row = await queryOne('SELECT affiliation FROM users WHERE id = ? LIMIT 1', [student.id]);
  assert.equal(row?.affiliation, mapId);
});

test('POST /api/students/:id/duplicate copie l’affiliation existante sans élargir à both', async () => {
  const { mapId, password, student } = await createStudentOnTemporaryMap('orphdu');
  const unique = Date.now();

  const res = await request(app)
    .post(`/api/students/${student.id}/duplicate`)
    .set('Authorization', `Bearer ${teacherToken}`)
    .send({
      first_name: 'Copie',
      last_name: `Aff${unique}`,
      password,
    })
    .expect(201);

  assert.equal(res.body.affiliation, mapId);
  const row = await queryOne('SELECT affiliation FROM users WHERE id = ? LIMIT 1', [res.body.id]);
  assert.equal(row?.affiliation, mapId);
});
