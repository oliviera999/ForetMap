'use strict';

/**
 * Audit ForetMap du 19/11/2026, lot 3 (authentification, mots de passe) — constats A3, A7, A9,
 * A10 et A13 (inscription), rejoués d'après les scénarios de `AUDIT_BUGS_FORETMAP_2026-11-19.md`.
 * Google est simulé par les crochets du routeur (aucun appel réseau). Comptes fictifs.
 */

require('./helpers/setup');
const { test, before, after, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const bcrypt = require('bcryptjs');
const request = require('supertest');

const { app } = require('../server');
const authRouter = require('../routes/auth');
const { initSchema, queryOne, execute } = require('../database');
const { signAuthToken } = require('../middleware/requireTeacher');
const { recomputeUserRole } = require('../lib/effectiveRole');
const { setSetting } = require('../lib/settings');
const {
  createPasswordResetToken,
  resetForgotPasswordLimiterForTests,
} = require('../lib/passwordReset');
const { snapshotSetting, restoreSetting } = require('./helpers/settingsSnapshot');

const ORIGIN = 'http://localhost:3000';
const CLIENT_ID = 'test-google-client-id.apps.googleusercontent.com';
const ENV_KEYS = [
  'GOOGLE_OAUTH_CLIENT_ID',
  'GOOGLE_OAUTH_CLIENT_SECRET',
  'GOOGLE_OAUTH_REDIRECT_URI',
  'GOOGLE_OAUTH_ALLOWED_DOMAINS',
  'GOOGLE_OAUTH_ALLOWED_EMAILS',
  'FRONTEND_ORIGIN',
];
const SETTING_KEYS = [
  'integration.google.enabled',
  'ui.auth.allow_google_teacher',
  'ui.auth.allow_google_student',
  'ui.auth.allow_register',
];
const savedEnv = {};
const snapshots = [];
const created = [];

before(async () => {
  for (const key of ENV_KEYS) savedEnv[key] = process.env[key];
  process.env.GOOGLE_OAUTH_CLIENT_ID = CLIENT_ID;
  process.env.GOOGLE_OAUTH_CLIENT_SECRET = 'test-google-client-secret';
  process.env.GOOGLE_OAUTH_REDIRECT_URI = `${ORIGIN}/api/auth/google/callback`;
  process.env.GOOGLE_OAUTH_ALLOWED_DOMAINS = 'example.org';
  process.env.GOOGLE_OAUTH_ALLOWED_EMAILS = '';
  process.env.FRONTEND_ORIGIN = ORIGIN;
  await initSchema();
  for (const key of SETTING_KEYS) snapshots.push(await snapshotSetting(key));
  await setSetting('integration.google.enabled', true, {});
  await setSetting('ui.auth.allow_google_teacher', true, {});
  await setSetting('ui.auth.allow_google_student', true, {});
  await setSetting('ui.auth.allow_register', true, {});
});

after(async () => {
  for (const key of ENV_KEYS) {
    if (savedEnv[key] === undefined) delete process.env[key];
    else process.env[key] = savedEnv[key];
  }
  for (const snap of snapshots) await restoreSetting(snap);
  authRouter.__setGoogleOAuthHooks();
  resetForgotPasswordLimiterForTests();
  if (created.length) {
    await execute(`DELETE FROM users WHERE id IN (${created.map(() => '?').join(', ')})`, created);
  }
});

afterEach(() => {
  authRouter.__setGoogleOAuthHooks();
});

async function createAccount({ userType = 'student', password = null, email, provider }) {
  const id = crypto.randomUUID();
  const stamp = crypto.randomUUID().slice(0, 8);
  const finalEmail = email === undefined ? `lot3.${stamp}@example.org` : email;
  const hash = password ? await bcrypt.hash(password, 10) : null;
  await execute(
    `INSERT INTO users (id, user_type, email, pseudo, first_name, last_name, display_name, password_hash, auth_provider, is_active, created_at, updated_at)
     VALUES (?, ?, ?, ?, 'Lot', ?, ?, ?, ?, 1, NOW(), NOW())`,
    [
      id,
      userType,
      finalEmail,
      `lot3_${stamp}`,
      stamp,
      `Lot ${stamp}`,
      hash,
      provider || (password ? 'local' : 'google'),
    ],
  );
  await recomputeUserRole(id);
  created.push(id);
  return { id, email: finalEmail, pseudo: `lot3_${stamp}` };
}

async function tokenFor(userType, userId) {
  const role = await queryOne(
    `SELECT r.id, r.slug, r.\`rank\` FROM user_roles ur INNER JOIN roles r ON r.id = ur.role_id
      WHERE ur.user_type = ? AND ur.user_id = ? AND ur.is_primary = 1 LIMIT 1`,
    [userType, userId],
  );
  const epoch = await queryOne('SELECT token_epoch FROM users WHERE id = ?', [userId]);
  return signAuthToken({
    userType,
    userId,
    roleId: role.id,
    roleSlug: role.slug,
    roleRank: role.rank,
    tokenEpoch: Number(epoch?.token_epoch || 0),
  });
}

function decodePayload(location) {
  const hash = new URLSearchParams(String(location).split('#')[1] || '');
  const raw = hash.get('oauth');
  return raw ? JSON.parse(Buffer.from(raw, 'base64url').toString('utf8')) : null;
}

// ── A3 ─────────────────────────────────────────────────────────────────────────────────────

test('A3 : un compte Google sans mot de passe n’en pose pas un par la session seule — un lien part à l’adresse en place', async () => {
  resetForgotPasswordLimiterForTests();
  const victim = await createAccount({ userType: 'student', password: null });
  const stolen = await tokenFor('student', victim.id);

  const res = await request(app)
    .post('/api/auth/me/password')
    .set('Authorization', `Bearer ${stolen}`)
    .send({ newPassword: 'PrisDeForce-2026' })
    .expect(202);
  assert.equal(res.body.linkSent, true);
  assert.match(String(res.body.message), /lien/i);
  assert.ok(!res.body.authToken, 'aucun jeton neuf : rien n’a changé');

  const row = await queryOne('SELECT password_hash, email FROM users WHERE id = ?', [victim.id]);
  assert.equal(row.password_hash, null, 'aucun mot de passe posé');
  assert.equal(row.email, victim.email);
  const link = await queryOne(
    "SELECT id FROM password_reset_tokens WHERE user_type = 'student' AND user_id = ? AND used_at IS NULL",
    [victim.id],
  );
  assert.ok(link, 'jeton de définition créé pour l’adresse en place');

  // Le scénario de l'audit échoue : pas de connexion avec le mot de passe « posé »…
  const login = await request(app)
    .post('/api/auth/login')
    .send({ identifier: victim.pseudo, password: 'PrisDeForce-2026' });
  assert.equal(login.status, 401);
  // … et le changement d'e-mail reste refusé (garde AC3).
  const swap = await request(app)
    .patch('/api/auth/me/profile')
    .set('Authorization', `Bearer ${stolen}`)
    .send({ email: 'pirate@example.org', currentPassword: 'PrisDeForce-2026' });
  assert.equal(swap.status, 403);
  assert.equal(swap.body.code, 'EMAIL_CHANGE_NEEDS_PASSWORD');
  resetForgotPasswordLimiterForTests();
});

test('A3 : le lien reçu définit bien le mot de passe (voie « réinitialisation »)', async () => {
  const account = await createAccount({ userType: 'student', password: null });
  const token = await createPasswordResetToken('student', account.id);
  await request(app)
    .post('/api/auth/reset-password')
    .send({ token, password: 'premier1234' })
    .expect(200);
  await request(app)
    .post('/api/auth/login')
    .send({ identifier: account.pseudo, password: 'premier1234' })
    .expect(200);
});

test('A3 : sans adresse e-mail, aucun lien possible → 409 explicite, rien n’est posé', async () => {
  const account = await createAccount({ userType: 'student', password: null, email: null });
  const token = await tokenFor('student', account.id);
  const res = await request(app)
    .post('/api/auth/me/password')
    .set('Authorization', `Bearer ${token}`)
    .send({ newPassword: 'premier1234' })
    .expect(409);
  assert.equal(res.body.code, 'PASSWORD_SETUP_NO_EMAIL');
  const row = await queryOne('SELECT password_hash FROM users WHERE id = ?', [account.id]);
  assert.equal(row.password_hash, null);
});

test('A3 : compte enseignant Google sans mot de passe → lien de type « teacher »', async () => {
  resetForgotPasswordLimiterForTests();
  const teacher = await createAccount({ userType: 'teacher', password: null });
  const token = await tokenFor('teacher', teacher.id);
  await request(app)
    .post('/api/auth/me/password')
    .set('Authorization', `Bearer ${token}`)
    .send({ newPassword: 'PremierSolide!2026' })
    .expect(202);
  const link = await queryOne(
    "SELECT id FROM password_reset_tokens WHERE user_type = 'teacher' AND user_id = ? AND used_at IS NULL",
    [teacher.id],
  );
  assert.ok(link);
  resetForgotPasswordLimiterForTests();
});

test('A3 : verifyCurrentPassword ne laisse plus passer un compte sans mot de passe', async () => {
  const { verifyCurrentPassword } = require('../lib/profileUpdate');
  const res = await verifyCurrentPassword({ password_hash: null }, {});
  assert.equal(res.ok, false);
});

// ── A9 / A10 ───────────────────────────────────────────────────────────────────────────────

for (const kind of ['student', 'teacher']) {
  const route =
    kind === 'student' ? '/api/auth/reset-password' : '/api/auth/teacher/reset-password';
  const good = kind === 'student' ? 'valable1234' : 'ValableSolide!2026';
  for (const [label, bad] of [
    ['nombre', 123456789012345],
    ['objet', { a: 'b' }],
    ['tableau', ['MotDePasseTableau1']],
  ]) {
    test(`A9 : ${route} avec un mot de passe ${label} → 400, et le jeton reste utilisable`, async () => {
      const account = await createAccount({ userType: kind, password: 'ancien-mdp-1234' });
      const token = await createPasswordResetToken(kind, account.id);
      const res = await request(app).post(route).send({ token, password: bad });
      assert.equal(res.status, 400);
      await request(app).post(route).send({ token, password: good }).expect(200);
    });
  }
}

test('A10 : la réinitialisation par e-mail d’un mot de passe enseignant lève password_must_reset', async () => {
  const teacher = await createAccount({ userType: 'teacher', password: 'Provisoire!2026x' });
  await execute('UPDATE users SET password_must_reset = 1 WHERE id = ?', [teacher.id]);
  const token = await createPasswordResetToken('teacher', teacher.id);
  await request(app)
    .post('/api/auth/teacher/reset-password')
    .send({ token, password: 'DefinitifSolide!2026' })
    .expect(200);
  const row = await queryOne('SELECT password_must_reset FROM users WHERE id = ?', [teacher.id]);
  assert.equal(Number(row.password_must_reset), 0);
});

// ── A13 (inscription) ─────────────────────────────────────────────────────────────────────

test('A13 : POST /api/auth/register avec un prénom ou un nom non textuel → 400', async () => {
  for (const body of [
    { firstName: 123, lastName: 'Dupont' },
    { firstName: 'Jean', lastName: { x: 1 } },
    { firstName: ['Jean'], lastName: 'Dupont' },
  ]) {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ ...body, password: 'motdepasse1234' });
    assert.equal(res.status, 400, JSON.stringify(body));
    assert.match(String(res.body.error), /Prénom et nom requis/);
  }
});

