'use strict';

// Chantier collège (flux C4) : `profile=college` sur `/api/clades` (arbre réduit aux groupes
// d'usage). Boîtes de test isolées ; les marques `visible_college` sont posées par le test et
// retirées à la fin (le seed n'en porte aucune).

require('./helpers/setup');
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { app } = require('../server');
const { initSchema, execute } = require('../database');

const stamp = Date.now();
const rootId = `c4root_${stamp}`.slice(0, 64);
const hiddenId = `c4hid_${stamp}`.slice(0, 64);
const leafId = `c4leaf_${stamp}`.slice(0, 64);
const otherId = `c4oth_${stamp}`.slice(0, 64);

let plantA = 0;
let plantB = 0;

before(async () => {
  await initSchema();
  // R (visible) › H (retirée) › L (visible) ; R › O (retirée).
  await execute(
    `INSERT INTO clades (id, parent_id, name, shared_attribute, sort_order, visible_college,
                         label_simple, attribute_simple)
     VALUES (?, NULL, 'Racine savante C4', 'Attribut savant racine', 950, 1, 'Racine simple', 'Attribut simple racine'),
            (?, ?, 'Intermédiaire C4', 'Attribut intermédiaire', 951, 0, NULL, NULL),
            (?, ?, 'Feuille savante C4', 'Attribut savant feuille', 952, 1, NULL, 'Attribut simple feuille'),
            (?, ?, 'Branche C4', 'Attribut branche', 953, 0, NULL, NULL)`,
    [rootId, hiddenId, rootId, leafId, hiddenId, otherId, rootId],
  );
  const a = await execute(
    `INSERT INTO plants (name, emoji, description, clade_id) VALUES (?, '🌱', 'test C4 A', ?)`,
    [`C4 plante A ${stamp}`, leafId],
  );
  const b = await execute(
    `INSERT INTO plants (name, emoji, description, clade_id) VALUES (?, '🌿', 'test C4 B', ?)`,
    [`C4 plante B ${stamp}`, otherId],
  );
  plantA = a.insertId;
  plantB = b.insertId;
});

after(async () => {
  if (plantA) await execute('DELETE FROM plants WHERE id = ?', [plantA]).catch(() => {});
  if (plantB) await execute('DELETE FROM plants WHERE id = ?', [plantB]).catch(() => {});
  for (const id of [leafId, otherId, hiddenId, rootId]) {
    await execute('DELETE FROM clades WHERE id = ?', [id]).catch(() => {});
  }
});

test('GET /api/clades sans profil : arbre complet inchangé (pas de champ collapsed)', async () => {
  const res = await request(app).get('/api/clades');
  assert.equal(res.status, 200);
  assert.equal(res.body.collapsed, undefined);
  const ids = res.body.items.map((c) => c.id);
  assert.ok(ids.includes(hiddenId));
  assert.ok(ids.includes('vivant'));
});

test('GET /api/clades?profile=college : boîtes visibles seulement, libellés simples', async () => {
  const res = await request(app).get('/api/clades').query({ profile: 'college' });
  assert.equal(res.status, 200);
  assert.equal(res.body.collapsed, true);
  const byId = new Map(res.body.items.map((c) => [c.id, c]));
  assert.ok(!byId.has(hiddenId));
  assert.ok(!byId.has(otherId));
  assert.equal(byId.get(rootId).name, 'Racine simple');
  assert.equal(byId.get(rootId).full_name, 'Racine savante C4');
  assert.equal(byId.get(leafId).name, 'Feuille savante C4');
  assert.equal(byId.get(leafId).shared_attribute, 'Attribut simple feuille');
  assert.equal(byId.get(leafId).parent_id, rootId);
});

test('GET /api/clades/:id/path?profile=college : fil réduit depuis la boîte visible', async () => {
  const leaf = await request(app).get(`/api/clades/${leafId}/path`).query({ profile: 'college' });
  assert.equal(leaf.status, 200);
  assert.equal(leaf.body.collapsed, true);
  assert.deepEqual(
    leaf.body.path.map((n) => n.name),
    ['Racine simple', 'Feuille savante C4'],
  );

  const other = await request(app).get(`/api/clades/${otherId}/path`).query({ profile: 'college' });
  assert.deepEqual(
    other.body.path.map((n) => n.id),
    [rootId],
  );

  const full = await request(app).get(`/api/clades/${leafId}/path`);
  assert.deepEqual(
    full.body.path.map((n) => n.id),
    [rootId, hiddenId, leafId],
  );
  assert.equal(full.body.collapsed, undefined);

  const missing = await request(app)
    .get('/api/clades/inexistant_c4/path')
    .query({ profile: 'college' });
  assert.equal(missing.status, 404);
});

test('activité au collège : sous-arbre réduit, options visibles, correction alignée', async () => {
  const sub = await request(app)
    .post('/api/clades/activity/subtree')
    .send({ plantIds: [plantA, plantB], profile: 'college' });
  assert.equal(sub.status, 200, JSON.stringify(sub.body));
  assert.equal(sub.body.collapsed, true);
  assert.equal(sub.body.tree.id, rootId);
  assert.equal(sub.body.tree.name, 'Racine simple');
  assert.deepEqual(
    sub.body.tree.children.map((c) => c.id),
    [leafId],
  );
  assert.deepEqual(
    sub.body.tree.plants.map((p) => p.id),
    [plantB],
  );
  assert.deepEqual(sub.body.cladeOptions.map((c) => c.id).sort(), [leafId, rootId].sort());
  assert.ok(sub.body.cladeOptions.every((c) => c.id !== hiddenId && c.id !== otherId));

  const check = await request(app)
    .post('/api/clades/activity/check')
    .send({
      profile: 'college',
      placements: [
        { plantId: plantA, cladeId: leafId },
        { plantId: plantB, cladeId: rootId },
      ],
    });
  assert.equal(check.status, 200);
  assert.equal(check.body.allCorrect, true);

  // Sans profil : la boîte attendue reste le groupe exact de la fiche.
  const strict = await request(app)
    .post('/api/clades/activity/check')
    .send({ placements: [{ plantId: plantB, cladeId: rootId }] });
  assert.equal(strict.body.allCorrect, false);
});

test('activité sans profil : comportement historique (arbre complet)', async () => {
  const sub = await request(app)
    .post('/api/clades/activity/subtree')
    .send({ plantIds: [plantA, plantB] });
  assert.equal(sub.status, 200);
  assert.equal(sub.body.collapsed, false);
  assert.equal(sub.body.tree.name, 'Racine savante C4');
  const optionIds = sub.body.cladeOptions.map((c) => c.id);
  assert.ok(optionIds.includes(hiddenId));
  assert.ok(optionIds.includes(otherId));
});
