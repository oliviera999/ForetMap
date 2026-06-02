'use strict';

require('./helpers/setup');
const { test, before } = require('node:test');
const assert = require('node:assert');
const request = require('supertest');
const { app } = require('../server');
const { initSchema, execute, queryOne } = require('../database');
const { signAuthToken } = require('../middleware/requireTeacher');

let adminToken = '';
const stamp = Date.now();
const testCode = `SL9${String(stamp).slice(-3)}`;

before(async () => {
  await initSchema();
  await execute(
    `INSERT INTO gl_admins (email, display_name, role, is_active, created_at, updated_at)
     VALUES (?, 'MJ Spells CRUD', 'admin', 1, NOW(), NOW())
     ON DUPLICATE KEY UPDATE is_active = 1, updated_at = NOW()`,
    [`spells.crud.${stamp}@ecole.local`]
  );
  const admin = await queryOne(
    'SELECT id FROM gl_admins WHERE email = ? LIMIT 1',
    [`spells.crud.${stamp}@ecole.local`]
  );
  adminToken = await signAuthToken({
    product: 'gl',
    userType: 'gl_admin',
    userId: String(admin.id),
    roleSlug: 'gl_admin',
    permissions: ['gl.read', 'gl.content.manage'],
  });
});

test('POST /api/gl/admin/spells crée un sort', async () => {
  const res = await request(app)
    .post('/api/gl/admin/spells')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({
      spell_code: testCode,
      category_slug: 'vie',
      nom: 'Sort test CRUD',
      emoji: '🧪',
      cout_gemmes: 2,
      statut: 'officiel',
      effet_court: 'Effet test',
    })
    .expect(201);
  assert.strictEqual(res.body?.spell?.spell_code, testCode);
});

test('PUT /api/gl/admin/spells/:code met à jour', async () => {
  const res = await request(app)
    .put(`/api/gl/admin/spells/${testCode}`)
    .set('Authorization', `Bearer ${adminToken}`)
    .send({
      category_slug: 'vie',
      nom: 'Sort test CRUD modifié',
      cout_gemmes: 3,
      statut: 'propose',
    })
    .expect(200);
  assert.strictEqual(res.body?.spell?.nom, 'Sort test CRUD modifié');
  assert.strictEqual(res.body?.spell?.statut, 'propose');
});

test('DELETE /api/gl/admin/spells/:code supprime', async () => {
  await request(app)
    .delete(`/api/gl/admin/spells/${testCode}`)
    .set('Authorization', `Bearer ${adminToken}`)
    .expect(200);
  await request(app)
    .get(`/api/gl/admin/spells/${testCode}`)
    .set('Authorization', `Bearer ${adminToken}`)
    .expect(404);
});
