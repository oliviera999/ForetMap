'use strict';

const test = require('node:test');
const assert = require('node:assert');

const { parseFlags } = require('../scripts/image-migration-report');

test('parseFlags détecte --json', () => {
  const parsed = parseFlags(['--json']);
  assert.strictEqual(parsed.json, true);
});

test('parseFlags sans options', () => {
  const parsed = parseFlags([]);
  assert.strictEqual(parsed.json, false);
});
