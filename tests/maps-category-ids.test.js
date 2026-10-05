'use strict';

/**
 * Catégories affichées par défaut et catégories cachées, réglées par carte
 * (`maps.default_category_ids` / `maps.hidden_category_ids`, migration 318) :
 * écriture par `PUT /api/settings/admin/maps/:id`, lecture ramenée aux catégories qui
 * concernent la carte, exposition dans `GET /api/maps`.
 */

require('./helpers/setup');
const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { app } = require('../server');
const { initSchema, queryOne, execute } = require('../database');
const { ensureAdminTeacherAuthToken } = require('./helpers/adminAuth');
const { invalidateMapsListCache } = require('../lib/terrain/mapService');

let token;
const createdMapIds = [];
const createdCategoryIds = [];

function asAdmin(req) {
  return req.set('Authorization', `Bearer ${token}`);
}

function newMapId(prefix) {
  const id = `${prefix}_${Date.now().toString(36)}${Math.floor(Math.random() * 1000)}`.slice(0, 31);
  createdMapIds.push(id);
  return id;
}

async function createCategory(label, body = {}) {
  const res = await asAdmin(request(app).post('/api/map-categories'))
    .send({ label: `${label} ${Date.now()}${Math.floor(Math.random() * 1000)}`, ...body })
    .expect(201);
  createdCategoryIds.push(res.body.id);
  return res.body;
}

test.before(async () => {
  await initSchema();
  token = await ensureAdminTeacherAuthToken();
});

test.beforeEach(async () => {
  token = await ensureAdminTeacherAuthToken();
});

test.after(async () => {
  for (const id of createdCategoryIds) {
    await execute('DELETE FROM location_categories WHERE id = ?', [id]);
  }
  for (const id of createdMapIds) await execute('DELETE FROM maps WHERE id = ?', [id]);
});

test('PUT /admin/maps/:id — catégories par défaut et cachées, ramenées à la carte', async () => {
  const mapId = newMapId('cats');
  const otherMapId = newMapId('cats');
  for (const id of [mapId, otherMapId]) {
    await asAdmin(request(app).post('/api/settings/admin/maps'))
      .send({ id, label: `Plan ${id}` })
      .expect(201);
  }
  const globalCat = await createCategory('Globale');
  const ownCat = await createCategory('Propre', { map_id: mapId });
  const foreignCat = await createCategory('Autre carte', { map_id: otherMapId });
  const planOnlyCat = await createCategory('Plan seul', { surfaces: ['plan'] });

  const res = await asAdmin(request(app).put(`/api/settings/admin/maps/${mapId}`))
    .send({
      default_category_ids: [globalCat.id, foreignCat.id, planOnlyCat.id, 'inconnue', globalCat.id],
      hidden_category_ids: `${ownCat.id};${foreignCat.id}`,
    })
    .expect(200);
  // Catégorie d'une autre carte, absente de la carte de travail ou inconnue : écartée.
  assert.deepEqual(res.body.default_category_ids, [globalCat.id]);
  assert.deepEqual(res.body.hidden_category_ids, [ownCat.id]);

  // Stockage brut normalisé (dédoublonné, `;`-séparé) : rien n'est perdu côté base.
  const row = await queryOne(
    'SELECT default_category_ids, hidden_category_ids FROM maps WHERE id = ?',
    [mapId],
  );
  assert.equal(
    row.default_category_ids,
    [globalCat.id, foreignCat.id, planOnlyCat.id, 'inconnue'].join(';'),
  );

  // Une catégorie à la fois cochée d'office et cachée reste cachée, jamais cochée.
  const both = await asAdmin(request(app).put(`/api/settings/admin/maps/${mapId}`))
    .send({ hidden_category_ids: [ownCat.id, globalCat.id] })
    .expect(200);
  assert.deepEqual(both.body.default_category_ids, []);
  assert.deepEqual(both.body.hidden_category_ids.sort(), [globalCat.id, ownCat.id].sort());

  // Champ omis : valeur conservée ; liste vide : effacée.
  const kept = await asAdmin(request(app).put(`/api/settings/admin/maps/${mapId}`))
    .send({ label: 'Plan renommé' })
    .expect(200);
  assert.deepEqual(kept.body.hidden_category_ids.sort(), [globalCat.id, ownCat.id].sort());
  const cleared = await asAdmin(request(app).put(`/api/settings/admin/maps/${mapId}`))
    .send({ default_category_ids: '', hidden_category_ids: [] })
    .expect(200);
  assert.deepEqual(cleared.body.default_category_ids, []);
  assert.deepEqual(cleared.body.hidden_category_ids, []);

  // L'autre carte n'est pas touchée.
  const other = await queryOne('SELECT hidden_category_ids FROM maps WHERE id = ?', [otherMapId]);
  assert.ok(!other.hidden_category_ids);
});

test('PUT /admin/maps/:id — liste trop longue refusée', async () => {
  const mapId = newMapId('cats');
  await asAdmin(request(app).post('/api/settings/admin/maps'))
    .send({ id: mapId, label: 'Plan' })
    .expect(201);
  const tooLong = Array.from({ length: 300 }, (_, i) => `categorie-${i}-${'x'.repeat(20)}`);
  const res = await asAdmin(request(app).put(`/api/settings/admin/maps/${mapId}`))
    .send({ hidden_category_ids: tooLong })
    .expect(400);
  assert.deepEqual(res.body, { error: 'Liste de catégories trop longue' });
});

test('GET /api/maps — la carte porte ses catégories par défaut et cachées', async () => {
  const mapId = newMapId('cats');
  await asAdmin(request(app).post('/api/settings/admin/maps'))
    .send({ id: mapId, label: 'Plan public' })
    .expect(201);
  const shown = await createCategory('Montrée', { map_id: mapId });
  const hidden = await createCategory('Cachée', { map_id: mapId });
  await asAdmin(request(app).put(`/api/settings/admin/maps/${mapId}`))
    .send({ default_category_ids: [shown.id], hidden_category_ids: [hidden.id] })
    .expect(200);
  invalidateMapsListCache();
  const res = await asAdmin(request(app).get('/api/maps')).expect(200);
  const listed = res.body.find((m) => m.id === mapId);
  assert.ok(listed, 'carte listée');
  assert.deepEqual(listed.default_category_ids, [shown.id]);
  assert.deepEqual(listed.hidden_category_ids, [hidden.id]);
});
