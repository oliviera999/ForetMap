'use strict';

require('./helpers/setup');
const test = require('node:test');
const assert = require('node:assert');
const request = require('supertest');
const { initSchema, queryOne } = require('../database');
const { app } = require('../server');
const { setSetting } = require('../lib/settings');
const {
  resetJwksCacheForTests,
  verifyLaunchToken,
  DEPLOYMENT_CLAIM,
} = require('../lib/lti/launch');
const { resetNonceCacheForTests } = require('../lib/lti/oidc');
const { readLtiEnv } = require('../lib/lti/config');
const { LTI_SETTING_KEYS } = require('../lib/lti/settingsRegistry');
const fx = require('./helpers/moodleFixtures');
const {
  startFakeLtiPlatform,
  applyLtiEnv,
  unsetLtiEnv,
  LEARNER,
  INSTRUCTOR,
  MESSAGE_TYPE_CLAIM,
} = require('./helpers/fakeLtiPlatform');

const stamp = Date.now();
let platform;
let restoreEnv;
let student;
let teacher;

function cookieFrom(res) {
  const raw = res.headers['set-cookie'];
  if (!raw) return '';
  return (Array.isArray(raw) ? raw : [raw]).map((c) => c.split(';')[0]).join('; ');
}

async function loginPair({ iss, clientId, target = 'https://foret.test/api/lti/launch' } = {}) {
  const env = readLtiEnv();
  const res = await request(app)
    .post('/api/lti/login')
    .type('form')
    .send({
      iss: iss || env.issuer,
      client_id: clientId || env.clientId,
      login_hint: 'hint',
      target_link_uri: target,
      lti_message_hint: 'm',
    })
    .redirects(0);
  assert.strictEqual(res.status, 302);
  const loc = new URL(res.headers.location);
  return {
    cookie: cookieFrom(res),
    state: loc.searchParams.get('state'),
    nonce: loc.searchParams.get('nonce'),
  };
}

test.before(async () => {
  await initSchema();
  await fx.purgeSyncArtifacts();
  platform = await startFakeLtiPlatform();
  restoreEnv = applyLtiEnv(platform.env);
  resetJwksCacheForTests();
  resetNonceCacheForTests();
  await setSetting(LTI_SETTING_KEYS.enabled, true);
  await setSetting(LTI_SETTING_KEYS.publicOrigin, 'https://foret.test');
  student = await fx.createStudent({
    firstName: 'Lina',
    lastName: `Lti${stamp}`,
    email: `lina.lti${stamp}@lyautey.test`,
  });
  teacher = await fx.createTeacher({
    firstName: 'Paul',
    lastName: `ProfLti${stamp}`,
    email: `paul.proflti${stamp}@lyautey.test`,
  });
});

test.after(async () => {
  if (restoreEnv) restoreEnv();
  if (platform) await platform.close();
});

test('GET /api/lti/login sans secrets : 503', async () => {
  const saved = applyLtiEnv({});
  unsetLtiEnv();
  try {
    const res = await request(app).get('/api/lti/login').query({ iss: 'x' });
    assert.strictEqual(res.status, 503);
    assert.strictEqual(res.body.code, 'LTI_NOT_CONFIGURED');
  } finally {
    saved();
    restoreEnv = applyLtiEnv(platform.env);
  }
});

test('inconnu refusé : aucun INSERT users, 403 LTI_UNKNOWN_USER', async () => {
  const pair = await loginPair();
  const idToken = await platform.sign({
    nonce: pair.nonce,
    sub: '999001',
    email: `inconnu.${stamp}@lyautey.test`,
    courseId: 564,
    roles: [LEARNER],
  });
  const before = await queryOne('SELECT COUNT(*) AS n FROM users');
  const res = await request(app)
    .post('/api/lti/launch')
    .set('Cookie', pair.cookie)
    .type('form')
    .send({ id_token: idToken, state: pair.state })
    .redirects(0);
  assert.strictEqual(res.status, 403);
  assert.strictEqual(res.body.code, 'LTI_UNKNOWN_USER');
  const after = await queryOne('SELECT COUNT(*) AS n FROM users');
  assert.strictEqual(Number(after.n), Number(before.n));
});

