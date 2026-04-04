'use strict';

require('./helpers/setup');
require('dotenv').config();
const { describe, it, before } = require('node:test');
const assert = require('node:assert');
const request = require('supertest');
const { app } = require('../server');
const { initSchema, queryOne, execute } = require('../database');
const { signAuthToken } = require('../middleware/requireTeacher');
const { ensureRbacBootstrap } = require('../lib/rbac');

let teacherToken;
let studentId;

before(async () => {
  await initSchema();
  await ensureRbacBootstrap();
  const loginEmail = String(process.env.TEACHER_ADMIN_EMAIL || '').trim();
  const teacher = await queryOne(
    "SELECT id FROM users WHERE user_type = 'teacher' AND LOWER(email) = LOWER(?) LIMIT 1",
    [loginEmail]
  );
  const adminRole = await queryOne("SELECT id FROM roles WHERE slug = 'admin' LIMIT 1");
  assert.ok(teacher?.id, 'Compte admin enseignant introuvable');
  assert.ok(adminRole?.id, 'Rôle admin introuvable');
  teacherToken = await signAuthToken({
    userType: 'teacher',
    userId: teacher.id,
    canonicalUserId: teacher.id,
    roleId: adminRole.id,
    roleSlug: 'admin',
    roleDisplayName: 'Administrateur',
    elevated: false,
  }, false);
  const reg = await request(app)
    .post('/api/auth/register')
    .send({ firstName: 'Ref', lastName: `St${Date.now()}`, password: 'pass123' })
    .expect(201);
  studentId = reg.body.id;
});

describe('Référents de tâche', () => {
  it('POST /api/tasks avec referent_user_ids valides renvoie les référents enrichis', async () => {
    const res = await request(app)
      .post('/api/tasks')
      .set('Authorization', `Bearer ${teacherToken}`)
      .send({
        title: 'Tâche avec référent',
        required_students: 1,
        referent_user_ids: [studentId],
      })
      .expect(201);
    assert.ok(Array.isArray(res.body.referent_user_ids));
    assert.ok(res.body.referent_user_ids.includes(String(studentId)));
    assert.ok(Array.isArray(res.body.referents_linked));
    assert.ok(res.body.referents_linked.some((r) => String(r.id) === String(studentId)));
  });

  it('POST /api/tasks avec référent inexistant renvoie 400', async () => {
    await request(app)
      .post('/api/tasks')
      .set('Authorization', `Bearer ${teacherToken}`)
      .send({
        title: 'Tâche référent invalide',
        referent_user_ids: ['00000000-0000-4000-8000-000000000001'],
      })
      .expect(400);
  });

  it('GET /api/tasks/referent-candidates avec jeton admin renvoie un tableau', async () => {
    const res = await request(app)
      .get('/api/tasks/referent-candidates')
      .set('Authorization', `Bearer ${teacherToken}`)
      .expect(200);
    assert.ok(Array.isArray(res.body));
    assert.ok(res.body.length >= 1);
    const sample = res.body[0];
    assert.ok(sample.id);
    assert.ok(['teacher', 'student'].includes(sample.user_type));
  });

  it('GET /api/tasks/referent-candidates sans jeton renvoie 401', async () => {
    await request(app).get('/api/tasks/referent-candidates').expect(401);
  });
});
