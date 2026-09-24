'use strict';

// Séances pédagogiques (pilotes A/B, migration 282).

require('./helpers/setup');
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { app } = require('../server');
const { initSchema, execute, queryOne } = require('../database');
const { ensureAdminTeacherAuthToken } = require('./helpers/adminAuth');

const stamp = Date.now();
let token = '';
const auth = () => ({ Authorization: `Bearer ${token}` });
let createdId = '';

before(async () => {
  await initSchema();
  token = await ensureAdminTeacherAuthToken();
});

after(async () => {
  if (createdId) {
    await execute('DELETE FROM pedago_sessions WHERE id = ?', [createdId]).catch(() => {});
  }
});

test('GET /api/pedago-sessions — seed A/B publiés', async () => {
  const res = await request(app).get('/api/pedago-sessions').expect(200);
  assert.ok(Array.isArray(res.body.items));
  const slugs = res.body.items.map((i) => i.slug);
  assert.ok(slugs.includes('college-reconaitre-sans-toucher'));
  assert.ok(slugs.includes('college-qui-mange-qui'));
  const a = res.body.items.find((i) => i.slug === 'college-reconaitre-sans-toucher');
  assert.equal(a.templateKey, 'college_reconaitre');
  assert.equal(a.level, 'college');
  assert.ok(a.steps.length >= 4);
  assert.equal(a.steps[0].action.type, 'message');
});

test('GET détail + PUT config prof', async () => {
  const detail = await request(app)
    .get('/api/pedago-sessions/college-reconaitre-sans-toucher')
    .expect(200);
  assert.equal(detail.body.slug, 'college-reconaitre-sans-toucher');

  const put = await request(app)
    .put('/api/pedago-sessions/college-reconaitre-sans-toucher')
    .set(auth())
    .send({
      keyIdOrSlug: `cle-test-${stamp}`,
      plantId: 1,
      notionNiveau: 'cycle3',
      isPublished: true,
    })
    .expect(200);
  assert.equal(put.body.config.keyIdOrSlug, `cle-test-${stamp}`);
  assert.equal(put.body.config.plantId, 1);
  assert.equal(put.body.config.notionNiveau, 'cycle3');
  const keyStep = put.body.steps.find((s) => s.action.type === 'open_id_key');
  assert.equal(keyStep.action.payload.keyIdOrSlug, `cle-test-${stamp}`);

  // Restaure placeholders pour ne pas polluer d'autres tests
  await request(app)
    .put('/api/pedago-sessions/college-reconaitre-sans-toucher')
    .set(auth())
    .send({
      keyIdOrSlug: null,
      plantId: null,
      plantIds: [],
      notionNiveau: 'cycle4',
      isPublished: true,
    })
    .expect(200);
});

test('POST crée une copie de template ; ?all=1 réservé manage', async () => {
  const denied = await request(app).get('/api/pedago-sessions?all=1').expect(403);
  assert.ok(denied.body.error);

  const created = await request(app)
    .post('/api/pedago-sessions')
    .set(auth())
    .send({
      templateKey: 'college_qui_mange',
      title: `Test séance ${stamp}`,
      slug: `test-seance-${stamp}`.slice(0, 120),
      isPublished: false,
      config: { plantIds: [11, 12, 13], notionNiveau: 'cycle4' },
    })
    .expect(201);
  createdId = created.body.id;
  assert.equal(created.body.templateKey, 'college_qui_mange');
  assert.equal(created.body.isPublished, false);
  assert.deepEqual(created.body.config.plantIds, [11, 12, 13]);

  const pub = await request(app).get('/api/pedago-sessions').expect(200);
  assert.ok(!pub.body.items.some((i) => i.id === createdId));

  const all = await request(app).get('/api/pedago-sessions?all=1').set(auth()).expect(200);
  assert.ok(all.body.items.some((i) => i.id === createdId));

  const hidden = await request(app).get(`/api/pedago-sessions/${createdId}`).expect(404);
  assert.ok(hidden.body.error);

  await request(app).get(`/api/pedago-sessions/${createdId}`).set(auth()).expect(200);
});

