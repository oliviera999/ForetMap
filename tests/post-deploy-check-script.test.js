'use strict';

const test = require('node:test');
const assert = require('node:assert');

const { parseArgs } = require('../scripts/post-deploy-check');

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
