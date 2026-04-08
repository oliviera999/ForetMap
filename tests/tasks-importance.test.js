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
  teacherToken = await signAuthToken(
    {
      userType: 'teacher',
      userId: teacher.id,
      canonicalUserId: teacher.id,
      roleId: adminRole.id,
      roleSlug: 'admin',
      roleDisplayName: 'Administrateur',
      elevated: false,
    },
    false
  );
});

describe('Tâches — importance_level', () => {
  it('POST /api/tasks refuse une importance invalide', async () => {
    const res = await request(app)
      .post('/api/tasks')
      .set('Authorization', `Bearer ${teacherToken}`)
      .send({
        title: `Tâche importance invalide ${Date.now()}`,
        required_students: 1,
        map_id: 'foret',
        importance_level: 'urgentissime',
      })
      .expect(400);
    assert.ok(String(res.body?.error || '').includes('importance') || String(res.body?.error || '').includes('Importance'));
  });

  it('POST puis PUT gèrent importance_level (null explicite)', async () => {
    const res = await request(app)
      .post('/api/tasks')
      .set('Authorization', `Bearer ${teacherToken}`)
      .send({
        title: `Tâche importance OK ${Date.now()}`,
        required_students: 1,
        map_id: 'foret',
        importance_level: 'high',
      })
      .expect(201);
    assert.strictEqual(res.body.importance_level, 'high');

    const cleared = await request(app)
      .put(`/api/tasks/${res.body.id}`)
      .set('Authorization', `Bearer ${teacherToken}`)
      .send({ importance_level: null })
      .expect(200);
    assert.strictEqual(cleared.body.importance_level, null);
  });

  it('GET /api/tasks trie par importance puis date limite (même carte)', async () => {
    const ts = Date.now();
    const due = '2035-06-15';
    const n = await request(app)
      .post('/api/tasks')
      .set('Authorization', `Bearer ${teacherToken}`)
      .send({
        title: `imp-${ts}-none`,
        required_students: 1,
        map_id: 'foret',
        due_date: due,
      })
      .expect(201);
    const low = await request(app)
      .post('/api/tasks')
      .set('Authorization', `Bearer ${teacherToken}`)
      .send({
        title: `imp-${ts}-low`,
        required_students: 1,
        map_id: 'foret',
        due_date: due,
        importance_level: 'low',
      })
      .expect(201);
    const abs = await request(app)
      .post('/api/tasks')
      .set('Authorization', `Bearer ${teacherToken}`)
      .send({
        title: `imp-${ts}-abs`,
        required_students: 1,
        map_id: 'foret',
        due_date: due,
        importance_level: 'absolute',
      })
      .expect(201);

    const list = await request(app).get('/api/tasks').query({ map_id: 'foret' }).expect(200);
    assert.ok(Array.isArray(list.body));
    const subset = list.body.filter((t) => String(t.title || '').startsWith(`imp-${ts}-`));
    assert.strictEqual(subset.length, 3);
    assert.strictEqual(subset[0].id, abs.body.id);
    assert.strictEqual(subset[1].id, low.body.id);
    assert.strictEqual(subset[2].id, n.body.id);

    await execute('DELETE FROM tasks WHERE id IN (?, ?, ?)', [n.body.id, low.body.id, abs.body.id]);
  });
});
