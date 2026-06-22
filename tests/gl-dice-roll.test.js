'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const { parseDiceRollPayload } = require('../lib/glDiceRoll');

test('parseDiceRollPayload — bornes et total cohérent', () => {
  assert.strictEqual(parseDiceRollPayload(null), null);
  assert.strictEqual(parseDiceRollPayload({ values: [], total: 0 }), null);
  assert.strictEqual(parseDiceRollPayload({ values: [1, 2, 3, 4, 5, 6], total: 21 }), null);
  assert.strictEqual(parseDiceRollPayload({ values: [1, 2], total: 4 }), null);
  assert.deepStrictEqual(parseDiceRollPayload({ values: [6], total: 6 }), {
    values: [6],
    total: 6,
  });
});
