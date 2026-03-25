'use strict';

require('./helpers/setup');
require('dotenv').config();
const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');
const { describe, it, before } = require('node:test');
const assert = require('node:assert');
const request = require('supertest');
const bcrypt = require('bcryptjs');
const { app } = require('../server');
const { initSchema, execute, queryOne } = require('../database');

before(async () => {
  process.env.SMTP_JSON_TRANSPORT = 'true';
  await initSchema();
});

describe('Auth', () => {
  const unique = `Test${Date.now()}`;
  const firstName = unique;
  const lastName = 'User';
  const password = 'password123';
  const pseudo = `test_${Date.now()}`;
  const email = `test_${Date.now()}@example.com`;
  const description = 'Profil de test';

  it('POST /api/auth/register crée un compte et renvoie l’élève sans mot de passe', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ firstName, lastName, password, pseudo, email, description })
      .expect(201);
    assert.strictEqual(res.body.first_name, firstName);
    assert.strictEqual(res.body.last_name, lastName);
    assert.strictEqual(res.body.pseudo, pseudo);
    assert.strictEqual(res.body.email, email);
    assert.strictEqual(res.body.description, description);
    assert.strictEqual(res.body.password, undefined);
    assert.ok(res.body.id);
  });

  it('POST /api/auth/register avec même nom renvoie 409', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ firstName, lastName, password: 'other' })
      .expect(409);
    assert.ok(res.body.error);
  });

  it('POST /api/auth/login accepte identifier=pseudo', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ identifier: pseudo, password })
      .expect(200);
    assert.strictEqual(res.body.first_name, firstName);
    assert.strictEqual(res.body.password, undefined);
  });

  it('POST /api/auth/login accepte identifier=email', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ identifier: email, password })
      .expect(200);
    assert.strictEqual(res.body.first_name, firstName);
    assert.strictEqual(res.body.password, undefined);
  });

  it('POST /api/auth/login garde la compatibilité firstName+lastName', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ firstName, lastName, password })
      .expect(200);
    assert.strictEqual(res.body.first_name, firstName);
    assert.strictEqual(res.body.password, undefined);
  });

  it('POST /api/auth/login avec mauvais mot de passe renvoie 401', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ firstName, lastName, password: 'wrong' })
      .expect(401);
    assert.ok(res.body.error);
  });

  it('POST /api/auth/login compte inexistant renvoie 401', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ firstName: 'Nobody', lastName: 'Here', password: 'x' })
      .expect(401);
    assert.ok(res.body.error);
  });

  it('POST /api/auth/forgot-password renvoie un succès neutre', async () => {
    const res = await request(app)
      .post('/api/auth/forgot-password')
      .send({ email })
      .expect(200);
    assert.strictEqual(res.body.ok, true);
    assert.ok(res.body.message);
  });

  it('POST /api/auth/reset-password consomme un token valide', async () => {
    const student = await queryOne('SELECT id FROM students WHERE LOWER(email)=LOWER(?) LIMIT 1', [email]);
    assert.ok(student?.id);
    const resetToken = `student-reset-${Date.now()}`;
    const tokenHash = crypto.createHash('sha256').update(resetToken).digest('hex');
    const tokenId = uuidv4();

    await execute(
      'INSERT INTO password_reset_tokens (id, user_type, user_id, token_hash, expires_at, used_at) VALUES (?, ?, ?, ?, DATE_ADD(NOW(), INTERVAL 1 HOUR), NULL)',
      [tokenId, 'student', student.id, tokenHash]
    );

    await request(app)
      .post('/api/auth/reset-password')
      .send({ token: resetToken, password: 'nouveauSecret1' })
      .expect(200);

    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ identifier: email, password: 'nouveauSecret1' })
      .expect(200);
    assert.strictEqual(loginRes.body.id, student.id);

    const consumed = await queryOne('SELECT used_at FROM password_reset_tokens WHERE id = ?', [tokenId]);
    assert.ok(consumed?.used_at);
  });

  it('POST /api/auth/teacher/login authentifie un compte prof email/mot de passe', async () => {
    const teacherEmail = `prof_${Date.now()}@example.com`;
    const teacherPassword = 'teacherPwd123';
    const hash = await bcrypt.hash(teacherPassword, 10);
    const now = new Date().toISOString();
    await execute(
      'INSERT INTO teachers (id, email, password_hash, display_name, is_active, last_seen, created_at, updated_at) VALUES (?, ?, ?, ?, 1, ?, ?, ?)',
      [uuidv4(), teacherEmail, hash, 'Prof Test', now, now, now]
    );

    const res = await request(app)
      .post('/api/auth/teacher/login')
      .send({ email: teacherEmail, password: teacherPassword })
      .expect(200);
    assert.ok(res.body.token);
  });

  it('POST /api/auth/teacher/reset-password met à jour le mot de passe prof', async () => {
    const teacherEmail = `prof_reset_${Date.now()}@example.com`;
    const oldPassword = 'oldPass1';
    const newPassword = 'newPass2';
    const hash = await bcrypt.hash(oldPassword, 10);
    const now = new Date().toISOString();
    const teacherId = uuidv4();
    await execute(
      'INSERT INTO teachers (id, email, password_hash, display_name, is_active, last_seen, created_at, updated_at) VALUES (?, ?, ?, ?, 1, ?, ?, ?)',
      [teacherId, teacherEmail, hash, 'Prof Reset', now, now, now]
    );

    const resetToken = `teacher-reset-${Date.now()}`;
    const tokenHash = crypto.createHash('sha256').update(resetToken).digest('hex');
    await execute(
      'INSERT INTO password_reset_tokens (id, user_type, user_id, token_hash, expires_at, used_at) VALUES (?, ?, ?, ?, DATE_ADD(NOW(), INTERVAL 1 HOUR), NULL)',
      [uuidv4(), 'teacher', teacherId, tokenHash]
    );

    await request(app)
      .post('/api/auth/teacher/reset-password')
      .send({ token: resetToken, password: newPassword })
      .expect(200);

    const login = await request(app)
      .post('/api/auth/teacher/login')
      .send({ email: teacherEmail, password: newPassword })
      .expect(200);
    assert.ok(login.body.token);
  });
});
