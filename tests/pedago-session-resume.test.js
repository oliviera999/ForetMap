'use strict';

// Séances guidées — reprise côté serveur (chantier « parcours d'apprentissage », lot 5,
// migration 372) : `current_step` sur `pedago_session_runs`, route `runs/progress`, reprise
// sans recompter de démarrage, fin qui clôt le passage.

require('./helpers/setup');
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { app } = require('../server');
const { initSchema, execute, queryOne } = require('../database');
const { ensureAdminTeacherAuthToken } = require('./helpers/adminAuth');

const stamp = Date.now();
const SLUG = 'college-qui-mange-qui';
const SESSION_ID = 'pedago-session-college-qui-mange';
let teacherToken = '';
let studentId = '';
let studentAuth = {};
let emptyId = '';

const url = (kind, key = SLUG) => `/api/pedago-sessions/${key}/runs/${kind}`;

before(async () => {
  await initSchema();
  teacherToken = await ensureAdminTeacherAuthToken();
  const reg = await request(app)
    .post('/api/auth/register')
    .send({ firstName: 'Reprise', lastName: `Seance${stamp}`, password: 'pwd12345' })
    .expect(201);
  studentId = reg.body.id;
  studentAuth = { Authorization: `Bearer ${reg.body.authToken}` };
});

after(async () => {
  await execute('DELETE FROM pedago_session_runs WHERE user_id = ?', [studentId]).catch(() => {});
  await execute('DELETE FROM users WHERE id = ?', [studentId]).catch(() => {});
  if (emptyId) {
    await execute('DELETE FROM pedago_sessions WHERE id = ?', [emptyId]).catch(() => {});
  }
});

test('migration 372 : colonnes current_step et last_step_at présentes', async () => {
  for (const col of ['current_step', 'last_step_at']) {
    const row = await queryOne(
      `SELECT COLUMN_NAME FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'pedago_session_runs' AND COLUMN_NAME = ?`,
      [col],
    );
    assert.ok(row, `colonne ${col} attendue`);
  }
});

test('démarrage → étape 0 ; progress mémorise ; reprise sans recompter', async () => {
  const started = await request(app).post(url('start')).set(studentAuth).expect(200);
  assert.equal(started.body.resumed, false);
  assert.equal(started.body.run.startCount, 1);
  assert.equal(started.body.run.currentStep, 0);
  assert.equal(started.body.run.inProgress, true);
  assert.ok(started.body.run.lastStepAt);

  const moved = await request(app)
    .post(url('progress'))
    .set(studentAuth)
    .send({ step: 2 })
    .expect(200);
  assert.equal(moved.body.run.currentStep, 2);

  // Nouvel onglet / autre jour : `runs/start` reprend à l'étape 2, sans nouveau démarrage.
  const resumed = await request(app).post(url('start')).set(studentAuth).expect(200);
  assert.equal(resumed.body.resumed, true);
  assert.equal(resumed.body.run.currentStep, 2);
  assert.equal(resumed.body.run.startCount, 1);

  // /me/runs expose l'étape où reprendre (catalogue « Reprendre »).
  const mine = await request(app).get('/api/pedago-sessions/me/runs').set(studentAuth).expect(200);
  const run = mine.body.runs.find((r) => r.sessionId === SESSION_ID);
  assert.equal(run.currentStep, 2);
  assert.equal(run.inProgress, true);

  const row = await queryOne(
    'SELECT current_step, start_count FROM pedago_session_runs WHERE session_id = ? AND user_id = ?',
    [SESSION_ID, studentId],
  );
  assert.equal(Number(row.current_step), 2);
  assert.equal(Number(row.start_count), 1);
});

test('progress : étape hors bornes refusée (400), corps absent refusé', async () => {
  const detail = await request(app).get(`/api/pedago-sessions/${SLUG}`).expect(200);
  const count = detail.body.steps.length;
  await request(app).post(url('progress')).set(studentAuth).send({ step: count }).expect(400);
  await request(app).post(url('progress')).set(studentAuth).send({ step: -1 }).expect(400);
  await request(app).post(url('progress')).set(studentAuth).send({ step: '1.5' }).expect(400);
  await request(app).post(url('progress')).set(studentAuth).send({}).expect(400);
  await request(app).post(url('progress')).send({ step: 1 }).expect(401);
});

