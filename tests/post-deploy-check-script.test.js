'use strict';

const test = require('node:test');
const assert = require('node:assert');
const http = require('http');

const { parseArgs, requestJsonWithTimeout, checkEndpoint } = require('../scripts/post-deploy-check');

test('parseArgs lit --base-url et --timeout-ms', () => {
  const parsed = parseArgs(['--base-url', 'https://example.org', '--timeout-ms', '7000']);
  assert.strictEqual(parsed.baseUrl, 'https://example.org');
  assert.strictEqual(parsed.timeoutMs, 7000);
});

test('parseArgs garde les valeurs par défaut', () => {
  const parsed = parseArgs([]);
  assert.ok(parsed.baseUrl);
  assert.strictEqual(typeof parsed.timeoutMs, 'number');
  assert.ok(parsed.timeoutMs > 0);
});

test('requestJsonWithTimeout lit une réponse JSON locale', async () => {
  const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, route: req.url }));
  });

  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  try {
    const out = await requestJsonWithTimeout(`http://127.0.0.1:${port}/api/health`, 3000);
    assert.strictEqual(out.ok, true);
    assert.strictEqual(out.status, 200);
    assert.strictEqual(out.body.ok, true);
    assert.strictEqual(out.body.route, '/api/health');
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test('checkEndpoint marque un endpoint requis en échec si 503', async () => {
  const server = http.createServer((req, res) => {
    res.writeHead(503, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'db down' }));
  });

  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  try {
    const out = await checkEndpoint(`http://127.0.0.1:${port}`, '/api/health/db', 3000, true);
    assert.strictEqual(out.required, true);
    assert.strictEqual(out.pass, false);
    assert.strictEqual(out.status, 503);
    assert.strictEqual(out.path, '/api/health/db');
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
