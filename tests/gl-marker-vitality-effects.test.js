'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const {
  resolveMarkerVitalityDeltas,
  hasNonZeroVitalityDeltas,
  buildMarkerEffectEventPayload,
} = require('../lib/glMarkerVitalityEffects');

test('resolveMarkerVitalityDeltas extrait cœurs et gemmes', () => {
  const deltas = resolveMarkerVitalityDeltas({ deltaPv: 2, deltaGems: -1, deltaMove: 0 });
  assert.strictEqual(deltas.healthDelta, 2);
  assert.strictEqual(deltas.powerDelta, -1);
  assert.strictEqual(deltas.moveDelta, 0);
});

test('hasNonZeroVitalityDeltas détecte les deltas applicables', () => {
  assert.strictEqual(hasNonZeroVitalityDeltas(0, 0), false);
  assert.strictEqual(hasNonZeroVitalityDeltas(1, 0), true);
  assert.strictEqual(hasNonZeroVitalityDeltas(0, -2), true);
});

test('buildMarkerEffectEventPayload inclut la cible vitalité', () => {
  const payload = buildMarkerEffectEventPayload({
    marker: { id: 5, label: 'Source', event_type: 'event' },
    resolved: { branch: 'neutral' },
    healthDelta: 1,
    powerDelta: -1,
    moveDelta: 0,
    passTurn: false,
    reason: 'Source',
    vitalityTarget: 'team',
    vitalityPlayerIds: null,
  });
  assert.strictEqual(payload.markerId, 5);
  assert.strictEqual(payload.healthDelta, 1);
  assert.strictEqual(payload.powerDelta, -1);
  assert.strictEqual(payload.vitalityTarget, 'team');
});
