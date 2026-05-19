'use strict';

require('./helpers/setup');
const { test, before } = require('node:test');
const assert = require('node:assert');
const request = require('supertest');
const bcrypt = require('bcryptjs');
const { app } = require('../server');
const { initSchema, execute, queryOne } = require('../database');

before(async () => {
  await initSchema();
  await execute(
    `INSERT INTO gl_admins (email, display_name, role, is_active, created_at, updated_at)
     VALUES ('mj.test@ecole.local', 'MJ Test', 'admin', 1, NOW(), NOW())
     ON DUPLICATE KEY UPDATE display_name = VALUES(display_name), is_active = 1, updated_at = NOW()`
  );
  const admin = await queryOne('SELECT id FROM gl_admins WHERE email = ? LIMIT 1', ['mj.test@ecole.local']);
  await execute(
    `INSERT INTO gl_classes (name, school, created_by, is_active, created_at, updated_at)
     VALUES ('6e A', 'College Test', ?, 1, NOW(), NOW())`,
    [admin.id]
  );
  const cls = await queryOne('SELECT id FROM gl_classes ORDER BY id DESC LIMIT 1');
  const pinHash = await bcrypt.hash('1234', 10);
  await execute(
    `INSERT INTO gl_players (class_id, pseudo, pin_hash, is_active, created_at, updated_at)
     VALUES (?, 'equipe_aurore', ?, 1, NOW(), NOW())
     ON DUPLICATE KEY UPDATE pin_hash = VALUES(pin_hash), class_id = VALUES(class_id), is_active = 1`,
    [cls.id, pinHash]
  );
});

test('POST /api/gl/auth/login retourne un token GL', async () => {
  const res = await request(app)
    .post('/api/gl/auth/login')
    .send({ pseudo: 'equipe_aurore', pin: '1234' })
    .expect(200);
  assert.ok(res.body?.authToken);
  assert.strictEqual(res.body?.auth?.product, 'gl');
  assert.strictEqual(res.body?.auth?.userType, 'gl_player');
});

test('POST /api/gl/auth/login rejette un mauvais PIN', async () => {
  const res = await request(app)
    .post('/api/gl/auth/login')
    .send({ pseudo: 'equipe_aurore', pin: '9999' })
    .expect(401);
  assert.ok(String(res.body?.error || '').includes('incorrect'));
});

test('GET /api/gl/auth/me nécessite un token GL valide', async () => {
  const login = await request(app)
    .post('/api/gl/auth/login')
    .send({ pseudo: 'equipe_aurore', pin: '1234' })
    .expect(200);
  const res = await request(app)
    .get('/api/gl/auth/me')
    .set('Authorization', `Bearer ${login.body.authToken}`)
    .expect(200);
  assert.strictEqual(res.body?.auth?.product, 'gl');
  assert.ok(res.body?.profile?.pseudo);
});
