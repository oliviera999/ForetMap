'use strict';

require('./helpers/setup');
const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { initSchema, queryAll } = require('../database');
const { app } = require('../server');
const { ensureAdminTeacherAuthToken } = require('./helpers/adminAuth');

test.before(async () => {
  await initSchema();
});

test('POST/PUT /api/plants — map_ids (rattachement direct à une carte)', async () => {
  const token = await ensureAdminTeacherAuthToken({ elevated: true });
  const stamp = Date.now();
  const name = `Merle map ${stamp}`;

  const created = await request(app)
    .post('/api/plants')
    .set('Authorization', `Bearer ${token}`)
    .send({ name, emoji: '🐦', map_ids: ['foret'] })
    .expect(201);

  assert.ok(created.body.id);
  assert.deepEqual(created.body.map_ids, ['foret']);

  const rows = await queryAll('SELECT map_id FROM map_species WHERE plant_id = ? ORDER BY map_id', [
    created.body.id,
  ]);
  assert.deepEqual(
    rows.map((r) => r.map_id),
    ['foret'],
  );

  const list = await request(app).get('/api/plants').expect(200);
  const fromList = list.body.find((p) => Number(p.id) === Number(created.body.id));
  assert.ok(fromList);
  assert.ok(Array.isArray(fromList.map_ids));
  assert.ok(fromList.map_ids.includes('foret'));

  const updated = await request(app)
    .put(`/api/plants/${created.body.id}`)
    .set('Authorization', `Bearer ${token}`)
    .send({ name, emoji: '🐦', map_ids: [] })
    .expect(200);
  assert.deepEqual(updated.body.map_ids, []);

  const after = await queryAll('SELECT map_id FROM map_species WHERE plant_id = ?', [
    created.body.id,
  ]);
  assert.equal(after.length, 0);
});

test('PUT /api/plants/:id — un map_id inconnu ne vide pas les rattachements valides', async () => {
  const token = await ensureAdminTeacherAuthToken({ elevated: true });
  const stamp = Date.now();
  const name = `Merle stale ${stamp}`;

  const created = await request(app)
    .post('/api/plants')
    .set('Authorization', `Bearer ${token}`)
    .send({ name, emoji: '🐦', map_ids: ['foret'] })
    .expect(201);

  // L'id inexistant est en tête : sans filtre + transaction, le DELETE commité
  // puis l'INSERT FK laissait la fiche sans aucune carte.
  const updated = await request(app)
    .put(`/api/plants/${created.body.id}`)
    .set('Authorization', `Bearer ${token}`)
    .send({ name, emoji: '🐦', map_ids: [`carte-absente-${stamp}`, 'foret'] })
    .expect(200);

  assert.deepEqual(updated.body.map_ids, ['foret']);
  const rows = await queryAll('SELECT map_id FROM map_species WHERE plant_id = ? ORDER BY map_id', [
    created.body.id,
  ]);
  assert.deepEqual(
    rows.map((r) => r.map_id),
    ['foret'],
  );
});
