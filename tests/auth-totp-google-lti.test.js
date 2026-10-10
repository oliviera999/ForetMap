'use strict';

/**
 * Double authentification après une connexion Google ou un lancement Moodle/LTI : un compte
 * administrateur ou n3boss ne reçoit pas de session dans la charge `#oauth=`, mais l'étape du
 * second facteur (`type: 'mfa'`) ; un élève n'est jamais concerné. Google est simulé par les
 * crochets du routeur (aucun appel réseau) ; tous les comptes sont fictifs.
 */

require('./helpers/setup');
const crypto = require('node:crypto');
process.env.TOTP_ENCRYPTION_KEY = crypto.randomBytes(32).toString('hex');

const { test, before, after, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');

const { app } = require('../server');
const authRouter = require('../routes/auth');
const { initSchema, execute, queryOne } = require('../database');
const { setSetting } = require('../lib/settings');
const { setAssignedRole, recomputeUserRole } = require('../lib/effectiveRole');
const totp = require('../lib/auth/totp');
const store = require('../lib/auth/totpStore');
const { issueTicket } = require('../lib/lti/session');
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
  'security.totp.enforcement',
  'integration.google.enabled',
  'ui.auth.allow_google_teacher',
  'ui.auth.allow_google_student',
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
});

after(async () => {
  for (const key of ENV_KEYS) {
    if (savedEnv[key] === undefined) delete process.env[key];
    else process.env[key] = savedEnv[key];
  }
  for (const snap of snapshots) await restoreSetting(snap);
  authRouter.__setGoogleOAuthHooks();
  if (created.length) {
    await execute(`DELETE FROM users WHERE id IN (${created.map(() => '?').join(', ')})`, created);
  }
});

afterEach(() => {
  authRouter.__setGoogleOAuthHooks();
});

async function createAccount({ userType = 'teacher', roleSlug }) {
  const id = crypto.randomUUID();
  const stamp = crypto.randomUUID().slice(0, 8);
  const email = `mfa.${stamp}@example.org`;
  await execute(
    `INSERT INTO users (id, user_type, email, pseudo, first_name, last_name, display_name, auth_provider, is_active, created_at, updated_at)
     VALUES (?, ?, ?, ?, 'Mfa', ?, ?, 'google', 1, NOW(), NOW())`,
    [id, userType, email, `mfa_${stamp}`, stamp, `Mfa ${stamp}`],
  );
  if (roleSlug) {
    const role = await queryOne('SELECT id FROM roles WHERE slug = ? LIMIT 1', [roleSlug]);
    await setAssignedRole(id, role.id);
  }
  await recomputeUserRole(id);
  created.push(id);
  return { id, email };
}

async function enrollAccount(userId) {
  const current = totp.timeStep(Date.now());
  const started = await store.startEnrollment(userId);
  const confirmNow = (current - 1) * 30000 + 1000;
  const res = await store.confirmEnrollment(userId, totp.totpAt(started.secret, confirmNow), {
    nowMs: confirmNow,
  });
  assert.equal(res.ok, true);
  return { secret: started.secret, lastStep: current - 1 };
}

function freshCode(enrolled) {
  const current = totp.timeStep(Date.now());
  const step = Math.max(current - 1, enrolled.lastStep + 1);
  enrolled.lastStep = step;
  return totp.hotp(enrolled.secret, step);
}

function decodePayload(location) {
  const hash = new URLSearchParams(String(location).split('#')[1] || '');
  const raw = hash.get('oauth');
  return raw ? JSON.parse(Buffer.from(raw, 'base64url').toString('utf8')) : null;
}

async function googleCallback({ email, mode }) {
  authRouter.__setGoogleOAuthHooks({
    exchangeCode: async () => ({ id_token: 'id-token-mfa' }),
    verifyIdToken: async () => ({
      aud: CLIENT_ID,
      iss: 'https://accounts.google.com',
      email_verified: true,
      email,
      hd: 'example.org',
      sub: `sub-${email}`,
      name: 'Mfa Test',
    }),
  });
  const state = crypto.randomUUID();
  const res = await request(app)
    .get(`/api/auth/google/callback?state=${state}&code=code-mfa`)
    .set('Cookie', [`foretmap_oauth_state=${state}`, `foretmap_oauth_mode=${mode}`])
    .expect(302);
  return {
    location: String(res.headers.location || ''),
    payload: decodePayload(res.headers.location),
  };
}

