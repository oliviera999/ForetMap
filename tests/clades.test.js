'use strict';

// Classification en groupes emboîtés (lot 5, migration 274).
// Couvre le CRUD (cycles interdits), le fil d'ancêtres, et l'activité subtree / correction.

require('./helpers/setup');
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { app } = require('../server');
const { initSchema, execute, queryOne } = require('../database');
const { ensureAdminTeacherAuthToken } = require('./helpers/adminAuth');
const {
  indexClades,
  ancestorChain,
  wouldCreateCycle,
  lowestCommonAncestor,
  buildNestedActivityTree,
  gradePlantPlacement,
} = require('../lib/clades');

const stamp = Date.now();
const rootId = `troot_${stamp}`.slice(0, 64);
const childId = `tchild_${stamp}`.slice(0, 64);
const grandId = `tgrand_${stamp}`.slice(0, 64);
const otherId = `tother_${stamp}`.slice(0, 64);

let token = '';
let plantA = 0;
let plantB = 0;
const auth = () => ({ Authorization: `Bearer ${token}` });

before(async () => {
  await initSchema();
  token = await ensureAdminTeacherAuthToken();

  // Groupes de test isolés (ne touchent pas au seed `vivant`…).
  await execute(
    `INSERT INTO clades (id, parent_id, name, shared_attribute, sort_order)
     VALUES (?, NULL, 'Test racine', 'Attribut racine', 900),
            (?, ?, 'Test enfant', 'Attribut enfant', 901),
            (?, ?, 'Test petit-enfant', 'Attribut petit-enfant', 902),
            (?, ?, 'Test branche', 'Attribut branche', 903)`,
    [rootId, childId, rootId, grandId, childId, otherId, rootId],
  );

  const a = await execute(
    `INSERT INTO plants (name, emoji, description, clade_id) VALUES (?, '🌱', 'test A', ?)`,
    [`Clade plant A ${stamp}`, grandId],
  );
  const b = await execute(
    `INSERT INTO plants (name, emoji, description, clade_id) VALUES (?, '🌿', 'test B', ?)`,
    [`Clade plant B ${stamp}`, otherId],
  );
  plantA = a.insertId;
  plantB = b.insertId;
});

after(async () => {
  if (plantA) await execute('DELETE FROM plants WHERE id = ?', [plantA]).catch(() => {});
  if (plantB) await execute('DELETE FROM plants WHERE id = ?', [plantB]).catch(() => {});
  for (const id of [grandId, childId, otherId, rootId]) {
    await execute('DELETE FROM clades WHERE id = ?', [id]).catch(() => {});
  }
});

test('helpers purs : ancêtres, LCA, cycles, correction', () => {
  const byId = indexClades([
    { id: 'r', parent_id: null, name: 'R', shared_attribute: 'a', sort_order: 0 },
    { id: 'c', parent_id: 'r', name: 'C', shared_attribute: 'b', sort_order: 1 },
    { id: 'g', parent_id: 'c', name: 'G', shared_attribute: 'c', sort_order: 2 },
    { id: 'o', parent_id: 'r', name: 'O', shared_attribute: 'd', sort_order: 3 },
  ]);
  assert.deepEqual(
    ancestorChain(byId, 'g').map((n) => n.id),
    ['r', 'c', 'g'],
  );
  assert.equal(lowestCommonAncestor(byId, ['g', 'o']).id, 'r');
  assert.equal(wouldCreateCycle(byId, 'r', 'g'), true);
  assert.equal(wouldCreateCycle(byId, 'g', 'o'), false);
  assert.equal(gradePlantPlacement(1, 'g', 'g').correct, true);
  assert.equal(gradePlantPlacement(1, 'g', 'c').correct, false);

  const tree = buildNestedActivityTree(
    byId,
    [
      { id: 1, name: 'A', clade_id: 'g' },
      { id: 2, name: 'B', clade_id: 'o' },
    ],
    ['g', 'o'],
  );
  assert.equal(tree.id, 'r');
  assert.ok(tree.children.some((c) => c.id === 'c'));
  assert.ok(tree.children.some((c) => c.id === 'o'));
});

test('le seed de classification est présent après migration', async () => {
  const vivant = await queryOne('SELECT id, name FROM clades WHERE id = ?', ['vivant']);
  assert.ok(vivant, 'groupe racine « vivant » attendu');
  assert.match(String(vivant.name), /vivant/i);
  const res = await request(app).get('/api/clades').expect(200);
  assert.ok((res.body.items || []).length >= 40);
});

test('GET /api/clades/:id/path renvoie le fil d’ancêtres', async () => {
  const res = await request(app).get(`/api/clades/${grandId}/path`).expect(200);
  assert.deepEqual(
    (res.body.path || []).map((p) => p.id),
    [rootId, childId, grandId],
  );
  assert.ok(res.body.path[0].shared_attribute);
});

test('POST activity/subtree + check corrigent les placements', async () => {
  const sub = await request(app)
    .post('/api/clades/activity/subtree')
    .send({ plantIds: [plantA, plantB] })
    .expect(200);
  assert.equal(sub.body.tree.id, rootId);
  assert.ok((sub.body.plants || []).length === 2);

  const bad = await request(app)
    .post('/api/clades/activity/check')
    .send({
      placements: [
        { plantId: plantA, cladeId: otherId },
        { plantId: plantB, cladeId: otherId },
      ],
    })
    .expect(200);
  assert.equal(bad.body.correctCount, 1);
  assert.equal(bad.body.allCorrect, false);

  const good = await request(app)
    .post('/api/clades/activity/check')
    .send({
      placements: [
        { plantId: plantA, cladeId: grandId },
        { plantId: plantB, cladeId: otherId },
      ],
    })
    .expect(200);
  assert.equal(good.body.allCorrect, true);
});

test('CRUD refuse un cycle et exige plants.manage', async () => {
  await request(app)
    .post('/api/clades')
    .send({
      id: `x${stamp}`.slice(0, 64),
      name: 'Sans auth',
      shared_attribute: 'x',
    })
    .expect(401);

  const cycle = await request(app)
    .put(`/api/clades/${rootId}`)
    .set(auth())
    .send({ parent_id: grandId })
    .expect(400);
  assert.match(String(cycle.body.error || ''), /cycle/i);

  const ok = await request(app)
    .put(`/api/clades/${childId}`)
    .set(auth())
    .send({ name: 'Test enfant renommé', shared_attribute: 'Attribut enfant' })
    .expect(200);
  assert.equal(ok.body.name, 'Test enfant renommé');
});
