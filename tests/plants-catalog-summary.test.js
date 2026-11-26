'use strict';

// Contrat liste résumé / fiche complète (`GET /api/plants` vs `GET /api/plants/:id`).

require('./helpers/setup');
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const request = require('supertest');
const { initSchema, execute } = require('../database');
const { app } = require('../server');
const { ensureAdminTeacherAuthToken } = require('./helpers/adminAuth');
const { invalidatePlantsListCache } = require('../lib/biodiv/speciesService');

const STAMP = crypto.randomUUID().slice(0, 8);
const NAME = `Résumé catalogue ${STAMP}`;
let token;
let plantId;

before(async () => {
  await initSchema();
  token = await ensureAdminTeacherAuthToken();
  const res = await request(app)
    .post('/api/plants')
    .set('Authorization', `Bearer ${token}`)
    .send({
      name: NAME,
      emoji: '🌿',
      photo: 'https://upload.wikimedia.org/wikipedia/commons/a/a1/Summary_test_a.jpg',
      photo_species:
        'https://upload.wikimedia.org/wikipedia/commons/a/a1/Summary_test_a.jpg\nhttps://upload.wikimedia.org/wikipedia/commons/b/b2/Summary_test_b.jpg\nhttps://upload.wikimedia.org/wikipedia/commons/c/c3/Summary_test_c.jpg',
    })
    .expect(201);
  plantId = res.body.id;
  invalidatePlantsListCache();
});

after(async () => {
  if (plantId) await execute('DELETE FROM plants WHERE id = ?', [plantId]).catch(() => {});
});

test('GET /api/plants — lignes résumé', async () => {
  const list = await request(app).get('/api/plants').expect(200);
  const row = list.body.find((p) => Number(p.id) === Number(plantId));
  assert.ok(row, 'fiche absente de la liste');
  assert.ok(row.id, 'id présent');
  assert.equal(row._view, 'summary');
  assert.equal(row.name, NAME);
  assert.ok(Array.isArray(row.photos));
  assert.ok(row.photos.length <= 2, 'photos plafonnées à 2');
  assert.equal(row.map_site_notes && Object.keys(row.map_site_notes).length, 0);
  assert.equal('lookalikes' in row, false);
  assert.equal('lookalike_species' in row, false);
  assert.equal('nutrition' in row, false);
  assert.equal('remarks' in row, false);
  assert.equal('remark_1' in row, false);
  assert.equal('ecosystem_role' in row, false);
  assert.equal('human_utility' in row, false);
});

test('GET /api/plants/:id — fiche complète', async () => {
  const res = await request(app).get(`/api/plants/${plantId}`).expect(200);
  assert.equal(res.body.id, plantId);
  assert.notEqual(res.body._view, 'summary');
  assert.ok(Array.isArray(res.body.photos));
  assert.ok(res.body.photos.length >= 3, 'toutes les photos de la fiche');
  assert.ok('lookalikes' in res.body);
  assert.ok('remarks' in res.body || res.body.remark_1 != null);
});

test('GET /api/plants/:id — erreurs identifiant', async () => {
  await request(app).get('/api/plants/not-an-id').expect(400);
  await request(app).get('/api/plants/999999999').expect(404);
});