test('runs : démarrage / fin élève, /me/runs, /stats réservé prof (migration 283)', async () => {
  const reg = await request(app)
    .post('/api/auth/register')
    .send({ firstName: 'Seance', lastName: `Run${stamp}`, password: 'pwd12345' })
    .expect(201);
  const studentId = reg.body.id;
  const studentAuth = { Authorization: `Bearer ${reg.body.authToken}` };
  const slug = 'college-qui-mange-qui';

  try {
    await request(app).post(`/api/pedago-sessions/${slug}/runs/start`).expect(401);

    const started = await request(app)
      .post(`/api/pedago-sessions/${slug}/runs/start`)
      .set(studentAuth)
      .expect(200);
    assert.equal(started.body.run.startCount, 1);
    assert.equal(started.body.run.completed, false);

    const done = await request(app)
      .post(`/api/pedago-sessions/${slug}/runs/complete`)
      .set(studentAuth)
      .expect(200);
    assert.equal(done.body.run.completed, true);
    assert.equal(done.body.run.completionCount, 1);
    assert.ok(done.body.run.firstCompletedAt);
    assert.ok(done.body.rewards.some((r) => r.key === 'session_first'));

    const again = await request(app)
      .post(`/api/pedago-sessions/${slug}/runs/complete`)
      .set(studentAuth)
      .expect(200);
    assert.equal(again.body.run.completionCount, 2);
    assert.deepEqual(
      again.body.rewards.map((r) => r.key),
      ['session_replay'],
      'seuls les badges nouvellement obtenus sont renvoyés',
    );

    const rewards = await request(app).get('/api/rewards/me').set(studentAuth).expect(200);
    const keys = rewards.body.rewards.map((r) => r.key);
    assert.ok(keys.includes('session_first'));
    assert.ok(keys.includes('session_replay'));
    assert.ok(rewards.body.catalogue.length >= keys.length);
    await request(app).get('/api/rewards/me').expect(401);

    const mine = await request(app)
      .get('/api/pedago-sessions/me/runs')
      .set(studentAuth)
      .expect(200);
    const run = mine.body.runs.find((r) => r.sessionId === 'pedago-session-college-qui-mange');
    assert.ok(run);
    assert.equal(run.completed, true);

    await request(app).get('/api/pedago-sessions/stats').set(studentAuth).expect(403);
    const stats = await request(app).get('/api/pedago-sessions/stats').set(auth()).expect(200);
    const entry = stats.body.stats.find((s) => s.sessionId === 'pedago-session-college-qui-mange');
    assert.ok(entry);
    assert.ok(entry.startedUsers >= 1);
    assert.ok(entry.completedUsers >= 1);
    assert.equal(Object.hasOwn(entry, 'userId'), false);

    if (createdId) {
      await request(app)
        .post(`/api/pedago-sessions/${createdId}/runs/start`)
        .set(studentAuth)
        .expect(404);
    }
    await request(app)
      .post('/api/pedago-sessions/seance-inexistante/runs/complete')
      .set(studentAuth)
      .expect(404);
  } finally {
    await execute('DELETE FROM pedago_session_runs WHERE user_id = ?', [studentId]).catch(() => {});
    await execute('DELETE FROM users WHERE id = ?', [studentId]).catch(() => {});
  }
});

