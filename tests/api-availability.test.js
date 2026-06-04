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
  } finally {
    setShutdownInProgressForTests(false);
  }
});
