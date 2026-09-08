'use strict';

require('./helpers/setup');
const test = require('node:test');
const assert = require('node:assert');
const request = require('supertest');
const { initSchema, queryOne, execute } = require('../database');
const { app } = require('../server');
const { signAuthToken } = require('../middleware/requireTeacher');
const { ensureRbacBootstrap } = require('../lib/rbac');
const { setSetting } = require('../lib/settings');
const { resetProcessLockForTests } = require('../lib/moodle/syncRun');
const fx = require('./helpers/moodleFixtures');

const BASE = '/api/admin/integrations/moodle';
const stamp = Date.now();
let adminToken;
let plainTeacherToken;
let fake;
const savedEnv = {};

async function tokenFor(userId, roleSlug) {
  const role = await queryOne('SELECT id, display_name FROM roles WHERE slug = ? LIMIT 1', [
    roleSlug,
  ]);
  assert.ok(role?.id, `rôle ${roleSlug}`);
  await execute('UPDATE user_roles SET is_primary = 0 WHERE user_type = ? AND user_id = ?', [
    'teacher',
    userId,
  ]);
  await execute(
    'INSERT INTO user_roles (user_type, user_id, role_id, is_primary) VALUES (?, ?, ?, 1) ON DUPLICATE KEY UPDATE is_primary = 1',
    ['teacher', userId, role.id],
  );
  return signAuthToken(
    {
      userType: 'teacher',
      userId,
      canonicalUserId: userId,
      roleId: role.id,
      roleSlug,
      roleDisplayName: role.display_name,
    },
    false,
  );
}

function pointEnvToFake() {
  for (const key of ['MOODLE_BASE_URL', 'MOODLE_WS_TOKEN', 'MOODLE_SYNC_ENABLED'])
    savedEnv[key] = process.env[key];
  process.env.MOODLE_BASE_URL = fake.baseUrl;
  process.env.MOODLE_WS_TOKEN = fake.state.token;
  delete process.env.MOODLE_SYNC_ENABLED;
}

function unsetEnv() {
  delete process.env.MOODLE_BASE_URL;
  delete process.env.MOODLE_WS_TOKEN;
  delete process.env.MOODLE_SYNC_ENABLED;
}

test.before(async () => {
  await initSchema();
  await ensureRbacBootstrap();
  await fx.purgeSyncArtifacts();
  const admin = await queryOne(
    "SELECT id FROM users WHERE user_type = 'teacher' AND LOWER(email) = LOWER(?) LIMIT 1",
    [process.env.TEACHER_ADMIN_EMAIL],
  );
  assert.ok(admin?.id, 'compte admin de test');
  adminToken = await tokenFor(admin.id, 'admin');
  const plain = await fx.createTeacher({
    firstName: 'Simple',
    lastName: `Prof${stamp}`,
    email: `simple.prof${stamp}@lyautey.test`,
  });
  plainTeacherToken = await tokenFor(plain.id, 'prof');
  ({ fake } = await fx.startFakeMoodle());
  await setSetting('integration.moodle.enabled', true);
  unsetEnv();
});

