'use strict';

// Audit ForetMap du 19/11/2026, lot 10 : séances pédagogiques (P5), individus suivis (P6),
// calendrier scolaire (P7), activité clades (P8), clés d'identification (P9).

require('./helpers/setup');
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { app } = require('../server');
const { initSchema, execute } = require('../database');
const { ensureAdminTeacherAuthToken } = require('./helpers/adminAuth');
const { parseISODateOnly } = require('../lib/schoolCalendar');

const stamp = Date.now();
let token = '';
let studentId = '';
let studentAuth = {};
let plantId = 0;
let individualId = 0;
let keyId = 0;
const sessionIds = [];
const otherMapId = `lot10-map-${stamp}`;
const otherZoneId = `lot10-zone-${stamp}`;
const auth = () => ({ Authorization: `Bearer ${token}` });

before(async () => {
  await initSchema();
  token = await ensureAdminTeacherAuthToken();
  const reg = await request(app)
    .post('/api/auth/register')
    .send({ firstName: 'Lot', lastName: `Dix${stamp}`, password: 'pwd12345' })
    .expect(201);
  studentId = reg.body.id;
  studentAuth = { Authorization: `Bearer ${reg.body.authToken}` };
  const plant = await execute(
    `INSERT INTO plants (name, emoji, description) VALUES (?, '🌳', 'audit lot 10')`,
    [`Lot10 Plant ${stamp}`],
  );
  plantId = plant.insertId;
  await execute(`INSERT INTO maps (id, label, sort_order, is_active) VALUES (?, ?, 999, 1)`, [
    otherMapId,
    `Carte lot 10 ${stamp}`,
  ]);
  await execute(
    `INSERT INTO zones (id, map_id, name, x, y, width, height, current_plant, stage, special, shape, points, color)
     VALUES (?, ?, ?, 0, 0, 0, 0, '', 'empty', 0, 'rect', '[]', '#86efac80')`,
    [otherZoneId, otherMapId, `Zone lot 10 ${stamp}`],
  );
});

after(async () => {
  await execute('DELETE FROM pedago_session_runs WHERE user_id = ?', [studentId]).catch(() => {});
  for (const id of sessionIds) {
    await execute('DELETE FROM pedago_sessions WHERE id = ?', [id]).catch(() => {});
  }
  await execute('DELETE FROM users WHERE id = ?', [studentId]).catch(() => {});
  if (individualId) {
    await execute('DELETE FROM tracked_individuals WHERE id = ?', [individualId]).catch(() => {});
  }
  if (keyId) await execute('DELETE FROM id_keys WHERE id = ?', [keyId]).catch(() => {});
  await execute('DELETE FROM zones WHERE id = ?', [otherZoneId]).catch(() => {});
  await execute('DELETE FROM maps WHERE id = ?', [otherMapId]).catch(() => {});
  if (plantId) await execute('DELETE FROM plants WHERE id = ?', [plantId]).catch(() => {});
});

async function createSession(label, { published = true } = {}) {
  const res = await request(app)
    .post('/api/pedago-sessions')
    .set(auth())
    .send({
      templateKey: 'college_reconaitre',
      title: `Lot10 ${label} ${stamp}`,
      slug: `lot10-${label}-${stamp}`,
      isPublished: published,
    })
    .expect(201);
  sessionIds.push(res.body.id);
  return res.body.id;
}

// ── P5 ────────────────────────────────────────────────────────────────────────

test('P5 — un prérequis en brouillon ne bloque pas la séance dépendante', async () => {
  const draft = await createSession('brouillon', { published: false });
  const dependent = await createSession('dependante');
  await request(app)
    .put(`/api/pedago-sessions/${dependent}`)
    .set(auth())
    .send({ requiresSessionId: draft })
    .expect(200);
  // Le prérequis est invisible pour l'élève…
  await request(app).post(`/api/pedago-sessions/${draft}/runs/start`).set(studentAuth).expect(404);
  // … il ne doit donc pas verrouiller la séance dépendante (403 avant correction).
  await request(app)
    .post(`/api/pedago-sessions/${dependent}/runs/start`)
    .set(studentAuth)
    .expect(200);
});

test('P5 — un prérequis publié non terminé verrouille toujours', async () => {
  const required = await createSession('requis');
  const dependent = await createSession('verrou');
  await request(app)
    .put(`/api/pedago-sessions/${dependent}`)
    .set(auth())
    .send({ requiresSessionId: required })
    .expect(200);
  const res = await request(app)
    .post(`/api/pedago-sessions/${dependent}/runs/start`)
    .set(studentAuth)
    .expect(403);
  assert.equal(res.body.locked, true);
});

test('P5 — un cycle de prérequis (A ↔ B, ou plus long) est refusé à l’écriture', async () => {
  const a = await createSession('cycle-a');
  const b = await createSession('cycle-b');
  const c = await createSession('cycle-c');
  await request(app)
    .put(`/api/pedago-sessions/${b}`)
    .set(auth())
    .send({ requiresSessionId: a })
    .expect(200);
  const direct = await request(app)
    .put(`/api/pedago-sessions/${a}`)
    .set(auth())
    .send({ requiresSessionId: b })
    .expect(400);
  assert.equal(direct.body.code, 'PREREQUISITE_CYCLE');

  // Chaîne C → B → A : A ne peut pas exiger C.
  await request(app)
    .put(`/api/pedago-sessions/${c}`)
    .set(auth())
    .send({ requiresSessionId: b })
    .expect(200);
  const long = await request(app)
    .put(`/api/pedago-sessions/${a}`)
    .set(auth())
    .send({ requiresSessionId: c })
    .expect(400);
  assert.equal(long.body.code, 'PREREQUISITE_CYCLE');
});

// ── P6 ────────────────────────────────────────────────────────────────────────

