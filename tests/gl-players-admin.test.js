'use strict';

require('./helpers/setup');
const { test, before } = require('node:test');
const assert = require('node:assert');
const request = require('supertest');
const { app } = require('../server');
const { initSchema, execute, queryOne } = require('../database');
const { signAuthToken } = require('../middleware/requireTeacher');

let adminToken;
let classId;

const stamp = Date.now();
const adminEmail = `players.admin.${stamp}@ecole.local`;
const className = `Classe Players Admin ${stamp}`;

before(async () => {
  await initSchema();
  await execute(
    `INSERT INTO gl_admins (email, display_name, role, is_active, created_at, updated_at)
     VALUES (?, 'MJ Players', 'admin', 1, NOW(), NOW())
     ON DUPLICATE KEY UPDATE is_active = 1, updated_at = NOW()`,
    [adminEmail],
  );
  const admin = await queryOne('SELECT id FROM gl_admins WHERE email = ? LIMIT 1', [adminEmail]);
  adminToken = await signAuthToken({
    product: 'gl',
    userType: 'gl_admin',
    userId: String(admin.id),
    roleSlug: 'gl_admin',
    permissions: ['gl.read', 'gl.players.manage'],
  });
  await execute(
    `INSERT INTO gl_classes (name, school, created_by, is_active, created_at, updated_at)
     VALUES (?, 'Ecole', ?, 1, NOW(), NOW())`,
    [className, admin.id],
  );
  const cls = await queryOne('SELECT id FROM gl_classes WHERE name = ? LIMIT 1', [className]);
  classId = Number(cls.id);
});

test('POST /api/gl/admin/players exige prénom, nom, pseudo et classId', async () => {
  await request(app)
    .post('/api/gl/admin/players')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ pseudo: 'incomplet', classId })
    .expect(400);
});

test('POST /api/gl/admin/players crée un joueur avec password (must_reset=0)', async () => {
  const pseudo = `pa_with_pwd_${stamp}`;
  const res = await request(app)
    .post('/api/gl/admin/players')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ classId, firstName: 'Léo', lastName: 'Durand', pseudo, password: 'motdepasse123' })
    .expect(201);
  assert.strictEqual(res.body?.pseudo, pseudo);
  assert.strictEqual(Number(res.body?.password_must_reset), 0);
  const row = await queryOne(
    'SELECT password_must_reset FROM gl_players WHERE pseudo = ? LIMIT 1',
    [pseudo],
  );
  assert.strictEqual(Number(row.password_must_reset), 0);
});

test('POST /api/gl/admin/players sans password active must_reset=1', async () => {
  const pseudo = `pa_no_pwd_${stamp}`;
  const res = await request(app)
    .post('/api/gl/admin/players')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ classId, firstName: 'Sans', lastName: 'Motdepasse', pseudo })
    .expect(201);
  assert.strictEqual(Number(res.body?.password_must_reset), 1);
});

test('POST /api/gl/admin/players refuse un pseudo déjà utilisé (409)', async () => {
  const pseudo = `pa_dup_${stamp}`;
  await request(app)
    .post('/api/gl/admin/players')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ classId, firstName: 'A', lastName: 'A', pseudo, password: 'motdepasse123' })
    .expect(201);
  const res = await request(app)
    .post('/api/gl/admin/players')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ classId, firstName: 'B', lastName: 'B', pseudo, password: 'motdepasse123' })
    .expect(409);
  assert.ok(
    String(res.body?.error || '')
      .toLowerCase()
      .includes('pseudo'),
  );
});

test('POST /api/gl/admin/players/:id/reset-password met must_reset=0', async () => {
  const pseudo = `pa_reset_${stamp}`;
  await request(app)
    .post('/api/gl/admin/players')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ classId, firstName: 'Reset', lastName: 'Me', pseudo })
    .expect(201);
  const before = await queryOne(
    'SELECT id, password_must_reset FROM gl_players WHERE pseudo = ? LIMIT 1',
    [pseudo],
  );
  assert.strictEqual(Number(before.password_must_reset), 1);

  await request(app)
    .post(`/api/gl/admin/players/${before.id}/reset-password`)
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ password: 'nouveau1234' })
    .expect(200);

  const after = await queryOne('SELECT password_must_reset FROM gl_players WHERE id = ? LIMIT 1', [
    before.id,
  ]);
  assert.strictEqual(Number(after.password_must_reset), 0);

  // Le joueur peut désormais se connecter
  await request(app)
    .post('/api/gl/auth/login')
    .send({ pseudo, password: 'nouveau1234' })
    .expect(200);
});

test('POST /api/gl/admin/players/:id/reset-pin reste accepté (alias compat)', async () => {
  const pseudo = `pa_alias_${stamp}`;
  await request(app)
    .post('/api/gl/admin/players')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ classId, firstName: 'Alias', lastName: 'Compat', pseudo })
    .expect(201);
  const row = await queryOne('SELECT id FROM gl_players WHERE pseudo = ? LIMIT 1', [pseudo]);
  await request(app)
    .post(`/api/gl/admin/players/${row.id}/reset-pin`)
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ pin: 'compat1234' })
    .expect(200);
  await request(app)
    .post('/api/gl/auth/login')
    .send({ pseudo, password: 'compat1234' })
    .expect(200);
});

test('PUT /api/gl/admin/players/:id met à jour prénom/nom/pseudo', async () => {
  const pseudo = `pa_put_${stamp}`;
  await request(app)
    .post('/api/gl/admin/players')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ classId, firstName: 'Avant', lastName: 'Modif', pseudo, password: 'motdepasse123' })
    .expect(201);
  const row = await queryOne('SELECT id FROM gl_players WHERE pseudo = ? LIMIT 1', [pseudo]);
  const res = await request(app)
    .put(`/api/gl/admin/players/${row.id}`)
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ firstName: 'Apres', lastName: 'Mise-A-Jour' })
    .expect(200);
  assert.strictEqual(res.body?.first_name, 'Apres');
  assert.strictEqual(res.body?.last_name, 'Mise-A-Jour');
});