test.after(async () => {
  await fake.stop();
  for (const [key, value] of Object.entries(savedEnv)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  await fx.purgeSyncArtifacts();
});

test.beforeEach(() => resetProcessLockForTests());

test('accès : 401 sans jeton, 403 sans la permission integrations.moodle.manage', async () => {
  await request(app).get(`${BASE}/status`).expect(401);
  const res = await request(app)
    .get(`${BASE}/status`)
    .set('Authorization', `Bearer ${plainTeacherToken}`)
    .expect(403);
  assert.match(res.body.error, /Permission/);
  await request(app)
    .post(`${BASE}/runs`)
    .set('Authorization', `Bearer ${plainTeacherToken}`)
    .send({ mode: 'dry_run', cohortIds: [1] })
    .expect(403);
});

test('non configuré : /status dit configured=false sans jeton ; /check, /cohorts, /courses, /runs → 503', async () => {
  const status = await request(app)
    .get(`${BASE}/status`)
    .set('Authorization', `Bearer ${adminToken}`)
    .expect(200);
  assert.strictEqual(status.body.configured, false);
  assert.ok(!('token' in status.body));
  assert.ok(!JSON.stringify(status.body).includes('test-token'));
  for (const [method, path] of [
    ['post', '/check'],
    ['get', '/cohorts'],
    ['get', '/courses'],
  ]) {
    const res = await request(app)
      [method](`${BASE}${path}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(503);
    assert.match(res.body.error, /non configurée/);
  }
  const run = await request(app)
    .post(`${BASE}/runs`)
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ mode: 'dry_run', cohortIds: [1] })
    .expect(503);
  assert.match(run.body.error, /non configurée/);
  // Les routes qui ne lisent que la base restent utilisables.
  await request(app).get(`${BASE}/runs`).set('Authorization', `Bearer ${adminToken}`).expect(200);
  await request(app)
    .get(`${BASE}/pending-matches`)
    .set('Authorization', `Bearer ${adminToken}`)
    .expect(200);
  await request(app)
    .get(`${BASE}/conflicts`)
    .set('Authorization', `Bearer ${adminToken}`)
    .expect(200);
  await request(app).get(`${BASE}/exempt`).set('Authorization', `Bearer ${adminToken}`).expect(200);
});

test('kill switch MOODLE_SYNC_ENABLED=0 : configuré mais coupé → 503', async () => {
  pointEnvToFake();
  process.env.MOODLE_SYNC_ENABLED = '0';
  const status = await request(app)
    .get(`${BASE}/status`)
    .set('Authorization', `Bearer ${adminToken}`)
    .expect(200);
  assert.strictEqual(status.body.configured, false);
  assert.strictEqual(status.body.killSwitchOff, true);
  await request(app).post(`${BASE}/check`).set('Authorization', `Bearer ${adminToken}`).expect(503);
  unsetEnv();
});

test('configuré : /check, /cohorts, /courses puis simulation via /runs et lecture /runs/:id', async () => {
  pointEnvToFake();
  fx.seedCohort(fake, {
    id: 671,
    idnumber: '26#671',
    name: `6e 671 ${stamp}`,
    members: [fx.member(9001, 'Route', `Un${stamp}`)],
  });
  fake.addCohort({ id: 702, idnumber: '25#702', name: 'Vieille cohorte' });
  fake.addCourse({ id: 42, fullname: 'Cours G&L chapitre 1', shortname: 'GL1' });

  const check = await request(app)
    .post(`${BASE}/check`)
    .set('Authorization', `Bearer ${adminToken}`)
    .expect(200);
  assert.strictEqual(check.body.ok, true, JSON.stringify(check.body.errors));
  assert.deepStrictEqual(check.body.missingFunctions, []);
  assert.ok(!JSON.stringify(check.body).includes(fake.state.token), 'jeton jamais renvoyé');

  const status = await request(app)
    .get(`${BASE}/status`)
    .set('Authorization', `Bearer ${adminToken}`)
    .expect(200);
  assert.strictEqual(status.body.configured, true);
  assert.strictEqual(status.body.lastCheck.ok, true);

  const cohorts = await request(app)
    .get(`${BASE}/cohorts`)
    .set('Authorization', `Bearer ${adminToken}`)
    .expect(200);
  const ids = cohorts.body.cohorts.map((c) => c.id);
  assert.ok(ids.includes(671));
  assert.ok(!ids.includes(702), 'cohorte d’une autre année filtrée');
  const cohort671 = cohorts.body.cohorts.find((c) => c.id === 671);
  assert.strictEqual(cohort671.policyKey, 'classe6');
  assert.strictEqual(cohort671.memberCount, 1);

  const courses = await request(app)
    .get(`${BASE}/courses`)
    .set('Authorization', `Bearer ${adminToken}`)
    .expect(200);
  assert.ok(Array.isArray(courses.body.rows));

  await request(app)
    .post(`${BASE}/runs`)
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ mode: 'dry_run' })
    .expect(400);
  await request(app)
    .post(`${BASE}/runs`)
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ mode: 'nope', cohortIds: [671] })
    .expect(400);
  const sim = await request(app)
    .post(`${BASE}/runs`)
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ mode: 'dry_run', cohortIds: [671] })
    .expect(200);
  assert.strictEqual(sim.body.status, 'succeeded');
  assert.strictEqual(sim.body.report.totals.creations, 1);
  assert.ok(!JSON.stringify(sim.body).includes(fake.state.token));

  const one = await request(app)
    .get(`${BASE}/runs/${sim.body.runId}`)
    .set('Authorization', `Bearer ${adminToken}`)
    .expect(200);
  assert.strictEqual(one.body.mode, 'dry_run');
  assert.strictEqual(one.body.report.totals.creations, 1);
  await request(app)
    .get(`${BASE}/runs/999999999`)
    .set('Authorization', `Bearer ${adminToken}`)
    .expect(404);
  const list = await request(app)
    .get(`${BASE}/runs?limit=5`)
    .set('Authorization', `Bearer ${adminToken}`)
    .expect(200);
  assert.ok(list.body.items.some((r) => r.id === sim.body.runId));
  assert.ok(!('report' in list.body.items[0]), 'liste sans rapport complet');

  // Simulation → apply sans force passe (garde des 24 h satisfaite), puis annulation.
  const applied = await request(app)
    .post(`${BASE}/runs`)
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ mode: 'apply', cohortIds: [671] })
    .expect(200);
  assert.strictEqual(applied.body.status, 'succeeded');
  assert.strictEqual(applied.body.report.applied.createdUsers, 1);
  const undo = await request(app)
    .post(`${BASE}/runs/${applied.body.runId}/undo`)
    .set('Authorization', `Bearer ${adminToken}`)
    .expect(200);
  assert.strictEqual(undo.body.deactivatedCreated, 1);
  await request(app)
    .post(`${BASE}/runs/${applied.body.runId}/undo`)
    .set('Authorization', `Bearer ${adminToken}`)
    .expect(409);
  await request(app)
    .post(`${BASE}/runs/${sim.body.runId}/undo`)
    .set('Authorization', `Bearer ${adminToken}`)
    .expect(409);
  unsetEnv();
});

test('verrou : une exécution en cours → 409 sur /runs', async () => {
  pointEnvToFake();
  const inserted = await execute(
    "INSERT INTO sync_runs (provider, mode, scope_json, status, started_at) VALUES ('moodle', 'dry_run', '{}', 'running', NOW())",
  );
  const res = await request(app)
    .post(`${BASE}/runs`)
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ mode: 'dry_run', cohortIds: [671] })
    .expect(409);
  assert.match(res.body.error, /déjà en cours/);
  await execute('DELETE FROM sync_runs WHERE id = ?', [inserted.insertId]);
  unsetEnv();
});

test('/exempt : marque un compte ou un groupe, 404 si inconnu, validation du corps', async () => {
  const student = await fx.createStudent({
    firstName: 'Exo',
    lastName: `Route${stamp}`,
    email: `exo.route${stamp}@lyautey.test`,
  });
  await request(app)
    .post(`${BASE}/exempt`)
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ targetType: 'planet', targetId: 'x' })
    .expect(400);
  await request(app)
    .post(`${BASE}/exempt`)
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ targetType: 'user', targetId: 'inconnu' })
    .expect(404);
  const on = await request(app)
    .post(`${BASE}/exempt`)
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ targetType: 'user', targetId: student.id })
    .expect(200);
  assert.strictEqual(on.body.exempt, true);
  assert.strictEqual(
    Number(
      (await queryOne('SELECT sync_exempt FROM users WHERE id = ?', [student.id])).sync_exempt,
    ),
    1,
  );
  const list = await request(app)
    .get(`${BASE}/exempt`)
    .set('Authorization', `Bearer ${adminToken}`)
    .expect(200);
  assert.ok(list.body.users.some((u) => u.userId === student.id));
  const off = await request(app)
    .post(`${BASE}/exempt`)
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ targetType: 'user', targetId: student.id, exempt: false })
    .expect(200);
  assert.strictEqual(off.body.exempt, false);
});

test('/merge : simulation par défaut, application explicite, erreurs propagées', async () => {
  const a = await fx.createStudent({
    firstName: 'Fusion',
    lastName: `A${stamp}`,
    email: `fusion.a${stamp}@lyautey.test`,
  });
  const b = await fx.createStudent({
    firstName: 'Fusion',
    lastName: `B${stamp}`,
    email: `fusion.b${stamp}@lyautey.test`,
  });
  await request(app)
    .post(`${BASE}/merge`)
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ fromUserId: a.id })
    .expect(400);
  const same = await request(app)
    .post(`${BASE}/merge`)
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ fromUserId: a.id, intoUserId: a.id })
    .expect(400);
  assert.match(same.body.error, /lui-même/);
  await request(app)
    .post(`${BASE}/merge`)
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ fromUserId: 'nope', intoUserId: a.id })
    .expect(404);
  const plan = await request(app)
    .post(`${BASE}/merge`)
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ fromUserId: b.id, intoUserId: a.id })
    .expect(200);
  assert.strictEqual(plan.body.dryRun, true);
  assert.ok(
    await queryOne('SELECT 1 AS x FROM users WHERE id = ?', [b.id]),
    'simulation : B toujours là',
  );
  const done = await request(app)
    .post(`${BASE}/merge`)
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ fromUserId: b.id, intoUserId: a.id, dryRun: false })
    .expect(200);
  assert.strictEqual(done.body.dryRun, false);
  assert.ok(done.body.runId);
  assert.strictEqual(await queryOne('SELECT 1 AS x FROM users WHERE id = ?', [b.id]), undefined);
});

test('/cohorts : jeton Moodle refusé → 502 exposé, pas « Erreur serveur »', async () => {
  pointEnvToFake();
  process.env.MOODLE_WS_TOKEN = 'nope';
  const res = await request(app)
    .get(`${BASE}/cohorts`)
    .set('Authorization', `Bearer ${adminToken}`)
    .expect(502);
  assert.match(res.body.error, /Moodle|invalidtoken/i);
  assert.notEqual(res.body.error, 'Erreur serveur');
  assert.equal(res.body.code, 'MOODLE_API');
  process.env.MOODLE_WS_TOKEN = fake.state.token;
});

test('/pending-matches/:id et /conflicts/:id : 404 sur identifiant inconnu, validation du corps', async () => {
  await request(app)
    .post(`${BASE}/pending-matches/999999`)
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ decision: 'ignore' })
    .expect(404);
  await request(app)
    .post(`${BASE}/pending-matches/1`)
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ decision: 'nope' })
    .expect(400);
  await request(app)
    .post(`${BASE}/conflicts/999999`)
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ resolution: 'ignore' })
    .expect(404);
  await request(app)
    .post(`${BASE}/conflicts/1`)
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ resolution: 'nope' })
    .expect(400);
});
