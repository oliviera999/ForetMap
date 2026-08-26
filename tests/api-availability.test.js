require('./helpers/setup');
const test = require('node:test');
const assert = require('node:assert');
const { app, setShutdownInProgressForTests } = require('../server');
const request = require('supertest');

test('GET /api/health reste joignable pendant un shutdown simulé', async () => {
  setShutdownInProgressForTests(true);
  try {
    const res = await request(app).get('/api/health').expect(200);
    assert.strictEqual(res.body.ok, true);
  } finally {
    setShutdownInProgressForTests(false);
  }
});

test('GET /api/zones renvoie 503 JSON SERVICE_RESTARTING pendant shutdown', async () => {
  setShutdownInProgressForTests(true);
  try {
    const res = await request(app).get('/api/zones').expect(503);
    assert.strictEqual(res.body.code, 'SERVICE_RESTARTING');
    assert.match(String(res.headers['content-type'] || ''), /application\/json/i);
    // Retry-After sert de plancher de délai à la boucle de retry du client.
    assert.strictEqual(res.headers['retry-after'], '2');
  } finally {
    setShutdownInProgressForTests(false);
  }
});

/**
 * Les endpoints d'exploitation en lecture seule doivent rester joignables quand la base
 * est indisponible : c'est exactement le moment où l'on a besoin de lire les diagnostics.
 * Preuve : sans secret ils répondent **403** (garde `DEPLOY_SECRET`), donc le verrou de
 * readiness BDD ne les a pas court-circuités en 503 avant d'y arriver.
 */
for (const route of ['/api/admin/diagnostics', '/api/admin/logs']) {
  test(`GET ${route} n'est pas bloqué par le verrou de readiness BDD`, async () => {
    const res = await request(app).get(route);
    assert.strictEqual(res.status, 403);
    assert.notStrictEqual(res.body?.code, 'SERVICE_NOT_READY');
  });

  test(`GET ${route} reste refusé pendant un redémarrage (SERVICE_RESTARTING)`, async () => {
    setShutdownInProgressForTests(true);
    try {
      const res = await request(app).get(route).expect(503);
      assert.strictEqual(res.body.code, 'SERVICE_RESTARTING');
    } finally {
      setShutdownInProgressForTests(false);
    }
  });
}
