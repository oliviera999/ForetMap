'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { deploySecretFromEnv } = require('../scripts/lib/deploy-secret-from-env');

test('deploySecretFromEnv priorise DEPLOY_SECRET', () => {
  process.env.DEPLOY_SECRET = 'a';
  process.env.FORETMAP_DEPLOY_CHECK_SECRET = 'b';
  process.env.FORETMAP_DEPLOY_SECRET = 'c';
  assert.strictEqual(deploySecretFromEnv(), 'a');
  delete process.env.DEPLOY_SECRET;
  assert.strictEqual(deploySecretFromEnv(), 'b');
  delete process.env.FORETMAP_DEPLOY_CHECK_SECRET;
  assert.strictEqual(deploySecretFromEnv(), 'c');
  delete process.env.FORETMAP_DEPLOY_SECRET;
  assert.strictEqual(deploySecretFromEnv(), '');
});
