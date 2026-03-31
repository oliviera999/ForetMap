const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');

if (String(process.env.FORETMAP_SNAPSHOT_TESTS || '').trim() !== '1') {
  test('snapshot DB: désactivé', { skip: 'Définir FORETMAP_SNAPSHOT_TESTS=1 pour activer ce test.' }, () => {});
} else {
  require('./helpers/setup');
  const { app } = require('../server');

  test('snapshot DB: la santé API/DB est OK', async () => {
    const health = await request(app).get('/api/health').expect(200);
    assert.equal(health.body?.ok, true);

    const dbHealth = await request(app).get('/api/health/db').expect(200);
    assert.equal(dbHealth.body?.ok, true);
  });

  test('snapshot DB: les listes publiques principales sont non vides', async () => {
    const zones = await request(app).get('/api/zones').expect(200);
    assert.ok(Array.isArray(zones.body), 'zones doit être un tableau');
    assert.ok(zones.body.length > 0, 'zones ne doit pas être vide sur snapshot');

    const plants = await request(app).get('/api/plants').expect(200);
    assert.ok(Array.isArray(plants.body), 'plants doit être un tableau');
    assert.ok(plants.body.length > 0, 'plants ne doit pas être vide sur snapshot');

    const tasks = await request(app).get('/api/tasks').expect(200);
    assert.ok(Array.isArray(tasks.body), 'tasks doit être un tableau');
    assert.ok(tasks.body.length > 0, 'tasks ne doit pas être vide sur snapshot');
  });
}