test('lot 5 : partage, suivi par élève, séance libre, prérequis', async () => {
  const reg = await request(app)
    .post('/api/auth/register')
    .send({ firstName: 'Seance', lastName: `Lot5${stamp}`, password: 'pwd12345' })
    .expect(201);
  const studentId = reg.body.id;
  const studentAuth = { Authorization: `Bearer ${reg.body.authToken}` };
  let customId = '';

  try {
    // Lien direct + QR code
    const share = await request(app)
      .get('/api/pedago-sessions/college-qui-mange-qui/share')
      .set(auth())
      .expect(200);
    assert.match(share.body.link, /\?seance=college-qui-mange-qui$/);
    assert.match(share.body.qrDataUrl, /^data:image\/png;base64,/);
    assert.equal(share.body.isPublished, true);
    await request(app)
      .get('/api/pedago-sessions/college-qui-mange-qui/share')
      .set(studentAuth)
      .expect(403);

    // Suivi nominatif (réservé prof)
    await request(app)
      .post('/api/pedago-sessions/college-qui-mange-qui/runs/start')
      .set(studentAuth)
      .expect(200);
    await request(app)
      .get('/api/pedago-sessions/college-qui-mange-qui/runs')
      .set(studentAuth)
      .expect(403);
    const runs = await request(app)
      .get('/api/pedago-sessions/college-qui-mange-qui/runs')
      .set(auth())
      .expect(200);
    const mine = runs.body.students.find((s) => s.userId === studentId);
    assert.ok(mine);
    assert.equal(mine.lastName, `Lot5${stamp}`);
    assert.ok(mine.startCount >= 1);

    // Séances lycée semées en brouillon
    const all = await request(app).get('/api/pedago-sessions?all=1').set(auth()).expect(200);
    const c = all.body.items.find((i) => i.slug === 'lycee-un-arbre-qui-grandit');
    const d = all.body.items.find((i) => i.slug === 'lycee-classer-pour-de-vrai');
    assert.equal(c.level, 'lycee');
    assert.ok(c.steps.some((s) => s.action.type === 'open_individual'));
    assert.ok(d.steps.some((s) => s.action.type === 'open_nested_groups'));

    // Séance libre : étapes éditables, cibles vérifiées à la publication
    const created = await request(app)
      .post('/api/pedago-sessions')
      .set(auth())
      .send({
        templateKey: 'custom',
        slug: `libre-${stamp}`,
        steps: [
          { id: 's1', title: 'Consigne', action: { type: 'message', payload: {} } },
          {
            id: 's2',
            title: 'Parcours',
            action: { type: 'open_map_route', payload: { routeSlug: `absent-${stamp}` } },
          },
        ],
      })
      .expect(201);
    customId = created.body.id;
    assert.equal(created.body.templateKey, 'custom');
    assert.equal(created.body.title, 'Nouvelle séance');
    assert.equal(created.body.steps[1].action.payload.routeSlug, `absent-${stamp}`);

    const refused = await request(app)
      .put(`/api/pedago-sessions/${customId}`)
      .set(auth())
      .send({ isPublished: true })
      .expect(400);
    assert.match(refused.body.error, /parcours/);

    const edited = await request(app)
      .put(`/api/pedago-sessions/${customId}`)
      .set(auth())
      .send({
        steps: [{ id: 's1', title: 'Seule étape', action: { type: 'message', payload: {} } }],
        requiresSessionId: 'pedago-session-college-reconaitre',
        isPublished: true,
      })
      .expect(200);
    assert.equal(edited.body.steps.length, 1);
    assert.equal(edited.body.config.requiresSessionId, 'pedago-session-college-reconaitre');

    await request(app)
      .put('/api/pedago-sessions/college-qui-mange-qui')
      .set(auth())
      .send({ steps: [{ id: 'x', title: 'X', action: { type: 'message' } }] })
      .expect(400);
    await request(app)
      .put(`/api/pedago-sessions/${customId}`)
      .set(auth())
      .send({ requiresSessionId: customId })
      .expect(400);

    // Prérequis : verrouillé tant que la séance A n'est pas terminée
    const locked = await request(app)
      .post(`/api/pedago-sessions/${customId}/runs/start`)
      .set(studentAuth)
      .expect(403);
    assert.equal(locked.body.locked, true);
    assert.equal(locked.body.requiresSessionId, 'pedago-session-college-reconaitre');
    await request(app)
      .post('/api/pedago-sessions/college-reconaitre-sans-toucher/runs/complete')
      .set(studentAuth)
      .expect(200);
    await request(app)
      .post(`/api/pedago-sessions/${customId}/runs/start`)
      .set(studentAuth)
      .expect(200);
    await request(app).post(`/api/pedago-sessions/${customId}/runs/start`).set(auth()).expect(200);
  } finally {
    await execute('DELETE FROM pedago_session_runs WHERE user_id = ?', [studentId]).catch(() => {});
    await execute('DELETE FROM user_rewards WHERE user_id = ?', [studentId]).catch(() => {});
    await execute('DELETE FROM users WHERE id = ?', [studentId]).catch(() => {});
    if (customId) {
      await execute('DELETE FROM pedago_sessions WHERE id = ?', [customId]).catch(() => {});
    }
  }
});

test('lot 5 : lien tâche → séance (migration 286)', async () => {
  const created = await request(app)
    .post('/api/tasks')
    .set(auth())
    .send({ title: `Tâche séance ${stamp}`, pedago_session_id: 'college-qui-mange-qui' })
    .expect(201);
  const taskId = created.body.id;
  try {
    assert.equal(created.body.pedago_session_id, 'pedago-session-college-qui-mange');
    await request(app)
      .post('/api/tasks')
      .set(auth())
      .send({ title: `Tâche KO ${stamp}`, pedago_session_id: 'seance-inexistante' })
      .expect(400);
    const list = await request(app).get('/api/tasks').set(auth()).expect(200);
    const items = Array.isArray(list.body) ? list.body : list.body.tasks || list.body.items || [];
    const listed = items.find((t) => t.id === taskId);
    if (listed) assert.equal(listed.pedago_session_id, 'pedago-session-college-qui-mange');
    const cleared = await request(app)
      .put(`/api/tasks/${taskId}`)
      .set(auth())
      .send({ pedago_session_id: null })
      .expect(200);
    assert.equal(cleared.body.pedago_session_id ?? null, null);
  } finally {
    await execute('DELETE FROM tasks WHERE id = ?', [taskId]).catch(() => {});
  }
});

test('seed toujours présent en base après initSchema', async () => {
  const row = await queryOne(`SELECT slug, is_published FROM pedago_sessions WHERE slug = ?`, [
    'college-qui-mange-qui',
  ]);
  assert.ok(row);
  assert.equal(!!row.is_published, true);
});
