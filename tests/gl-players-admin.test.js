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
  assert.strictEqual(res.body?.generatedPassword, null);
  const row = await queryOne(
    `SELECT u.password_must_reset FROM gl_players p
      INNER JOIN users u ON u.id = p.linked_foretmap_user_id WHERE p.pseudo = ? LIMIT 1`,
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
  // Le mot de passe généré est restitué une seule fois, et permet de se connecter.
  assert.match(String(res.body?.generatedPassword || ''), /^[a-z0-9]{10}$/);
  const login = await request(app)
    .post('/api/gl/auth/login')
    .send({ identifier: pseudo, password: res.body.generatedPassword })
    .expect(200);
  assert.strictEqual(login.body?.auth?.passwordMustReset, true);
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
    `SELECT p.id, u.password_must_reset FROM gl_players p
      INNER JOIN users u ON u.id = p.linked_foretmap_user_id WHERE p.pseudo = ? LIMIT 1`,
    [pseudo],
  );
  assert.strictEqual(Number(before.password_must_reset), 1);

  await request(app)
    .post(`/api/gl/admin/players/${before.id}/reset-password`)
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ password: 'nouveau1234' })
    .expect(200);

  const after = await queryOne(
    `SELECT u.password_must_reset FROM gl_players p
      INNER JOIN users u ON u.id = p.linked_foretmap_user_id WHERE p.id = ? LIMIT 1`,
    [before.id],
  );
  assert.strictEqual(Number(after.password_must_reset), 0);

  // Le joueur peut désormais se connecter
  await request(app)
    .post('/api/gl/auth/login')
    .send({ pseudo, password: 'nouveau1234' })
    .expect(200);
});

test('G5 : reset-pin supprimé (404), alias body `pin` encore accepté sur reset-password', async () => {
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
    .expect(404);
  await request(app)
    .post(`/api/gl/admin/players/${row.id}/reset-password`)
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

test('DELETE /api/gl/admin/players/:id purge tentatives, verrous et accusés du joueur', async () => {
  // Lecteur polymorphe (reader_user_type, reader_user_id) : aucune FK vers gl_players n'est
  // possible. Sans purge applicative, un identifiant réattribué héritait des bonnes réponses,
  // des accusés et des verrous du joueur supprimé (audit validation quiz 2026-09, C1).
  const pseudo = `pa_purge_${stamp}`;
  await request(app)
    .post('/api/gl/admin/players')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ classId, firstName: 'Purge', lastName: 'Traces', pseudo, password: 'motdepasse123' })
    .expect(201);
  const row = await queryOne('SELECT id FROM gl_players WHERE pseudo = ? LIMIT 1', [pseudo]);
  const readerId = String(row.id);
  await execute(
    `INSERT INTO gl_qcm_attempts (reader_user_type, reader_user_id, question_dataset, question_code, is_correct, answered_at)
     VALUES ('gl_player', ?, 'qcm', 'GQCM0001', 1, NOW())`,
    [readerId],
  );
  await execute(
    `INSERT INTO gl_resource_gating_cooldowns
      (reader_user_type, reader_user_id, resource_type, resource_ref, question_code, locked_until, wrong_question_code, wrong_attempts)
     VALUES ('gl_player', ?, 'species', 'SPX', '', DATE_ADD(NOW(), INTERVAL 1 DAY), 'GQCM0001', 1)`,
    [readerId],
  );
  await execute(
    `INSERT INTO gl_learning_acknowledgements (reader_user_type, reader_user_id, target_type, target_code, acknowledged_at)
     VALUES ('gl_player', ?, 'species', 'SPX', NOW())`,
    [readerId],
  );

  await request(app)
    .delete(`/api/gl/admin/players/${row.id}`)
    .set('Authorization', `Bearer ${adminToken}`)
    .expect(200);

  for (const table of [
    'gl_qcm_attempts',
    'gl_resource_gating_cooldowns',
    'gl_learning_acknowledgements',
  ]) {
    const left = await queryOne(
      `SELECT COUNT(*) AS c FROM ${table} WHERE reader_user_type = 'gl_player' AND reader_user_id = ?`,
      [readerId],
    );
    assert.strictEqual(Number(left.c), 0, `${table} purgée avec le joueur`);
  }
});
