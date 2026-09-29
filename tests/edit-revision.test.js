'use strict';

// Modifications concurrentes entre profs (migration 312, `lib/editRevision.js`) : un PUT qui
// porte une révision périmée est refusé (409 `edit_conflict`) sans rien écrire.
require('./helpers/setup');
const test = require('node:test');
const assert = require('node:assert');
const request = require('supertest');
const { app } = require('../server');
const { initSchema, queryOne, execute } = require('../database');
const { ensureAdminTeacherAuthToken, getAdminTeacherUserId } = require('./helpers/adminAuth');
const { withEditRevision, readExpectedRevision } = require('../lib/editRevision');

let token;
let teacherId;
const STAMP = `${Date.now()}_${Math.floor(Math.random() * 10000)}`;
const cleanup = [];

const POLYGON = [
  { xp: 10, yp: 10 },
  { xp: 20, yp: 10 },
  { xp: 20, yp: 20 },
];

test.before(async () => {
  await initSchema();
  token = await ensureAdminTeacherAuthToken();
  teacherId = await getAdminTeacherUserId();
});

test.after(async () => {
  for (const [table, id] of cleanup) {
    await execute(`DELETE FROM ${table} WHERE id = ?`, [id]).catch(() => {});
  }
});

const auth = (req) => req.set('Authorization', `Bearer ${token}`);

const revisionOf = async (table, id) =>
  Number((await queryOne(`SELECT edit_revision FROM ${table} WHERE id = ?`, [id])).edit_revision);

const RESOURCES = [
  {
    label: 'tâche',
    table: 'tasks',
    url: (id) => `/api/tasks/${id}`,
    field: 'title',
    create: async () =>
      (
        await auth(request(app).post('/api/tasks'))
          .send({
            title: `Révision ${STAMP}`,
            required_students: 1,
            referent_user_ids: [teacherId],
          })
          .expect(201)
      ).body,
  },
  {
    label: 'zone',
    table: 'zones',
    url: (id) => `/api/zones/${id}`,
    field: 'name',
    create: async () =>
      (
        await auth(request(app).post('/api/zones'))
          .send({ name: `Zone révision ${STAMP}`, points: POLYGON, map_id: 'foret' })
          .expect(201)
      ).body,
  },
  {
    label: 'repère',
    table: 'map_markers',
    url: (id) => `/api/map/markers/${id}`,
    field: 'label',
    create: async () =>
      (
        await auth(request(app).post('/api/map/markers'))
          .send({ label: `Repère révision ${STAMP}`, x_pct: 10, y_pct: 10, map_id: 'foret' })
          .expect(201)
      ).body,
  },
  {
    label: 'fiche espèce',
    table: 'plants',
    url: (id) => `/api/plants/${id}`,
    field: 'name',
    create: async () =>
      (
        await auth(request(app).post('/api/plants'))
          .send({ name: `Espèce révision ${STAMP}` })
          .expect(201)
      ).body,
  },
];

for (const r of RESOURCES) {
  test(`${r.label} : révision à jour acceptée, révision périmée refusée sans écriture`, async () => {
    const created = await r.create();
    cleanup.push([r.table, created.id]);
    const start = await revisionOf(r.table, created.id);

    const ok = await auth(request(app).put(r.url(created.id)))
      .send({ [r.field]: `Version A ${STAMP}`, expected_revision: start })
      .expect(200);
    assert.strictEqual(Number(ok.body.edit_revision), start + 1, 'révision renvoyée à jour');

    const stale = await auth(request(app).put(r.url(created.id)))
      .send({ [r.field]: `Version B ${STAMP}`, expected_revision: start })
      .expect(409);
    assert.strictEqual(stale.body.code, 'edit_conflict');
    assert.strictEqual(stale.body.current_revision, start + 1);
    const row = await queryOne(`SELECT ${r.field} AS v FROM ${r.table} WHERE id = ?`, [created.id]);
    assert.strictEqual(row.v, `Version A ${STAMP}`, 'la version A n’est pas écrasée');
    assert.strictEqual(await revisionOf(r.table, created.id), start + 1);

    await auth(request(app).put(r.url(created.id)))
      .send({ [r.field]: `Version C ${STAMP}` })
      .expect(200);
    assert.strictEqual(
      await revisionOf(r.table, created.id),
      start + 2,
      'sans révision attendue, l’écriture passe et la révision avance',
    );

    await auth(request(app).put(r.url(created.id)))
      .send({ [r.field]: `Version D ${STAMP}`, expected_revision: 'abc' })
      .expect(400);
    assert.strictEqual(await revisionOf(r.table, created.id), start + 2);
  });
}

test('fiche introuvable : 404 du service, pas de conflit', async () => {
  const res = await auth(request(app).put('/api/zones/zone-inexistante-revision')).send({
    name: 'x',
    expected_revision: 0,
  });
  assert.strictEqual(res.status, 404);
});

test('écriture métier en échec : la révision réservée est rendue', async () => {
  const zone = await RESOURCES[1].create();
  cleanup.push(['zones', zone.id]);
  const start = await revisionOf('zones', zone.id);

  const refused = await withEditRevision(
    'zones',
    zone.id,
    { expected_revision: start },
    async () => ({ status: 400, body: { error: 'refus' } }),
  );
  assert.strictEqual(refused.status, 400);
  assert.strictEqual(await revisionOf('zones', zone.id), start);

  await assert.rejects(
    withEditRevision('zones', zone.id, { expected_revision: start }, async () => {
      throw new Error('panne');
    }),
    /panne/,
  );
  assert.strictEqual(await revisionOf('zones', zone.id), start);

  let received;
  await withEditRevision('zones', zone.id, { expected_revision: start, name: 'y' }, async (b) => {
    received = b;
    return { status: 200, body: {} };
  });
  assert.deepStrictEqual(received, { name: 'y' }, 'le service ne voit pas le champ de contrôle');
  assert.strictEqual(await revisionOf('zones', zone.id), start + 1);
});

test('readExpectedRevision : absente, valide, invalide', () => {
  assert.strictEqual(readExpectedRevision({}), null);
  assert.strictEqual(readExpectedRevision({ expected_revision: null }), null);
  assert.strictEqual(readExpectedRevision({ expected_revision: '3' }), 3);
  assert.strictEqual(readExpectedRevision({ expected_revision: 0 }), 0);
  assert.strictEqual(readExpectedRevision({ expected_revision: -1 }), undefined);
  assert.strictEqual(readExpectedRevision({ expected_revision: 1.5 }), undefined);
  assert.strictEqual(readExpectedRevision({ expected_revision: 'abc' }), undefined);
});
