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
const authRouter = require('../routes/auth');
const { initSchema, execute, queryOne } = require('../database');

before(async () => {
  process.env.SMTP_JSON_TRANSPORT = 'true';
  process.env.GOOGLE_OAUTH_CLIENT_ID = 'test-google-client-id.apps.googleusercontent.com';
  process.env.GOOGLE_OAUTH_CLIENT_SECRET = 'test-google-client-secret';
  process.env.GOOGLE_OAUTH_REDIRECT_URI = 'http://localhost:3000/api/auth/google/callback';
  process.env.GOOGLE_OAUTH_ALLOWED_DOMAINS = 'pedagolyautey.org,lyceelyautey.org';
  process.env.GOOGLE_OAUTH_ALLOWED_EMAILS = 'oliv.arn.lau@gmail.com';
  process.env.FRONTEND_ORIGIN = 'http://localhost:3000';
  await initSchema();
});

function decodeOAuthPayloadFromRedirect(location) {
  const hashPart = String(location || '').split('#')[1] || '';
  const params = new URLSearchParams(hashPart);
  const encoded = params.get('oauth');
  if (!encoded) return null;
  return JSON.parse(Buffer.from(decodeURIComponent(encoded), 'base64url').toString('utf8'));
}

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
    assert.strictEqual(res.body.password_hash, undefined);
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
    assert.strictEqual(res.body.password_hash, undefined);
  });

  it('POST /api/auth/login accepte identifier=email', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ identifier: email, password })
      .expect(200);
    assert.strictEqual(res.body.first_name, firstName);
    assert.strictEqual(res.body.password_hash, undefined);
  });

  it('POST /api/auth/login refuse firstName+lastName (users-only identifier)', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ firstName, lastName, password })
      .expect(400);
    assert.ok(String(res.body.error || '').includes('Identifiant'));
  });

  it('POST /api/auth/login avec mauvais mot de passe renvoie 401', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ identifier: email, password: 'wrong' })
      .expect(401);
    assert.ok(res.body.error);
    const evt = await queryOne(
      "SELECT action, result FROM security_events WHERE action = 'auth.login.student' ORDER BY id DESC LIMIT 1"
    );
    assert.ok(evt);
    assert.strictEqual(evt.result, 'failure');
  });

  it('POST /api/auth/login compte inexistant renvoie 401', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ identifier: `nobody_${Date.now()}@example.com`, password: 'x' })
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
    const student = await queryOne("SELECT id FROM users WHERE user_type = 'student' AND LOWER(email)=LOWER(?) LIMIT 1", [email]);
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

  it('POST /api/auth/login authentifie un compte prof email/mot de passe', async () => {
    const teacherEmail = `prof_${Date.now()}@example.com`;
    const teacherPassword = 'teacherPwd123';
    const hash = await bcrypt.hash(teacherPassword, 10);
    const now = new Date().toISOString();
    await execute(
      `INSERT INTO users
        (id, user_type, legacy_user_id, email, pseudo, first_name, last_name, display_name, description, avatar_path, affiliation, password_hash, auth_provider, is_active, last_seen, created_at, updated_at)
       VALUES (?, 'teacher', NULL, ?, ?, NULL, NULL, ?, NULL, NULL, 'both', ?, 'local', 1, ?, NOW(), NOW())`,
      [uuidv4(), teacherEmail, teacherEmail.split('@')[0], 'Prof Test', hash, now]
    );

    const res = await request(app)
      .post('/api/auth/login')
      .send({ identifier: teacherEmail, password: teacherPassword })
      .expect(200);
    assert.ok(res.body.authToken);
    assert.strictEqual(res.body.user_type, 'teacher');
    const evt = await queryOne(
      "SELECT action, result FROM security_events WHERE action = 'auth.login' ORDER BY id DESC LIMIT 1"
    );
    assert.ok(evt);
    assert.strictEqual(evt.result, 'success');
  });

  it('POST /api/auth/login admin permet les routes élévation sans PIN', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({
        identifier: process.env.TEACHER_ADMIN_EMAIL,
        password: process.env.TEACHER_ADMIN_PASSWORD,
      })
      .expect(200);
    assert.ok(res.body.authToken);

    const profiles = await request(app)
      .get('/api/rbac/profiles')
      .set('Authorization', `Bearer ${res.body.authToken}`)
      .expect(200);
    assert.ok(Array.isArray(profiles.body));
    assert.ok(profiles.body.some((r) => r.slug === 'admin'));
  });

  it('GET /api/auth/google/start redirige vers Google avec state', async () => {
    const res = await request(app)
      .get('/api/auth/google/start?mode=student')
      .expect(302);
    assert.ok(String(res.headers.location || '').startsWith('https://accounts.google.com/o/oauth2/v2/auth?'));
    assert.ok((res.headers['set-cookie'] || []).some((c) => c.startsWith('foretmap_oauth_state=')));
  });

  it('GET /api/auth/google/callback refuse un state invalide', async () => {
    const res = await request(app)
      .get('/api/auth/google/callback?state=bad&code=abc')
      .set('Cookie', ['foretmap_oauth_state=good', 'foretmap_oauth_mode=student'])
      .expect(302);
    assert.ok(String(res.headers.location || '').includes('oauth_invalid_state'));
  });

  it('GET /api/auth/google/callback connecte un professeur existant', async () => {
    const teacherEmail = 'oauth.prof@pedagolyautey.org';
    const now = new Date().toISOString();
    await execute(
      `INSERT INTO users
        (id, user_type, legacy_user_id, email, pseudo, first_name, last_name, display_name, description, avatar_path, affiliation, password_hash, auth_provider, is_active, last_seen, created_at, updated_at)
       VALUES (?, 'teacher', NULL, ?, ?, NULL, NULL, ?, NULL, NULL, 'both', ?, 'local', 1, ?, NOW(), NOW())`,
      [uuidv4(), teacherEmail, teacherEmail.split('@')[0], 'Prof OAuth', await bcrypt.hash('dummy-password', 10), now]
    );
    authRouter.__setGoogleOAuthHooks({
      exchangeCode: async () => ({ id_token: 'token-prof' }),
      verifyIdToken: async () => ({
        aud: process.env.GOOGLE_OAUTH_CLIENT_ID,
        iss: 'https://accounts.google.com',
        email: teacherEmail,
        email_verified: true,
        hd: 'pedagolyautey.org',
      }),
    });
    const res = await request(app)
      .get('/api/auth/google/callback?state=ok&code=code-prof')
      .set('Cookie', ['foretmap_oauth_state=ok', 'foretmap_oauth_mode=teacher'])
      .expect(302);
    const payload = decodeOAuthPayloadFromRedirect(res.headers.location);
    assert.strictEqual(payload?.type, 'teacher');
    assert.ok(payload?.token);
    authRouter.__setGoogleOAuthHooks();
  });

  it('GET /api/auth/google/callback crée un élève OAuth si absent', async () => {
    const studentEmail = `oauth_student_${Date.now()}@lyceelyautey.org`;
    authRouter.__setGoogleOAuthHooks({
      exchangeCode: async () => ({ id_token: 'token-student' }),
      verifyIdToken: async () => ({
        aud: process.env.GOOGLE_OAUTH_CLIENT_ID,
        iss: 'accounts.google.com',
        email: studentEmail,
        email_verified: true,
        hd: 'lyceelyautey.org',
        given_name: 'Google',
        family_name: 'Student',
        name: 'Google Student',
      }),
    });
    const res = await request(app)
      .get('/api/auth/google/callback?state=ok2&code=code-student')
      .set('Cookie', ['foretmap_oauth_state=ok2', 'foretmap_oauth_mode=student'])
      .expect(302);
    const payload = decodeOAuthPayloadFromRedirect(res.headers.location);
    assert.strictEqual(payload?.type, 'student');
    assert.ok(payload?.student?.id);
    assert.strictEqual(String(payload?.student?.email || '').toLowerCase(), studentEmail.toLowerCase());
    const created = await queryOne("SELECT id, email FROM users WHERE user_type = 'student' AND LOWER(email)=LOWER(?) LIMIT 1", [studentEmail]);
    assert.ok(created?.id);
    authRouter.__setGoogleOAuthHooks();
  });

  it('GET /api/auth/google/callback refuse un email non autorisé', async () => {
    authRouter.__setGoogleOAuthHooks({
      exchangeCode: async () => ({ id_token: 'token-denied' }),
      verifyIdToken: async () => ({
        aud: process.env.GOOGLE_OAUTH_CLIENT_ID,
        iss: 'https://accounts.google.com',
        email: 'intrus@example.com',
        email_verified: true,
        hd: 'example.com',
      }),
    });
    const res = await request(app)
      .get('/api/auth/google/callback?state=ok3&code=code-denied')
      .set('Cookie', ['foretmap_oauth_state=ok3', 'foretmap_oauth_mode=student'])
      .expect(302);
    assert.ok(String(res.headers.location || '').includes('oauth_email_not_allowed'));
    authRouter.__setGoogleOAuthHooks();
  });

  it('POST /api/auth/teacher/reset-password met à jour le mot de passe prof', async () => {
    const teacherEmail = `prof_reset_${Date.now()}@example.com`;
    const oldPassword = 'oldPass1';
    const newPassword = 'newPass2';
    const hash = await bcrypt.hash(oldPassword, 10);
    const now = new Date().toISOString();
    const teacherId = uuidv4();
    await execute(
      `INSERT INTO users
        (id, user_type, legacy_user_id, email, pseudo, first_name, last_name, display_name, description, avatar_path, affiliation, password_hash, auth_provider, is_active, last_seen, created_at, updated_at)
       VALUES (?, 'teacher', NULL, ?, ?, NULL, NULL, ?, NULL, NULL, 'both', ?, 'local', 1, ?, NOW(), NOW())`,
      [teacherId, teacherEmail, teacherEmail.split('@')[0], 'Prof Reset', hash, now]
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
      .post('/api/auth/login')
      .send({ identifier: teacherEmail, password: newPassword })
      .expect(200);
    assert.ok(login.body.authToken);
  });
});
