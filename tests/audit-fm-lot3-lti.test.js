'use strict';

/**
 * Audit ForetMap du 19/11/2026, lot 3 — constat A5 : un compte de type élève au profil `prof`
 * ou `admin` entrait par un lancement LTI « Learner » avec toutes ses permissions (la garde
 * Instructor ne regardait que `user_type`). Plateforme LTI simulée, comptes fictifs.
 */

require('./helpers/setup');
const test = require('node:test');
const assert = require('node:assert');
const request = require('supertest');
const { initSchema, queryOne } = require('../database');
const { app } = require('../server');
const { setSetting } = require('../lib/settings');
const { setAssignedRole, recomputeUserRole } = require('../lib/effectiveRole');
const { resetJwksCacheForTests } = require('../lib/lti/launch');
const { resetNonceCacheForTests } = require('../lib/lti/oidc');
const { readLtiEnv } = require('../lib/lti/config');
const { LTI_SETTING_KEYS } = require('../lib/lti/settingsRegistry');
const { ltiLaunchRequiresInstructor } = require('../lib/lti/session');
const fx = require('./helpers/moodleFixtures');
const {
  startFakeLtiPlatform,
  applyLtiEnv,
  LEARNER,
  INSTRUCTOR,
} = require('./helpers/fakeLtiPlatform');

const stamp = Date.now();
let platform;
let restoreEnv;
let plainStudent;
let promotedProf;
let promotedAdmin;
let teacher;

function cookieFrom(res) {
  const raw = res.headers['set-cookie'];
  if (!raw) return '';
  return (Array.isArray(raw) ? raw : [raw]).map((c) => c.split(';')[0]).join('; ');
}

async function loginPair() {
  const env = readLtiEnv();
  const res = await request(app)
    .post('/api/lti/login')
    .type('form')
    .send({
      iss: env.issuer,
      client_id: env.clientId,
      login_hint: 'hint',
      target_link_uri: 'https://foret.test/api/lti/launch',
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

async function launch({ sub, email, roles }) {
  const pair = await loginPair();
  const idToken = await platform.sign({ nonce: pair.nonce, sub, email, courseId: 564, roles });
  return request(app)
    .post('/api/lti/launch')
    .set('Cookie', pair.cookie)
    .type('form')
    .send({ id_token: idToken, state: pair.state })
    .redirects(0);
}

async function promote(user, slug) {
  const role = await queryOne('SELECT id FROM roles WHERE slug = ? LIMIT 1', [slug]);
  assert.ok(role?.id, `profil ${slug} attendu`);
  await setAssignedRole(user.id, role.id);
  await recomputeUserRole(user.id);
}

test.before(async () => {
  await initSchema();
  platform = await startFakeLtiPlatform();
  restoreEnv = applyLtiEnv(platform.env);
  resetJwksCacheForTests();
  await resetNonceCacheForTests();
  await setSetting(LTI_SETTING_KEYS.enabled, true);
  await setSetting(LTI_SETTING_KEYS.publicOrigin, 'https://foret.test');
  plainStudent = await fx.createStudent({
    firstName: 'Lea',
    lastName: `Lot3Eleve${stamp}`,
    email: `lea.lot3${stamp}@lyautey.test`,
  });
  promotedProf = await fx.createStudent({
    firstName: 'Marc',
    lastName: `Lot3Prof${stamp}`,
    email: `marc.lot3${stamp}@lyautey.test`,
  });
  promotedAdmin = await fx.createStudent({
    firstName: 'Nina',
    lastName: `Lot3Admin${stamp}`,
    email: `nina.lot3${stamp}@lyautey.test`,
  });
  teacher = await fx.createTeacher({
    firstName: 'Omar',
    lastName: `Lot3Enseignant${stamp}`,
    email: `omar.lot3${stamp}@lyautey.test`,
  });
  await recomputeUserRole(plainStudent.id);
  await promote(promotedProf, 'prof');
  await promote(promotedAdmin, 'admin');
});

test.after(async () => {
  if (restoreEnv) restoreEnv();
  if (platform) await platform.close();
});

test('A5 : la garde Instructor suit le profil effectif, pas seulement user_type', async () => {
  assert.strictEqual(
    await ltiLaunchRequiresInstructor({ id: plainStudent.id, user_type: 'student' }),
    false,
  );
  assert.strictEqual(
    await ltiLaunchRequiresInstructor({ id: promotedProf.id, user_type: 'student' }),
    true,
  );
  assert.strictEqual(
    await ltiLaunchRequiresInstructor({ id: promotedAdmin.id, user_type: 'student' }),
    true,
  );
  assert.strictEqual(
    await ltiLaunchRequiresInstructor({ id: teacher.id, user_type: 'teacher' }),
    true,
  );
});

test('A5 : un compte élève promu prof entre en « Learner » → 403 LTI_TEACHER_ROLE_REQUIRED', async () => {
  const res = await launch({
    sub: `lot3-prof-${stamp}`,
    email: promotedProf.email,
    roles: [LEARNER],
  });
  assert.strictEqual(res.status, 403);
  assert.strictEqual(res.body.code, 'LTI_TEACHER_ROLE_REQUIRED');
});

test('A5 : un compte élève promu admin entre en « Learner » → 403', async () => {
  const res = await launch({
    sub: `lot3-admin-${stamp}`,
    email: promotedAdmin.email,
    roles: [LEARNER],
  });
  assert.strictEqual(res.status, 403);
  assert.strictEqual(res.body.code, 'LTI_TEACHER_ROLE_REQUIRED');
});

test('A5 : le même compte présenté Instructor entre ; un élève ordinaire entre en Learner', async () => {
  const asInstructor = await launch({
    sub: `lot3-prof-${stamp}`,
    email: promotedProf.email,
    roles: [INSTRUCTOR],
  });
  assert.strictEqual(asInstructor.status, 302);
  assert.match(asInstructor.headers.location, /\/lti\/arrivee#ticket=/);
  const learner = await launch({
    sub: `lot3-eleve-${stamp}`,
    email: plainStudent.email,
    roles: [LEARNER],
  });
  assert.strictEqual(learner.status, 302);
});