test('P6 — individus : dates, bornes, groupe et zone validés en 400', async () => {
  await request(app)
    .post('/api/individuals')
    .set(auth())
    .send({ plant_id: plantId, map_id: 'foret', label: 'X', planted_at: '2026-02-31' })
    .expect(400);
  await request(app)
    .post('/api/individuals')
    .set(auth())
    .send({ plant_id: plantId, map_id: 'foret', label: 'X', wood_density: 12 })
    .expect(400);

  const created = await request(app)
    .post('/api/individuals')
    .set(auth())
    .send({ plant_id: plantId, map_id: 'foret', label: `Lot10 indiv ${stamp}` })
    .expect(201);
  individualId = created.body.id;
  const measure = (body) =>
    request(app).post(`/api/individuals/${individualId}/measurements`).set(auth()).send(body);

  await measure({ measured_at: '2026-02-31', height_m: 2 }).expect(400);
  await measure({ measured_at: '2026-09-22', height_m: 1000 }).expect(400);
  await measure({ measured_at: '2026-09-22', crown_diameter_m: 1500 }).expect(400);
  await measure({ measured_at: '2026-09-22', circumference_cm: -5 }).expect(400);
  await measure({ measured_at: '2026-09-22', height_m: 0 }).expect(400);
  const group = await measure({
    measured_at: '2026-09-22',
    height_m: 2,
    group_id: `groupe-inexistant-${stamp}`,
  }).expect(400);
  assert.match(group.body.error, /Groupe introuvable/);
  await measure({ measured_at: '2024-02-29', height_m: 999.99 }).expect(201);

  await request(app)
    .put(`/api/individuals/${individualId}`)
    .set(auth())
    .send({ zone_id: `zone-inexistante-${stamp}` })
    .expect(400);
  await request(app)
    .put(`/api/individuals/${individualId}`)
    .set(auth())
    .send({ zone_id: otherZoneId })
    .expect(400);
  await request(app)
    .put(`/api/individuals/${individualId}`)
    .set(auth())
    .send({ planted_at: '2026-04-31' })
    .expect(400);
});

// ── P7 ────────────────────────────────────────────────────────────────────────

test('P7 — calendrier : une date impossible est refusée (400)', async () => {
  assert.equal(parseISODateOnly('2031-09-31'), null);
  assert.equal(parseISODateOnly('2031-02-29'), null);
  assert.equal(parseISODateOnly('2032-02-29'), '2032-02-29');
  assert.equal(parseISODateOnly('2031-09-30'), '2031-09-30');
  const res = await request(app)
    .post('/api/school-calendar/years')
    .set(auth())
    .send({ label: `lot10-${stamp}`, starts_on: '2031-09-31', ends_on: '2032-07-05' })
    .expect(400);
  assert.match(res.body.error, /Dates invalides/);
});

// ── P8 ────────────────────────────────────────────────────────────────────────

test('P8 — activité clades : entrées non objets écartées, plus de 500', async () => {
  await request(app)
    .post('/api/clades/activity/check')
    .send({ placements: [null] })
    .expect(400);
  await request(app)
    .post('/api/clades/activity/check')
    .send({ placements: [null, 3, 'x', []] })
    .expect(400);
  const mixed = await request(app)
    .post('/api/clades/activity/check')
    .send({ placements: [null, { plantId, cladeId: null }] })
    .expect(200);
  assert.equal(mixed.body.total, 1);
});

// ── P9 ────────────────────────────────────────────────────────────────────────

test('P9 — clé publiée : couplet visé ou de départ non supprimable (409)', async () => {
  const created = await request(app)
    .post('/api/id-keys')
    .set(auth())
    .send({ slug: `lot10-cle-${stamp}`, title: 'Clé lot 10', niveau: 'college' })
    .expect(201);
  keyId = created.body.id;
  const c1 = created.body.couplets[0].id;
  const c2 = (await request(app).post(`/api/id-keys/${keyId}/couplets`).set(auth()).send({})).body
    .id;
  const c3 = (await request(app).post(`/api/id-keys/${keyId}/couplets`).set(auth()).send({})).body
    .id;
  const leaves = [
    { statement: 'Feuilles opposées', plant_id: plantId },
    { statement: 'Feuilles alternes', plant_id: plantId },
  ];
  await request(app)
    .put(`/api/id-keys/${keyId}/couplets/${c1}/leads`)
    .set(auth())
    .send({
      leads: [
        { statement: 'Feuilles en aiguilles', next_couplet_id: c2 },
        { statement: 'Feuilles larges', plant_id: plantId },
      ],
    })
    .expect(200);
  for (const c of [c2, c3]) {
    await request(app)
      .put(`/api/id-keys/${keyId}/couplets/${c}/leads`)
      .set(auth())
      .send({ leads: leaves })
      .expect(200);
  }
  await request(app)
    .put(`/api/id-keys/${keyId}`)
    .set(auth())
    .send({ is_published: true })
    .expect(200);

  const refused = await request(app)
    .delete(`/api/id-keys/${keyId}/couplets/${c2}`)
    .set(auth())
    .expect(409);
  assert.deepEqual(refused.body.referencedBy, [1]);
  await request(app).delete(`/api/id-keys/${keyId}/couplets/${c1}`).set(auth()).expect(409);
  // Couplet orphelin (visé par personne) : suppression permise.
  await request(app).delete(`/api/id-keys/${keyId}/couplets/${c3}`).set(auth()).expect(200);

  const detail = await request(app).get(`/api/id-keys/${keyId}`).expect(200);
  for (const couplet of detail.body.couplets) {
    for (const lead of couplet.leads) {
      assert.ok(lead.next_couplet_id || lead.plant_id || lead.outcome, 'proposition sans issue');
    }
  }
});