// ── A7 ─────────────────────────────────────────────────────────────────────────────────────

async function googleCallbackWithoutModeCookie(email) {
  authRouter.__setGoogleOAuthHooks({
    exchangeCode: async () => ({ id_token: 'id-token-lot3' }),
    verifyIdToken: async () => ({
      aud: CLIENT_ID,
      iss: 'https://accounts.google.com',
      email_verified: true,
      email,
      hd: 'example.org',
      sub: `sub-${email}`,
      name: 'Lot Trois',
    }),
  });
  const state = crypto.randomUUID();
  // Rappel sans le cookie de mode : la voie qui retombait en mode élève.
  const res = await request(app)
    .get(`/api/auth/google/callback?state=${state}&code=code-lot3`)
    .set('Cookie', [`foretmap_oauth_state=${state}`])
    .expect(302);
  return String(res.headers.location || '');
}

test('A7 : connexion Google élève coupée — un rappel sans cookie de mode ne donne pas de session élève', async () => {
  const student = await createAccount({ userType: 'student', password: null });
  await setSetting('ui.auth.allow_google_student', false, {});
  try {
    // `start?mode=teacher` passe la garde de démarrage (réglage enseignant ouvert).
    const start = await request(app).get('/api/auth/google/start?mode=teacher');
    assert.equal(start.status, 302);
    const location = await googleCallbackWithoutModeCookie(student.email);
    assert.match(location, /oauth_student_google_disabled/);
    assert.equal(decodePayload(location), null, 'aucune charge de session');
  } finally {
    await setSetting('ui.auth.allow_google_student', true, {});
  }
  // Réglage ouvert : la connexion élève fonctionne toujours.
  const ok = await googleCallbackWithoutModeCookie(student.email);
  const payload = decodePayload(ok);
  assert.equal(payload?.type, 'student');
  assert.ok(payload?.student?.authToken, 'session élève délivrée quand le réglage est ouvert');
});
