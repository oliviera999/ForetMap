'use strict';

/**
 * Pagination explicite de GET /api/tasks (audit 26/11 P1).
 */

require('./helpers/setup');
require('dotenv').config();
const { describe, it, before } = require('node:test');
const assert = require('node:assert');
const request = require('supertest');
const { app } = require('../server');
const { initSchema, queryOne } = require('../database');
const { signAuthToken } = require('../middleware/requireTeacher');
const { ensureRbacBootstrap } = require('../lib/rbac');
const { tasksListItems } = require('./helpers/tasksListResponse');

let teacherToken;

before(async () => {
  await initSchema();
  await ensureRbacBootstrap();
  const loginEmail = String(process.env.TEACHER_ADMIN_EMAIL || '').trim();
  const teacher = await queryOne(
    "SELECT id FROM users WHERE user_type = 'teacher' AND LOWER(email) = LOWER(?) LIMIT 1",
    [loginEmail],
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
    false,
  );
});

describe('GET /api/tasks — pagination', () => {
  it('renvoie une enveloppe { items, limit, offset, total, hasMore }', async () => {
    const res = await request(app)
      .get('/api/tasks?limit=5&offset=0')
      .set('Authorization', `Bearer ${teacherToken}`)
      .expect(200);
    assert.ok(res.body && typeof res.body === 'object');
    assert.ok(Array.isArray(res.body.items));
    assert.strictEqual(res.body.limit, 5);
    assert.strictEqual(res.body.offset, 0);
    assert.ok(typeof res.body.total === 'number');
    assert.ok(typeof res.body.hasMore === 'boolean');
    assert.ok(res.body.items.length <= 5);
  });

  it('plafonne limit à 500', async () => {
    const res = await request(app)
      .get('/api/tasks?limit=9999')
      .set('Authorization', `Bearer ${teacherToken}`)
      .expect(200);
    assert.strictEqual(res.body.limit, 500);
    assert.ok(tasksListItems(res.body).length <= 500);
  });
});