test('Google, compte administrateur enrôlé : étape TOTP, puis session complète', async () => {
  await setSetting('security.totp.enforcement', 'enroll', {});
  const admin = await createAccount({ roleSlug: 'admin' });
  const enrolled = await enrollAccount(admin.id);
  const { payload } = await googleCallback({ email: admin.email, mode: 'teacher' });
  assert.equal(payload.type, 'mfa', JSON.stringify(payload));
  assert.equal(payload.stage, 'verify');
  assert.equal(payload.next, 'teacher');
  assert.equal(payload.token, undefined);
  assert.ok(payload.mfaToken);
  const done = await request(app)
    .post('/api/auth/totp/verify')
    .send({ mfaToken: payload.mfaToken, code: freshCode(enrolled) })
    .expect(200);
  assert.ok(done.body.authToken);
  assert.equal(done.body.sessionKind, 'teacher');
  assert.equal(done.body.auth.mfa, true);
});

test('Google, prof non enrôlé en « required » : enrôlement imposé, aucun jeton de session', async () => {
  await setSetting('security.totp.enforcement', 'required', {});
  const prof = await createAccount({ roleSlug: 'prof' });
  const { location, payload } = await googleCallback({ email: prof.email, mode: 'teacher' });
  assert.equal(payload.type, 'mfa');
  assert.equal(payload.stage, 'enroll');
  assert.ok(!/authToken|"token"/.test(JSON.stringify(payload)));
  assert.ok(location.startsWith(`${ORIGIN}/#oauth=`));
});

test('Google, plan des personnels : même étape, retour attendu « staff »', async () => {
  await setSetting('security.totp.enforcement', 'enroll', {});
  const prof = await createAccount({ roleSlug: 'prof' });
  const enrolled = await enrollAccount(prof.id);
  const { payload } = await googleCallback({ email: prof.email, mode: 'staff' });
  assert.equal(payload.type, 'mfa');
  assert.equal(payload.next, 'staff');
  const done = await request(app)
    .post('/api/auth/totp/verify')
    .send({ mfaToken: payload.mfaToken, code: freshCode(enrolled) })
    .expect(200);
  assert.equal(done.body.sessionKind, 'staff');
  assert.ok(done.body.authToken);
});

test('Google, règle sur le profil effectif : un compte élève promu n3boss est soumis, un élève jamais', async () => {
  await setSetting('security.totp.enforcement', 'required', {});
  const promoted = await createAccount({ userType: 'student', roleSlug: 'prof' });
  const promotedLogin = await googleCallback({ email: promoted.email, mode: 'student' });
  assert.equal(promotedLogin.payload.type, 'mfa');
  assert.equal(promotedLogin.payload.next, 'student');

  const student = await createAccount({ userType: 'student' });
  const { payload } = await googleCallback({ email: student.email, mode: 'student' });
  assert.equal(payload.type, 'student');
  assert.ok(payload.student.authToken);
});

function ltiTicket(userId) {
  return issueTicket({
    userId,
    destination: { instructor: true, destinations: [{ id: 'fm', product: 'fm', landing: 'map' }] },
    report: {},
  });
}

test('Moodle/LTI, administrateur : l’arrivée renvoie l’étape TOTP, pas de jeton', async () => {
  await setSetting('security.totp.enforcement', 'required', {});
  const admin = await createAccount({ roleSlug: 'admin' });
  const res = await request(app)
    .post('/api/lti/session')
    .send({ ticket: ltiTicket(admin.id), destinationId: 'fm' })
    .expect(200);
  assert.equal(res.body.type, 'mfa');
  assert.equal(res.body.token, null);
  const payload = decodePayload(res.body.redirectUrl);
  assert.equal(payload.type, 'mfa');
  assert.equal(payload.stage, 'enroll');
  assert.equal(payload.next, 'teacher');

  // Un élève qui arrive du même cours n'est jamais concerné.
  const student = await createAccount({ userType: 'student', roleSlug: 'eleve_novice' });
  const studentRes = await request(app)
    .post('/api/lti/session')
    .send({
      ticket: issueTicket({
        userId: student.id,
        destination: {
          instructor: false,
          destinations: [{ id: 'fm', product: 'fm', landing: 'map' }],
        },
        report: {},
      }),
      destinationId: 'fm',
    })
    .expect(200);
  assert.ok(studentRes.body.token);
  assert.equal(studentRes.body.type, 'student');
});

test('Moodle/LTI, administrateur enrôlé : code TOTP puis session complète', async () => {
  await setSetting('security.totp.enforcement', 'enroll', {});
  const admin = await createAccount({ roleSlug: 'admin' });
  const enrolled = await enrollAccount(admin.id);
  const res = await request(app)
    .post('/api/lti/session')
    .send({ ticket: ltiTicket(admin.id), destinationId: 'fm' })
    .expect(200);
  const payload = decodePayload(res.body.redirectUrl);
  assert.equal(payload.stage, 'verify');
  const done = await request(app)
    .post('/api/auth/totp/verify')
    .send({ mfaToken: payload.mfaToken, code: freshCode(enrolled) })
    .expect(200);
  assert.ok(done.body.authToken);
  assert.equal(done.body.sessionKind, 'teacher');
});