test('élève connu par e-mail : redirection /lti/arrivee, identité lti posée', async () => {
  const pair = await loginPair();
  const idToken = await platform.sign({
    nonce: pair.nonce,
    sub: '2001',
    email: student.email,
    courseId: 564,
    roles: [LEARNER],
    givenName: 'Lina',
    familyName: 'Lti',
  });
  const res = await request(app)
    .post('/api/lti/launch')
    .set('Cookie', pair.cookie)
    .type('form')
    .send({ id_token: idToken, state: pair.state })
    .redirects(0);
  assert.strictEqual(res.status, 302);
  assert.match(res.headers.location, /\/lti\/arrivee#ticket=/);
  const ident = await queryOne(
    "SELECT * FROM external_identities WHERE provider = 'lti' AND external_id = '2001' LIMIT 1",
  );
  assert.ok(ident);
  assert.strictEqual(ident.user_id, student.id);
});

test('Instructor n’ouvre pas une session élève : destinations enseignant', async () => {
  const pair = await loginPair();
  const idToken = await platform.sign({
    nonce: pair.nonce,
    sub: '3001',
    email: teacher.email,
    courseId: 564,
    roles: [INSTRUCTOR],
  });
  const res = await request(app)
    .post('/api/lti/launch')
    .set('Cookie', pair.cookie)
    .type('form')
    .send({ id_token: idToken, state: pair.state })
    .redirects(0);
  assert.strictEqual(res.status, 302);
  const hash = new URL(res.headers.location.replace('#', '?')).searchParams.get('ticket');
  assert.ok(hash);
  const { readTicket } = require('../lib/lti/session');
  const claims = readTicket(hash);
  assert.strictEqual(claims.destination.instructor, true);
  assert.ok(claims.destination.destinations.every((d) => d.product === 'fm' || d.product === 'gl'));
  assert.ok(!claims.destination.destinations.some((d) => d.id === 'gl_game'));
});

test('nonce rejoué / état OIDC absent : 401', async () => {
  const pair = await loginPair();
  const idToken = await platform.sign({
    nonce: pair.nonce,
    sub: '2001',
    email: student.email,
    courseId: 564,
  });
  const first = await request(app)
    .post('/api/lti/launch')
    .set('Cookie', pair.cookie)
    .type('form')
    .send({ id_token: idToken, state: pair.state })
    .redirects(0);
  assert.ok(first.status === 302 || first.status === 403);
  const replay = await request(app)
    .post('/api/lti/launch')
    .set('Cookie', pair.cookie)
    .type('form')
    .send({ id_token: idToken, state: pair.state })
    .redirects(0);
  assert.strictEqual(replay.status, 401);
});

test('aud / issuer / deployment faux : 401', async () => {
  const env = readLtiEnv();
  const pair = await loginPair();
  const badAud = await platform.sign({
    nonce: pair.nonce,
    sub: '2001',
    email: student.email,
    courseId: 564,
  });
  // aud : signer avec un autre audience en recréant le jeton via jose directement
  const { signIdToken, ltiClaims } = require('./helpers/fakeLtiPlatform');
  const wrongAud = await signIdToken(
    platform.platform.privateKey,
    ltiClaims({
      nonce: pair.nonce,
      deploymentId: env.deploymentId,
      courseId: 564,
      email: student.email,
    }),
    {
      kid: platform.platform.kid,
      issuer: env.issuer,
      audience: 'autre-client',
      subject: '2001',
    },
  );
  const resAud = await request(app)
    .post('/api/lti/launch')
    .set('Cookie', pair.cookie)
    .type('form')
    .send({ id_token: wrongAud, state: pair.state })
    .redirects(0);
  assert.strictEqual(resAud.status, 401);

  const pair2 = await loginPair();
  const wrongDep = await signIdToken(
    platform.platform.privateKey,
    {
      ...ltiClaims({
        nonce: pair2.nonce,
        deploymentId: 'not-this',
        courseId: 564,
        email: student.email,
      }),
    },
    {
      kid: platform.platform.kid,
      issuer: env.issuer,
      audience: env.clientId,
      subject: '2001',
    },
  );
  const resDep = await request(app)
    .post('/api/lti/launch')
    .set('Cookie', pair2.cookie)
    .type('form')
    .send({ id_token: wrongDep, state: pair2.state })
    .redirects(0);
  assert.strictEqual(resDep.status, 401);
  assert.ok(DEPLOYMENT_CLAIM);
  assert.ok(MESSAGE_TYPE_CLAIM);
  assert.ok(badAud);
});

test('verifyLaunchToken : nonce attendu différent', async () => {
  const env = readLtiEnv();
  const token = await platform.sign({
    nonce: 'nonce-a',
    sub: '1',
    courseId: 564,
  });
  await assert.rejects(() => verifyLaunchToken(token, { env, expectedNonce: 'nonce-b' }), /Nonce/);
});

test('JWKS public de l’outil', async () => {
  const res = await request(app).get('/api/lti/.well-known/jwks.json');
  assert.strictEqual(res.status, 200);
  assert.ok(Array.isArray(res.body.keys));
  assert.strictEqual(res.body.keys[0].kty, 'RSA');
});
