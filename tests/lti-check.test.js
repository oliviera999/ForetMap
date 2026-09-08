'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { runLtiCheck } = require('../lib/lti/check');

function listen(handler) {
  const server = http.createServer(handler);
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      resolve({
        server,
        url: `http://127.0.0.1:${port}/mod/lti/certs.php`,
        async close() {
          await new Promise((done) => server.close(() => done()));
        },
      });
    });
  });
}

test('runLtiCheck : JWKS joignable via http natif (sans global.fetch)', async () => {
  const ctx = await listen((_req, res) => {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ keys: [{ kty: 'RSA', kid: 'moodle', n: 'x', e: 'AQAB' }] }));
  });
  const previousFetch = globalThis.fetch;
  globalThis.fetch = () => {
    throw new Error('globalThis.fetch ne doit pas être appelé');
  };
  try {
    const report = await runLtiCheck({
      env: {
        configured: true,
        issuer: 'http://moodle.test',
        clientId: 'tool',
        deploymentId: '1',
        platformAuthUrl: 'http://moodle.test/mod/lti/auth.php',
        platformJwksUrl: ctx.url,
        toolPrivateKey: 'pas-une-cle',
        toolKid: 'foretmap-lti',
      },
    });
    assert.equal(report.jwksOk, true);
    assert.equal(report.jwksKeys, 1);
    assert.equal(report.toolJwkOk, false);
    assert.ok(report.errors.some((e) => e.step === 'tool_key'));
    assert.ok(!report.errors.some((e) => e.step === 'jwks'));
  } finally {
    globalThis.fetch = previousFetch;
    await ctx.close();
  }
});
