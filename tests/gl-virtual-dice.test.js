'use strict';

const { test } = require('node:test');
const assert = require('node:assert');

test('glVirtualDice — clampDiceCount et rollDice', async () => {
  const {
    clampDiceCount,
    rollDice,
    MIN_DICE_COUNT,
    MAX_DICE_COUNT,
    DICE_SIDES,
    formatDiceBreakdown,
  } = await import('../src/gl/utils/glVirtualDice.js');

  assert.strictEqual(clampDiceCount(0), MIN_DICE_COUNT);
  assert.strictEqual(clampDiceCount(99), MAX_DICE_COUNT);
  assert.strictEqual(clampDiceCount(3.7), 3);
  assert.strictEqual(clampDiceCount('bad'), MIN_DICE_COUNT);

  const result = rollDice(3);
  assert.strictEqual(result.values.length, 3);
  assert.strictEqual(
    result.total,
    result.values.reduce((a, b) => a + b, 0),
  );
  for (const v of result.values) {
    assert.ok(v >= 1 && v <= DICE_SIDES);
  }

  assert.strictEqual(formatDiceBreakdown([4, 5, 2]), '4 + 5 + 2');
  assert.strictEqual(formatDiceBreakdown([]), '');
});