test('restart : retour à l’étape 0 sans recompter de démarrage', async () => {
  const restarted = await request(app)
    .post(url('start'))
    .set(studentAuth)
    .send({ restart: true })
    .expect(200);
  assert.equal(restarted.body.resumed, false);
  assert.equal(restarted.body.run.currentStep, 0);
  assert.equal(restarted.body.run.startCount, 1);
  await request(app).post(url('progress')).set(studentAuth).send({ step: 1 }).expect(200);
});

test('fin : clôt le passage (current_step NULL) ; progress ensuite refusé (409)', async () => {
  const done = await request(app).post(url('complete')).set(studentAuth).expect(200);
  assert.equal(done.body.run.completionCount, 1);
  assert.equal(done.body.run.currentStep, null);
  assert.equal(done.body.run.inProgress, false);

  const late = await request(app)
    .post(url('progress'))
    .set(studentAuth)
    .send({ step: 1 })
    .expect(409);
  assert.equal(late.body.code, 'SESSION_NOT_STARTED');
  // Une seconde fin exige toujours un nouveau passage (§ 6, audit du 30/09/2026).
  await request(app).post(url('complete')).set(studentAuth).expect(409);

  // Nouveau passage après une fin : compté, repart de l'étape 0.
  const again = await request(app).post(url('start')).set(studentAuth).expect(200);
  assert.equal(again.body.resumed, false);
  assert.equal(again.body.run.startCount, 2);
  assert.equal(again.body.run.currentStep, 0);
  const second = await request(app).post(url('complete')).set(studentAuth).expect(200);
  assert.equal(second.body.run.completionCount, 2);
});

test('séance raccourcie depuis l’arrêt : la reprise se cale sur sa dernière étape', async () => {
  await request(app).post(url('start')).set(studentAuth).expect(200);
  await execute(
    'UPDATE pedago_session_runs SET current_step = 999 WHERE session_id = ? AND user_id = ?',
    [SESSION_ID, studentId],
  );
  const detail = await request(app).get(`/api/pedago-sessions/${SLUG}`).expect(200);
  const resumed = await request(app).post(url('start')).set(studentAuth).expect(200);
  assert.equal(resumed.body.resumed, true);
  assert.equal(resumed.body.run.currentStep, detail.body.steps.length - 1);
  await request(app).post(url('complete')).set(studentAuth).expect(200);
});

test('séance sans étape : démarrage refusé avec un message (422)', async () => {
  const created = await request(app)
    .post('/api/pedago-sessions')
    .set({ Authorization: `Bearer ${teacherToken}` })
    .send({
      templateKey: 'custom',
      title: `Séance vide ${stamp}`,
      slug: `seance-vide-${stamp}`,
      isPublished: false,
    })
    .expect(201);
  emptyId = created.body.id;
  // Publication forcée en base : l'éditeur exige au moins une étape, une base ancienne non.
  await execute("UPDATE pedago_sessions SET steps_json = '[]', is_published = 1 WHERE id = ?", [
    emptyId,
  ]);
  const res = await request(app).post(url('start', emptyId)).set(studentAuth).expect(422);
  assert.equal(res.body.code, 'SESSION_EMPTY');
  assert.ok(res.body.error);
});

test('suivi prof : l’étape du passage en cours est visible', async () => {
  await request(app).post(url('start')).set(studentAuth).expect(200);
  await request(app).post(url('progress')).set(studentAuth).send({ step: 1 }).expect(200);
  const res = await request(app)
    .get(`/api/pedago-sessions/${SLUG}/runs`)
    .set({ Authorization: `Bearer ${teacherToken}` })
    .expect(200);
  const me = res.body.students.find((s) => s.userId === String(studentId));
  assert.ok(me, 'élève présent dans le suivi');
  assert.equal(me.currentStep, 1);
  assert.ok(me.lastStepAt);
});
